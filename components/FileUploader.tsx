"use client";

import { useState, useCallback } from "react";
import { Upload, X, Copy, Check, Lock, File as FileIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUploader } from "@/hooks/use-file-uploader";

export default function FileUploader() {
  const { state, handleFileSelect, reset: hookReset } = useFileUploader();

  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file)
        handleFileSelect(file, usePassword && password ? password : undefined);
    },
    [handleFileSelect, usePassword, password],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file)
        handleFileSelect(file, usePassword && password ? password : undefined);
    },
    [handleFileSelect, usePassword, password],
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

  const getStatusText = () => {
    switch (state.connectionState) {
      case "idle":
        return "Drop file to upload";
      case "creating":
        return "Encrypting file...";
      case "waiting":
        return "Waiting for peer...";
      case "connecting":
        return "Connecting to peer...";
      case "transferring":
        return "Transferring file...";
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
                cursor-pointer
              "
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                onChange={handleInputChange}
              />

              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8 text-orange-500" />
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Click or drag file to upload
              </h3>
              <p className="text-gray-500 text-sm max-w-xs mx-auto mb-8">
                Files are encrypted with AES-256 before leaving your device.
              </p>

              <div
                className="w-full max-w-xs text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-white/60 transition-colors">
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${usePassword ? "bg-orange-500 border-orange-500" : "border-gray-300 bg-white"}`}
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
                  <span className="text-sm font-medium text-gray-600">
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
                      <input
                        type="password"
                        placeholder="Enter password..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full mt-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 text-sm transition-all"
                      />
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
            {/* File Info */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <FileIcon className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 truncate">
                  {state.file?.name}
                </h4>
                <p className="text-sm text-gray-500">
                  {state.file
                    ? (state.file.size / 1024 / 1024).toFixed(2) + " MB"
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
                      : "text-gray-900"
                  }
                >
                  {state.error || getStatusText()}
                </span>
                <span className="text-gray-500">
                  {Math.round(state.progress)}%
                </span>
              </div>

              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${state.connectionState === "error" ? "bg-red-500" : "bg-orange-500"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${state.progress}%` }}
                  transition={{ type: "spring", stiffness: 50 }}
                />
              </div>
            </div>

            {/* Share Link */}
            {state.shareUrl && state.connectionState === "waiting" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Share Link
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={state.shareUrl}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 font-mono focus:outline-none"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-colors"
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
                Send Another File
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
