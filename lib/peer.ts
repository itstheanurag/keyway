// WebRTC peer connection and data channel management

import type { FileMetadata } from "./crypto";

const CHUNK_SIZE = 16384; // 16KB chunks for DataChannel

export interface PeerConfig {
  iceServers: RTCIceServer[];
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// ============================================================================
// Multi-File Protocol Types
// ============================================================================

export type MessageType =
  | "metadata" // File metadata (legacy & new)
  | "complete" // Single file complete (legacy)
  | "file-start" // Multi-file: start of a file
  | "file-chunk" // Multi-file: chunk with fileId
  | "file-end" // Multi-file: end of a file
  | "session-ready" // Connection ready for transfers
  | "request-file"; // Receiver wants to send a file back

export interface TransferMessage {
  type: MessageType;
  fileId?: string;
  metadata?: FileMetadata & { encryptedSize: number };
  chunkIndex?: number;
  totalChunks?: number;
}

/**
 * Generate a unique file ID for multi-file transfers
 */
export function generateFileId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a new RTCPeerConnection with default config
 */
export function createPeerConnection(
  config: PeerConfig = { iceServers: DEFAULT_ICE_SERVERS },
): RTCPeerConnection {
  return new RTCPeerConnection(config);
}

/**
 * Create data channel for file transfer (sender side)
 */
export function createDataChannel(
  pc: RTCPeerConnection,
  label: string = "fileTransfer",
): RTCDataChannel {
  const channel = pc.createDataChannel(label, {
    ordered: true,
  });
  channel.binaryType = "arraybuffer";
  return channel;
}

/**
 * Send file data over DataChannel with progress tracking
 * Supports optional fileId for multi-file transfers
 */
export async function sendFile(
  channel: RTCDataChannel,
  encryptedData: ArrayBuffer,
  metadata: FileMetadata,
  onProgress?: (progress: number) => void,
  fileId?: string, // Optional: for multi-file transfers
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

      const sendNextChunk = () => {
        while (channel.bufferedAmount < CHUNK_SIZE * 10) {
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

          const chunk = data.slice(start, end);
          channel.send(chunk);
          sentChunks++;
          onProgress?.(Math.round((sentChunks / totalChunks) * 100));
        }

        // Wait for buffer to drain
        setTimeout(sendNextChunk, 50);
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
 * Receive file data over DataChannel with progress tracking
 */
export function receiveFile(
  channel: RTCDataChannel,
  onProgress?: (progress: number) => void,
  onMetadata?: (metadata: FileMetadata & { encryptedSize: number }) => void,
): Promise<{ data: ArrayBuffer; metadata: FileMetadata }> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let metadata: (FileMetadata & { encryptedSize: number }) | null = null;
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
          chunks.push(event.data);
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
      if (chunks.length === 0) {
        reject(new Error("Channel closed before receiving data"));
      }
    };
  });
}

// ============================================================================
// File System Access API for Streaming Downloads
// ============================================================================

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
  // Map common MIME types to file extensions
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

  // Fallback: accept all files
  return { "application/octet-stream": [""] };
}

/**
 * Open file save picker and return a writable stream
 */
export async function openFileSaveStream(
  fileName: string,
  mimeType: string,
): Promise<{
  writable: FileSystemWritableFileStream;
  close: () => Promise<void>;
} | null> {
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
    // User cancelled or API not available
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
  onProgress?: (progress: number) => void,
  onMetadata?: (metadata: FileMetadata & { encryptedSize: number }) => void,
): Promise<{
  data: ArrayBuffer | null;
  metadata: FileMetadata;
  streamed: boolean;
}> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = []; // Only used if not streaming
    let metadata: (FileMetadata & { encryptedSize: number }) | null = null;
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
              // Data was streamed to disk
              resolve({ data: null, metadata, streamed: true });
            } else {
              // Combine all chunks from memory
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
          // Binary chunk
          if (isStreaming && writable) {
            // Write directly to disk
            await writable.write(event.data);
          } else {
            // Buffer in memory
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
