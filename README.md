
## NexusMeet — Encrypted Real-Time Communication Platform

NexusMeet is a full-stack video communication platform that enables real-time meetings with secure chat, waiting rooms, and scalable video calling. It is built to explore how modern conferencing systems handle media routing, scaling, and secure communication.

---

## What it does

- Real-time video calls using WebRTC
- Scalable video streaming using SFU (mediasoup) with P2P fallback
- Waiting room with host control and participant management
- End-to-end encrypted chat using browser-based AES encryption
- Screen sharing, reactions, and meeting controls
- Automatic reconnection and session recovery

---

## Key Engineering Focus

- Dual architecture (P2P + SFU) for reliability and scalability
- SFU-based media routing for efficient multi-user video calls
- Redis-backed state syncing for multi-instance support
- Automatic fallback to P2P when SFU is unavailable
- Room-based session management using Socket.IO
- Secure message encryption handled entirely on client side

---

## Architecture Overview

```

Client (React)
↓
Socket.IO + WebRTC Signaling
↓
Node.js Backend (Express)
↓
Mediasoup SFU (optional)
↓
Redis (state sync)
↓
MongoDB (users & history)

```

---

## Tech Stack

**Frontend**
- React 18
- WebRTC
- Socket.IO Client
- Web Crypto API (AES-GCM)

**Backend**
- Node.js + Express
- Socket.IO
- Mediasoup (SFU)
- MongoDB
- Redis (optional scaling layer)

**DevOps**
- Docker
- CI with automated testing

---

## Security Highlights

- End-to-end encrypted chat (client-side encryption)
- JWT authentication with secure session handling
- No server-side access to encryption keys
- Rate limiting and request validation
- Secure WebRTC transport (STUN/TURN support)

---

## Scaling Design

- P2P mode for small meetings
- SFU mode for multi-user scalability
- Redis used for cross-instance synchronization
- Horizontal scaling supported via Socket.IO adapter
- Graceful degradation when media infrastructure is unavailable

---

## Testing

- 40+ unit and integration tests
- API + Socket.IO event testing
- WebRTC signaling validation
- End-to-end browser tests using Playwright

---

## Limitations (Honest Design Tradeoffs)

- SFU requires native mediasoup dependencies
- TURN server not included (must be self-hosted or external)
- E2E chat requires full link sharing (hash-based key)
- Room state is not permanently stored by default
- Designed for learning + scalability exploration, not production at Zoom scale

---

## Summary

NexusMeet demonstrates how modern real-time communication systems work under the hood, combining WebRTC, SFU architecture, and secure messaging into a scalable full-stack system.
