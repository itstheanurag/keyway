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
  receiveNextFile,
  sendFile,
  supportsFileSystemAccess,
  supportsDirectoryPicker,
  openFileSaveStream,
  openDirectoryPicker,
  saveFileToDirectory,
  flattenPathForDownload,
  generateFileId,
  DEFAULT_ICE_SERVERS,
} from "@/lib/webrtc";
import type { FileMetadata } from "@/lib/webrtc";
import type {
  DownloaderConnectionState,
  TransferRecord,
  DownloaderState,
  FolderShareInfo,
} from "@/lib/transfer";
import { signaling } from "@/lib/signaling";

export type {
  DownloaderConnectionState as ConnectionState,
  TransferRecord,
  DownloaderState,
};

export function useFileDownloader(roomId: string, encryptionKey: string) {
  const isPasswordProtected = encryptionKey.startsWith("p_");
  const streamsSupported =
    typeof window !== "undefined" && supportsFileSystemAccess();
  const directoryPickerSupported =
    typeof window !== "undefined" && supportsDirectoryPicker();

  const [state, setState] = useState<DownloaderState>({
    connectionState: isPasswordProtected ? "awaiting-password" : "connecting",
    progress: 0,
    error: null,
    fileName: null,
    fileSize: null,
    folder: null,
    folderProgress: null,
    isPasswordProtected,
    supportsStreaming: streamsSupported,
    supportsDirectoryPicker: directoryPickerSupported,
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
  const pendingFolderRef = useRef<FolderShareInfo | null>(null);
  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const fileStream = useRef<{
    writable: FileSystemWritableFileStream;
    close: () => Promise<void>;
  } | null>(null);
  const isSendingRef = useRef(false);
  const listeningForMore = useRef(false);

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

  const saveReceivedFile = useCallback(
    async (blob: Blob, metadata: FileMetadata) => {
      if (directoryHandleRef.current && metadata.relativePath) {
        await saveFileToDirectory(
          directoryHandleRef.current,
          metadata.relativePath,
          blob,
        );
        return;
      }

      const downloadName = metadata.relativePath
        ? flattenPathForDownload(metadata.relativePath)
        : metadata.name;
      downloadFile(blob, downloadName);
    },
    [downloadFile],
  );

  const receiveFolderBatch = useCallback(
    async (channel: RTCDataChannel, key: CryptoKey) => {
      const folderInfo = pendingFolderRef.current;
      const totalFiles = folderInfo?.fileCount ?? 0;
      let received = 0;

      updateState({
        connectionState: "receiving-folder",
        progress: 0,
        folderProgress: { received: 0, total: totalFiles },
      });

      while (channel.readyState === "open") {
        if (totalFiles > 0 && received >= totalFiles) break;

        try {
          const { data, metadata } = await receiveNextFile(channel, {
            shouldAccept: () => !isSendingRef.current,
            onMetadata: (meta) => {
              updateState({
                fileName: meta.relativePath || meta.name,
                fileSize: meta.size,
                progress: 0,
              });
            },
            onProgress: (progress) => updateState({ progress }),
          });

          updateState({ connectionState: "decrypting" });

          const decryptedBlob = await decryptFile(data, key, metadata);
          await saveReceivedFile(decryptedBlob, metadata);

          received++;
          setState((prev) => ({
            ...prev,
            connectionState: "receiving-folder",
            progress: totalFiles
              ? Math.round((received / totalFiles) * 100)
              : 100,
            folderProgress: { received, total: totalFiles || received },
            transferHistory: [
              ...prev.transferHistory,
              {
                fileId: generateFileId(),
                fileName: metadata.relativePath || metadata.name,
                fileSize: metadata.size,
                direction: "received" as const,
                completedAt: new Date(),
              },
            ],
          }));
        } catch (error) {
          if (channel.readyState !== "open") break;
          console.error("Folder receive error:", error);
          updateState({
            connectionState: "error",
            error: "Failed to receive folder",
          });
          return;
        }
      }

      pendingFolderRef.current = null;
      directoryHandleRef.current = null;

      setState((prev) => ({
        ...prev,
        connectionState: "ready",
        progress: 100,
        isConnected: true,
        folder: null,
        folderProgress: null,
      }));
    },
    [saveReceivedFile, updateState],
  );

  const startListeningForMoreFiles = useCallback(() => {
    const channel = dataChannel.current || pendingChannel.current;
    const key = cryptoKey.current;

    if (!channel || channel.readyState !== "open" || !key) return;
    if (listeningForMore.current) return;

    listeningForMore.current = true;
    channel.onmessage = null;

    const listen = async () => {
      while (
        channel.readyState === "open" &&
        listeningForMore.current &&
        !isSendingRef.current
      ) {
        try {
          updateState({
            connectionState: "waiting-for-metadata",
            progress: 0,
            error: null,
          });

          const { data, metadata } = await receiveNextFile(channel, {
            shouldAccept: () => !isSendingRef.current,
            onMetadata: (meta) => {
              updateState({
                connectionState: "receiving",
                fileName: meta.relativePath || meta.name,
                fileSize: meta.size,
                progress: 0,
              });
            },
            onProgress: (progress) => updateState({ progress }),
          });

          updateState({ connectionState: "decrypting", progress: 100 });

          const decryptedBlob = await decryptFile(data, key, metadata);
          await saveReceivedFile(decryptedBlob, metadata);

          setState((prev) => ({
            ...prev,
            connectionState: "ready",
            progress: 100,
            isConnected: true,
            transferHistory: [
              ...prev.transferHistory,
              {
                fileId: generateFileId(),
                fileName: metadata.relativePath || metadata.name,
                fileSize: metadata.size,
                direction: "received" as const,
                completedAt: new Date(),
              },
            ],
          }));
        } catch (error) {
          if (channel.readyState !== "open") break;
          console.error("Additional file receive error:", error);
          break;
        }
      }
      listeningForMore.current = false;
    };

    listen();
  }, [saveReceivedFile, updateState]);

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
      isSendingRef.current = true;
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
      } finally {
        isSendingRef.current = false;
        startListeningForMoreFiles();
      }
    },
    [updateState, startListeningForMoreFiles],
  );

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
        await saveReceivedFile(decryptedBlob, receivedMetadata);

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
      startListeningForMoreFiles();
    } catch (error) {
      console.error("Receive error:", error);
      updateState({
        connectionState: "error",
        error: "Failed to receive file",
      });
    }
  }, [saveReceivedFile, updateState, startListeningForMoreFiles]);

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

  const proceedWithFallback = useCallback(async () => {
    fileStream.current = null;
    await startStreamingReceive();
  }, [startStreamingReceive]);

  const beginFolderReceive = useCallback(
    async (useDirectoryPicker: boolean) => {
      const channel = pendingChannel.current;
      const key = cryptoKey.current;

      if (!channel || !key || !pendingFolderRef.current) {
        updateState({ connectionState: "error", error: "No folder to receive" });
        return;
      }

      directoryHandleRef.current = null;

      if (useDirectoryPicker && directoryPickerSupported) {
        const dirHandle = await openDirectoryPicker();
        if (!dirHandle) return;
        directoryHandleRef.current = dirHandle;
      }

      dataChannel.current = channel;
      await receiveFolderBatch(channel, key);
      startListeningForMoreFiles();
    },
    [
      directoryPickerSupported,
      receiveFolderBatch,
      startListeningForMoreFiles,
      updateState,
    ],
  );

  const proceedWithSaveFolder = useCallback(async () => {
    await beginFolderReceive(true);
  }, [beginFolderReceive]);

  const proceedWithFolderFallback = useCallback(async () => {
    await beginFolderReceive(false);
  }, [beginFolderReceive]);

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

        const handleInitialMessage = (e: MessageEvent) => {
          if (typeof e.data !== "string") return;

          try {
            const msg = JSON.parse(e.data);

            if (msg.type === "folder-start") {
              pendingFolderRef.current = {
                name: msg.folderName,
                fileCount: msg.fileCount,
                totalSize: msg.totalSize,
              };
              channel.removeEventListener("message", handleInitialMessage);

              updateState({
                folder: pendingFolderRef.current,
                connectionState: directoryPickerSupported
                  ? "choosing-save-folder"
                  : "receiving-folder",
              });

              if (!directoryPickerSupported) {
                beginFolderReceive(false);
              }
              return;
            }

            if (msg.type === "metadata") {
              pendingMetadata.current = msg;
              channel.removeEventListener("message", handleInitialMessage);

              updateState({
                fileName: msg.name,
                fileSize: msg.size,
              });

              if (streamsSupported) {
                updateState({ connectionState: "choosing-save-location" });
              } else {
                proceedWithFallback();
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        channel.addEventListener("message", handleInitialMessage);
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
  }, [
    roomId,
    updateState,
    streamsSupported,
    directoryPickerSupported,
    proceedWithFallback,
    beginFolderReceive,
    startListeningForMoreFiles,
  ]);

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
    proceedWithSaveFolder,
    proceedWithFolderFallback,
    sendFileBack,
  };
}