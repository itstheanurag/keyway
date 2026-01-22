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

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const encryptionKey = useRef<CryptoKey | null>(null);
  const encryptedData = useRef<ArrayBuffer | null>(null);
  const fileMetadata = useRef<FileMetadata | null>(null);

  const updateState = (updates: Partial<FileUploaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const handleFileSelect = useCallback(async (file: File) => {
    // Reset state
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
      const roomId = uuidv4();
      await signaling.createRoom(roomId);
      updateState({ progress: 60 });

      // Generate share URL
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

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendIceCandidate(event.candidate.toJSON());
      }
    };

    // When peer joins, create and send offer
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

    // Handle answer from receiver
    signaling.on("answer", async (sdp) => {
      try {
        await peerConnection.current!.setRemoteDescription(sdp);
      } catch (error) {
        console.error("Answer error:", error);
      }
    });

    // Handle ICE candidates from receiver
    signaling.on("ice-candidate", async (candidate) => {
      try {
        await peerConnection.current!.addIceCandidate(candidate);
      } catch (error) {
        console.error("ICE error:", error);
      }
    });

    // When data channel opens, start transfer
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

  // Cleanup on unmount
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
        return "Encrypting file...";
      case "waiting":
        return "Waiting for recipient to connect...";
      case "connecting":
        return "Establishing connection...";
      case "transferring":
        return "Transferring file...";
      case "complete":
        return "Transfer complete!";
      case "error":
        return state.error || "An error occurred";
      default:
        return "";
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6">
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
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

        {!state.file ? (
          <div>
            <div className="text-4xl mb-4">📁</div>
            <p className="text-lg font-medium">
              Drop a file here or click to select
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Files are encrypted before sharing
            </p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-4">📄</div>
            <p className="text-lg font-medium">{state.file.name}</p>
            <p className="text-sm text-gray-500">
              {formatBytes(state.file.size)}
            </p>
          </div>
        )}
      </div>

      {/* Status section */}
      <div className="mt-6">
        <p className="text-center text-gray-600 mb-4">{getStatusMessage()}</p>

        {state.connectionState !== "idle" &&
          state.connectionState !== "waiting" &&
          state.connectionState !== "complete" &&
          state.connectionState !== "error" && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          )}

        {state.shareUrl && state.connectionState === "waiting" && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm font-medium mb-2">Share this link:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={state.shareUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-white border rounded truncate"
              />
              <button
                onClick={copyToClipboard}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Keep this page open until the recipient downloads the file
            </p>
          </div>
        )}

        {state.connectionState === "complete" && (
          <div className="mt-4 p-4 bg-green-100 text-green-700 rounded-lg text-center">
            ✓ File transferred successfully!
          </div>
        )}

        {state.connectionState === "error" && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg text-center">
            ✗ {state.error}
          </div>
        )}
      </div>
    </div>
  );
}
