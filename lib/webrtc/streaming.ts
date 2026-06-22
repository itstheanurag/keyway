// Streaming Download Utilities (FileSystem Access API)

import type {
  ProgressCallback,
  MetadataCallback,
  TransferMetadata,
  StreamingReceiveResult,
  FileSaveStream,
} from "./types";
import { TransferCancelledError } from "./transfer";

/**
 * Check if the File System Access API is available (Chromium browsers only)
 */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof (window as Window & { showSaveFilePicker?: unknown })
      .showSaveFilePicker === "function"
  );
}

/**
 * Get MIME type options for the file picker
 */
function getMimeTypeAccept(mimeType: string): Record<string, string[]> {
  const mimeToExt: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "application/zip": [".zip"],
    "application/x-zip-compressed": [".zip"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    "video/mp4": [".mp4"],
    "video/webm": [".webm"],
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "text/plain": [".txt"],
    "application/json": [".json"],
  };

  if (mimeType && mimeToExt[mimeType]) {
    return { [mimeType]: mimeToExt[mimeType] };
  }

  return { "application/octet-stream": [""] };
}

/**
 * Open file save picker and return a writable stream
 */
export async function openFileSaveStream(
  fileName: string,
  mimeType: string,
): Promise<FileSaveStream | null> {
  if (!supportsFileSystemAccess()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const showSaveFilePicker = (window as any).showSaveFilePicker;
    const handle = await showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: "File",
          accept: getMimeTypeAccept(mimeType),
        },
      ],
    });

    const writable = await handle.createWritable();
    return {
      writable,
      close: async () => {
        await writable.close();
      },
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return null; // User cancelled
    }
    console.error("File picker error:", error);
    return null;
  }
}

function asArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  }
  throw new Error("Expected binary ArrayBuffer chunk");
}

export interface ReceiveFileStreamingOptions {
  /** Metadata already received before the streaming handler was attached */
  initialMetadata?: TransferMetadata;
  /** Binary chunks that arrived before the streaming handler was attached */
  initialChunks?: ArrayBuffer[];
  /** Abort controller to cancel the active receive */
  abort?: AbortController;
  /** Cleanup partial writes when a receive is cancelled */
  onAbort?: () => Promise<void>;
}

/**
 * Receive file over DataChannel and stream directly to disk (when supported)
 * Falls back to memory buffering if streaming is not available
 */
export function receiveFileStreaming(
  channel: RTCDataChannel,
  writable: FileSystemWritableFileStream | null,
  onProgress?: ProgressCallback,
  onMetadata?: MetadataCallback,
  options?: ReceiveFileStreamingOptions,
): Promise<StreamingReceiveResult> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let metadata: TransferMetadata | null = options?.initialMetadata ?? null;
    let receivedBytes = 0;
    const isStreaming = writable !== null;
    let settled = false;

    channel.binaryType = "arraybuffer";

    if (metadata) {
      onMetadata?.(metadata);
    }

    const signal = options?.abort?.signal;

    const cleanup = () => {
      channel.removeEventListener("message", handler);
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (result: StreamingReceiveResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = async (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error instanceof TransferCancelledError && options?.onAbort) {
        await options.onAbort().catch(() => undefined);
      }
      reject(error);
    };

    const onAbort = () => {
      void fail(new TransferCancelledError());
    };

    signal?.addEventListener("abort", onAbort);

    const processBinaryChunk = async (data: ArrayBuffer) => {
      if (isStreaming && writable) {
        await writable.write(data);
      } else {
        chunks.push(data);
      }

      receivedBytes += data.byteLength;

      if (metadata?.encryptedSize) {
        onProgress?.(
          Math.min(
            100,
            Math.round((receivedBytes / metadata.encryptedSize) * 100),
          ),
        );
      }
    };

    let messageChain = Promise.resolve();

    const enqueue = (task: () => Promise<void>) => {
      messageChain = messageChain.then(task).catch((error) => {
        fail(error);
      });
    };

    const handler = (event: MessageEvent) => {
      enqueue(async () => {
        if (signal?.aborted) {
          throw new TransferCancelledError();
        }

        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);

          if (msg.type === "transfer-cancel") {
            throw new TransferCancelledError();
          }

          if (msg.type === "metadata" || msg.type === "file-start") {
            metadata =
              msg.type === "file-start" ? (msg.metadata ?? null) : msg;
            if (metadata) {
              onMetadata?.(metadata);
            }
          } else if (msg.type === "complete" || msg.type === "file-end") {
            if (!metadata) {
              throw new Error("No metadata received");
            }

            if (isStreaming) {
              finish({ data: null, metadata, streamed: true });
            } else {
              const totalLength = chunks.reduce(
                (sum, chunk) => sum + chunk.byteLength,
                0,
              );
              const result = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of chunks) {
                result.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
              }
              finish({ data: result.buffer, metadata, streamed: false });
            }
          }
        } else {
          await processBinaryChunk(asArrayBuffer(event.data));
        }
      });
    };

    channel.addEventListener("message", handler);
    channel.onerror = (e) => fail(new Error(`DataChannel error: ${e}`));
    channel.onclose = () => {
      if (!settled && !isStreaming && chunks.length === 0) {
        fail(new Error("Channel closed before receiving data"));
      }
    };

    for (const chunk of options?.initialChunks ?? []) {
      messageChain = messageChain.then(() => processBinaryChunk(chunk));
    }
    messageChain.catch((error) => {
      void fail(error);
    });
  });
}
