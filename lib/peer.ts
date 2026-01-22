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
 */
export async function sendFile(
  channel: RTCDataChannel,
  encryptedData: ArrayBuffer,
  metadata: FileMetadata,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Send metadata first
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
            // All chunks sent
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
