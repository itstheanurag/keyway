// File Transfer Functions

import type {
  FileMetadata,
  FolderInfo,
  TransferMessage,
  ProgressCallback,
  MetadataCallback,
  ReceiveResult,
  StreamingSendResult,
  TransferMetadata,
} from "./types";
import { estimateEncryptedPayloadSize } from "../crypto";
import { CHUNK_SIZE } from "./constants";
import { generateFileId } from "./connection";

const MAX_BUFFERED_BYTES = CHUNK_SIZE * 10;

class DataChannelClosedError extends Error {
  constructor(message = "DataChannel is not open") {
    super(message);
    this.name = "DataChannelClosedError";
  }
}

export class TransferCancelledError extends Error {
  constructor(message = "Transfer cancelled") {
    super(message);
    this.name = "TransferCancelledError";
  }
}

export function isTransferCancelled(error: unknown): boolean {
  return (
    error instanceof TransferCancelledError ||
    (error instanceof Error && error.name === "TransferCancelledError")
  );
}

export function sendTransferCancel(channel: RTCDataChannel): void {
  if (channel.readyState === "open") {
    channel.send(JSON.stringify({ type: "transfer-cancel" }));
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TransferCancelledError();
  }
}

function bindTransferCancel(
  channel: RTCDataChannel,
  abort?: AbortController,
): () => void {
  if (!abort) {
    return () => undefined;
  }

  const onMessage = (event: MessageEvent) => {
    if (typeof event.data !== "string") return;
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "transfer-cancel") {
        abort.abort();
      }
    } catch {
      // Ignore non-JSON control messages
    }
  };

  channel.addEventListener("message", onMessage);
  return () => channel.removeEventListener("message", onMessage);
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
  throwIfAborted(signal);
  return new Promise((_, reject) => {
    if (!signal) return;
    const onAbort = () => {
      reject(new TransferCancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function ensureChannelOpen(channel: RTCDataChannel): void {
  if (channel.readyState !== "open") {
    throw new DataChannelClosedError();
  }
}

function sendControlMessage(channel: RTCDataChannel, message: TransferMessage): void {
  ensureChannelOpen(channel);
  channel.send(JSON.stringify(message));
}

/**
 * Copy bytes into a standalone ArrayBuffer for reliable cross-browser DataChannel sends.
 * Avoids SharedArrayBuffer typing issues and subarray/view pitfalls in older engines.
 */
function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function sendBinaryChunk(channel: RTCDataChannel, bytes: Uint8Array): void {
  ensureChannelOpen(channel);
  if (bytes.byteLength > CHUNK_SIZE) {
    throw new Error(
      `DataChannel message size ${bytes.byteLength} exceeds limit of ${CHUNK_SIZE} bytes`,
    );
  }
  channel.send(toArrayBufferCopy(bytes));
}

async function sendBinaryDataInChunks(
  channel: RTCDataChannel,
  data: Uint8Array,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  let offset = 0;
  const totalBytes = data.byteLength;

  while (offset < totalBytes) {
    throwIfAborted(signal);
    ensureChannelOpen(channel);
    await Promise.race([
      waitForBufferSpace(channel, signal),
      waitForAbort(signal),
    ]);

    while (
      channel.readyState === "open" &&
      channel.bufferedAmount <= MAX_BUFFERED_BYTES &&
      offset < totalBytes
    ) {
      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      sendBinaryChunk(channel, data.subarray(offset, end));
      offset = end;
      if (totalBytes > 0) {
        onProgress?.(Math.round((offset / totalBytes) * 100));
      }
    }
  }
}

function waitForReceiverReady(
  channel: RTCDataChannel,
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  ensureChannelOpen(channel);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "session-ready") {
          finish();
        } else if (msg.type === "transfer-cancel") {
          fail(new TransferCancelledError());
        }
      } catch {
        // Ignore non-JSON control messages
      }
    };

    const onAbort = () => {
      fail(new TransferCancelledError());
    };

    const onClose = () => {
      fail(new DataChannelClosedError("DataChannel closed before receiver was ready"));
    };

    const timer = setTimeout(() => {
      fail(new Error("Timed out waiting for receiver to be ready"));
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort);
    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose, { once: true });
  });
}

function waitForBufferSpace(
  channel: RTCDataChannel,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  ensureChannelOpen(channel);

  if (channel.bufferedAmount <= MAX_BUFFERED_BYTES) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      channel.removeEventListener("bufferedamountlow", onBufferedAmountLow);
      channel.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onAbort = () => {
      fail(new TransferCancelledError());
    };

    const onClose = () => {
      fail(new DataChannelClosedError("DataChannel closed while waiting to send"));
    };

    const onBufferedAmountLow = () => {
      if (signal?.aborted) {
        fail(new TransferCancelledError());
        return;
      }
      if (channel.readyState !== "open") {
        fail(new DataChannelClosedError());
        return;
      }
      if (channel.bufferedAmount <= MAX_BUFFERED_BYTES) {
        finish();
      }
    };

    signal?.addEventListener("abort", onAbort);
    channel.addEventListener("close", onClose, { once: true });

    if ("bufferedAmountLowThreshold" in channel) {
      channel.bufferedAmountLowThreshold = MAX_BUFFERED_BYTES;
      channel.addEventListener("bufferedamountlow", onBufferedAmountLow);
    }

    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      if (signal?.aborted) {
        fail(new TransferCancelledError());
        return;
      }
      if (channel.readyState !== "open") {
        fail(new DataChannelClosedError());
        return;
      }
      if (channel.bufferedAmount <= MAX_BUFFERED_BYTES) {
        finish();
        return;
      }
      pollTimer = setTimeout(poll, 50);
    };
    poll();
  });
}

function asArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    return toArrayBufferCopy(view);
  }
  throw new Error("Expected binary ArrayBuffer chunk");
}

export function sendFolderStart(
  channel: RTCDataChannel,
  info: FolderInfo,
): void {
  channel.send(
    JSON.stringify({
      type: "folder-start",
      folderName: info.folderName,
      fileCount: info.fileCount,
      totalSize: info.totalSize,
    } as TransferMessage),
  );
}

export function sendFolderEnd(
  channel: RTCDataChannel,
  folderName: string,
): void {
  channel.send(
    JSON.stringify({
      type: "folder-end",
      folderName,
    } as TransferMessage),
  );
}

/**
 * Send file data over DataChannel with progress tracking
 * Supports optional fileId for multi-file transfers
 */
export async function sendFile(
  channel: RTCDataChannel,
  encryptedData: ArrayBuffer,
  metadata: FileMetadata,
  onProgress?: ProgressCallback,
  fileId?: string,
  abort?: AbortController,
): Promise<void> {
  const signal = abort?.signal;
  return new Promise((resolve, reject) => {
    let settled = false;
    const unbindCancel = bindTransferCancel(channel, abort);

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      unbindCancel();
      channel.removeEventListener("close", onClose);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onClose = () => {
      finish(new DataChannelClosedError("DataChannel closed during transfer"));
    };

    try {
      const id = fileId || generateFileId();
      const data = new Uint8Array(encryptedData);

      const sendPayload = async () => {
        try {
          throwIfAborted(signal);
          sendControlMessage(channel, {
            type: "file-start",
            fileId: id,
            metadata: {
              ...metadata,
              encryptedSize: encryptedData.byteLength,
            },
          });

          // Also send legacy metadata for backward compatibility
          ensureChannelOpen(channel);
          channel.send(
            JSON.stringify({
              ...metadata,
              type: "metadata",
              encryptedSize: encryptedData.byteLength,
            }),
          );

          await waitForReceiverReady(channel, 120_000, signal);
          await sendBinaryDataInChunks(channel, data, onProgress, signal);

          sendControlMessage(channel, {
            type: "file-end",
            fileId: id,
          });

          // Also send legacy complete for backward compatibility
          ensureChannelOpen(channel);
          channel.send(JSON.stringify({ type: "complete" }));
          finish();
        } catch (error) {
          finish(error);
        }
      };

      channel.addEventListener("close", onClose);
      channel.onerror = (e) =>
        finish(new Error(`DataChannel error: ${e}`));

      if (channel.readyState === "open") {
        void sendPayload();
      } else {
        channel.onopen = () => void sendPayload();
      }
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Send file data from a stream over DataChannel
 * This allows sending large files without loading them entirely into memory
 */
export async function sendFileStreaming(
  channel: RTCDataChannel,
  stream: ReadableStream<Uint8Array>,
  metadata: FileMetadata,
  onProgress?: ProgressCallback,
  fileId?: string,
  abort?: AbortController,
): Promise<StreamingSendResult> {
  const signal = abort?.signal;
  return new Promise((resolve, reject) => {
    let settled = false;
    const reader = stream.getReader();
    const unbindCancel = bindTransferCancel(channel, abort);

    const finish = (error?: unknown, result?: StreamingSendResult) => {
      if (settled) return;
      settled = true;
      unbindCancel();
      channel.removeEventListener("close", onClose);
      void reader.cancel().catch(() => undefined);
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };

    const onClose = () => {
      finish(new DataChannelClosedError("DataChannel closed during transfer"));
    };

    try {
      const id = fileId || generateFileId();
      let totalBytesSent = 0;
      const encryptedSize = estimateEncryptedPayloadSize(metadata);

      const pump = async () => {
        try {
          throwIfAborted(signal);
          ensureChannelOpen(channel);
          const { done, value } = await Promise.race([
            reader.read(),
            waitForAbort(signal),
          ]);

          if (done) {
            sendControlMessage(channel, {
              type: "file-end",
              fileId: id,
            });

            // Also send legacy complete for backward compatibility
            ensureChannelOpen(channel);
            channel.send(JSON.stringify({ type: "complete" }));
            finish(undefined, { streamed: true, metadata });
            return;
          }

          if (value) {
            await sendBinaryDataInChunks(channel, value, undefined, signal);
            totalBytesSent += value.byteLength;

            if (encryptedSize > 0) {
              onProgress?.(
                Math.min(
                  100,
                  Math.round((totalBytesSent / encryptedSize) * 100),
                ),
              );
            }
          }

          await pump();
        } catch (error) {
          finish(error);
        }
      };

      const startTransfer = async () => {
        try {
          throwIfAborted(signal);
          sendControlMessage(channel, {
            type: "file-start",
            fileId: id,
            metadata: {
              ...metadata,
              encryptedSize,
            },
          });

          // Also send legacy metadata for backward compatibility
          ensureChannelOpen(channel);
          channel.send(
            JSON.stringify({
              ...metadata,
              type: "metadata",
              encryptedSize,
            }),
          );

          await waitForReceiverReady(channel, 120_000, signal);
          await pump();
        } catch (error) {
          finish(error);
        }
      };

      channel.addEventListener("close", onClose);
      channel.onerror = (e) =>
        finish(new Error(`DataChannel error: ${e}`));

      if (channel.readyState === "open") {
        void startTransfer();
      } else {
        channel.onopen = () => void startTransfer();
      }
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Receive file data over DataChannel with progress tracking
 */
export function receiveFile(
  channel: RTCDataChannel,
  onProgress?: ProgressCallback,
  onMetadata?: MetadataCallback,
): Promise<ReceiveResult> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let metadata: TransferMetadata | null = null;
    let receivedBytes = 0;

    channel.binaryType = "arraybuffer";

    channel.onmessage = (event) => {
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

            // Combine all chunks
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

            resolve({ data: result.buffer, metadata });
          }
        } else {
          // Binary chunk
          const chunk = asArrayBuffer(event.data);
          chunks.push(chunk);
          receivedBytes += chunk.byteLength;

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
      if (chunks.length === 0) {
        reject(new Error("Channel closed before receiving data"));
      }
    };
  });
}

export interface ReceiveNextFileCallbacks {
  onProgress?: ProgressCallback;
  onMetadata?: MetadataCallback;
  /** Return false to ignore metadata (e.g. while sending a file back) */
  shouldAccept?: () => boolean;
}

/**
 * Receive the next file over an already-open DataChannel.
 * Waits for metadata/file-start, buffers chunks, resolves on complete/file-end.
 * Uses addEventListener so it can coexist with other listeners.
 */
export function receiveNextFile(
  channel: RTCDataChannel,
  callbacks?: ReceiveNextFileCallbacks,
  abort?: AbortController,
): Promise<ReceiveResult> {
  const signal = abort?.signal;
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let metadata: TransferMetadata | null = null;
    let receivedBytes = 0;
    let receiving = false;
    const unbindCancel = bindTransferCancel(channel, abort);

    channel.binaryType = "arraybuffer";

    const cleanup = () => {
      unbindCancel();
      channel.removeEventListener("message", handler);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new TransferCancelledError());
    };

    signal?.addEventListener("abort", onAbort);

    const handler = (event: MessageEvent) => {
      try {
        throwIfAborted(signal);

        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);

          if (msg.type === "transfer-cancel") {
            cleanup();
            reject(new TransferCancelledError());
            return;
          }

          if (
            (msg.type === "metadata" || msg.type === "file-start") &&
            !receiving
          ) {
            if (callbacks?.shouldAccept && !callbacks.shouldAccept()) {
              return;
            }
            receiving = true;
            metadata = msg.type === "file-start" ? msg.metadata : msg;
            if (metadata) {
              callbacks?.onMetadata?.(metadata);
              if (channel.readyState === "open") {
                channel.send(JSON.stringify({ type: "session-ready" }));
              }
            }
          } else if (
            (msg.type === "complete" || msg.type === "file-end") &&
            receiving
          ) {
            if (!metadata) {
              cleanup();
              reject(new Error("No metadata received"));
              return;
            }

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

            cleanup();
            resolve({ data: result.buffer, metadata });
          }
        } else if (receiving) {
          const chunk = asArrayBuffer(event.data);
          chunks.push(chunk);
          receivedBytes += chunk.byteLength;

          if (metadata?.encryptedSize) {
            callbacks?.onProgress?.(
              Math.round((receivedBytes / metadata.encryptedSize) * 100),
            );
          }
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    channel.addEventListener("message", handler);
    channel.onerror = (e) => {
      cleanup();
      reject(new Error(`DataChannel error: ${e}`));
    };
  });
}
