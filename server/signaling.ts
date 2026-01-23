import { Server as SocketIOServer, Socket } from "socket.io";
import { createServer, Server as HttpServer } from "http";

interface Room {
  sender: string | null;
  receiver: string | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const ROOM_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Attach signaling handlers to a Socket.io server instance
 * This can be used with any http server (standalone or Next.js custom server)
 */
export function setupSignaling(io: SocketIOServer): void {
  // Cleanup expired rooms periodically
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.createdAt > ROOM_TIMEOUT) {
        io.to(roomId).emit("room-expired");
        rooms.delete(roomId);
      }
    }
  }, 30000);

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on(
      "create-room",
      (
        roomId: string,
        callback: (res: { success: boolean; error?: string }) => void,
      ) => {
        if (rooms.has(roomId)) {
          callback({ success: false, error: "Room already exists" });
          return;
        }

        rooms.set(roomId, {
          sender: socket.id,
          receiver: null,
          createdAt: Date.now(),
        });

        socket.join(roomId);
        callback({ success: true });
        console.log(`Room created: ${roomId}`);
      },
    );

    socket.on(
      "join-room",
      (
        roomId: string,
        callback: (res: { success: boolean; error?: string }) => void,
      ) => {
        const room = rooms.get(roomId);

        if (!room) {
          callback({ success: false, error: "Room not found" });
          return;
        }

        if (room.receiver) {
          callback({ success: false, error: "Room is full" });
          return;
        }

        room.receiver = socket.id;
        socket.join(roomId);
        callback({ success: true });

        // Notify sender that receiver has joined
        socket.to(roomId).emit("peer-joined");
        console.log(`Peer joined room: ${roomId}`);
      },
    );

    socket.on(
      "offer",
      ({ roomId, sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
        socket.to(roomId).emit("offer", sdp);
      },
    );

    socket.on(
      "answer",
      ({ roomId, sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
        socket.to(roomId).emit("answer", sdp);
      },
    );

    socket.on(
      "ice-candidate",
      ({
        roomId,
        candidate,
      }: {
        roomId: string;
        candidate: RTCIceCandidateInit;
      }) => {
        socket.to(roomId).emit("ice-candidate", candidate);
      },
    );

    socket.on("disconnect", () => {
      // Find and cleanup any rooms this socket was in
      for (const [roomId, room] of rooms.entries()) {
        if (room.sender === socket.id || room.receiver === socket.id) {
          socket.to(roomId).emit("peer-disconnected");
          rooms.delete(roomId);
          console.log(`Room deleted: ${roomId}`);
        }
      }
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

/**
 * Create a standalone signaling server (for development or separate deployment)
 */
export function createSignalingServer(port: number = 3001) {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    path: "/api/socketio",
  });

  setupSignaling(io);

  httpServer.listen(port, () => {
    console.log(`Signaling server running on port ${port}`);
  });

  return { io, httpServer };
}

// Start server if run directly
if (require.main === module) {
  const port = parseInt(process.env.SIGNALING_PORT || "3001", 10);
  createSignalingServer(port);
}
