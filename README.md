<div align="center">

![MeetSync](./screenshots/banner.svg)

WebRTC video conferencing with mediasoup SFU and E2E encrypted chat

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-247_passing-brightgreen?style=flat-square)

</div>

---

## what this is

a video calling app. you create a meeting, get a link, share it — anyone can join from their browser. no installs.

started as a basic P2P thing but I ended up adding an SFU layer with mediasoup so it actually works with more than 3 people in a call. also added E2E encryption on the chat because the server shouldn't be reading messages.

**the main stuff:**
- video calls (P2P for small rooms, SFU when mediasoup is running)
- screen sharing
- chat with E2E encryption (AES-256-GCM, key stays in the URL hash so server never sees it)
- reactions, hand raise, typing indicators
- spotlight mode — pin someone full screen
- per-person volume control
- keyboard shortcuts (M V C H E)
- works on mobile

## stack

**frontend** — React 18, MUI dark theme, mediasoup-client, Socket.io, DOMPurify for XSS

**backend** — Express, mediasoup (SFU worker pool), Socket.io, MongoDB, JWT + bcrypt, Helmet + HSTS, rate limiting, gzip compression, Winston structured logs

## how the SFU works

the server tries to spin up mediasoup workers on start. if it works, each room gets its own Router — participants send one stream up, the server forwards it to everyone else. way better than P2P mesh where everyone connects to everyone.

if mediasoup fails (wrong platform, no UDP ports, whatever), it just falls back to P2P. the frontend hits `/api/v1/sfu-status` before joining and picks the right mode. so it never breaks — worst case you get the old P2P behavior.

## the E2E encryption part

when you create a meeting the browser generates an AES key and sticks it in the URL after the `#`. browsers don't send the hash to the server (that's just how HTTP works), so the key never leaves the clients. messages get encrypted before going through the socket and decrypted on the other side. server only sees base64 gibberish.

this only covers chat — the video/audio is already encrypted by WebRTC (SRTP). in SFU mode the server technically terminates the SRTP but that's the same tradeoff Google Meet makes.

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
- MongoDB is included, data persists in a named volume

for SFU you also need `MEDIASOUP_ANNOUNCED_IP` set to your server's public IP and UDP ports 10000–10100 open. without that it falls back to P2P automatically.

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
| GET | `/health` | — | Service health (mongo, sfu, version) |
| GET | `/api/v1/metrics` | — | Uptime, memory, request counts |
| GET | `/api/v1/ice-config` | — | STUN/TURN server list |
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
  app.js                            Express app, middleware, routes
  controllers/
    socketManager.js                Socket.IO orchestrator (join/signal/disconnect)
    socketHandlers/
      state.js                      Shared Maps, rate limiter, room TTL
      chat.js                       chat-message, hand-raise, reaction, typing
      sfu.js                        mediasoup signalling (8 events, guard wrapper)
  sfu/          config.js  worker.js  room.js
  models/       user.model.js  meeting.model.js
  utils/        jwt.js  logger.js
  routes/       users.routes.js

backend/docs/
  openapi.yaml                      Full HTTP API spec (OpenAPI 3.1.0)
  socket-events.md                  All 20 Socket.IO events documented

frontend/src/
  pages/        VideoMeet.jsx  landing  auth  home  history
  hooks/        useRoomControls  useNetworkQuality  useEncryptedChat  useMediaDevices
  components/   ErrorBoundary  AvatarPicker  Logo
  utils/        sfuClient.js  encryption.js  withAuth.jsx
  contexts/     AuthContext.jsx
```

---

[@AradhyaStuti](https://github.com/AradhyaStuti)
