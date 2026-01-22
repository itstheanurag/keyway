"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  importKey,
  decryptFile,
  deriveKeyFromPassword,
  base64UrlToArrayBuffer,
} from "@/lib/crypto";
import {
  createPeerConnection,
  receiveFile,
  DEFAULT_ICE_SERVERS,
} from "@/lib/peer";
import { signaling } from "@/lib/signaling";

export type ConnectionState =
  | "awaiting-password"
  | "connecting"
  | "receiving"
  | "decrypting"
  | "complete"
  | "error";

export interface DownloaderState {
  connectionState: ConnectionState;
  progress: number;
  error: string | null;
  fileName: string | null;
  fileSize: number | null;
  isPasswordProtected: boolean;
}

export function useFileDownloader(roomId: string, encryptionKey: string) {
  const isPasswordProtected = encryptionKey.startsWith("p_");

  const [state, setState] = useState<DownloaderState>({
    connectionState: isPasswordProtected ? "awaiting-password" : "connecting",
    progress: 0,
    error: null,
    fileName: null,
    fileSize: null,
    isPasswordProtected,
  });

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const cryptoKey = useRef<CryptoKey | null>(null);
  const receivedData = useRef<{ data: ArrayBuffer; metadata: any } | null>(
    null,
  );
  const salt = useRef<Uint8Array | null>(null);
  const hasStarted = useRef(false);
  const connectionStateRef = useRef<ConnectionState>(
    isPasswordProtected ? "awaiting-password" : "connecting",
  );

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

  const proceedWithDecryption = useCallback(async () => {
    if (!receivedData.current || !cryptoKey.current) return;

    updateState({ connectionState: "decrypting", progress: 100 });
    try {
      const { data, metadata } = receivedData.current;
      const decryptedBlob = await decryptFile(
        data,
        cryptoKey.current,
        metadata,
      );
      downloadFile(decryptedBlob, metadata.name);
      updateState({ connectionState: "complete" });
    } catch (error) {
      console.error("Decryption error:", error);
      updateState({
        connectionState: "error",
        error: "Incorrect password or corrupted file",
      });
    }
  }, [downloadFile, updateState]);

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
            receivedData.current = { data, metadata };
            await proceedWithDecryption();
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
        if (connectionStateRef.current !== "complete") {
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
      console.error("Connection error:", error);
      updateState({
        connectionState: "error",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }
  }, [roomId, updateState, proceedWithDecryption]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const init = async () => {
      try {
        if (isPasswordProtected) {
          // Parse salt and wait for password
          const saltStr = encryptionKey.substring(2);
          salt.current = new Uint8Array(base64UrlToArrayBuffer(saltStr));
          // Don't connect yet - wait for user to enter password
          return;
        }

        // Non-password protected: import key and connect immediately
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
        // Derive the key from password
        cryptoKey.current = await deriveKeyFromPassword(password, salt.current);
        // Now connect and receive the file
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

  return { state, decryptWithPassword };
}
