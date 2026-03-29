<div align="center">

![MeetSync](./screenshots/banner.svg)

WebRTC video conferencing with mediasoup SFU, waiting room, and E2E encrypted chat

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-247_passing-brightgreen?style=flat-square)

</div>

---

## what this is

a video calling app. you create a meeting, get a link, share it — anyone can join from their browser. no installs.

started as a basic P2P thing but I ended up adding an SFU layer with mediasoup so it actually works with more than 3 people in a call. also added E2E encryption on the chat because the server shouldn't be reading messages.

**the main stuff:**
- video calls (P2P for small rooms, SFU when mediasoup is running)
- waiting room — host admits/rejects joiners, auto-promotes next participant if host leaves
- screen sharing
- chat with E2E encryption (AES-256-GCM, key stays in the URL hash — server never sees it)
- reactions, hand raise, typing indicators
- spotlight mode — pin someone full screen
- per-person volume control
- keyboard shortcuts (M V C H E)
- works on mobile

## architecture

```
browser ──WebSocket──▶ Express + Socket.IO ──▶ MongoDB (users, history)
   │                        │                         │
   │ (P2P or SFU)          ├── mediasoup workers      ├── Redis (room state)
   │                        │   (1 per core, max 4)   │   (optional, in-memory fallback)
   └──STUN/TURN────────────┘
```

**design decisions and why:**

- **Dual-mode media (P2P + SFU):** P2P mesh is simpler but scales O(n^2) — every participant sends to every other. mediasoup SFU breaks that: one upload per person, server fans out. I implemented both because mediasoup requires a native binary that doesn't run everywhere, so P2P is the universal fallback. The frontend checks `/api/v1/sfu-status` before joining and picks the right mode automatically.

- **In-memory Maps as source of truth, Redis as write-through cache:** Socket.IO event handlers are synchronous — making every room lookup `await redis.hGet(...)` would add latency to every signaling message. So in-memory Maps handle the hot path, and Redis mirrors state for horizontal scaling. The tradeoff: if Redis silently fails (`.catch(() => {})`), instances can drift. In a real production setup, I'd flip this — Redis as primary, in-memory as cache — and add failure monitoring.

- **Waiting room with host promotion:** First joiner becomes host. Others wait. If the host disconnects, the next participant auto-promotes and gets the waiting list. If the room empties while people wait, they get rejected (no orphaned waiters).

- **Component architecture:** The frontend `VideoMeet` was a 668-line monolith. Split into 6 focused components (PreJoinLobby, WaitingScreen, RejectedScreen, VideoGrid, ChatPanel, MeetingControls) with VideoMeet as the state orchestrator.

## stack

**frontend** — React 18, MUI dark theme, mediasoup-client, Socket.io, Web Crypto API (AES-256-GCM), DOMPurify

**backend** — Express, mediasoup (SFU worker pool), Socket.io, MongoDB, Redis (optional), JWT + bcrypt, Helmet + HSTS, rate limiting, gzip compression, Winston structured logs

## how the SFU works

the server tries to spin up mediasoup workers on start (one per CPU core, max 4). if it works, each room gets its own Router — participants send one stream up, the server forwards it to everyone else.

if mediasoup fails (wrong platform, no UDP ports, whatever), it falls back to P2P. the frontend hits `/api/v1/sfu-status` before joining and picks the right mode. so it never breaks — worst case you get the old P2P behavior.

**what this means for scaling:** a single instance handles ~50-100 concurrent rooms. to go beyond that you'd need: Redis as primary state store (not optional), Socket.IO Redis adapter for cross-instance event broadcasting, and sticky sessions so participants in the same room hit the same mediasoup worker.

## the E2E encryption part

when you create a meeting the browser generates an AES key and sticks it in the URL after the `#`. browsers don't send the hash to the server (that's just how HTTP works), so the key never leaves the clients. messages get encrypted before going through the socket and decrypted on the other side. server only sees base64 gibberish.

**caveat:** this only works when users join via the full link (with the hash). users who join via room code get plain text chat by default — the key gets generated in their URL for sharing forward, but their session starts unencrypted.

video/audio is already encrypted by WebRTC (SRTP). in SFU mode the server technically terminates the SRTP — that's the same tradeoff Google Meet and Zoom make. true E2E for media would require Insertable Streams, which I didn't implement.

## TURN server setup

by default only STUN servers are configured (Google's free ones). STUN works when both sides have public IPs or simple NATs. **behind corporate firewalls or symmetric NATs, you need a TURN relay.**

no TURN server ships with this project — you need to run your own (coturn) or use a service (Twilio, Metered).

```bash
# .env
TURN_URL=turn:relay.example.com:3478,turns:relay.example.com:5349
TURN_USERNAME=user
TURN_CREDENTIAL=pass

# optional second TURN server (e.g. TCP-only fallback)
TURN_URL_2=turn:fallback.example.com:3478?transport=tcp
TURN_USERNAME_2=user2
TURN_CREDENTIAL_2=pass2
```

the frontend fetches ICE config dynamically from `/api/v1/ice-config`, so you can change TURN servers without redeploying the client.

## Redis (optional)

Redis mirrors room state (participants, hosts, waiting room, chat history, rate limits) for multi-instance deployments. without `REDIS_URL`, everything runs in-memory on a single instance — no Redis required for development.

```bash
# .env
REDIS_URL=redis://localhost:6379
```

Docker Compose includes a Redis container automatically.

## running it

### with Docker (recommended)

```bash
git clone https://github.com/AradhyaStuti/MeetSync-Full-Stack-WebRTC-Video-Conferencing-Platform.git
cd MeetSync-Full-Stack-WebRTC-Video-Conferencing-Platform

# set required secrets
echo "JWT_SECRET=your-secret-here" > .env

docker compose up
```

- frontend → http://localhost:3000
- backend API → http://localhost:8000
- MongoDB + Redis are included, data persists in named volumes

for SFU you also need `MEDIASOUP_ANNOUNCED_IP` set to your server's public IP and UDP ports 10000-10100 open. without that it falls back to P2P automatically.

### without Docker

```bash
# backend
cd backend
cp .env.example .env   # fill in MONGO_URI and JWT_SECRET
npm install && npm start

# frontend (other terminal)
cd frontend
npm install && npm start
```

## tests

247 tests across backend + frontend, all passing.

```bash
cd backend && npm test
# jwt, validation, controller, SFU room, socket events (real socket.io),
# HTTP integration (real MongoDB via mongodb-memory-server)

cd frontend && npm test
# VideoMeet component, hooks (useRoomControls, useNetworkQuality,
# useEncryptedChat), SfuClient, encryption utils, ErrorBoundary
```

there's a GitHub Actions pipeline that runs lint + tests + Docker build on every push.

## API

Full OpenAPI 3.1.0 spec at [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml).

Full Socket.IO event reference at [`backend/docs/socket-events.md`](backend/docs/socket-events.md).

**HTTP endpoints**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Service health (mongo, redis, sfu, version) |
| GET | `/api/v1/metrics` | — | Uptime, memory, request counts, redis status |
| GET | `/api/v1/ice-config` | — | STUN/TURN server list (5min cache) |
| GET | `/api/v1/sfu-status` | — | Whether SFU is available |
| POST | `/api/v1/users/register` | — | Create account |
| POST | `/api/v1/users/login` | — | Authenticate, get JWT |
| GET | `/api/v1/users/get_all_activity` | JWT | Meeting history |
| POST | `/api/v1/users/add_to_activity` | JWT | Save meeting to history |
| DELETE | `/api/v1/users/delete_from_activity` | JWT | Remove from history |

Every response includes an `x-request-id` header for tracing.

## project layout

```
backend/src/
  app.js                            Express app, middleware, routes, Redis init
  controllers/
    socketManager.js                Socket.IO orchestrator (join/signal/disconnect/waiting room)
    socketHandlers/
      state.js                      In-memory Maps (source of truth), rate limiter, room TTL
      chat.js                       chat-message, hand-raise, reaction, typing
      sfu.js                        mediasoup signalling (8 events, guard wrapper)
  store/
    roomStore.js                    Redis-backed room state (write-through)
  sfu/          config.js  worker.js  room.js
  models/       user.model.js  meeting.model.js
  utils/        jwt.js  logger.js  redis.js
  routes/       users.routes.js

backend/docs/
  openapi.yaml                      Full HTTP API spec (OpenAPI 3.1.0)
  socket-events.md                  All 20 Socket.IO events documented

frontend/src/
  pages/        VideoMeet.jsx (orchestrator)
  components/   PreJoinLobby  WaitingScreen  RejectedScreen  VideoGrid  ChatPanel  MeetingControls
                ErrorBoundary  AvatarPicker  Logo
  hooks/        useRoomControls  useNetworkQuality  useEncryptedChat  useMediaDevices  useWaitingRoom
  utils/        sfuClient.js  encryption.js  withAuth.jsx
  contexts/     AuthContext.jsx
```

## known limitations

- **Redis is write-through, not primary.** In-memory Maps are the real source of truth. Redis failures are silently swallowed. For true horizontal scaling, this needs to be inverted.
- **E2E chat encryption is opt-in.** Only works when users join via the full URL with the hash. Code-based joins default to plain text.
- **No TURN server included.** STUN only gets you through simple NATs. Corporate firewalls need TURN, which costs bandwidth and money.
- **SFU needs native dependencies.** mediasoup compiles C++ — doesn't work on all hosting platforms.
- **Rooms are ephemeral.** No persistent room state beyond the Redis TTL (24h). Restart the server, rooms are gone.

---

[@AradhyaStuti](https://github.com/AradhyaStuti)
