"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { importKey, decryptFile, type FileMetadata } from "@/lib/crypto";
import {
  createPeerConnection,
  receiveFile,
  DEFAULT_ICE_SERVERS,
} from "@/lib/peer";
import { signaling } from "@/lib/signaling";

type ConnectionState =
  | "connecting"
  | "receiving"
  | "decrypting"
  | "complete"
  | "error";

interface FileDownloaderProps {
  roomId: string;
  encryptionKey: string;
}

interface DownloaderState {
  connectionState: ConnectionState;
  progress: number;
  error: string | null;
  fileName: string | null;
  fileSize: number | null;
}

export default function FileDownloader({
  roomId,
  encryptionKey,
}: FileDownloaderProps) {
  const [state, setState] = useState<DownloaderState>({
    connectionState: "connecting",
    progress: 0,
    error: null,
    fileName: null,
    fileSize: null,
  });

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const cryptoKey = useRef<CryptoKey | null>(null);
  const hasStarted = useRef(false);

  const updateState = (updates: Partial<DownloaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const downloadFile = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const start = async () => {
      try {
        cryptoKey.current = await importKey(encryptionKey);
        await signaling.connect();
        await signaling.joinRoom(roomId);

        peerConnection.current = createPeerConnection({
          iceServers: DEFAULT_ICE_SERVERS,
        });

        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            signaling.sendIceCandidate(event.candidate.toJSON());
          }
        };

        peerConnection.current.ondatachannel = (event) => {
          const channel = event.channel;
          updateState({ connectionState: "receiving" });

          receiveFile(
            channel,
            (progress) => updateState({ progress }),
            (metadata) =>
              updateState({ fileName: metadata.name, fileSize: metadata.size }),
          )
            .then(async ({ data, metadata }) => {
              updateState({ connectionState: "decrypting", progress: 100 });

              try {
                const decryptedBlob = await decryptFile(
                  data,
                  cryptoKey.current!,
                  metadata,
                );
                downloadFile(decryptedBlob, metadata.name);
                updateState({ connectionState: "complete" });
              } catch (error) {
                console.error("Decryption error:", error);
                updateState({
                  connectionState: "error",
                  error: "Failed to decrypt file",
                });
              }
            })
            .catch((error) => {
              console.error("Receive error:", error);
              updateState({
                connectionState: "error",
                error: "Failed to receive file",
              });
            });
        };

        signaling.on("offer", async (sdp) => {
          try {
            await peerConnection.current!.setRemoteDescription(sdp);
            const answer = await peerConnection.current!.createAnswer();
            await peerConnection.current!.setLocalDescription(answer);
            signaling.sendAnswer(answer);
          } catch (error) {
            console.error("Answer error:", error);
            updateState({
              connectionState: "error",
              error: "Connection failed",
            });
          }
        });

        signaling.on("ice-candidate", async (candidate) => {
          try {
            await peerConnection.current!.addIceCandidate(candidate);
          } catch (error) {
            console.error("ICE error:", error);
          }
        });

        signaling.on("peer-disconnected", () => {
          if (state.connectionState !== "complete") {
            updateState({
              connectionState: "error",
              error: "Sender disconnected",
            });
          }
        });

        signaling.on("error", (message) => {
          updateState({ connectionState: "error", error: message });
        });
      } catch (error) {
        console.error("Setup error:", error);
        updateState({
          connectionState: "error",
          error: error instanceof Error ? error.message : "Connection failed",
        });
      }
    };

    start();

    return () => {
      peerConnection.current?.close();
      signaling.disconnect();
    };
  }, [roomId, encryptionKey, downloadFile, state.connectionState]);

  return (
    <div className="w-full">
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
