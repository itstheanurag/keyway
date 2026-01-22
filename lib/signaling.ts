// Socket.io client for signaling

import { io, Socket } from "socket.io-client";

export interface SignalingEvents {
  "peer-joined": () => void;
  offer: (sdp: RTCSessionDescriptionInit) => void;
  answer: (sdp: RTCSessionDescriptionInit) => void;
  "ice-candidate": (candidate: RTCIceCandidateInit) => void;
  "peer-disconnected": () => void;
  "room-expired": () => void;
  error: (message: string) => void;
}

class SignalingClient {
  private socket: Socket | null = null;
  private roomId: string | null = null;
  private handlers: Partial<{
    [K in keyof SignalingEvents]: SignalingEvents[K];
  }> = {};

  connect(serverUrl?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Connect to signaling server (port 3001 in dev, configurable via env)
      const url =
        serverUrl ||
        process.env.NEXT_PUBLIC_SIGNALING_URL ||
        "http://localhost:3001";

      this.socket = io(url, {
        path: "/api/socketio",
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        this.setupListeners();
        resolve();
      });

      this.socket.on("connect_error", (err) => {
        reject(new Error(`Connection failed: ${err.message}`));
      });
    });
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on("peer-joined", () => {
      this.handlers["peer-joined"]?.();
    });

    this.socket.on("offer", (sdp: RTCSessionDescriptionInit) => {
      this.handlers["offer"]?.(sdp);
    });

    this.socket.on("answer", (sdp: RTCSessionDescriptionInit) => {
      this.handlers["answer"]?.(sdp);
    });

    this.socket.on("ice-candidate", (candidate: RTCIceCandidateInit) => {
      this.handlers["ice-candidate"]?.(candidate);
    });

    this.socket.on("peer-disconnected", () => {
      this.handlers["peer-disconnected"]?.();
    });

    this.socket.on("room-expired", () => {
      this.handlers["room-expired"]?.();
    });

    this.socket.on("error", (message: string) => {
      this.handlers["error"]?.(message);
    });
  }

  on<K extends keyof SignalingEvents>(event: K, handler: SignalingEvents[K]) {
    this.handlers[event] = handler;
  }

  off<K extends keyof SignalingEvents>(event: K) {
    delete this.handlers[event];
  }

  createRoom(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected"));
        return;
      }

      this.socket.emit(
        "create-room",
        roomId,
        (response: { success: boolean; error?: string }) => {
          if (response.success) {
            this.roomId = roomId;
            resolve();
          } else {
            reject(new Error(response.error || "Failed to create room"));
          }
        },
      );
    });
  }

  joinRoom(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected"));
        return;
      }

      this.socket.emit(
        "join-room",
        roomId,
        (response: { success: boolean; error?: string }) => {
          if (response.success) {
            this.roomId = roomId;
            resolve();
          } else {
            reject(new Error(response.error || "Failed to join room"));
          }
        },
      );
    });
  }

  sendOffer(sdp: RTCSessionDescriptionInit) {
    this.socket?.emit("offer", { roomId: this.roomId, sdp });
  }

  sendAnswer(sdp: RTCSessionDescriptionInit) {
    this.socket?.emit("answer", { roomId: this.roomId, sdp });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit) {
    this.socket?.emit("ice-candidate", { roomId: this.roomId, candidate });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.roomId = null;
  }

  get connected() {
    return this.socket?.connected ?? false;
  }
}

// Singleton instance
export const signaling = new SignalingClient();
