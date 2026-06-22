# Keyway Architecture

This document explains how Keyway works — first in plain language, then with technical detail for developers.

---

## The Big Picture (Plain English)

Keyway lets you send a file directly from one person's browser to another's. Think of it like handing someone a sealed envelope across a table, while a third person only helps you find each other and never opens the envelope.

**What Keyway is good at:**

- Files go **directly** from sender to receiver (peer-to-peer).
- Files are **locked** before they leave the sender's device.
- The server **never stores** your files.
- The server **never sees** the password or secret key that unlocks the file.

**What the server actually does:**

It acts like a **matchmaker**. When two browsers want to connect, the server helps them find each other and exchange connection details. Once they're connected, the file travels between the browsers — not through the server.

---

## How a File Share Works (Step by Step)

### 1. Sender picks a file

The sender chooses a file (or folder) in their browser. Nothing is uploaded to a server.

### 2. The file is locked on the sender's device

Before any data leaves the sender's computer, Keyway encrypts (scrambles) the file using strong encryption (AES-256). Only someone with the right key can unscramble it.

This happens entirely inside the browser. The server is not involved.

### 3. A share link is created

Keyway creates a link that looks like:

```
https://yoursite.com/d/abc12345#SecretKeyGoesHere
```

The link has two important parts:

| Part | Example | Who sees it? |
|------|---------|--------------|
| **Room code** (before `#`) | `abc12345` | The server — used to match sender and receiver |
| **Secret key** (after `#`) | `SecretKeyGoesHere` | **Only the browsers** — never sent to the server |

The part after `#` is called the **URL fragment**. Browsers keep it private. When you visit a link, your browser asks the server for the page, but it does **not** send the `#...` part along with that request.

### 4. Receiver opens the link

The receiver clicks the link (or scans a QR code). Their browser:

1. Loads the Keyway page from the server (using the room code).
2. Reads the secret key from the `#` part locally.
3. Connects to the signaling server to find the sender.

### 5. The server introduces the two browsers

The signaling server is like a reception desk:

- Sender says: "I'm in room `abc12345`, waiting for someone."
- Receiver says: "I'm joining room `abc12345`."
- Server tells the sender: "Someone joined!"
- Both browsers exchange connection info through the server (this is called **signaling**).

The server only passes along "how to reach each other" messages. It does not see file contents.

### 6. File transfers directly between browsers

Once connected, the browsers talk to each other using **WebRTC** — a technology built into modern browsers for direct communication.

The encrypted file travels over this direct connection. The server is no longer in the path.

### 7. Receiver unlocks and saves the file

The receiver's browser uses the secret key from the link to decrypt the file, then saves it to disk (or triggers a download).

---

## Visual Overview

```
  SENDER'S BROWSER                         RECEIVER'S BROWSER
  ─────────────────                        ──────────────────

  [ Pick file ]                            [ Open share link ]
       │                                          │
       ▼                                          ▼
  [ Lock file with secret key ]            [ Read secret key from #hash ]
       │                                   (never sent to server)
       │                                          │
       └──────────────┬───────────────────────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │  SIGNALING SERVER   │  ← matchmaker only
            │  (no file storage)  │
            │                     │
            │  knows: room code,  │
            │  who's connected    │
            │                     │
            │  does NOT know:     │
            │  file contents,     │
            │  secret key         │
            └─────────────────────┘
                      │
                      ▼
            [ Direct browser-to-browser link ]
            [ Encrypted file flows here ]
                      │
                      ▼
              [ Receiver unlocks file ]
```

---

## Security & Privacy

### What is protected?

| Data | Protected? | How |
|------|------------|-----|
| File contents | Yes | Encrypted before leaving sender's device |
| Secret key | Yes | Stored in URL `#fragment`, never sent to server |
| Password (optional) | Yes | Typed by receiver locally, never sent anywhere |

### Optional password protection

Instead of putting the full secret key in the link, the sender can set a password. In that case:

- The link only contains a **salt** (a random helper value), prefixed with `p_`.
- The receiver must type the password.
- The browser combines password + salt to derive the real key locally.

The password never travels over the network.

### What is NOT encrypted?

File **metadata** (name, size, file type) is sent in plain text over the direct browser connection so the receiver knows what they're getting. This metadata never goes through the Keyway server — but it is visible on the peer-to-peer link itself.

### How long does a share last?

Rooms expire after **10 minutes** of inactivity on the server. If nobody connects in time, the sender needs to create a new share. The server does not keep any file data when a room expires — it only forgets the room entry.

### Important things to know

- **Anyone with the full link (including the `#` part) can decrypt the file.** Treat share links like secrets.
- **Keyway does not store files.** If the sender closes their browser before the transfer finishes, the receiver cannot get the file from a server backup — there isn't one.
- **Both sides need a modern browser** with WebRTC support (Chrome, Firefox, Safari, Edge).

---

## What the Server Sees (and Doesn't)

This is the most common question. Here is an honest breakdown:

### The server DOES see:

- A short **room code** (e.g. `abc12345`)
- Which browser sockets are in that room (anonymous connection IDs)
- **WebRTC handshake messages** (technical connection info so browsers can find each other)
- When a room was created

### The server does NOT see:

- File contents (encrypted or otherwise)
- The secret key or password
- Filenames or file sizes (those travel peer-to-peer only)
- Any stored copy of your data — nothing is written to disk

There is **no database**. Room info lives in server memory and is deleted when peers disconnect or the room expires.

---

## Main Parts of the App

Keyway is a single application with three cooperating layers:

### 1. The website (what you see)

Built with **Next.js** and **React**. This is the user interface — buttons, progress bars, share links, QR codes.

| Page | URL | Purpose |
|------|-----|---------|
| Home | `/` | Pick a file to share |
| Download | `/d/[roomId]` | Receive a file (key comes from `#hash`) |
| Manual receive | `/receive` | Enter a room code by hand |

### 2. The signaling server (the matchmaker)

A small **Socket.io** service that helps browsers find each other. It runs on the same machine as the website in production, or on a separate port during development.

It handles exactly four jobs:

1. Create a room when the sender is ready.
2. Let the receiver join that room.
3. Relay WebRTC connection messages between the two browsers.
4. Clean up expired or disconnected rooms.

### 3. The direct connection (WebRTC)

Once signaling succeeds, the browsers open a **data channel** — a private pipe between them. All file bytes flow through this pipe. Keyway encrypts those bytes before they enter the pipe.

---

## Folder Sharing & Sending More Files

After the first connection is established, either person can send more files or entire folders over the same encrypted channel. You don't need a new link — the same secret key protects everything in that session.

For large files (over 100 MB), Keyway encrypts and sends in chunks so it doesn't run out of browser memory. On supported browsers (mainly Chromium), receivers can pick a save location upfront and stream the decrypted file straight to disk.

---

## Glossary

| Term | Simple meaning |
|------|----------------|
| **Peer-to-peer (P2P)** | Two devices talking directly, without a middleman holding the data |
| **Encryption** | Scrambling data so only someone with the key can read it |
| **Signaling** | The "phone call" that helps two browsers find each other before the real transfer |
| **WebRTC** | Browser technology for direct audio, video, and data connections |
| **URL fragment** | The `#something` at the end of a link — browsers keep it private from servers |
| **Room** | A temporary meeting point identified by a short code |
| **AES-256-GCM** | The encryption method Keyway uses (industry standard, very strong) |
| **PBKDF2** | A method to turn a human password into a strong encryption key |
| **STUN** | A public helper service that helps browsers discover how to reach each other through home routers |

---

## For Developers

The sections below mirror the actual codebase. See also `AGENTS.md` for agent-oriented notes.

### Repository layout

```
keyway/
├── app/                    # Next.js pages (/, /d/[roomId], /receive)
├── components/             # UI components (uploader, downloader, layout)
├── hooks/
│   ├── use-file-uploader.ts   # Sender state machine + WebRTC setup
│   └── use-file-downloader.ts # Receiver state machine + WebRTC setup
├── lib/
│   ├── crypto.ts           # AES-GCM encrypt/decrypt, PBKDF2, key import/export
│   ├── signaling.ts        # Socket.io client singleton
│   ├── folder.ts           # Folder share helpers
│   ├── transfer/           # Shared transfer types
│   └── webrtc/             # Peer connection, data channel, file send/receive
├── server/
│   ├── index.ts            # Production entry: Next.js + Socket.io on one port
│   └── signaling.ts        # Room management + SDP/ICE relay
└── scripts/dev.ts          # Dev: Next.js :3000 + signaling :3001
```

### System diagram (technical)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SENDER BROWSER                             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐   │
│  │   Select   │───▶│  Encrypt   │───▶│  Create    │───▶│   Send     │   │
│  │    File    │    │  AES-GCM   │    │   Room     │    │   via      │   │
│  │            │    │  (local)   │    │            │    │  DataChannel│  │
│  └────────────┘    └────────────┘    └────────────┘    └────────────┘   │
└────────────────────────────────────────┼────────────────────────────────┘
                                         │ Socket.io (/api/socketio)
                                         ▼
                          ┌──────────────────────────────┐
                          │      SIGNALING SERVER        │
                          │  In-memory room map only     │
                          │  - create-room / join-room   │
                          │  - SDP offer/answer relay    │
                          │  - ICE candidate relay       │
                          │  - 10 min expiry, 30s sweep  │
                          └──────────────────────────────┘
                                         │ Socket.io
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            RECEIVER BROWSER                             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐   │
│  │ Join room  │───▶│  Receive   │───▶│  Decrypt   │───▶│  Save /    │   │
│  │ + key from │    │  via       │    │  AES-GCM   │    │  download  │   │
│  │  #hash     │    │  DataChannel│   │  (local)   │    │            │   │
│  └────────────┘    └────────────┘    └────────────┘    └────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Encryption implementation (`lib/crypto.ts`)

| Function | Algorithm | Purpose |
|----------|-----------|---------|
| `generateKey()` | AES-GCM-256 | Random session key |
| `deriveKeyFromPassword()` | PBKDF2-SHA256, 100k iterations | Password-based key |
| `encryptData()` / `encryptFileStreaming()` | AES-GCM | Per-chunk encryption, 12-byte IV prepended |
| `exportKey()` / `importKey()` | — | Base64url key in URL fragment |
| `ENCRYPT_READ_CHUNK_SIZE` | — | 16 MB plaintext per encryption segment |

Wire format per segment: `IV (12 bytes) + ciphertext + GCM auth tag (16 bytes)`.

### Signaling protocol (`server/signaling.ts`)

Socket events:

| Event | Direction | Payload |
|-------|-----------|---------|
| `create-room` | client → server | `roomId` |
| `join-room` | client → server | `roomId` |
| `offer` / `answer` | bidirectional relay | `{ roomId, sdp }` |
| `ice-candidate` | bidirectional relay | `{ roomId, candidate }` |
| `peer-joined` | server → sender | — |
| `peer-disconnected` | server → peer | — |
| `room-expired` | server → room | — |

Room state stored in memory:

```ts
interface Room {
  sender: string | null;   // socket id
  receiver: string | null; // socket id
  createdAt: number;
}
```

### Connection state machines

**Sender** (`use-file-uploader.ts`):

`idle → creating → waiting → connecting → transferring → ready | error`

**Receiver** (`use-file-downloader.ts`):

`awaiting-password → connecting → waiting-for-metadata → choosing-save-location → receiving → decrypting → ready | error`

(folder and streaming variants add `choosing-save-folder`, `receiving-folder`, `sending`)

### WebRTC details (`lib/webrtc/`)

- Data channel label: `fileTransfer`, `ordered: true`, `binaryType: arraybuffer`
- Chunk size over data channel: 16 KB (`CHUNK_SIZE`)
- ICE servers: Google public STUN only — **no TURN relay** configured
- If NAT traversal fails, the connection fails rather than falling back to server relay

### Key transport

Share URL format:

```
{origin}/d/{roomId}#{shareToken}
```

- `shareToken` = base64url-encoded raw AES key, OR `p_{base64urlSalt}` for password mode
- Receiver reads hash in `app/d/[roomId]/page.tsx` via `window.location.hash`
- Password entered in UI → `deriveKeyFromPassword()` on receiver

### What travels over each channel

| Channel | Data |
|---------|------|
| HTTP (Next.js) | HTML, JS, CSS only — no file uploads |
| Socket.io signaling | Room IDs, SDP, ICE candidates |
| WebRTC data channel | Encrypted file bytes + JSON metadata (filename, size, mime, folder info) |

### Running locally

```bash
bun install

# Two processes: Next.js :3000 + signaling :3001
bun run dev

# Single process: Next.js + signaling on :3000
bun run dev:integrated

# Signaling only
bun run signaling

# Production
bun run build
bun run start
```

Environment variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `3000`) |
| `SIGNALING_PORT` | Standalone signaling port (default `3001`) |
| `NEXT_PUBLIC_SIGNALING_URL` | Override signaling server URL for the client |
| `NEXT_PUBLIC_URL` | CORS origin for signaling in production |

Client signaling URL resolution (`lib/signaling.ts`): tries `window.location.origin` first (integrated mode), then `NEXT_PUBLIC_SIGNALING_URL`, then localhost fallbacks.

### Production deployment

Typical split:

| Component | Suggested hosting | Notes |
|-----------|-------------------|-------|
| Frontend + integrated server | Any Node host | `bun run start` runs `server/index.ts` |
| Signaling only | Railway, Render, Fly.io | Set `NEXT_PUBLIC_SIGNALING_URL` on the frontend |

If frontend and signaling are on different origins, set `NEXT_PUBLIC_SIGNALING_URL` and configure CORS via `NEXT_PUBLIC_URL`.

### Tech stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS v4, Framer Motion
- **Signaling**: Node.js, Socket.io 4.x, path `/api/socketio`
- **Encryption**: Web Crypto API (browser-native, no external crypto library)
- **P2P**: WebRTC `RTCDataChannel`
- **Package manager**: Bun (`bun.lock`)
- **License**: Apache 2.0

### Known limitations

- No database, no upload API, no file persistence
- File System Access streaming save is Chromium-biased; other browsers buffer in memory
- Metadata (filename, size) is plaintext on the WebRTC channel
- Rooms are 1 sender + 1 receiver only
- README references some scripts (`dev:all`, `start:all`) that do not exist — use `dev` or `dev:integrated` instead