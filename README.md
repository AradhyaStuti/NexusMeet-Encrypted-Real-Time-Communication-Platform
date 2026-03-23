# UshaMeetX

A video conferencing web app. WebRTC for peer-to-peer video, Socket.io for signaling and real-time stuff, React frontend, Node/Express backend with MongoDB.

Basically you create a meeting, share the link, and people join - no downloads or accounts needed for guests. Has screen sharing, chat, reactions, all that.

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333?style=flat-square&logo=webrtc&logoColor=white)

---

## What's in it

**Video & Media**
- P2P video calls through WebRTC with multiple STUN servers. Also supports TURN if you configure it (helps behind corporate firewalls). If a connection drops, it tries an ICE restart automatically
- Screen sharing - full screen or just a window, handles the fallback when you stop sharing
- Spotlight mode where you can pin someone's video full-screen and the rest show up in a thumbnail strip on the side
- Per-participant volume sliders that show up on hover

**Collaboration stuff**
- Real-time chat with timestamps and auto-scroll. Has a typing indicator so you can see when someone's writing. Messages go through DOMPurify to prevent XSS
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

**Frontend** - React 18 with React Router v6, Material UI for components with a custom dark theme, Socket.io client for real-time events, WebRTC API using the modern `addTrack`/`replaceTrack` (not the deprecated `addStream`), CSS Modules for scoped styles, Axios with request/response interceptors for JWT, DOMPurify for sanitizing chat

**Backend** - Express with Helmet for security headers, JWT authentication with bcrypt for password hashing, rate limiting on auth endpoints (30 req per 15 min), Socket.io handling signaling + chat + reactions + typing + hand raise. Socket messages are rate limited too (10 per 10 sec per client). MongoDB with Mongoose, compound indexes on the meeting model. Winston for structured logging with file rotation. Graceful shutdown handler for SIGTERM/SIGINT

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

On the backend, rooms are tracked in a `Map<path, Map<socketId, {username, avatar}>>` with a reverse `Map<socketId, path>` so looking up which room a socket belongs to is O(1) instead of iterating everything. Chat history is kept in memory capped at 200 messages per room, and rooms get cleaned up automatically when the last person disconnects.

The ICE config (STUN/TURN servers) is served from a `/api/v1/ice-config` endpoint rather than hardcoded in the frontend, so if you're using TURN the credentials don't end up in client code.

On the frontend, the WebRTC peer connections live in a `useRef` - I had them as a module-level variable before and it was causing weird shared state issues across re-renders. ICE config is fetched from the server right before creating any peer connections. If a connection fails, it automatically attempts an ICE restart with `createOffer({ iceRestart: true })`.

Auth is JWT based - the axios instance has an interceptor that attaches the token to every request via `x-auth-token` header, and another interceptor that clears the token on 401 responses. The whole app is wrapped in an Error Boundary that catches render crashes and shows a recovery page instead of just going blank.

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
      socketManager.js         # signaling, chat, reactions, hand raise, rate limiting
    models/
      user.model.js
      meeting.model.js
    routes/users.routes.js
    utils/
      jwt.js
      logger.js
  tests/
    auth.test.js
    logger.test.js

frontend/src/
  pages/
    VideoMeet.jsx              # main meeting room component
    landing.jsx
    authentication.jsx
    home.jsx
    history.jsx
  components/
    ErrorBoundary.jsx
    AvatarPicker.jsx
    UshaMeetXLogo.jsx
  contexts/AuthContext.jsx
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
| GET | `/health` | no | server status |

Socket.io events: `join-call`, `user-joined`, `user-left`, `signal`, `chat-message`, `hand-raise`, `reaction`, `typing`

## Deployment

Frontend goes on Vercel or Netlify - just run `npm run build` and point it at the `build/` folder.

Backend goes on Render or similar - set the root directory to `backend`, start command is `node src/app.js`. Make sure to set `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGINS` in the env vars.

Then update `frontend/src/environment.js` with whatever URL your backend ends up at.

---

[@AradhyaStuti](https://github.com/AradhyaStuti)
