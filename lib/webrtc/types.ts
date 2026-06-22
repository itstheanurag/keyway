// WebRTC Types and Interfaces

import type { FileMetadata } from "../crypto";

// Re-export FileMetadata for convenience
export type { FileMetadata };

/**
 * Configuration for RTCPeerConnection
 */
export interface PeerConfig {
  iceServers: RTCIceServer[];
}

/**
 * Message types for the file transfer protocol
 */
export type MessageType =
  | "metadata" // File metadata (legacy & new)
  | "complete" // Single file complete (legacy)
  | "file-start" // Multi-file: start of a file
  | "file-chunk" // Multi-file: chunk with fileId
  | "file-end" // Multi-file: end of a file
  | "session-ready" // Connection ready for transfers
  | "request-file"; // Receiver wants to send a file back

/**
 * Message structure for file transfer protocol
 */
export interface TransferMessage {
  type: MessageType;
  fileId?: string;
  metadata?: FileMetadata & { encryptedSize: number };
  chunkIndex?: number;
  totalChunks?: number;
}

/**
 * Extended metadata with encrypted size
 */
export interface TransferMetadata extends FileMetadata {
  encryptedSize: number;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: number) => void;

/**
 * Metadata callback type
 */
export type MetadataCallback = (metadata: TransferMetadata) => void;

/**
 * Result of receiving a file
 */
export interface ReceiveResult {
  data: ArrayBuffer;
  metadata: FileMetadata;
}

/**
 * Result of streaming receive
 */
export interface StreamingReceiveResult {
  data: ArrayBuffer | null;
  metadata: FileMetadata;
  streamed: boolean;
}

/**
 * File save stream handle
 */
export interface FileSaveStream {
  writable: FileSystemWritableFileStream;
  close: () => Promise<void>;
}
