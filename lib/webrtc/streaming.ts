// Streaming Download Utilities (FileSystem Access API)

import type {
  FileMetadata,
  ProgressCallback,
  MetadataCallback,
  TransferMetadata,
  StreamingReceiveResult,
  FileSaveStream,
} from "./types";

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

/**
 * Receive file over DataChannel and stream directly to disk (when supported)
 * Falls back to memory buffering if streaming is not available
 */
export function receiveFileStreaming(
  channel: RTCDataChannel,
  writable: FileSystemWritableFileStream | null,
  onProgress?: ProgressCallback,
  onMetadata?: MetadataCallback,
): Promise<StreamingReceiveResult> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let metadata: TransferMetadata | null = null;
    let receivedBytes = 0;
    const isStreaming = writable !== null;

    channel.binaryType = "arraybuffer";

    channel.onmessage = async (event) => {
      try {
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);

          if (msg.type === "metadata") {
            metadata = msg;
            onMetadata?.(msg);
          } else if (msg.type === "complete") {
            if (!metadata) {
              reject(new Error("No metadata received"));
              return;
            }

            if (isStreaming) {
              resolve({ data: null, metadata, streamed: true });
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
              resolve({ data: result.buffer, metadata, streamed: false });
            }
          }
        } else {
          if (isStreaming && writable) {
            await writable.write(event.data);
          } else {
            chunks.push(event.data);
          }

          receivedBytes += event.data.byteLength;

          if (metadata?.encryptedSize) {
            onProgress?.(
              Math.round((receivedBytes / metadata.encryptedSize) * 100),
            );
          }
        }
      } catch (error) {
        reject(error);
      }
    };

    channel.onerror = (e) => reject(new Error(`DataChannel error: ${e}`));
    channel.onclose = () => {
      if (!isStreaming && chunks.length === 0) {
        reject(new Error("Channel closed before receiving data"));
      }
    };
  });
}
