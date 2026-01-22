"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useFileDownloader } from "@/hooks/use-file-downloader";

interface FileDownloaderProps {
  roomId: string;
  encryptionKey: string;
}

export default function FileDownloader({
  roomId,
  encryptionKey,
}: FileDownloaderProps) {
  const { state, decryptWithPassword } = useFileDownloader(
    roomId,
    encryptionKey,
  );
  const [password, setPassword] = useState("");

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
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all mb-4"
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

      {/* Receiving State */}
      {state.connectionState === "receiving" && (
        <div className="py-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-light)] flex items-center justify-center flex-shrink-0">
              <svg
                className="w-6 h-6 text-[var(--accent)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
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
              <div
                className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
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

      {/* Complete State */}
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
