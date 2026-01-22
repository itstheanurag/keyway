// Client-side encryption using Web Crypto API
// AES-GCM 256-bit encryption

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Generate a new random encryption key
 */
export async function generateKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable
    ["encrypt", "decrypt"],
  );
}

/**
 * Export key to base64url string for URL sharing
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64Url(exported);
}

/**
 * Import key from base64url string
 */
export async function importKey(keyStr: string): Promise<CryptoKey> {
  const keyData = base64UrlToArrayBuffer(keyStr);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["decrypt"],
  );
}

/**
 * Encrypt file data with the given key
 * Returns: IV (12 bytes) + encrypted data
 */
export async function encryptData(
  data: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data,
  );

  // Prepend IV to encrypted data
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);

  return result.buffer;
}

/**
 * Decrypt data with the given key
 * Expects: IV (12 bytes) + encrypted data
 */
export async function decryptData(
  encryptedData: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedData);
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);

  return await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
}

/**
 * Encrypt a File object
 */
export async function encryptFile(
  file: File,
  key: CryptoKey,
  onProgress?: (progress: number) => void,
): Promise<{ encrypted: ArrayBuffer; metadata: FileMetadata }> {
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(50);

  const encrypted = await encryptData(arrayBuffer, key);
  onProgress?.(100);

  return {
    encrypted,
    metadata: {
      name: file.name,
      mimeType: file.type,
      size: file.size,
    },
  };
}

/**
 * Decrypt data back to a File/Blob
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  key: CryptoKey,
  metadata: FileMetadata,
): Promise<Blob> {
  const decrypted = await decryptData(encryptedData, key);
  return new Blob([decrypted], {
    type: metadata.mimeType || "application/octet-stream",
  });
}

// Utility functions
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface FileMetadata {
  name: string;
  mimeType: string;
  size: number;
}
