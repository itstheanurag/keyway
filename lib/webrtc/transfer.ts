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
import { CHUNK_SIZE } from "./constants";
import { generateFileId } from "./connection";

const MAX_BUFFERED_BYTES = CHUNK_SIZE * 10;

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
  channel.send(toArrayBufferCopy(bytes));
}

function waitForBufferSpace(channel: RTCDataChannel): Promise<void> {
  if (channel.bufferedAmount <= MAX_BUFFERED_BYTES) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      channel.removeEventListener("bufferedamountlow", onBufferedAmountLow);
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
      }
      resolve();
    };

    const onBufferedAmountLow = () => {
      if (channel.bufferedAmount <= MAX_BUFFERED_BYTES) {
        finish();
      }
    };

    if ("bufferedAmountLowThreshold" in channel) {
      channel.bufferedAmountLowThreshold = MAX_BUFFERED_BYTES;
      channel.addEventListener("bufferedamountlow", onBufferedAmountLow);
    }

    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const id = fileId || generateFileId();

      // Send file-start message (new protocol)
      channel.send(
        JSON.stringify({
          type: "file-start",
          fileId: id,
          metadata: {
            ...metadata,
            encryptedSize: encryptedData.byteLength,
          },
        } as TransferMessage),
      );

      // Also send legacy metadata for backward compatibility
      channel.send(
        JSON.stringify({
          ...metadata,
          type: "metadata",
          encryptedSize: encryptedData.byteLength,
        }),
      );

      const data = new Uint8Array(encryptedData);
      const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
      let sentChunks = 0;

      const sendNextChunk = async () => {
        try {
          while (channel.bufferedAmount <= MAX_BUFFERED_BYTES) {
            const start = sentChunks * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, data.length);

            if (start >= data.length) {
              // All chunks sent - send file-end (new protocol)
              channel.send(
                JSON.stringify({
                  type: "file-end",
                  fileId: id,
                } as TransferMessage),
              );

              // Also send legacy complete for backward compatibility
              channel.send(JSON.stringify({ type: "complete" }));
              resolve();
              return;
            }

            sendBinaryChunk(channel, data.slice(start, end));
            sentChunks++;
            onProgress?.(Math.round((sentChunks / totalChunks) * 100));
          }

          await waitForBufferSpace(channel);
          sendNextChunk();
        } catch (error) {
          reject(error);
        }
      };

      // Wait for channel to be ready
      if (channel.readyState === "open") {
        sendNextChunk();
      } else {
        channel.onopen = () => sendNextChunk();
      }

      channel.onerror = (e) => reject(new Error(`DataChannel error: ${e}`));
    } catch (error) {
      reject(error);
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
): Promise<StreamingSendResult> {
  return new Promise((resolve, reject) => {
    try {
      const id = fileId || generateFileId();
      let totalBytesSent = 0;
      const expectedSize = metadata.size;

      // Send file-start message (new protocol)
      channel.send(
        JSON.stringify({
          type: "file-start",
          fileId: id,
          metadata: {
            ...metadata,
            encryptedSize: expectedSize,
          },
        } as TransferMessage),
      );

      // Also send legacy metadata for backward compatibility
      channel.send(
        JSON.stringify({
          ...metadata,
          type: "metadata",
          encryptedSize: expectedSize,
        }),
      );

      const reader = stream.getReader();

      const pump = async () => {
        try {
          const { done, value } = await reader.read();

          if (done) {
            // All chunks sent - send file-end (new protocol)
            channel.send(
              JSON.stringify({
                type: "file-end",
                fileId: id,
              } as TransferMessage),
            );

            // Also send legacy complete for backward compatibility
            channel.send(JSON.stringify({ type: "complete" }));
            resolve({ streamed: true, metadata });
            return;
          }

          if (value) {
            await waitForBufferSpace(channel);
            sendBinaryChunk(channel, value);
            totalBytesSent += value.byteLength;

            if (expectedSize > 0) {
              onProgress?.(Math.round((totalBytesSent / expectedSize) * 100));
            }
          }

          pump();
        } catch (error) {
          reject(error);
        }
      };

      // Wait for channel to be ready
      if (channel.readyState === "open") {
        pump();
      } else {
        channel.onopen = () => pump();
      }

      channel.onerror = (e) => reject(new Error(`DataChannel error: ${e}`));
    } catch (error) {
      reject(error);
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
): Promise<ReceiveResult> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let metadata: TransferMetadata | null = null;
    let receivedBytes = 0;
    let receiving = false;

    channel.binaryType = "arraybuffer";

    const cleanup = () => {
      channel.removeEventListener("message", handler);
    };

    const handler = (event: MessageEvent) => {
      try {
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);

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
