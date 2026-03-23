<div align="center">

![UshaMeetX](./screenshots/banner.svg)

WebRTC video conferencing with mediasoup SFU and E2E encrypted chat

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)

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

**backend** — Express, mediasoup (SFU worker pool), Socket.io, MongoDB, JWT + bcrypt, Helmet, rate limiting, Winston for logs

## how the SFU works

the server tries to spin up mediasoup workers on start. if it works, each room gets its own Router — participants send one stream up, the server forwards it to everyone else. way better than P2P mesh where everyone connects to everyone.

if mediasoup fails (wrong platform, no UDP ports, whatever), it just falls back to P2P. the frontend hits `/api/v1/sfu-status` before joining and picks the right mode. so it never breaks — worst case you get the old P2P behavior.

## the E2E encryption part

when you create a meeting the browser generates an AES key and sticks it in the URL after the `#`. browsers don't send the hash to the server (that's just how HTTP works), so the key never leaves the clients. messages get encrypted before going through the socket and decrypted on the other side. server only sees base64 gibberish.

this only covers chat — the video/audio is already encrypted by WebRTC (SRTP). in SFU mode the server technically terminates the SRTP but that's the same tradeoff Google Meet makes.

## running it

```bash
git clone https://github.com/AradhyaStuti/UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform.git
cd UshaMeetX-Full-Stack-WebRTC-Video-Conferencing-Platform
```

```bash
# backend
cd backend
cp .env.example .env   # need MONGO_URI and JWT_SECRET at minimum
npm install && npm start

# frontend (other terminal)
cd frontend
npm install && npm start
```

for SFU to work you need to set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP and open up some UDP ports (`RTC_MIN_PORT`/`RTC_MAX_PORT`). on platforms without UDP support it just uses P2P.

## tests

```bash
cd backend && npm test     # jwt, validation, rate limiting, logger
cd frontend && npm test    # landing page, error boundary, avatar picker
```

there's a github actions pipeline that runs these on every push too.

## project layout

```
backend/src/
  app.js
  controllers/  user.controller.js  socketManager.js
  sfu/          config.js  worker.js  room.js
  models/       user.model.js  meeting.model.js
  utils/        jwt.js  logger.js

frontend/src/
  pages/        VideoMeet.jsx  landing  auth  home  history
  components/   ErrorBoundary  AvatarPicker  Logo
  utils/        sfuClient.js  encryption.js
  contexts/     AuthContext.jsx
```

---

[@AradhyaStuti](https://github.com/AradhyaStuti)
