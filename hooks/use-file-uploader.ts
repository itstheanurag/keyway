"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  generateKey,
  exportKey,
  encryptFile,
  encryptFileStreaming,
  deriveKeyFromPassword,
  generateSalt,
  arrayBufferToBase64Url,
} from "@/lib/crypto";
import { decryptFile } from "@/lib/crypto";
import {
  createPeerConnection,
  createDataChannel,
  sendFile,
  sendFileStreaming,
  sendFolderStart,
  sendFolderEnd,
  receiveNextFile,
  sendTransferCancel,
  isTransferCancelled,
  generateFileId,
  DEFAULT_ICE_SERVERS,
} from "@/lib/webrtc";
import type { FileMetadata } from "@/lib/webrtc";
import type {
  UploaderConnectionState,
  TransferHistory,
  FileUploaderState,
  FolderShareInfo,
} from "@/lib/transfer";
import type { ShareEntry } from "@/lib/folder";
import { getFolderInfo, isFolderShare } from "@/lib/folder";
import { signaling } from "@/lib/signaling";

export type {
  UploaderConnectionState as ConnectionState,
  TransferHistory,
  FileUploaderState,
};

function transferErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function useFileUploader() {
  const [state, setState] = useState<FileUploaderState>({
    file: null,
    folder: null,
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
  const isSendingRef = useRef(false);
  const listeningForMore = useRef(false);
  const shareQueueRef = useRef<ShareEntry[]>([]);
  const folderShareRef = useRef<FolderShareInfo | null>(null);
  const passwordMetaRef = useRef<{
    isPasswordProtected: boolean;
    salt?: string;
  } | null>(null);
  const transferAbortRef = useRef<AbortController | null>(null);

  const beginTransferAbort = useCallback(() => {
    transferAbortRef.current?.abort();
    transferAbortRef.current = new AbortController();
    return transferAbortRef.current;
  }, []);

  const cancelTransfer = useCallback(() => {
    transferAbortRef.current?.abort();
    transferAbortRef.current = null;
    if (dataChannel.current?.readyState === "open") {
      sendTransferCancel(dataChannel.current);
    }
    isSendingRef.current = false;
    setState((prev) => ({
      ...prev,
      connectionState: prev.isConnected ? "ready" : "waiting",
      progress: 0,
      error: null,
    }));
  }, []);

  const updateState = useCallback((updates: Partial<FileUploaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
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

  const startListeningForIncomingFiles = useCallback(() => {
    if (!dataChannel.current || dataChannel.current.readyState !== "open")
      return;
    if (!encryptionKey.current) return;
    if (listeningForMore.current) return;

    listeningForMore.current = true;
    const channel = dataChannel.current;
    const key = encryptionKey.current;

    const listen = async () => {
      while (
        channel.readyState === "open" &&
        listeningForMore.current &&
        !isSendingRef.current
      ) {
        try {
          const abort = beginTransferAbort();
          const { data, metadata } = await receiveNextFile(
            channel,
            {
              shouldAccept: () => !isSendingRef.current,
              onMetadata: () => {
                updateState({ connectionState: "transferring", progress: 0 });
              },
              onProgress: (progress) => updateState({ progress }),
            },
            abort,
          );

          const decryptedBlob = await decryptFile(data, key, metadata);
          downloadFile(decryptedBlob, metadata.name);

          setState((prev) => ({
            ...prev,
            connectionState: "ready",
            progress: 100,
            transferHistory: [
              ...prev.transferHistory,
              {
                fileId: generateFileId(),
                fileName: metadata.relativePath || metadata.name,
                fileSize: metadata.size,
                completedAt: new Date(),
              },
            ],
          }));
        } catch (error) {
          if (isTransferCancelled(error)) {
            updateState({
              connectionState: "ready",
              progress: 0,
              error: null,
            });
            break;
          }
          if (channel.readyState !== "open") break;
          console.error("Incoming file receive error:", error);
          break;
        }
      }
      listeningForMore.current = false;
    };

    listen();
  }, [beginTransferAbort, downloadFile, updateState]);

  const sendQueuedFiles = useCallback(
    async (channel: RTCDataChannel, key: CryptoKey) => {
      const queue = shareQueueRef.current;
      const folderInfo = folderShareRef.current;
      const totalFiles = queue.length;

      if (totalFiles === 0) return;

      isSendingRef.current = true;
      const abort = beginTransferAbort();
      updateState({ connectionState: "transferring", progress: 0 });

      try {
        if (folderInfo) {
          sendFolderStart(channel, {
            folderName: folderInfo.name,
            fileCount: folderInfo.fileCount,
            totalSize: folderInfo.totalSize,
          });
        }

        for (let i = 0; i < totalFiles; i++) {
          const entry = queue[i];
          const fileId = generateFileId();

          // Use streaming for files larger than 100MB to avoid memory issues
          const USE_STREAMING_THRESHOLD = 100 * 1024 * 1024;
          const useStreaming = entry.file.size > USE_STREAMING_THRESHOLD;

          let metadata: FileMetadata;

          if (useStreaming) {
            const { stream, metadata: fileMetadata } =
              await encryptFileStreaming(
                entry.file,
                key,
                undefined,
                entry.relativePath,
              );
            metadata = fileMetadata;

            if (passwordMetaRef.current?.isPasswordProtected) {
              metadata.isPasswordProtected = true;
              metadata.salt = passwordMetaRef.current.salt;
            }

            await sendFileStreaming(
              channel,
              stream,
              metadata,
              (fileProgress) => {
                const overall = ((i + fileProgress / 100) / totalFiles) * 100;
                updateState({ progress: overall });
              },
              fileId,
              abort,
            );
          } else {
            const { encrypted, metadata: fileMetadata } = await encryptFile(
              entry.file,
              key,
              undefined,
              entry.relativePath,
            );
            metadata = fileMetadata;

            if (passwordMetaRef.current?.isPasswordProtected) {
              metadata.isPasswordProtected = true;
              metadata.salt = passwordMetaRef.current.salt;
            }

            await sendFile(
              channel,
              encrypted,
              metadata,
              (fileProgress) => {
                const overall = ((i + fileProgress / 100) / totalFiles) * 100;
                updateState({ progress: overall });
              },
              fileId,
              abort,
            );
          }

          setState((prev) => ({
            ...prev,
            transferHistory: [
              ...prev.transferHistory,
              {
                fileId,
                fileName: entry.relativePath,
                fileSize: entry.file.size,
                completedAt: new Date(),
              },
            ],
          }));
        }

        if (folderInfo) {
          sendFolderEnd(channel, folderInfo.name);
        }

        setState((prev) => ({
          ...prev,
          connectionState: "ready",
          progress: 100,
        }));
      } catch (error) {
        if (isTransferCancelled(error)) {
          updateState({
            connectionState: "ready",
            progress: 0,
            error: null,
          });
        } else {
          const message = transferErrorMessage(error, "Transfer failed");
          console.error("Transfer error:", error);
          updateState({ connectionState: "error", error: message });
        }
      } finally {
        isSendingRef.current = false;
        startListeningForIncomingFiles();
      }
    },
    [beginTransferAbort, updateState, startListeningForIncomingFiles],
  );

  const sendAdditionalFile = useCallback(
    async (file: File, relativePath?: string) => {
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
      isSendingRef.current = true;
      const abort = beginTransferAbort();
      updateState({
        file,
        folder: null,
        connectionState: "transferring",
        progress: 0,
        error: null,
      });

      try {
        // Use streaming for files larger than 100MB
        const USE_STREAMING_THRESHOLD = 100 * 1024 * 1024;
        const useStreaming = file.size > USE_STREAMING_THRESHOLD;

        if (useStreaming) {
          const { stream, metadata } = await encryptFileStreaming(
            file,
            encryptionKey.current,
            (p) => updateState({ progress: p * 0.5 }),
            relativePath,
          );

          await sendFileStreaming(
            dataChannel.current!,
            stream,
            metadata,
            (progress) => updateState({ progress: 50 + progress * 0.5 }),
            fileId,
            abort,
          );
        } else {
          const { encrypted, metadata } = await encryptFile(
            file,
            encryptionKey.current,
            (p) => updateState({ progress: p * 0.5 }),
            relativePath,
          );

          await sendFile(
            dataChannel.current!,
            encrypted,
            metadata,
            (progress) => updateState({ progress: 50 + progress * 0.5 }),
            fileId,
            abort,
          );
        }

        setState((prev) => ({
          ...prev,
          connectionState: "ready",
          progress: 100,
          transferHistory: [
            ...prev.transferHistory,
            {
              fileId,
              fileName: relativePath || file.name,
              fileSize: file.size,
              completedAt: new Date(),
            },
          ],
        }));
      } catch (error) {
        if (isTransferCancelled(error)) {
          updateState({
            connectionState: "ready",
            progress: 0,
            error: null,
          });
        } else {
          const message = transferErrorMessage(error, "Transfer failed");
          console.error("Transfer error:", error);
          updateState({ connectionState: "error", error: message });
        }
      } finally {
        isSendingRef.current = false;
        startListeningForIncomingFiles();
      }
    },
    [beginTransferAbort, updateState, startListeningForIncomingFiles],
  );

  const sendAdditionalFolder = useCallback(
    async (entries: ShareEntry[]) => {
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

      const folderInfo = getFolderInfo(entries);
      folderShareRef.current = folderInfo;
      shareQueueRef.current = entries;

      updateState({
        folder: folderInfo,
        file: null,
        error: null,
      });

      await sendQueuedFiles(dataChannel.current, encryptionKey.current);
    },
    [sendQueuedFiles, updateState],
  );

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
      } catch {
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

      if (encryptionKey.current) {
        await sendQueuedFiles(dataChannel.current!, encryptionKey.current);
      }
    };

    signaling.on("peer-disconnected", () => {
      setState((prev) => ({
        ...prev,
        isConnected: false,
        connectionState: prev.connectionState === "ready" ? "waiting" : "error",
        error: prev.connectionState === "ready" ? null : "Peer disconnected",
      }));
    });
  }, [sendQueuedFiles, updateState]);

  const handleShareSelect = useCallback(
    async (entries: ShareEntry[], password?: string) => {
      if (entries.length === 0) return;

      if (state.isConnected && dataChannel.current?.readyState === "open") {
        if (isFolderShare(entries)) {
          return sendAdditionalFolder(entries);
        }
        return sendAdditionalFile(entries[0].file, entries[0].relativePath);
      }

      const folderInfo = isFolderShare(entries) ? getFolderInfo(entries) : null;
      const primaryFile = entries[0].file;

      shareQueueRef.current = entries;
      folderShareRef.current = folderInfo;

      updateState({
        file: folderInfo ? null : primaryFile,
        folder: folderInfo,
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
          passwordMetaRef.current = {
            isPasswordProtected: true,
            salt: arrayBufferToBase64Url(salt.buffer as ArrayBuffer),
          };
        } else {
          key = await generateKey();
          shareToken = await exportKey(key);
          passwordMetaRef.current = null;
        }

        encryptionKey.current = key;
        shareTokenRef.current = shareToken;

        updateState({ progress: 30 });

        await signaling.connect();
        updateState({ progress: 50 });

        const roomId = uuidv4().slice(0, 8);
        roomIdRef.current = roomId;
        await signaling.createRoom(roomId);
        updateState({ progress: 70 });

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
    [
      updateState,
      setupWebRTC,
      sendAdditionalFile,
      sendAdditionalFolder,
      state.isConnected,
    ],
  );

  const handleFileSelect = useCallback(
    async (file: File, password?: string) => {
      await handleShareSelect([{ file, relativePath: file.name }], password);
    },
    [handleShareSelect],
  );

  const handleFolderSelect = useCallback(
    async (entries: ShareEntry[], password?: string) => {
      await handleShareSelect(entries, password);
    },
    [handleShareSelect],
  );

  const reset = useCallback(() => {
    transferAbortRef.current?.abort();
    transferAbortRef.current = null;
    listeningForMore.current = false;
    isSendingRef.current = false;
    shareQueueRef.current = [];
    folderShareRef.current = null;
    passwordMetaRef.current = null;
    dataChannel.current?.close();
    peerConnection.current?.close();
    signaling.disconnect();
    roomIdRef.current = null;
    shareTokenRef.current = null;
    encryptionKey.current = null;
    setState({
      file: null,
      folder: null,
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
    handleFolderSelect,
    sendAdditionalFile,
    sendAdditionalFolder,
    cancelTransfer,
    reset,
  };
}
