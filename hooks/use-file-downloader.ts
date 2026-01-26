"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  importKey,
  decryptFile,
  encryptFile,
  deriveKeyFromPassword,
  base64UrlToArrayBuffer,
} from "@/lib/crypto";
import {
  createPeerConnection,
  receiveFileStreaming,
  sendFile,
  supportsFileSystemAccess,
  openFileSaveStream,
  generateFileId,
  DEFAULT_ICE_SERVERS,
} from "@/lib/webrtc";
import type { FileMetadata } from "@/lib/webrtc";
import type {
  DownloaderConnectionState,
  TransferRecord,
  DownloaderState,
} from "@/lib/transfer";
import { signaling } from "@/lib/signaling";

// Re-export types for consumers
export type {
  DownloaderConnectionState as ConnectionState,
  TransferRecord,
  DownloaderState,
};

export function useFileDownloader(roomId: string, encryptionKey: string) {
  const isPasswordProtected = encryptionKey.startsWith("p_");
  const streamsSupported =
    typeof window !== "undefined" && supportsFileSystemAccess();

  const [state, setState] = useState<DownloaderState>({
    connectionState: isPasswordProtected ? "awaiting-password" : "connecting",
    progress: 0,
    error: null,
    fileName: null,
    fileSize: null,
    isPasswordProtected,
    supportsStreaming: streamsSupported,
    isConnected: false,
    transferHistory: [],
  });

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const cryptoKey = useRef<CryptoKey | null>(null);
  const salt = useRef<Uint8Array | null>(null);
  const hasStarted = useRef(false);
  const connectionStateRef = useRef<DownloaderConnectionState>(
    isPasswordProtected ? "awaiting-password" : "connecting",
  );
  const pendingChannel = useRef<RTCDataChannel | null>(null);
  const pendingMetadata = useRef<
    (FileMetadata & { encryptedSize: number }) | null
  >(null);
  const fileStream = useRef<{
    writable: FileSystemWritableFileStream;
    close: () => Promise<void>;
  } | null>(null);

  const updateState = useCallback((updates: Partial<DownloaderState>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates };
      if (updates.connectionState) {
        connectionStateRef.current = updates.connectionState;
      }
      return newState;
    });
  }, []);

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

  /**
   * Send a file back to the sender (bidirectional transfer)
   */
  const sendFileBack = useCallback(
    async (file: File) => {
      const channel = dataChannel.current || pendingChannel.current;
      const key = cryptoKey.current;

      if (!channel || channel.readyState !== "open") {
        updateState({
          error: "Connection not ready",
          connectionState: "error",
        });
        return;
      }

      if (!key) {
        updateState({ error: "No encryption key", connectionState: "error" });
        return;
      }

      const fileId = generateFileId();
      updateState({
        connectionState: "sending",
        progress: 0,
        error: null,
        fileName: file.name,
        fileSize: file.size,
      });

      try {
        const { encrypted, metadata } = await encryptFile(file, key, (p) =>
          updateState({ progress: p * 0.5 }),
        );

        await sendFile(
          channel,
          encrypted,
          metadata,
          (progress) => updateState({ progress: 50 + progress * 0.5 }),
          fileId,
        );

        setState((prev) => ({
          ...prev,
          connectionState: "ready",
          progress: 100,
          transferHistory: [
            ...prev.transferHistory,
            {
              fileId,
              fileName: file.name,
              fileSize: file.size,
              direction: "sent" as const,
              completedAt: new Date(),
            },
          ],
        }));
      } catch (error) {
        console.error("Send error:", error);
        updateState({ connectionState: "error", error: "Failed to send file" });
      }
    },
    [updateState],
  );

  /**
   * Called after user chooses save location (streaming mode only)
   */
  const startStreamingReceive = useCallback(async () => {
    const channel = pendingChannel.current;
    const metadata = pendingMetadata.current;
    const writable = fileStream.current?.writable ?? null;
    const key = cryptoKey.current;

    if (!channel || !metadata || !key) {
      updateState({
        connectionState: "error",
        error: "Missing data for streaming",
      });
      return;
    }

    updateState({ connectionState: "receiving", progress: 0 });

    try {
      const {
        data,
        metadata: receivedMetadata,
        streamed,
      } = await receiveFileStreaming(
        channel,
        writable,
        (progress) => updateState({ progress }),
        () => {},
      );

      if (streamed && fileStream.current) {
        await fileStream.current.close();

        setState((prev) => ({
          ...prev,
          connectionState: "ready",
          progress: 100,
          isConnected: true,
          transferHistory: [
            ...prev.transferHistory,
            {
              fileId: generateFileId(),
              fileName: receivedMetadata.name,
              fileSize: receivedMetadata.size,
              direction: "received" as const,
              completedAt: new Date(),
            },
          ],
        }));
      } else if (data) {
        updateState({ connectionState: "decrypting", progress: 100 });

        const decryptedBlob = await decryptFile(data, key, receivedMetadata);
        downloadFile(decryptedBlob, receivedMetadata.name);

        setState((prev) => ({
          ...prev,
          connectionState: "ready",
          isConnected: true,
          transferHistory: [
            ...prev.transferHistory,
            {
              fileId: generateFileId(),
              fileName: receivedMetadata.name,
              fileSize: receivedMetadata.size,
              direction: "received" as const,
              completedAt: new Date(),
            },
          ],
        }));
      }

      dataChannel.current = channel;
    } catch (error) {
      console.error("Receive error:", error);
      updateState({
        connectionState: "error",
        error: "Failed to receive file",
      });
    }
  }, [downloadFile, updateState]);

  /**
   * User picked a save location - proceed with receiving
   */
  const proceedWithSaveLocation = useCallback(async () => {
    const metadata = pendingMetadata.current;
    if (!metadata) {
      updateState({ connectionState: "error", error: "No metadata" });
      return;
    }

    const stream = await openFileSaveStream(metadata.name, metadata.mimeType);
    if (stream) {
      fileStream.current = stream;
    }

    await startStreamingReceive();
  }, [startStreamingReceive, updateState]);

  /**
   * User chose to download without picking location (fallback mode)
   */
  const proceedWithFallback = useCallback(async () => {
    fileStream.current = null;
    await startStreamingReceive();
  }, [startStreamingReceive]);

  const startConnection = useCallback(async () => {
    try {
      updateState({ connectionState: "connecting" });
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

      peerConnection.current.onconnectionstatechange = () => {
        const connState = peerConnection.current?.connectionState;
        if (connState === "connected") {
          updateState({ isConnected: true });
        } else if (connState === "disconnected" || connState === "failed") {
          updateState({ isConnected: false });
        }
      };

      peerConnection.current.ondatachannel = (event) => {
        const channel = event.channel;
        pendingChannel.current = channel;
        dataChannel.current = channel;

        updateState({ connectionState: "waiting-for-metadata" });

        channel.binaryType = "arraybuffer";

        const handleMetadata = (e: MessageEvent) => {
          if (typeof e.data === "string") {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === "metadata") {
                pendingMetadata.current = msg;
                updateState({
                  fileName: msg.name,
                  fileSize: msg.size,
                });

                channel.removeEventListener("message", handleMetadata);

                if (streamsSupported) {
                  updateState({ connectionState: "choosing-save-location" });
                } else {
                  proceedWithFallback();
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        };

        channel.addEventListener("message", handleMetadata);
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
        if (
          connectionStateRef.current !== "complete" &&
          connectionStateRef.current !== "ready"
        ) {
          updateState({
            connectionState: "error",
            error: "Sender disconnected",
          });
        } else {
          updateState({ isConnected: false });
        }
      });

      signaling.on("error", (message) => {
        updateState({ connectionState: "error", error: message });
      });
    } catch (error) {
      console.error("Connection error:", error);
      updateState({
        connectionState: "error",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }
  }, [roomId, updateState, streamsSupported, proceedWithFallback]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const init = async () => {
      try {
        if (isPasswordProtected) {
          const saltStr = encryptionKey.substring(2);
          salt.current = new Uint8Array(base64UrlToArrayBuffer(saltStr));
          return;
        }

        cryptoKey.current = await importKey(encryptionKey);
        await startConnection();
      } catch (error) {
        console.error("Init error:", error);
        updateState({
          connectionState: "error",
          error:
            error instanceof Error ? error.message : "Initialization failed",
        });
      }
    };

    init();

    return () => {
      peerConnection.current?.close();
      signaling.disconnect();
    };
  }, [
    roomId,
    encryptionKey,
    isPasswordProtected,
    startConnection,
    updateState,
  ]);

  const decryptWithPassword = useCallback(
    async (password: string) => {
      if (!salt.current) {
        updateState({ connectionState: "error", error: "Salt not found" });
        return;
      }

      try {
        cryptoKey.current = await deriveKeyFromPassword(password, salt.current);
        await startConnection();
      } catch (error) {
        console.error("Password error:", error);
        updateState({
          connectionState: "error",
          error: "Failed to derive key from password",
        });
      }
    },
    [startConnection, updateState],
  );

  return {
    state,
    decryptWithPassword,
    proceedWithSaveLocation,
    proceedWithFallback,
    sendFileBack,
  };
}
