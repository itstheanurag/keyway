"use client";

import { useState, useRef, useCallback } from "react";
import {
  Lock,
  Download,
  FolderDown,
  HardDrive,
  Plus,
  ArrowUpDown,
  File as FileIcon,
  Check,
  Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFileDownloader } from "@/hooks/use-file-downloader";

interface FileDownloaderProps {
  roomId: string;
  encryptionKey: string;
}

export default function FileDownloader({
  roomId,
  encryptionKey,
}: FileDownloaderProps) {
  const {
    state,
    decryptWithPassword,
    proceedWithSaveLocation,
    proceedWithFallback,
    sendFileBack,
  } = useFileDownloader(roomId, encryptionKey);
  const [password, setPassword] = useState("");
  const sendFileInput = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    decryptWithPassword(password);
  };

  const handleSendFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        sendFileBack(file);
        e.target.value = ""; // Reset input
      }
    },
    [sendFileBack],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && state.isConnected) {
        sendFileBack(file);
      }
    },
    [sendFileBack, state.isConnected],
  );

  return (
    <div className="w-full">
      {/* Awaiting Password */}
      {state.connectionState === "awaiting-password" && (
        <div className="py-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-orange-600" />
          </div>
          <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
            Password Protected
          </h3>
          <p className="text-gray-500 text-center text-sm mb-8">
            This file is encrypted with a password. Enter it below to decrypt
            and download.
          </p>
          <form onSubmit={handlePasswordSubmit} className="max-w-xs mx-auto">
            <input
              type="password"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all mb-4"
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
            >
              Decrypt File
            </button>
          </form>
        </div>
      )}

      {/* Connecting State */}
      {state.connectionState === "connecting" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[var(--primary-light)] flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="font-medium text-[var(--foreground)] mb-1">
            Connecting to sender
          </h3>
          <p className="text-sm text-[var(--muted)]">
            Establishing secure connection...
          </p>
        </div>
      )}

      {/* Waiting for Metadata State */}
      {state.connectionState === "waiting-for-metadata" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[var(--primary-light)] flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="font-medium text-[var(--foreground)] mb-1">
            Connected
          </h3>
          <p className="text-sm text-[var(--muted)]">
            Waiting for file information...
          </p>
        </div>
      )}

      {/* Choose Save Location State */}
      {state.connectionState === "choosing-save-location" && (
        <div className="py-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-[var(--accent-light)] flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-7 h-7 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[var(--foreground)] truncate">
                {state.fileName}
              </p>
              {state.fileSize && (
                <p className="text-sm text-[var(--muted)]">
                  {formatBytes(state.fileSize)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={proceedWithSaveLocation}
              className="w-full py-3.5 bg-[var(--primary)] text-white font-medium rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/20"
            >
              <FolderDown className="w-5 h-5" />
              Choose Save Location
            </button>
            <button
              onClick={proceedWithFallback}
              className="w-full py-3 bg-[var(--border)] text-[var(--foreground)] font-medium rounded-xl hover:bg-[var(--border)]/80 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Quick Download
            </button>
            <p className="text-xs text-center text-[var(--muted)]">
              Choose a location to stream directly to disk, or quick download to
              browser default
            </p>
          </div>
        </div>
      )}

      {/* Receiving State */}
      {state.connectionState === "receiving" && (
        <div className="py-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-light)] flex items-center justify-center flex-shrink-0">
              <Download className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[var(--foreground)] truncate">
                {state.fileName || "Receiving file..."}
              </p>
              {state.fileSize && (
                <p className="text-sm text-[var(--muted)]">
                  {formatBytes(state.fileSize)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Downloading...</span>
              <span className="font-medium text-[var(--foreground)]">
                {state.progress}%
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[var(--primary)] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${state.progress}%` }}
                transition={{ type: "spring", stiffness: 50 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sending State */}
      {state.connectionState === "sending" && (
        <div className="py-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Send className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[var(--foreground)] truncate">
                {state.fileName || "Sending file..."}
              </p>
              {state.fileSize && (
                <p className="text-sm text-[var(--muted)]">
                  {formatBytes(state.fileSize)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Sending...</span>
              <span className="font-medium text-[var(--foreground)]">
                {state.progress}%
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${state.progress}%` }}
                transition={{ type: "spring", stiffness: 50 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Decrypting State */}
      {state.connectionState === "decrypting" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-[var(--accent)] animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="font-medium text-[var(--foreground)] mb-1">
            Decrypting file
          </h3>
          <p className="text-sm text-[var(--muted)]">Almost done...</p>
        </div>
      )}

      {/* Ready State - Bidirectional Transfer UI */}
      {state.connectionState === "ready" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-6 space-y-4"
        >
          {/* Connection Status */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${state.isConnected ? "bg-green-500" : "bg-gray-400"}`}
            />
            <span
              className={
                state.isConnected
                  ? "text-green-600 font-medium"
                  : "text-gray-500"
              }
            >
              {state.isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Transfer History */}
          {state.transferHistory.length > 0 && (
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpDown className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Transfer History ({state.transferHistory.length})
                </span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {state.transferHistory.map((transfer) => (
                  <div
                    key={transfer.fileId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <FileIcon
                      className={`w-4 h-4 ${transfer.direction === "received" ? "text-green-600" : "text-blue-600"}`}
                    />
                    <span className="truncate flex-1 text-gray-700">
                      {transfer.fileName}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        transfer.direction === "received"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {transfer.direction === "received"
                        ? "↓ Received"
                        : "↑ Sent"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send File Back Button */}
          {state.isConnected && (
            <div
              className="p-6 border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer text-center"
              onClick={() => sendFileInput.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={sendFileInput}
                type="file"
                className="hidden"
                onChange={handleSendFileChange}
              />
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Send className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-blue-700">Send a File Back</p>
                  <p className="text-xs text-blue-600">
                    Drop or click to share a file with the sender
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          <div className="text-center p-4 bg-green-50 rounded-xl border border-green-100">
            <Check className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-green-700 font-medium">
              File transfer complete!
            </p>
            <p className="text-xs text-green-600 mt-1">
              You can send files back while connected.
            </p>
          </div>
        </motion.div>
      )}

      {/* Complete State (legacy/fallback) */}
      {state.connectionState === "complete" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[var(--accent)] flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="font-medium text-[var(--foreground)] mb-1">
            Download complete!
          </h3>
          <p className="text-sm text-[var(--muted)]">
            {state.fileName} has been saved
          </p>
        </div>
      )}

      {/* Error State */}
      {state.connectionState === "error" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-[var(--error)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h3 className="font-medium text-[var(--foreground)] mb-1">
            Something went wrong
          </h3>
          <p className="text-sm text-[var(--muted)]">{state.error}</p>
        </div>
      )}
    </div>
  );
}
