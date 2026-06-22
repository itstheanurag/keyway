// Shared Transfer Types for Hooks

/**
 * Connection state for file uploader
 */
export type UploaderConnectionState =
  | "idle"
  | "creating"
  | "waiting"
  | "connecting"
  | "transferring"
  | "ready"
  | "complete"
  | "error";

/**
 * Connection state for file downloader
 */
export type DownloaderConnectionState =
  | "awaiting-password"
  | "connecting"
  | "waiting-for-metadata"
  | "choosing-save-location"
  | "choosing-save-folder"
  | "receiving"
  | "receiving-folder"
  | "decrypting"
  | "ready"
  | "sending"
  | "complete"
  | "error";

/**
 * Transfer history record for uploader
 */
export interface TransferHistory {
  fileId: string;
  fileName: string;
  fileSize: number;
  completedAt: Date;
}

/**
 * Transfer record with direction for downloader
 */
export interface TransferRecord {
  fileId: string;
  fileName: string;
  fileSize: number;
  direction: "received" | "sent";
  completedAt: Date;
}

/**
 * State for file uploader hook
 */
export interface FolderShareInfo {
  name: string;
  fileCount: number;
  totalSize: number;
}

export interface FileUploaderState {
  file: File | null;
  folder: FolderShareInfo | null;
  shareUrl: string | null;
  connectionState: UploaderConnectionState;
  progress: number;
  error: string | null;
  transferHistory: TransferHistory[];
  isConnected: boolean;
}

/**
 * State for file downloader hook
 */
export interface DownloaderState {
  connectionState: DownloaderConnectionState;
  progress: number;
  error: string | null;
  fileName: string | null;
  fileSize: number | null;
  folder: FolderShareInfo | null;
  folderProgress: { received: number; total: number } | null;
  isPasswordProtected: boolean;
  supportsStreaming: boolean;
  supportsDirectoryPicker: boolean;
  isConnected: boolean;
  transferHistory: TransferRecord[];
}
