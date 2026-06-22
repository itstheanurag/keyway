"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  Copy,
  Check,
  Lock,
  File as FileIcon,
  Plus,
  Folder,
  FolderUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUploader } from "@/hooks/use-file-uploader";
import ShareQRCode from "@/components/ShareQRCode";
import {
  entriesFromDataTransfer,
  entriesFromFileList,
  isFolderShare,
} from "@/lib/folder";

export default function FileUploader() {
  const {
    state,
    handleFileSelect,
    handleFolderSelect,
    sendAdditionalFile,
    sendAdditionalFolder,
    cancelTransfer,
    reset: hookReset,
  } = useFileUploader();

  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInput = useRef<HTMLInputElement>(null);
  const additionalFolderInput = useRef<HTMLInputElement>(null);

  const getPassword = useCallback(
    () => (usePassword && password ? password : undefined),
    [usePassword, password],
  );

  const handleShareEntries = useCallback(
    async (entries: ReturnType<typeof entriesFromFileList>) => {
      if (entries.length === 0) return;

      if (state.isConnected) {
        if (isFolderShare(entries)) {
          await sendAdditionalFolder(entries);
        } else {
          await sendAdditionalFile(entries[0].file, entries[0].relativePath);
        }
        return;
      }

      if (isFolderShare(entries)) {
        await handleFolderSelect(entries, getPassword());
      } else {
        await handleFileSelect(entries[0].file, getPassword());
      }
    },
    [
      state.isConnected,
      sendAdditionalFolder,
      sendAdditionalFile,
      handleFolderSelect,
      handleFileSelect,
      getPassword,
    ],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const entries = await entriesFromDataTransfer(e.dataTransfer);
      await handleShareEntries(entries);
    },
    [handleShareEntries],
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const entries = entriesFromFileList(e.target.files ?? []);
      await handleShareEntries(entries);
      e.target.value = "";
    },
    [handleShareEntries],
  );

  const handleFolderInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const entries = entriesFromFileList(e.target.files ?? []);
      await handleShareEntries(entries);
      e.target.value = "";
    },
    [handleShareEntries],
  );

  const copyToClipboard = useCallback(() => {
    if (state.shareUrl) {
      navigator.clipboard.writeText(state.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [state.shareUrl]);

  const reset = () => {
    hookReset();
    setPassword("");
    setUsePassword(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusText = () => {
    switch (state.connectionState) {
      case "idle":
        return "Drop a file or folder to share";
      case "creating":
        return state.folder ? "Preparing folder..." : "Encrypting file...";
      case "waiting":
        return "Waiting for peer...";
      case "connecting":
        return "Connecting to peer...";
      case "transferring":
        return state.folder ? "Transferring folder..." : "Transferring file...";
      case "ready":
        return "Connected - Ready for more";
      case "complete":
        return "Transfer Completed";
      case "error":
        return "Error Occurred";
      default:
        return "";
    }
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {state.connectionState === "idle" ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="group relative"
          >
            <div
              className="
                relative flex flex-col items-center justify-center p-12 text-center
                border-2 border-dashed border-gray-200 rounded-3xl
                bg-gray-50/50 hover:bg-orange-50/30 hover:border-orange-200 transition-all duration-300
              "
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                // @ts-expect-error webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderInputChange}
              />

              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8 text-orange-500" />
              </div>

              <h3 className="text-xl font-bold text-[var(--muted)] mb-2">
                Share files or folders
              </h3>
              <p className="text-[var(--muted)] text-sm max-w-sm mx-auto mb-8">
                Drag and drop a file or folder, or use the buttons below.
                Everything is encrypted with AES-256 before leaving your device.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
                >
                  <FileIcon className="w-5 h-5" />
                  Select File
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-orange-200 transition-colors"
                >
                  <FolderUp className="w-5 h-5 text-orange-500" />
                  Select Folder
                </button>
              </div>

              <div
                className="w-full max-w-xs text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl">
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${usePassword ? "bg-orange-500 border-orange-500" : "border-[var(--border)] bg-[var(--card)]"}`}
                  >
                    <input
                      type="checkbox"
                      checked={usePassword}
                      onChange={(e) => setUsePassword(e.target.checked)}
                      className="hidden"
                    />
                    {usePassword && (
                      <Check className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-[var(--muted)]">
                    Password Protection
                  </span>
                </label>

                <AnimatePresence>
                  {usePassword && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-1">
                        <input
                          type="password"
                          placeholder="Enter password..."
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full mt-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm transition-all"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="status"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8"
          >
            {/* File / Folder Info */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                {state.folder ? (
                  <Folder className="w-6 h-6 text-orange-600" />
                ) : (
                  <FileIcon className="w-6 h-6 text-orange-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 truncate">
                  {state.folder
                    ? state.folder.name
                    : state.file?.name}
                </h4>
                <p className="text-sm text-gray-500">
                  {state.folder
                    ? `${state.folder.fileCount} files · ${formatBytes(state.folder.totalSize)}`
                    : state.file
                      ? formatBytes(state.file.size)
                      : ""}
                </p>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-medium">
                <span
                  className={
                    state.connectionState === "error"
                      ? "text-red-500"
                      : state.connectionState === "ready"
                        ? "text-green-600"
                        : "text-[var(--muted)]"
                  }
                >
                  {state.error || getStatusText()}
                </span>
                <span className="text-[var(--muted)]">
                  {Math.round(state.progress)}%
                </span>
              </div>

              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${
                    state.connectionState === "error"
                      ? "bg-red-500"
                      : state.connectionState === "ready"
                        ? "bg-green-500"
                        : "bg-orange-500"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${state.progress}%` }}
                  transition={{ type: "spring", stiffness: 50 }}
                />
              </div>

              {state.connectionState === "transferring" && (
                <button
                  type="button"
                  onClick={cancelTransfer}
                  className="w-full py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                >
                  Cancel transfer
                </button>
              )}
            </div>

            {/* Share Link & QR Code */}
            {state.shareUrl && state.connectionState === "waiting" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-100 text-[var(--muted)]"
              >
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <ShareQRCode url={state.shareUrl} size={140} />
                  <div className="flex-1 w-full">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Share Link
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={state.shareUrl}
                        className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none"
                      />
                      <button
                        onClick={copyToClipboard}
                        className="p-2 bg-transparent border border-[var(--border)] rounded-xl hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-colors"
                      >
                        {copied ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-xs text-orange-600 font-medium">
                      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      Waiting for peer to connect...
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Ready State */}
            {state.connectionState === "ready" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 space-y-4"
              >
                {state.transferHistory.length > 0 && (
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-green-700">
                        Sent ({state.transferHistory.length})
                      </span>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {state.transferHistory.map((transfer) => (
                        <div
                          key={transfer.fileId}
                          className="flex items-center gap-2 text-sm text-green-700"
                        >
                          <FileIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate flex-1">
                            {transfer.fileName}
                          </span>
                          <span className="text-xs text-green-600">
                            {formatBytes(transfer.fileSize)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className="p-5 border-2 border-dashed border-green-200 rounded-2xl bg-green-50/50 hover:bg-green-50 hover:border-green-300 transition-all cursor-pointer text-center"
                    onClick={() => additionalFileInput.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <input
                      ref={additionalFileInput}
                      type="file"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-green-700">Add File</p>
                        <p className="text-xs text-green-600">
                          Over same connection
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-5 border-2 border-dashed border-green-200 rounded-2xl bg-green-50/50 hover:bg-green-50 hover:border-green-300 transition-all cursor-pointer text-center"
                    onClick={() => additionalFolderInput.current?.click()}
                  >
                    <input
                      ref={additionalFolderInput}
                      type="file"
                      className="hidden"
                      // @ts-expect-error webkitdirectory is non-standard but widely supported
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFolderInputChange}
                    />
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                        <FolderUp className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-green-700">Add Folder</p>
                        <p className="text-xs text-green-600">
                          Preserves structure
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {state.shareUrl && (
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex flex-col sm:flex-row gap-6 items-center">
                      <ShareQRCode url={state.shareUrl} size={120} />
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            Share Link
                          </span>
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            Connected
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={state.shareUrl}
                            className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none"
                          />
                          <button
                            onClick={copyToClipboard}
                            className="p-2 bg-transparent border border-gray-200 rounded-xl hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-colors"
                          >
                            {copied ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <Copy className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={reset}
                  className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                >
                  End Session
                </button>
              </motion.div>
            )}

            {(state.connectionState === "complete" ||
              state.connectionState === "error") && (
              <motion.button
                onClick={reset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full mt-8 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
              >
                Share Again
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}