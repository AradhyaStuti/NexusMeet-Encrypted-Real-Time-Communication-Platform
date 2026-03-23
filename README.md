<div align="center">

![UshaMeetX](./screenshots/banner.svg)

Video conferencing platform with hybrid **P2P + SFU** architecture and **end-to-end encrypted** chat.
<br/>Share a link, join instantly — no downloads, no plugins.

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)
![mediasoup](https://img.shields.io/badge/mediasoup-SFU-7c3aed?style=flat-square)
![Tests](https://img.shields.io/badge/32_tests-passing-28A745?style=flat-square)

</div>

---

## Features

| Feature | Description |
|---|---|
| **HD Video Calls** | WebRTC with STUN/TURN support and automatic ICE restart on connection failure |
| **SFU Mode** | mediasoup-powered selective forwarding — each person uploads once, server distributes. Falls back to P2P if unavailable |
| **E2E Encrypted Chat** | AES-256-GCM via Web Crypto API. Key lives in URL hash fragment — never sent to server |
| **Screen Sharing** | Full screen or specific window with automatic fallback |
| **Live Chat** | Real-time with timestamps, typing indicators, auto-scroll, DOMPurify XSS protection |
| **Reactions & Hand Raise** | Floating emoji reactions and animated hand raise badge visible to all |
| **Spotlight & Volume** | Pin any participant full-screen, per-person volume sliders on hover |
| **Guest Access** | Join via link without an account — meeting URL is the only thing needed |
| **Keyboard Shortcuts** | `M` mute · `V` camera · `C` chat · `H` hand · `E` end call |
| **Network Quality** | Live green/yellow/red indicator calculated from WebRTC round-trip time |
| **Responsive** | Video grid, controls, chat and spotlight adapt to mobile screens |

---

## Architecture

```
                    ┌─────────────────────────────┐
  Browser A ────────┤  mediasoup SFU (if available)├──────── Browser B
       │            │  or direct P2P WebRTC mesh   │            │
       │            └──────────────┬───────────────┘            │
       │                           │                            │
       └───── Socket.io ───────────┼─────────── Socket.io ──────┘
                                   │
                          Node.js / Express
                    ┌──────┬───────┼───────┬──────┐
                    │      │       │       │      │
                 Helmet   JWT    Rate   Winston  Graceful
                         Auth   Limit   Logger   Shutdown
                                   │
                              MongoDB Atlas
```

**SFU vs P2P** — On startup the backend initializes mediasoup workers (one per CPU core, capped at 4). If successful, media is routed through the server — each participant uploads one stream and the server forwards selectively. This scales to large group calls where P2P mesh would choke. If mediasoup can't initialize (no native deps, no UDP ports), it falls back to P2P automatically. Frontend checks `/api/v1/sfu-status` and picks the right mode.

**E2E Encryption** — When a meeting is created, the browser generates an AES-256-GCM key and stores it in the URL hash (`#`). The hash fragment is never sent to the server per the HTTP spec. All chat messages are encrypted before leaving the browser and decrypted on the receiving end. The server only relays ciphertext.

**Room Management** — Rooms use `Map<path, Map<socketId, {username, avatar}>>` with a reverse `Map<socketId, path>` for O(1) lookups. Chat capped at 200 messages per room. Empty rooms get garbage collected. Each room gets its own mediasoup Router in SFU mode.

---

## Tech Stack

| Frontend | Backend |
|---|---|
| React 18, React Router v6 | Express, Helmet, CORS |
| Material UI v5 (dark theme) | mediasoup SFU (worker pool, per-room routers) |
| mediasoup-client | Socket.io (signaling, chat, reactions, typing) |
| WebRTC API (`addTrack`/`replaceTrack`) | JWT auth + bcrypt (10 rounds) |
| Axios with JWT interceptors | Rate limiting — 30 req/15min auth, 10 msg/10s chat |
| DOMPurify, Web Crypto API | Winston structured logging with file rotation |
| CSS Modules (responsive) | MongoDB + Mongoose (compound indexes) |

**Testing:** 32 tests — 14 backend (node:test: JWT, validation, rate limiting, logger) + 18 frontend (Jest + RTL: landing page, error boundary, avatar picker)

**CI/CD:** GitHub Actions pipeline runs syntax checks, all tests, and production build on every push and PR

---

## Getting Started

```bash
git clone https://github.com/AradhyaStuti/UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform.git
cd UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform
```

**Backend:**
```bash
cd backend
cp .env.example .env     # set MONGO_URI and JWT_SECRET
npm install && npm start  # http://localhost:8000
```

**Frontend** (separate terminal):
```bash
cd frontend
npm install && npm start  # http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for signing auth tokens |
| `CORS_ORIGINS` | No | Allowed origins, comma-separated. Allows all if unset |
| `TURN_URL` | No | TURN server URL for NAT traversal |
| `MEDIASOUP_ANNOUNCED_IP` | No | Public IP for SFU mode (needed on VPS) |
| `RTC_MIN_PORT` / `RTC_MAX_PORT` | No | UDP port range for mediasoup (default 10000-10100) |

---

## Project Structure

```
backend/
  src/
    app.js                          # server setup, middleware, graceful shutdown
    controllers/
      user.controller.js            # JWT auth, requireAuth middleware, history CRUD
      socketManager.js              # P2P + SFU signaling, chat, reactions, rate limiting
    sfu/
      config.js                     # mediasoup codec and transport config
      worker.js                     # worker pool with round-robin
      room.js                       # SfuRoom — router, transports, producers, consumers
    models/  user.model.js · meeting.model.js
    routes/  users.routes.js
    utils/   jwt.js · logger.js
  tests/     auth.test.js · logger.test.js

frontend/src/
  pages/
    VideoMeet.jsx                   # meeting room — SFU + P2P + E2E chat
    landing.jsx · authentication.jsx · home.jsx · history.jsx
  components/  ErrorBoundary.jsx · AvatarPicker.jsx · UshaMeetXLogo.jsx
  contexts/    AuthContext.jsx
  utils/       sfuClient.js · encryption.js
  styles/      videoComponent.module.css

.github/workflows/ci.yml           # lint + test + build pipeline
```

---

## Running Tests

```bash
cd backend && npm test      # 14 tests
cd frontend && npm test     # 18 tests
```

---

<div align="center">

Built by [@AradhyaStuti](https://github.com/AradhyaStuti)

</div>
