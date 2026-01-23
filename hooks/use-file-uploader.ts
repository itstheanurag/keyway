"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  generateKey,
  exportKey,
  encryptFile,
  deriveKeyFromPassword,
  generateSalt,
  arrayBufferToBase64Url,
  type FileMetadata,
} from "@/lib/crypto";
import {
  createPeerConnection,
  createDataChannel,
  sendFile,
  generateFileId,
  DEFAULT_ICE_SERVERS,
} from "@/lib/peer";
import { signaling } from "@/lib/signaling";

export type ConnectionState =
  | "idle"
  | "creating"
  | "waiting"
  | "connecting"
  | "transferring"
  | "ready" // Connection established, ready for more files
  | "complete" // Legacy: single transfer complete (deprecated)
  | "error";

export interface TransferHistory {
  fileId: string;
  fileName: string;
  fileSize: number;
  completedAt: Date;
}

export interface FileUploaderState {
  file: File | null;
  shareUrl: string | null;
  connectionState: ConnectionState;
  progress: number;
  error: string | null;
  transferHistory: TransferHistory[];
  isConnected: boolean;
}

export function useFileUploader() {
  const [state, setState] = useState<FileUploaderState>({
    file: null,
    shareUrl: null,
    connectionState: "idle",
    progress: 0,
    error: null,
    transferHistory: [],
    isConnected: false,
  });

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const encryptionKey = useRef<CryptoKey | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const shareTokenRef = useRef<string | null>(null);

  const updateState = useCallback((updates: Partial<FileUploaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Send an additional file over the existing connection
   */
  const sendAdditionalFile = useCallback(
    async (file: File) => {
      if (!dataChannel.current || dataChannel.current.readyState !== "open") {
        updateState({
          error: "Connection not ready",
          connectionState: "error",
        });
        return;
      }

      if (!encryptionKey.current) {
        updateState({ error: "No encryption key", connectionState: "error" });
        return;
      }

      const fileId = generateFileId();
      updateState({
        file,
        connectionState: "transferring",
        progress: 0,
        error: null,
      });

      try {
        // Encrypt the file with the same key
        const { encrypted, metadata } = await encryptFile(
          file,
          encryptionKey.current,
          (p) => updateState({ progress: p * 0.5 }), // 0-50% for encryption
        );

        // Send the file
        await sendFile(
          dataChannel.current!,
          encrypted,
          metadata,
          (progress) => updateState({ progress: 50 + progress * 0.5 }), // 50-100% for transfer
          fileId,
        );

        // Add to history
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
              completedAt: new Date(),
            },
          ],
        }));
      } catch (error) {
        console.error("Transfer error:", error);
        updateState({ connectionState: "error", error: "Transfer failed" });
      }
    },
    [updateState],
  );

  const setupWebRTC = useCallback(
    (
      encryptedData: ArrayBuffer,
      fileMetadata: FileMetadata,
      fileId: string,
    ) => {
      peerConnection.current = createPeerConnection({
        iceServers: DEFAULT_ICE_SERVERS,
      });
      dataChannel.current = createDataChannel(peerConnection.current);

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

      signaling.on("peer-joined", async () => {
        updateState({ connectionState: "connecting" });
        try {
          const offer = await peerConnection.current!.createOffer();
          await peerConnection.current!.setLocalDescription(offer);
          signaling.sendOffer(offer);
        } catch (error) {
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
        updateState({
          connectionState: "transferring",
          progress: 0,
          isConnected: true,
        });
        try {
          await sendFile(
            dataChannel.current!,
            encryptedData,
            fileMetadata,
            (progress) => updateState({ progress }),
            fileId,
          );

          // Instead of "complete", go to "ready" state for multi-file support
          setState((prev) => ({
            ...prev,
            connectionState: "ready",
            progress: 100,
            transferHistory: [
              ...prev.transferHistory,
              {
                fileId,
                fileName: fileMetadata.name,
                fileSize: fileMetadata.size,
                completedAt: new Date(),
              },
            ],
          }));
        } catch (error) {
          updateState({ connectionState: "error", error: "Transfer failed" });
        }
      };

      signaling.on("peer-disconnected", () => {
        updateState({
          isConnected: false,
          connectionState:
            state.connectionState === "ready" ? "waiting" : "error",
          error: state.connectionState === "ready" ? null : "Peer disconnected",
        });
      });
    },
    [state.connectionState, updateState],
  );

  const handleFileSelect = useCallback(
    async (file: File, password?: string) => {
      // If already connected, send additional file
      if (state.isConnected && dataChannel.current?.readyState === "open") {
        return sendAdditionalFile(file);
      }

      updateState({
        file,
        shareUrl: null,
        connectionState: "creating",
        progress: 0,
        error: null,
        transferHistory: [],
      });

      try {
        let key: CryptoKey;
        let shareToken: string;
        let salt: Uint8Array | undefined;

        if (password) {
          salt = generateSalt();
          key = await deriveKeyFromPassword(password, salt);
          shareToken = `p_${arrayBufferToBase64Url(salt.buffer as ArrayBuffer)}`;
        } else {
          key = await generateKey();
          shareToken = await exportKey(key);
        }

        encryptionKey.current = key;
        shareTokenRef.current = shareToken;

        updateState({ progress: 10 });
        const { encrypted, metadata } = await encryptFile(
          file,
          encryptionKey.current,
          (p) => {
            updateState({ progress: 10 + p * 0.3 });
          },
        );

        // Add password info to metadata
        if (password && salt) {
          metadata.isPasswordProtected = true;
          metadata.salt = arrayBufferToBase64Url(salt.buffer as ArrayBuffer);
        }

        updateState({ progress: 40 });

        await signaling.connect();
        updateState({ progress: 50 });

        const roomId = uuidv4().slice(0, 8);
        roomIdRef.current = roomId;
        await signaling.createRoom(roomId);
        updateState({ progress: 60 });

        const shareUrl = `${window.location.origin}/d/${roomId}#${shareToken}`;
        updateState({ shareUrl, connectionState: "waiting", progress: 100 });

        const fileId = generateFileId();
        setupWebRTC(encrypted, metadata, fileId);
      } catch (error) {
        console.error("Setup error:", error);
        updateState({
          connectionState: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [updateState, setupWebRTC, sendAdditionalFile, state.isConnected],
  );

  const reset = useCallback(() => {
    dataChannel.current?.close();
    peerConnection.current?.close();
    signaling.disconnect();
    roomIdRef.current = null;
    shareTokenRef.current = null;
    encryptionKey.current = null;
    setState({
      file: null,
      shareUrl: null,
      connectionState: "idle",
      progress: 0,
      error: null,
      transferHistory: [],
      isConnected: false,
    });
  }, []);

  useEffect(() => {
    return () => {
      dataChannel.current?.close();
      peerConnection.current?.close();
      signaling.disconnect();
    };
  }, []);

  return {
    state,
    handleFileSelect,
    sendAdditionalFile,
    reset,
  };
}
