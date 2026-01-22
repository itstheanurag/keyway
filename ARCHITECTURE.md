# Keyway Architecture

## Overview

Keyway is a peer-to-peer (P2P) encrypted file sharing application. Files are encrypted client-side before transmission and sent directly between browsers using WebRTC.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SENDER BROWSER                             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐   │
│  │   Select   │───▶│  Encrypt   │───▶│  Create    │───▶│   Send     │   │
│  │    File    │    │  (AES-256) │    │   Room     │    │   via      │   │
│  │            │    │            │    │            │    │   WebRTC   │   │
│  └────────────┘    └────────────┘    └────────────┘    └────────────┘   │
└────────────────────────────────────────┼────────────────────────────────┘
                                         │
                                         │ Signaling (WebSocket)
                                         ▼
                          ┌──────────────────────────────┐
                          │      SIGNALING SERVER        │
                          │  - Room management           │
                          │  - SDP offer/answer relay    │
                          │  - ICE candidate exchange    │
                          └──────────────────────────────┘
                                         │
                                         │ Signaling (WebSocket)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            RECEIVER BROWSER                             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐   │
│  │   Join     │───▶│  Receive   │───▶│  Decrypt   │───▶│  Download  │   │
│  │   Room     │    │  via       │    │  (AES-256) │    │   File     │   │
│  │            │    │  WebRTC    │    │            │    │            │   │
│  └────────────┘    └────────────┘    └────────────┘    └────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Frontend (Next.js)

| Directory     | Purpose                                           |
| ------------- | ------------------------------------------------- |
| `app/`        | Next.js App Router pages                          |
| `components/` | React UI components                               |
| `hooks/`      | Custom React hooks for file upload/download logic |
| `lib/`        | Core utilities (crypto, peer, signaling)          |

### 2. Signaling Server (Node.js + Socket.io)

Located in `server/signaling.ts`. Handles:

- Room creation and management
- WebRTC signaling (SDP offer/answer exchange)
- ICE candidate relay
- Connection timeout cleanup

### 3. Encryption Layer

| Function                  | Algorithm     | Purpose                         |
| ------------------------- | ------------- | ------------------------------- |
| `generateKey()`           | AES-GCM-256   | Random key for file encryption  |
| `deriveKeyFromPassword()` | PBKDF2-SHA256 | Password-based key derivation   |
| `encryptData()`           | AES-GCM       | Encrypt file with IV prepended  |
| `decryptData()`           | AES-GCM       | Decrypt file using IV from data |

## Data Flow

### File Upload (Sender)

1. User selects file
2. Generate random AES-256 key (or derive from password)
3. Encrypt file client-side
4. Create room on signaling server
5. Generate share URL with room ID + key
6. Wait for receiver to connect
7. Establish WebRTC data channel
8. Send encrypted file chunks

### File Download (Receiver)

1. Open share URL
2. Extract room ID and key from URL
3. Connect to signaling server
4. Establish WebRTC connection with sender
5. Receive encrypted file chunks
6. Decrypt file with key
7. Trigger browser download

## Security Model

### Zero-Knowledge Architecture

- **Server never sees file content** - All encryption happens in the browser
- **Server never sees encryption key** - Key is only in the URL fragment (#hash)
- **No persistent storage** - Files exist only during transfer

### Encryption Details

```
File → [AES-GCM-256 Encrypt] → IV (12 bytes) + Ciphertext → WebRTC → Receiver
```

- **Algorithm**: AES-GCM with 256-bit key
- **IV**: 12 bytes (96 bits), randomly generated per encryption
- **Key Transport**: Base64URL encoded in URL fragment (never sent to server)

### Password Protection (Optional)

```
Password + Salt → [PBKDF2-SHA256, 100k iterations] → AES-256 Key
```

- Salt is included in the share URL
- Key is derived on receiver's device

## Deployment Architecture

### Development

```bash
bun run dev:all  # Runs both Next.js and Signaling Server
```

### Production (Recommended)

| Component | Platform         | Config                   |
| --------- | ---------------- | ------------------------ |
| Frontend  | Vercel / Netlify | Default Next.js settings |
| Signaling | Railway / Render | Set `PORT` env variable  |

Environment variable: `NEXT_PUBLIC_SIGNALING_URL` must point to deployed signaling server.

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, Framer Motion
- **Signaling**: Node.js, Socket.io
- **Encryption**: Web Crypto API (browser-native)
- **P2P**: WebRTC Data Channels
