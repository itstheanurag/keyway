// WebRTC Constants

import type { PeerConfig } from "./types";

/**
 * Chunk size for DataChannel transfers (16KB)
 */
export const CHUNK_SIZE = 16384;

/**
 * Default ICE servers for WebRTC connections
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

/**
 * Default peer configuration
 */
export const DEFAULT_PEER_CONFIG: PeerConfig = {
  iceServers: DEFAULT_ICE_SERVERS,
};
