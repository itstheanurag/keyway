<p align="center">
  <img src="public/mascot.png" alt="Keyway Logo" width="120" />
</p>

<h1 align="center">Keyway</h1>

<p align="center">
  <strong>Secure, peer-to-peer file sharing with end-to-end encryption</strong>
</p>

<p align="center">
  No servers. No storage. No trace left behind.
</p>

---

## What is Keyway?

Keyway is an open-source file sharing application that transfers files **directly between browsers** using WebRTC. All files are encrypted with **AES-256** on your device before transmission — the server never sees your data.

### Key Features

- **🔐 End-to-End Encryption** — Files encrypted with AES-256-GCM before leaving your device
- **📡 Peer-to-Peer Transfer** — Direct browser-to-browser, no server storage
- **🔑 Optional Password Protection** — Add an extra layer with PBKDF2-derived keys
- **🚀 No File Size Limits** — Limited only by browser memory
- **🕵️ Zero-Knowledge** — Server only facilitates connections, never sees content

## How It Works

```
1. SENDER selects a file
2. File is encrypted in the browser (AES-256-GCM)
3. A unique share link is generated (contains room ID + encryption key)
4. RECEIVER opens the link
5. Direct WebRTC connection is established
6. Encrypted file transfers peer-to-peer
7. RECEIVER decrypts and downloads the file
```

The encryption key is stored in the URL fragment (`#hash`) — it's **never sent to any server**.

## Quick Start

### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/keyway.git
cd keyway

# Install dependencies
npm install
# or
bun install
```

### Development

```bash
# Start both frontend and signaling server (separate ports)
npm run dev
# or
bun run dev

# Or run the integrated server (single port)
npm run dev:integrated
# or
bun run dev:integrated
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
# Build the frontend
npm run build

# Start production server (integrated)
npm run start

# Or run the standalone signaling server
npm run signaling
```

## Project Structure

```
keyway/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Home page
│   ├── d/[roomId]/        # Download page
│   └── receive/           # Manual receive page
├── components/            # React components
│   ├── FileUploader.tsx   # Upload UI
│   ├── FileDownloader.tsx # Download UI
│   ├── layout/            # Navbar, Footer
│   └── sections/          # Home page sections
├── hooks/                 # Custom React hooks
│   ├── use-file-uploader.ts
│   └── use-file-downloader.ts
├── lib/                   # Core utilities
│   ├── crypto.ts          # Encryption functions
│   ├── webrtc/            # WebRTC helpers
│   ├── signaling.ts       # Socket.io client
│   └── ...               # Other utilities
├── server/                # Signaling server
│   └── signaling.ts       # WebSocket server
└── public/                # Static assets
```

## Deployment

### Architecture

Keyway requires two components:

| Component            | Description                         | Platforms               |
| -------------------- | ----------------------------------- | ----------------------- |
| **Frontend**         | Next.js application                 | Vercel, Netlify, Render |
| **Signaling Server** | WebSocket server for peer discovery | Railway, Render, Fly.io |

> ⚠️ **Important**: Vercel and Netlify are serverless and cannot host the signaling server. Deploy it separately on Railway or Render.

### Environment Variables

```env
NEXT_PUBLIC_SIGNALING_URL=https://your-signaling-server.railway.app
```

### Deploy to Vercel (Frontend Only)

1. Push to GitHub
2. Import to Vercel
3. Set `NEXT_PUBLIC_SIGNALING_URL` environment variable
4. Deploy

### Deploy Signaling Server to Railway

1. Create new Railway project
2. Connect `server/signaling.ts`
3. Set `PORT` environment variable (Railway provides this automatically)
4. Deploy

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed deployment instructions.

## Security

### Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Generation**: Web Crypto API (cryptographically secure)
- **Password Derivation**: PBKDF2-SHA256 with 100,000 iterations

### Privacy

- Files are **never stored** on any server
- Encryption keys exist **only in the browser** and URL fragment
- The signaling server **cannot decrypt** your files
- No analytics, no tracking, no logs

## Scripts

| Command                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| `npm run dev`            | Start Next.js + standalone signaling server |
| `npm run dev:integrated` | Start integrated server (single port)       |
| `npm run signaling`      | Start standalone signaling server           |
| `npm run build`          | Build for production                        |
| `npm run start`          | Start production integrated server          |

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS, Framer Motion
- **Signaling**: Node.js, Socket.io
- **Encryption**: Web Crypto API
- **P2P**: WebRTC Data Channels

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

Apache 2.0 License — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Made with ❤️ for privacy
</p>
