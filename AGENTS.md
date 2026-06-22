# Keyway — Agent Guide

## Architecture

Single-package Next.js 16 + React 19 app with an **embedded Socket.io signaling server** on the same HTTP process. No monorepo, no database.

- **Server entrypoint**: `server/index.ts` — custom Node.js server that runs Next.js request handler + attaches Socket.io at path `/api/socketio`.
- **Signaling server**: `server/signaling.ts` — exports `setupSignaling(io)` used by the combined server, or can run standalone as `tsx server/signaling.ts` (port 3001).
- **Client signaling**: `lib/signaling.ts` — singleton `SignalingClient`. Connects to `window.location.origin + /api/socketio` by default, or `NEXT_PUBLIC_SIGNALING_URL` env var.
- **Frontend routes**: `/` (home), `/d/[roomId]` (download), `/receive` (manual entry).
- **Encryption key transport**: stored in URL fragment (`#hash`) — never sent to server.
- **State machines**: `hooks/use-file-uploader.ts` and `hooks/use-file-downloader.ts` define explicit connection states (idle → creating → waiting → connecting → transferring → complete/error).

## Commands

Only scripts in `package.json`:
- `bun run dev` — signaling on 3001 + Next.js on 3000 (via `scripts/dev.ts`)
- `bun run dev:integrated` — combined server (Next.js + Socket.io on port 3000)
- `bun run signaling` — standalone signaling server (port 3001)
- `bun run build` — `next build`
- `bun run start` — `NODE_ENV=production tsx server/index.ts`
- `bun run lint` — `eslint`

The README references `dev:all`, `dev:server`, `start:all` — these do not exist.

## Style & Config

- **TypeScript**: strict, bundler module resolution, `@/*` path alias maps to root
- **Tailwind v4**: CSS-first config in `app/globals.css` via `@theme inline` — **no `tailwind.config.*` file**
- **ESLint**: flat config (`eslint.config.mjs`), `eslint-config-next` with core-web-vitals + TypeScript rules
- **No formatter** (no Prettier or other)
- **No testing infrastructure** (no Jest/Vitest/Playwright config)
- **No CI/CD pipelines** (no `.github/workflows/`)

## Gotchas

- **License**: `LICENSE` is Apache 2.0, NOT MIT (README is wrong).
- Use Bun for installs (`bun install`). Lockfile: `bun.lock`.
- `server/index.ts` listens on `0.0.0.0:${PORT || 3000}`.
- Socket.io client path is hardcoded to `/api/socketio` on both client and server.
- Rooms expire after 10 min (server-side cleanup runs every 30s).
- WebRTC streaming uses File System Access API (`showSaveFilePicker`) — Chromium-only; falls back to in-memory buffering.
- The directory `lib/webrtc/` exists (not `lib/peer.ts` as README says).
