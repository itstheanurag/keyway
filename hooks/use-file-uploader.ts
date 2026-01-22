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
  DEFAULT_ICE_SERVERS,
} from "@/lib/peer";
import { signaling } from "@/lib/signaling";

export type ConnectionState =
  | "idle"
  | "creating"
  | "waiting"
  | "connecting"
  | "transferring"
  | "complete"
  | "error";

export interface FileUploaderState {
  file: File | null;
  shareUrl: string | null;
  connectionState: ConnectionState;
  progress: number;
  error: string | null;
}

export function useFileUploader() {
  const [state, setState] = useState<FileUploaderState>({
    file: null,
    shareUrl: null,
    connectionState: "idle",
    progress: 0,
    error: null,
  });

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const encryptionKey = useRef<CryptoKey | null>(null);
  const encryptedData = useRef<ArrayBuffer | null>(null);
  const fileMetadata = useRef<FileMetadata | null>(null);

  const updateState = useCallback((updates: Partial<FileUploaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
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
        updateState({ connectionState: "error", error: "Transfer failed" });
      }
    };

    signaling.on("peer-disconnected", () => {
      if (state.connectionState !== "complete") {
        updateState({ connectionState: "error", error: "Peer disconnected" });
      }
    });
  }, [state.connectionState, updateState]);

  const handleFileSelect = useCallback(
    async (file: File, password?: string) => {
      updateState({
        file,
        shareUrl: null,
        connectionState: "creating",
        progress: 0,
        error: null,
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

        encryptedData.current = encrypted;
        fileMetadata.current = metadata;
        updateState({ progress: 40 });

        await signaling.connect();
        updateState({ progress: 50 });

        const roomId = uuidv4().slice(0, 8);
        await signaling.createRoom(roomId);
        updateState({ progress: 60 });

        const shareUrl = `${window.location.origin}/d/${roomId}#${shareToken}`;
        updateState({ shareUrl, connectionState: "waiting", progress: 100 });

        setupWebRTC();
      } catch (error) {
        console.error("Setup error:", error);
        updateState({
          connectionState: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [updateState, setupWebRTC],
  );

  const reset = useCallback(() => {
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
    reset,
  };
}
