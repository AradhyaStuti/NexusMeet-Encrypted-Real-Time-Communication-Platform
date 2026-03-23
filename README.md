# UshaMeetX

A video conferencing web app. WebRTC for peer-to-peer video, Socket.io for signaling and real-time stuff, React frontend, Node/Express backend with MongoDB. Has an SFU mode using mediasoup for scaling beyond 1-on-1 calls, and E2E encrypted chat.

Basically you create a meeting, share the link, and people join - no downloads or accounts needed for guests. Has screen sharing, chat, reactions, all that.

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)
![mediasoup](https://img.shields.io/badge/mediasoup-SFU-7c3aed?style=flat-square)

---

## What's in it

**Video & Media**
- P2P video calls through WebRTC with multiple STUN servers. Also supports TURN if you configure it (helps behind corporate firewalls). If a connection drops, it tries an ICE restart automatically
- **SFU mode** with mediasoup — when the server has mediasoup available, media gets routed through the server instead of P2P. This scales way better for group calls (P2P breaks down at 4-5 people because each peer has to send N-1 streams). Falls back to P2P gracefully if mediasoup isn't running
- Screen sharing - full screen or just a window, handles the fallback when you stop sharing
- Spotlight mode where you can pin someone's video full-screen and the rest show up in a thumbnail strip on the side
- Per-participant volume sliders that show up on hover

**Collaboration stuff**
- Real-time chat with timestamps and auto-scroll. Has a typing indicator so you can see when someone's writing. Messages go through DOMPurify to prevent XSS
- **E2E encrypted chat** — messages are encrypted with AES-256-GCM before they leave your browser. The key lives in the URL hash fragment (the `#` part), which browsers never send to the server. So the server only ever sees ciphertext. A green lock badge shows up in the meeting when E2E is active
- Emoji reactions (👍👏❤️😂🎉🔥) that float up on the screen, everyone sees them
- Hand raise feature with a little wave animation on your video tile
- Actual participant names and avatars show up on the video tiles instead of just "Participant 1"

**Other**
- Keyboard shortcuts - M for mute, V for video, C for chat, H for hand raise, E to end the call. Disabled when you're typing in an input field obviously
- Network quality indicator (green/yellow/red dot) calculated from WebRTC round trip time stats
- Guest join via link, no account required. Or create an account to keep meeting history
- Meeting history page where you can rejoin or delete old meetings
- 16 emoji avatars you can pick from, saved to localStorage
- Mobile responsive - the video grid, controls, chat panel and spotlight all adapt

## Tech stack

**Frontend** - React 18 with React Router v6, Material UI for components with a custom dark theme, Socket.io client for real-time events, mediasoup-client for SFU connections, WebRTC API using the modern `addTrack`/`replaceTrack` (not the deprecated `addStream`), CSS Modules for scoped styles, Axios with request/response interceptors for JWT, DOMPurify for XSS, Web Crypto API for E2E encryption

**Backend** - Express with Helmet for security headers, JWT authentication with bcrypt for password hashing, rate limiting on auth endpoints (30 req per 15 min), mediasoup SFU with worker pool and per-room routers, Socket.io handling signaling + SFU events + chat + reactions + typing + hand raise. Socket messages are rate limited too (10 per 10 sec per client). MongoDB with Mongoose, compound indexes on the meeting model. Winston for structured logging with file rotation. Graceful shutdown handler for SIGTERM/SIGINT

**Testing & CI** - 32 tests total. Backend uses node's built-in test runner for JWT, input validation, rate limiting logic and the logger. Frontend uses Jest + React Testing Library for the landing page, error boundary and avatar picker. GitHub Actions runs everything on push/PR - syntax checks, tests, production build

## Getting started

```bash
git clone https://github.com/AradhyaStuti/UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform.git
cd UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform
```

Backend:
```bash
cd backend
cp .env.example .env     # edit this with your mongo URI and a JWT secret
npm install
npm start                 # runs on localhost:8000
```

Frontend (separate terminal):
```bash
cd frontend
npm install
npm start                 # runs on localhost:3000
```

The `.env.example` has everything you need. Main things are `MONGO_URI`, `JWT_SECRET`, and `CORS_ORIGINS`. If you have a TURN server you can add `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` too but it's not required for local dev.

## Architecture notes

### SFU (Selective Forwarding Unit)

The app has two modes for video: P2P and SFU. On startup the backend tries to initialize mediasoup workers (one per CPU core, capped at 4). If that works, it tells the frontend via `GET /api/v1/sfu-status` and the client uses mediasoup-client instead of raw RTCPeerConnection.

In SFU mode each participant creates a send transport (to produce their audio/video) and a receive transport (to consume everyone else's). The server's mediasoup router handles forwarding — so each person only uploads one stream regardless of how many people are in the call. Way more scalable than P2P mesh where everyone connects to everyone.

If mediasoup isn't available (missing native deps, wrong platform, whatever) the server just logs a warning and everything falls back to P2P mode. The frontend checks `sfu-status` before joining and picks the right path.

Each meeting room gets its own mediasoup Router. When the last person leaves, the router gets closed and garbage collected.

### E2E Encryption

Chat messages are encrypted client-side using AES-256-GCM via the Web Crypto API. The encryption key is generated when someone creates a meeting and stored in the URL hash (`#`). The hash fragment is never sent to the server by browsers — it stays entirely client-side. When you share the meeting link, recipients get the key automatically as part of the URL.

The server only sees base64 ciphertext. It can't read any messages. A green "E2E" badge shows up in the control bar when encryption is active.

This doesn't cover the video/audio streams — those are already encrypted by WebRTC itself (SRTP). In SFU mode the server can technically see the media since it's the SRTP endpoint, but that's how every SFU works (Google Meet, Zoom, Teams all have this same tradeoff).

### Everything else

Rooms are tracked in a `Map<path, Map<socketId, {username, avatar}>>` with a reverse `Map<socketId, path>` so looking up which room a socket belongs to is O(1) instead of iterating everything. Chat history is kept in memory capped at 200 messages per room, and rooms get cleaned up automatically when the last person disconnects.

The ICE config (STUN/TURN servers) is served from `/api/v1/ice-config` rather than hardcoded in the frontend, so TURN credentials don't end up in client code.

On the frontend, the WebRTC peer connections live in a `useRef` - I had them as a module-level variable before and it was causing weird shared state issues across re-renders. Auth is JWT based with axios interceptors that auto-attach the token and clear it on 401. The whole app is wrapped in an Error Boundary.

## Running tests

```bash
cd backend && npm test      # 14 tests
cd frontend && npm test     # 18 tests
```

There's a CI pipeline at `.github/workflows/ci.yml` that runs on every push and PR to main.

## Project structure

```
backend/
  src/
    app.js
    controllers/
      user.controller.js      # JWT auth, requireAuth middleware, history CRUD
      socketManager.js         # P2P signaling, SFU events, chat, reactions, rate limiting
    models/
      user.model.js
      meeting.model.js
    routes/users.routes.js
    sfu/
      config.js                # mediasoup codec + transport config
      worker.js                # worker pool, round-robin assignment
      room.js                  # SfuRoom class — router, transports, producers, consumers
    utils/
      jwt.js
      logger.js
  tests/
    auth.test.js
    logger.test.js

frontend/src/
  pages/
    VideoMeet.jsx              # main meeting room — SFU + P2P + E2E chat
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
    sfuClient.js               # mediasoup-client Device wrapper
    encryption.js              # AES-256-GCM encrypt/decrypt via Web Crypto API
  styles/videoComponent.module.css

.github/workflows/ci.yml
```

## API endpoints

| Method | Endpoint | Auth | |
|---|---|---|---|
| POST | `/api/v1/users/register` | no | create account |
| POST | `/api/v1/users/login` | no | returns JWT |
| GET | `/api/v1/users/get_all_activity` | yes | get meeting history |
| POST | `/api/v1/users/add_to_activity` | yes | save a meeting |
| DELETE | `/api/v1/users/delete_from_activity` | yes | delete a meeting |
| GET | `/api/v1/ice-config` | no | STUN/TURN config |
| GET | `/api/v1/sfu-status` | no | whether SFU is available |
| GET | `/health` | no | server status + SFU state |

Socket.io events: `join-call`, `user-joined`, `user-left`, `signal`, `chat-message`, `hand-raise`, `reaction`, `typing`, `get-rtp-capabilities`, `create-send-transport`, `create-recv-transport`, `connect-transport`, `produce`, `consume`, `consumer-resume`, `get-producers`, `new-producer`, `producer-closed`

## Deployment

Frontend goes on Vercel or Netlify - just run `npm run build` and point it at the `build/` folder.

Backend goes on Render or similar - set the root directory to `backend`, start command is `node src/app.js`. Make sure to set `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGINS` in the env vars. For SFU to work the server needs UDP ports (set `RTC_MIN_PORT`, `RTC_MAX_PORT`, `MEDIASOUP_ANNOUNCED_IP`). On platforms that don't support UDP (like Render free tier), it'll just fall back to P2P and everything still works.

Then update `frontend/src/environment.js` with whatever URL your backend ends up at.

---

[@AradhyaStuti](https://github.com/AradhyaStuti)
