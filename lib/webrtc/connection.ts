// WebRTC Connection Management

import type { PeerConfig } from "./types";
import { DEFAULT_PEER_CONFIG } from "./constants";

/**
 * Generate a unique file ID for multi-file transfers
 */
export function generateFileId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a new RTCPeerConnection with default config
 */
export function createPeerConnection(
  config: PeerConfig = DEFAULT_PEER_CONFIG,
): RTCPeerConnection {
  return new RTCPeerConnection(config);
}

/**
 * Create data channel for file transfer (sender side)
 */
export function createDataChannel(
  pc: RTCPeerConnection,
  label: string = "fileTransfer",
): RTCDataChannel {
  const channel = pc.createDataChannel(label, {
    ordered: true,
  });
  channel.binaryType = "arraybuffer";
  return channel;
}
