# UshaMeetX

A video conferencing web app with WebRTC, Socket.io, React and Node.js. Has a hybrid P2P + SFU architecture (mediasoup) and E2E encrypted chat. Create a meeting, share the link, people join — no downloads or signups needed for guests.

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)
![mediasoup](https://img.shields.io/badge/mediasoup-SFU-7c3aed?style=flat-square)

---

## Features

| Feature | How it works |
|---|---|
| HD Video Calls | WebRTC P2P with STUN/TURN. Auto ICE restart if connection drops |
| SFU Mode | mediasoup routes media through server — scales to large group calls. Falls back to P2P if unavailable |
| Screen Sharing | full screen or window, auto-fallback when you stop |
| Spotlight | pin anyone full-screen, rest go to thumbnail strip |
| Volume Control | per-participant slider on hover |
| E2E Encrypted Chat | AES-256-GCM via Web Crypto API. Key stays in URL hash, server only sees ciphertext |
| Live Chat | timestamps, auto-scroll, typing indicators, XSS sanitized with DOMPurify |
| Reactions | 👍👏❤️😂🎉🔥 float up on screen for everyone |
| Hand Raise | animated wave badge on your video tile |
| Participant Names | real names + avatars on every tile, not just "Participant 1" |
| Keyboard Shortcuts | M mute, V camera, C chat, H hand, E end call |
| Network Quality | green/yellow/red dot from WebRTC RTT stats |
| Guest Join | share a link, no account needed |
| Meeting History | rejoin or delete past meetings |
| Avatars | 16 emoji avatars, saved to localStorage |
| Mobile Responsive | video grid, controls, chat, spotlight all adapt |

---

## Tech Stack

### Frontend

| Tech | What it does |
|---|---|
| React 18 | SPA with React Router v6 |
| Material UI v5 | component library, custom dark theme |
| mediasoup-client | SFU transport/producer/consumer management |
| WebRTC API | `addTrack`/`replaceTrack` (not the deprecated `addStream`) |
| Socket.io Client | signaling, chat, reactions, typing |
| Axios | HTTP client with JWT interceptors |
| DOMPurify | XSS sanitization on chat |
| Web Crypto API | AES-256-GCM for E2E chat encryption |
| CSS Modules | scoped responsive styles |

### Backend

| Tech | What it does |
|---|---|
| Express | REST API + middleware stack |
| mediasoup | SFU — worker pool, per-room routers, transports |
| Socket.io | signaling (P2P + SFU), chat, reactions, typing, hand raise |
| MongoDB + Mongoose | users, meeting history, compound indexes |
| JWT | stateless auth with signed tokens + expiry |
| bcrypt | password hashing (10 rounds) |
| Helmet | security headers |
| express-rate-limit | 30 req/15min on auth, 10 msg/10sec on chat sockets |
| Winston | structured logging, file rotation, JSON output |

### Testing & CI

| What | Details |
|---|---|
| Backend tests | 14 tests — JWT, input validation, rate limiting, logger (node:test) |
| Frontend tests | 18 tests — landing page, error boundary, avatar picker (Jest + RTL) |
| CI pipeline | GitHub Actions — syntax check, test, build on every push/PR |

---

## Getting Started

```bash
git clone https://github.com/AradhyaStuti/UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform.git
cd UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform
```

Backend:
```bash
cd backend
cp .env.example .env     # fill in MONGO_URI, JWT_SECRET
npm install
npm start                 # localhost:8000
```

Frontend (new terminal):
```bash
cd frontend
npm install
npm start                 # localhost:3000
```

Check `.env.example` for all the env vars. The main ones are `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGINS`. TURN and SFU vars are optional for local dev.

---

## Architecture

### How the video works (P2P vs SFU)

The app runs in two modes depending on what the server can do:

| Mode | When | How |
|---|---|---|
| **SFU** | mediasoup workers initialized successfully | each person uploads one stream to server, server forwards to everyone else. Scales to big rooms |
| **P2P** | mediasoup not available (fallback) | direct peer-to-peer connections. Works great for 2-3 people, gets heavy at 4-5 |

On startup the backend tries to spin up mediasoup workers (one per CPU, capped at 4). Frontend checks `/api/v1/sfu-status` before joining and picks the right path. If SFU init fails for whatever reason — missing deps, no UDP ports, wrong platform — it just logs a warning and falls back to P2P. Nothing breaks.

Each meeting room gets its own mediasoup Router. When the last person leaves, the router closes and gets garbage collected. A purple "SFU" badge shows up in the meeting controls when SFU is active.

### How E2E encryption works

| Step | What happens |
|---|---|
| Room created | browser generates AES-256-GCM key, puts it in URL hash (`#key`) |
| Link shared | recipient gets the key as part of the URL |
| Message sent | encrypted client-side before hitting the socket |
| Server receives | only sees base64 ciphertext, can't read anything |
| Message received | other clients decrypt using key from their URL hash |

The URL hash fragment is never sent to the server by browsers — that's by design in the HTTP spec. So the server genuinely cannot read the messages. A green lock "E2E" badge shows up in the control bar when it's active.

Video/audio streams are already encrypted by WebRTC (SRTP). In SFU mode the server is the SRTP endpoint so it could technically access media — but that's how every SFU works (Google Meet, Zoom, Teams all have this same tradeoff).

### Other internals

Rooms tracked in `Map<path, Map<socketId, {username, avatar}>>` with a reverse `Map<socketId, path>` for O(1) lookups. Chat capped at 200 msgs per room, empty rooms auto-cleaned. ICE config served from `/api/v1/ice-config` so TURN creds stay out of frontend code. WebRTC connections live in a `useRef` (not module-level). JWT auto-attached via axios interceptors. Whole app wrapped in Error Boundary.

---

## Tests

```bash
cd backend && npm test      # 14 tests
cd frontend && npm test     # 18 tests
```

CI at `.github/workflows/ci.yml` runs on every push/PR to main.

---

## Project Structure

```
backend/
  src/
    app.js
    controllers/
      user.controller.js         # JWT auth, requireAuth, history
      socketManager.js            # P2P + SFU signaling, chat, reactions
    models/
      user.model.js
      meeting.model.js
    sfu/
      config.js                   # mediasoup codec + transport config
      worker.js                   # worker pool, round-robin
      room.js                     # SfuRoom — router, transports, producers, consumers
    routes/users.routes.js
    utils/
      jwt.js                      # sign/verify
      logger.js                   # winston
  tests/
    auth.test.js
    logger.test.js

frontend/src/
  pages/
    VideoMeet.jsx                 # meeting room — SFU + P2P + E2E
    landing.jsx
    authentication.jsx
    home.jsx
    history.jsx
  components/
    ErrorBoundary.jsx
    AvatarPicker.jsx
    UshaMeetXLogo.jsx
  contexts/AuthContext.jsx
  utils/
    sfuClient.js                  # mediasoup-client wrapper
    encryption.js                 # AES-256-GCM via Web Crypto
  styles/videoComponent.module.css

.github/workflows/ci.yml
```

---

## API

| Method | Endpoint | Auth | What |
|---|---|---|---|
| POST | `/api/v1/users/register` | — | create account |
| POST | `/api/v1/users/login` | — | get JWT |
| GET | `/api/v1/users/get_all_activity` | JWT | meeting history |
| POST | `/api/v1/users/add_to_activity` | JWT | save meeting |
| DELETE | `/api/v1/users/delete_from_activity` | JWT | delete meeting |
| GET | `/api/v1/ice-config` | — | STUN/TURN servers |
| GET | `/api/v1/sfu-status` | — | is SFU available |
| GET | `/health` | — | server status + SFU state |

### Socket Events

| Event | Direction | What |
|---|---|---|
| `join-call` | client → server | join room with name + avatar |
| `user-joined` | server → client | full participant list |
| `user-left` | server → client | someone disconnected |
| `signal` | both | P2P SDP/ICE exchange |
| `chat-message` | both | encrypted chat |
| `hand-raise` | both | raise/lower hand |
| `reaction` | both | emoji reaction |
| `typing` | both | typing indicator |
| `get-rtp-capabilities` | client → server | SFU: get router caps |
| `create-send-transport` | client → server | SFU: create upload transport |
| `create-recv-transport` | client → server | SFU: create download transport |
| `connect-transport` | client → server | SFU: DTLS connect |
| `produce` | client → server | SFU: start sending media |
| `consume` | client → server | SFU: start receiving media |
| `new-producer` | server → client | SFU: someone started a track |
| `producer-closed` | server → client | SFU: someone stopped a track |

---

## Deployment

Frontend → Vercel or Netlify, just `npm run build` and deploy `build/`

Backend → Render or any VPS, start command is `node src/app.js`

| Env var | Required | What |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | random string for signing tokens |
| `CORS_ORIGINS` | no | allowed frontend URLs (comma-separated). Allows all if not set |
| `TURN_URL` | no | TURN server for NAT traversal |
| `TURN_USERNAME` | no | TURN auth |
| `TURN_CREDENTIAL` | no | TURN auth |
| `RTC_MIN_PORT` | no | mediasoup UDP port range start (default 10000) |
| `RTC_MAX_PORT` | no | mediasoup UDP port range end (default 10100) |
| `MEDIASOUP_ANNOUNCED_IP` | no | public IP for SFU (needed on VPS) |

On Render free tier, SFU won't have UDP ports so it falls back to P2P automatically. Everything still works.

Update `frontend/src/environment.js` with your backend URL.

---

[@AradhyaStuti](https://github.com/AradhyaStuti)
