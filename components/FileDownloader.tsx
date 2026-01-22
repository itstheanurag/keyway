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

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const start = async () => {
      try {
        // Import encryption key
        cryptoKey.current = await importKey(encryptionKey);

        // Connect to signaling server
        await signaling.connect();
        await signaling.joinRoom(roomId);

        // Setup WebRTC
        peerConnection.current = createPeerConnection({
          iceServers: DEFAULT_ICE_SERVERS,
        });

        // Handle ICE candidates
        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            signaling.sendIceCandidate(event.candidate.toJSON());
          }
        };

        // Handle incoming data channel
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

        // Handle offer from sender
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

        // Handle ICE candidates from sender
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusMessage = () => {
    switch (state.connectionState) {
      case "connecting":
        return "Connecting to sender...";
      case "receiving":
        return "Receiving file...";
      case "decrypting":
        return "Decrypting file...";
      case "complete":
        return "Download complete!";
      case "error":
        return state.error || "An error occurred";
      default:
        return "";
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6">
      <div className="border-2 border-gray-200 rounded-lg p-8 text-center">
        {state.connectionState === "connecting" && (
          <>
            <div className="text-4xl mb-4 animate-pulse">🔗</div>
            <p className="text-lg font-medium">{getStatusMessage()}</p>
            <p className="text-sm text-gray-500 mt-2">
              Please wait while we connect you to the sender
            </p>
          </>
        )}

        {state.connectionState === "receiving" && (
          <>
            <div className="text-4xl mb-4">📥</div>
            {state.fileName && (
              <>
                <p className="text-lg font-medium">{state.fileName}</p>
                {state.fileSize && (
                  <p className="text-sm text-gray-500">
                    {formatBytes(state.fileSize)}
                  </p>
                )}
              </>
            )}
            <p className="text-gray-600 mt-4">{getStatusMessage()}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">{state.progress}%</p>
          </>
        )}

        {state.connectionState === "decrypting" && (
          <>
            <div className="text-4xl mb-4 animate-spin">🔓</div>
            <p className="text-lg font-medium">{getStatusMessage()}</p>
          </>
        )}

        {state.connectionState === "complete" && (
          <div className="text-green-600">
            <div className="text-4xl mb-4">✓</div>
            <p className="text-lg font-medium">{getStatusMessage()}</p>
            {state.fileName && (
              <p className="text-sm text-gray-500 mt-2">
                {state.fileName} has been downloaded
              </p>
            )}
          </div>
        )}

        {state.connectionState === "error" && (
          <div className="text-red-600">
            <div className="text-4xl mb-4">✗</div>
            <p className="text-lg font-medium">Error</p>
            <p className="text-sm mt-2">{state.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
