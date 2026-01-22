"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  generateKey,
  exportKey,
  encryptFile,
  type FileMetadata,
} from "@/lib/crypto";
import {
  createPeerConnection,
  createDataChannel,
  sendFile,
  DEFAULT_ICE_SERVERS,
} from "@/lib/peer";
import { signaling } from "@/lib/signaling";

type ConnectionState =
  | "idle"
  | "creating"
  | "waiting"
  | "connecting"
  | "transferring"
  | "complete"
  | "error";

interface FileUploaderState {
  file: File | null;
  shareUrl: string | null;
  connectionState: ConnectionState;
  progress: number;
  error: string | null;
}

export default function FileUploader() {
  const [state, setState] = useState<FileUploaderState>({
    file: null,
    shareUrl: null,
    connectionState: "idle",
    progress: 0,
    error: null,
  });
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const encryptionKey = useRef<CryptoKey | null>(null);
  const encryptedData = useRef<ArrayBuffer | null>(null);
  const fileMetadata = useRef<FileMetadata | null>(null);

  const updateState = (updates: Partial<FileUploaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const handleFileSelect = useCallback(async (file: File) => {
    updateState({
      file,
      shareUrl: null,
      connectionState: "creating",
      progress: 0,
      error: null,
    });

    try {
      // Generate encryption key
      encryptionKey.current = await generateKey();
      const keyString = await exportKey(encryptionKey.current);

      // Encrypt file
      updateState({ progress: 10 });
      const { encrypted, metadata } = await encryptFile(
        file,
        encryptionKey.current,
        (p) => {
          updateState({ progress: 10 + p * 0.3 });
        },
      );
      encryptedData.current = encrypted;
      fileMetadata.current = metadata;
      updateState({ progress: 40 });

      // Connect to signaling server
      await signaling.connect();
      updateState({ progress: 50 });

      // Create room
      const roomId = uuidv4().slice(0, 8); // Shorter room ID for easier sharing
      await signaling.createRoom(roomId);
      updateState({ progress: 60 });

      // Generate share URL with optional password indicator
      const shareUrl = `${window.location.origin}/d/${roomId}#${keyString}`;
      updateState({ shareUrl, connectionState: "waiting", progress: 100 });

      // Setup WebRTC
      setupWebRTC();
    } catch (error) {
      console.error("Setup error:", error);
      updateState({
        connectionState: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  const setupWebRTC = useCallback(() => {
    peerConnection.current = createPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
    });
    dataChannel.current = createDataChannel(peerConnection.current);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendIceCandidate(event.candidate.toJSON());
      }
    };

    signaling.on("peer-joined", async () => {
      updateState({ connectionState: "connecting" });

      try {
        const offer = await peerConnection.current!.createOffer();
        await peerConnection.current!.setLocalDescription(offer);
        signaling.sendOffer(offer);
      } catch (error) {
        console.error("Offer error:", error);
        updateState({
          connectionState: "error",
          error: "Failed to create connection",
        });
      }
    });

    signaling.on("answer", async (sdp) => {
      try {
        await peerConnection.current!.setRemoteDescription(sdp);
      } catch (error) {
        console.error("Answer error:", error);
      }
    });

    signaling.on("ice-candidate", async (candidate) => {
      try {
        await peerConnection.current!.addIceCandidate(candidate);
      } catch (error) {
        console.error("ICE error:", error);
      }
    });

    dataChannel.current.onopen = async () => {
      updateState({ connectionState: "transferring", progress: 0 });

      try {
        await sendFile(
          dataChannel.current!,
          encryptedData.current!,
          fileMetadata.current!,
          (progress) => updateState({ progress }),
        );
        updateState({ connectionState: "complete", progress: 100 });
      } catch (error) {
        console.error("Transfer error:", error);
        updateState({ connectionState: "error", error: "Transfer failed" });
      }
    };

    signaling.on("peer-disconnected", () => {
      if (state.connectionState !== "complete") {
        updateState({ connectionState: "error", error: "Peer disconnected" });
      }
    });
  }, [state.connectionState]);

  useEffect(() => {
    return () => {
      dataChannel.current?.close();
      peerConnection.current?.close();
      signaling.disconnect();
    };
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const copyToClipboard = useCallback(() => {
    if (state.shareUrl) {
      navigator.clipboard.writeText(state.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [state.shareUrl]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusMessage = () => {
    switch (state.connectionState) {
      case "idle":
        return "Select a file to share";
      case "creating":
        return "Encrypting your file...";
      case "waiting":
        return "Waiting for recipient...";
      case "connecting":
        return "Establishing secure connection...";
      case "transferring":
        return "Transferring encrypted file...";
      case "complete":
        return "Transfer complete!";
      case "error":
        return state.error || "An error occurred";
      default:
        return "";
    }
  };

  const reset = () => {
    dataChannel.current?.close();
    peerConnection.current?.close();
    signaling.disconnect();
    setState({
      file: null,
      shareUrl: null,
      connectionState: "idle",
      progress: 0,
      error: null,
    });
    setPassword("");
    setUsePassword(false);
  };

  return (
    <div className="w-full">
      {/* File Drop Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200 min-h-[200px] flex flex-col items-center justify-center
          ${
            state.connectionState === "idle"
              ? "border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
              : "border-[var(--border)] bg-[var(--card)]"
          }
        `}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() =>
          state.connectionState === "idle" &&
          document.getElementById("file-input")?.click()
        }
      >
        <input
          id="file-input"
          type="file"
          className="hidden"
          onChange={handleInputChange}
          disabled={state.connectionState !== "idle"}
        />

        {state.connectionState === "idle" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[var(--primary-light)] flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-[var(--primary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-[var(--foreground)] mb-1">
              Drop a file here or click to select
            </p>
            <p className="text-sm text-[var(--muted)]">
              Your file will be encrypted before sharing
            </p>
          </>
        )}

        {state.file && state.connectionState !== "idle" && (
          <div className="w-full">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--accent-light)] flex items-center justify-center">
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
            </div>
            <p className="font-medium text-[var(--foreground)] truncate max-w-xs mx-auto">
              {state.file.name}
            </p>
            <p className="text-sm text-[var(--muted)]">
              {formatBytes(state.file.size)}
            </p>
          </div>
        )}
      </div>

      {/* Password Option */}
      {state.connectionState === "idle" && (
        <div className="mt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(e) => setUsePassword(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <span className="text-sm text-[var(--muted)]">
              Add password protection
            </span>
          </label>

          {usePassword && (
            <input
              type="password"
              placeholder="Enter a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-3 w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
            />
          )}
        </div>
      )}

      {/* Status & Progress */}
      {state.connectionState !== "idle" && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {getStatusMessage()}
            </span>
            {state.connectionState === "transferring" && (
              <span className="text-sm text-[var(--muted)]">
                {state.progress}%
              </span>
            )}
          </div>

          {(state.connectionState === "creating" ||
            state.connectionState === "connecting" ||
            state.connectionState === "transferring") && (
            <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          )}

          {state.connectionState === "waiting" && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <div className="w-2 h-2 bg-[var(--warning)] rounded-full animate-pulse" />
              <span>Keep this page open until transfer completes</span>
            </div>
          )}
        </div>
      )}

      {/* Share Link */}
      {state.shareUrl && state.connectionState === "waiting" && (
        <div className="mt-6 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <p className="text-sm font-medium text-[var(--foreground)] mb-3">
            Share this link:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={state.shareUrl}
              readOnly
              className="flex-1 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono truncate"
            />
            <button
              onClick={copyToClipboard}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                copied
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Success State */}
      {state.connectionState === "complete" && (
        <div className="mt-6 p-4 rounded-xl bg-[var(--accent-light)] border border-[var(--accent)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
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
            <div>
              <p className="font-medium text-[var(--foreground)]">
                Transfer complete!
              </p>
              <p className="text-sm text-[var(--muted)]">
                Your file was securely delivered
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {state.connectionState === "error" && (
        <div className="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-[var(--error)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--error)] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
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
            <div>
              <p className="font-medium text-[var(--foreground)]">
                Something went wrong
              </p>
              <p className="text-sm text-[var(--muted)]">{state.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Reset Button */}
      {(state.connectionState === "complete" ||
        state.connectionState === "error") && (
        <button
          onClick={reset}
          className="mt-4 w-full py-3 rounded-xl border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--card-hover)] transition-colors"
        >
          Share another file
        </button>
      )}
    </div>
  );
}
