# Socket.IO Event Reference

All real-time communication uses Socket.IO over WebSocket. The server is accessible at the same host/port as the HTTP API.

## Connection

```js
import { io } from 'socket.io-client'
const socket = io('http://localhost:8000', { transports: ['websocket'] })
```

---

## Client → Server events

### `join-call`
Join a meeting room. Must be called before sending any other events.

| Parameter | Type | Max length | Default |
|-----------|------|-----------|---------|
| `path` | `string` | — | required |
| `username` | `string` | 40 chars | `"Guest"` |
| `avatar` | `string` | 4 chars (emoji) | `"😊"` |

```js
socket.emit('join-call', '/meeting/abc123', 'Alice', '😊')
```

---

### `chat-message`
Send a chat message to everyone in the room.

| Parameter | Type | Max length |
|-----------|------|-----------|
| `data` | `string` | 2000 chars |
| `sender` | `string` | 40 chars |

Rate limit: 10 messages per 10 seconds. Exceeding the limit emits an [`error-message`](#error-message) back to the sender.

```js
socket.emit('chat-message', 'Hello everyone!', 'Alice')
```

---

### `hand-raise`
Toggle raised-hand state.

| Parameter | Type |
|-----------|------|
| `raised` | `boolean` |

```js
socket.emit('hand-raise', true)
```

---

### `reaction`
Send an emoji reaction (displayed briefly on screen).

| Parameter | Type | Max length |
|-----------|------|-----------|
| `emoji` | `string` | 4 chars |

```js
socket.emit('reaction', '👍')
```

---

### `typing`
Broadcast typing indicator state.

| Parameter | Type |
|-----------|------|
| `isTyping` | `boolean` |

```js
socket.emit('typing', true)
```

---

### `signal` (P2P mode)
Forward a WebRTC signalling message to a specific peer. Used when the SFU is unavailable and P2P mode is active.

| Parameter | Type | Description |
|-----------|------|-------------|
| `toId` | `string` | Target socket ID |
| `message` | `object` | SDP offer/answer or ICE candidate |

```js
socket.emit('signal', targetSocketId, { type: 'offer', sdp: '...' })
```

---

### SFU signalling events (SFU mode only)

These events are only used when `/api/v1/sfu-status` returns `{ enabled: true }`.

#### `get-rtp-capabilities`
```js
socket.emit('get-rtp-capabilities', ({ rtpCapabilities, error }) => { ... })
```

#### `create-send-transport`
```js
socket.emit('create-send-transport', ({ id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, error }) => { ... })
```

#### `create-recv-transport`
```js
socket.emit('create-recv-transport', ({ id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, error }) => { ... })
```

#### `connect-transport`
```js
socket.emit('connect-transport', { transportId, dtlsParameters }, ({ error }) => { ... })
```

#### `produce`
```js
socket.emit('produce', { kind, rtpParameters, appData }, ({ producerId, error }) => { ... })
```

#### `consume`
```js
socket.emit('consume', { producerId, rtpCapabilities }, ({ id, producerId, kind, rtpParameters, error }) => { ... })
```

#### `consumer-resume`
```js
socket.emit('consumer-resume', { consumerId }, () => { ... })
```

#### `get-producers`
```js
socket.emit('get-producers', (producers) => {
    // producers: Array<{ producerId, socketId, kind }>
})
```

---

## Server → Client events

### `user-joined`
Emitted to **all peers in the room** when someone joins.

| Parameter | Type | Description |
|-----------|------|-------------|
| `socketId` | `string` | Socket ID of the joining peer |
| `participants` | `Array<{ socketId, username, avatar }>` | Full current participant list |

```js
socket.on('user-joined', (socketId, participants) => {
    console.log(`${socketId} joined. Room now has ${participants.length} peers.`)
})
```

---

### `user-left`
Emitted to **remaining peers** when someone disconnects.

| Parameter | Type |
|-----------|------|
| `socketId` | `string` |

```js
socket.on('user-left', (socketId) => { removeParticipant(socketId) })
```

---

### `chat-message`
Broadcast to **all peers in the room** (including sender).

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `string` | Message content |
| `sender` | `string` | Display name |
| `socketId` | `string` | Sender's socket ID |
| `timestamp` | `number` | Unix ms |

```js
socket.on('chat-message', (data, sender, socketId, timestamp) => {
    appendMessage({ data, sender, socketId, timestamp })
})
```

> **Note:** On join, the server replays up to 200 historical messages from the room to the newly connected client.

---

### `hand-raise`
Emitted to **all other peers** when someone toggles their hand.

| Parameter | Type |
|-----------|------|
| `socketId` | `string` |
| `raised` | `boolean` |

```js
socket.on('hand-raise', (socketId, raised) => { updateHandState(socketId, raised) })
```

---

### `reaction`
Emitted to **all peers in the room** (including sender).

| Parameter | Type |
|-----------|------|
| `socketId` | `string` |
| `emoji` | `string` |

```js
socket.on('reaction', (socketId, emoji) => { showReaction(socketId, emoji) })
```

---

### `typing`
Emitted to **all other peers** in the room.

| Parameter | Type |
|-----------|------|
| `socketId` | `string` |
| `isTyping` | `boolean` |

```js
socket.on('typing', (socketId, isTyping) => { setTypingIndicator(socketId, isTyping) })
```

---

### `signal` (P2P mode)
Relayed WebRTC signalling from another peer.

| Parameter | Type |
|-----------|------|
| `fromId` | `string` |
| `message` | `object` |

```js
socket.on('signal', (fromId, message) => { handleSignal(fromId, message) })
```

---

### `new-producer` (SFU mode)
Emitted to **all other peers** when someone starts publishing a new track.

| Parameter | Type |
|-----------|------|
| `producerId` | `string` |
| `socketId` | `string` |
| `kind` | `"audio" \| "video"` |

```js
socket.on('new-producer', ({ producerId, socketId, kind }) => { consumeProducer(producerId) })
```

---

### `producer-closed` (SFU mode)
Emitted to **all peers** when a track is closed (e.g., peer disconnected).

| Parameter | Type |
|-----------|------|
| `producerId` | `string` |

```js
socket.on('producer-closed', ({ producerId }) => { removeRemoteTrack(producerId) })
```

---

### `error-message`
Server-side error notice sent only to the **requesting client**.

| Parameter | Type | Example |
|-----------|------|---------|
| `message` | `string` | `"You're sending messages too fast."` |

```js
socket.on('error-message', (message) => { showToast(message) })
```

---

## Event flow examples

### P2P call (2 peers)

```
Alice                        Server                        Bob
  |---- join-call ----------->|                              |
  |<--- user-joined ----------|                              |
  |                           |<---------- join-call --------|
  |<--- user-joined ----------|---------> user-joined ------>|
  |---- signal (offer) ------>|---------> signal ----------->|
  |<--- signal (answer) ------|<---------- signal -----------|
  |---- signal (ICE) -------->|---------> signal ----------->|
  |<========= media flows directly peer-to-peer ============>|
```

### SFU call

```
Alice                        Server (mediasoup)
  |---- join-call ----------->|
  |---- get-rtp-capabilities ->|
  |<--- callback rtpCaps ------|
  |---- create-send-transport->|
  |<--- callback transport ----|
  |---- connect-transport ---->|
  |---- produce -------------->|
  |<--- callback producerId ---|
  |                           |----> new-producer ----> Bob
```
