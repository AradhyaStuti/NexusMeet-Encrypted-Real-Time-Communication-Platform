<div align="center">

![UshaMeetX Banner](./screenshots/banner.svg)

<br/>

[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white&labelColor=0d1117)](https://reactjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=nodedotjs&logoColor=white&labelColor=0d1117)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white&labelColor=0d1117)](https://mongodb.com)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?style=for-the-badge&logo=socketdotio&logoColor=white&labelColor=0d1117)](https://socket.io)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Video-333333?style=for-the-badge&logo=webrtc&logoColor=white&labelColor=0d1117)](https://webrtc.org)
[![MUI](https://img.shields.io/badge/MUI-v5-007FFF?style=for-the-badge&logo=mui&logoColor=white&labelColor=0d1117)](https://mui.com)

<br/>

**UshaMeetX** is a full-stack, real-time HD video conferencing web app built with WebRTC and Socket.io.
No downloads. No plugins. Just open a link and meet.

[Live Demo](#deployment) · [Features](#-features) · [Quick Start](#-quick-start)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| **HD Video Calls** | Peer-to-peer WebRTC streaming with adaptive quality |
| **Instant Meetings** | Create a meeting in one click — get a shareable link immediately |
| **Guest Join** | Anyone can join via link — no account or download required |
| **Screen Sharing** | Share your full screen or a specific window/tab |
| **Live Chat** | Real-time in-meeting text chat with message history |
| **Spotlight Mode** | Tap any participant's video to pin it full-screen |
| **Volume Control** | Adjust each participant's audio independently |
| **Avatar Picker** | Choose from 16 emoji avatars — persists across sessions |
| **Meeting History** | View, rejoin, or delete past meetings with one click |
| **Copy Meeting Link** | Share your invite link with a single tap |
| **Auth System** | Secure register / login with token-based authentication |

---

## 🏗️ Tech Stack

### Frontend
```
React 18          — SPA with React Router v6
Material UI v5    — Component library (dark theme)
Socket.io Client  — Real-time signaling
WebRTC            — Peer-to-peer audio/video
CSS Modules       — Scoped styles for meeting room
```

### Backend
```
Node.js + Express — REST API server
Socket.io         — WebRTC signaling server + chat
MongoDB + Mongoose — User accounts + meeting history
bcrypt            — Password hashing
crypto            — Token generation
```

### Architecture
```
Browser A ──WebRTC P2P──► Browser B
    │                          │
    └──── Socket.io ────────────┘
               │
           Node.js Server
               │
           MongoDB Atlas
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- MongoDB Atlas account (free tier works)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/UshaMeetX.git
cd UshaMeetX
```

### 2. Start the backend
```bash
cd backend
npm install
npm start
# Server runs on http://localhost:8000
```

### 3. Start the frontend
```bash
cd frontend
npm install
npm start
# App opens at http://localhost:3000
```

> **Note:** Make sure `frontend/src/environment.js` has `IS_PROD` logic pointing to `http://localhost:8000` for local dev (handled automatically — `process.env.NODE_ENV` is used).

---

## 🌐 Deployment

### Frontend → Vercel
```bash
cd frontend
npm run build
# Deploy the build/ folder to Vercel or Netlify
# Environment: NODE_ENV=production is set automatically
```

### Backend → Render
1. Push the `backend/` folder to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Set **Start Command**: `node src/app.js`
4. Set environment variables:
   ```
   PORT=8000
   ```
5. Your backend URL will be `https://your-service.onrender.com`

### Update the backend URL
Edit `frontend/src/environment.js`:
```js
const server = process.env.NODE_ENV === "production"
    ? "https://YOUR-RENDER-URL.onrender.com"   // ← update this
    : "http://localhost:8000";
```

---

## 📁 Project Structure

```
UshaMeetX/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── UshaMeetXLogo.jsx   ← SVG brand mark
│       │   └── AvatarPicker.jsx    ← Emoji avatar system
│       ├── contexts/
│       │   └── AuthContext.jsx     ← Auth + API calls
│       ├── pages/
│       │   ├── landing.jsx         ← Marketing page
│       │   ├── authentication.jsx  ← Sign In / Sign Up
│       │   ├── home.jsx            ← Dashboard
│       │   ├── history.jsx         ← Meeting history
│       │   └── VideoMeet.jsx       ← Meeting room (WebRTC)
│       ├── styles/
│       │   └── videoComponent.module.css
│       ├── utils/
│       │   └── withAuth.jsx        ← Auth guard HOC
│       └── environment.js          ← API URL config
│
└── backend/
    └── src/
        ├── controllers/
│       │   ├── user.controller.js  ← Auth + history endpoints
│       │   └── socketManager.js    ← WebRTC signaling + chat
        ├── models/
│       │   ├── user.model.js
│       │   └── meeting.model.js
        ├── routes/
│       │   └── users.routes.js
        └── app.js                  ← Express server entry
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/users/register` | Create new account |
| `POST` | `/api/v1/users/login` | Login, receive token |
| `POST` | `/api/v1/users/add_to_activity` | Save meeting to history |
| `GET`  | `/api/v1/users/get_all_activity` | Fetch meeting history |
| `DELETE` | `/api/v1/users/delete_from_activity` | Delete a history entry |

### Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `join-call` | Client → Server | Join a meeting room |
| `user-joined` | Server → Client | New participant joined |
| `user-left` | Server → Client | Participant disconnected |
| `signal` | Both | WebRTC SDP/ICE exchange |
| `chat-message` | Both | Send/receive chat messages |

---

## 🎨 Design System

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#040d18` | Page background |
| `--bg-mid` | `#071a2e` | Card backgrounds |
| `--primary` | `#0ea5e9` | Buttons, accents |
| `--primary-h` | `#0284c7` | Hover states |
| `--highlight` | `#38bdf8` | Links, icons |
| `--text-1` | `#f0f6fc` | Primary text |
| `--text-2` | `#8b9ab0` | Secondary text |

---

## 👥 How Guest Join Works

1. You start a meeting → browser navigates to `https://your-app.com/abc123xyz`
2. Copy that URL and send it (WhatsApp, email, SMS)
3. Recipient opens the link — lands directly on the meeting lobby
4. They enter their name → click **Join Meeting**
5. WebRTC connection established — they're in ✅

No account required for guests. The meeting URL is the only credential needed.

---

## 🛡️ Security

- Passwords hashed with **bcrypt** (10 salt rounds)
- Auth tokens generated with **crypto.randomBytes(20)**
- Tokens stored in MongoDB, validated on every protected request
- Meeting rooms identified by URL — share only with people you trust
- History endpoints require a valid token — guests can't access user data

---

*UshaMeetX — Connect with anyone, anywhere, anytime*

</div>
