/**
 * Socket.IO connection orchestrator.
 *
 * Responsibilities:
 *   - Create the Socket.IO server
 *   - Handle join-call / signal / disconnect at the room level
 *   - Waiting room: first joiner is host, others wait for admission
 *   - Delegate chat events   → socketHandlers/chat.js
 *   - Delegate SFU signaling → socketHandlers/sfu.js
 *
 * All mutable state lives in socketHandlers/state.js so each
 * module can import exactly what it needs.
 */
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import logger from "../utils/logger.js";
import { isSfuAvailable } from "../sfu/worker.js";
import { SfuRoom } from "../sfu/room.js";
import { getRedis } from "../utils/redis.js";
import {
    rooms, messages, roomLastActivity,
    socketRoom, sfuRooms, clearRateLimitState,
    roomHosts, waitingRoom,
} from "./socketHandlers/state.js";
import { registerChatHandlers } from "./socketHandlers/chat.js";
import { registerSfuHandlers } from "./socketHandlers/sfu.js";
import * as store from "../store/roomStore.js";


// Re-export so existing tests keep working without path changes
export { isRateLimited } from "./socketHandlers/state.js";

/** Normalize a raw path from the client */
function normalizePath(rawPath) {
    let path = String(rawPath);
    try { path = new URL(path).pathname; } catch { /* already a pathname */ }
    return path.toLowerCase().replace(/\/+$/, "") || "/";
}

/** Add a user fully into a room (used for host auto-join and admitted users) */
async function addUserToRoom(socket, io, path, username, avatar) {
    const sfuEnabled = isSfuAvailable();

    socket.join(path);
    socketRoom.set(socket.id, path);

    if (!rooms.has(path)) rooms.set(path, new Map());
    rooms.get(path).set(socket.id, { username, avatar });
    roomLastActivity.set(path, Date.now());

    // Sync to Redis
    store.setSocketRoom(socket.id, path).catch(err => logger.warn("Redis store write failed", { error: err.message }));
    store.addParticipant(path, socket.id, { username, avatar }).catch(err => logger.warn("Redis store write failed", { error: err.message }));
    store.setActivity(path).catch(err => logger.warn("Redis store write failed", { error: err.message }));

    const participants = [...rooms.get(path)].map(([sid, info]) => ({ socketId: sid, ...info }));

    if (sfuEnabled) {
        try {
            if (!sfuRooms.has(path)) {
                const sfuRoom = new SfuRoom(path);
                await sfuRoom.init();
                sfuRooms.set(path, sfuRoom);
            }
            sfuRooms.get(path).addPeer(socket.id);
        } catch (err) {
            logger.error("SFU room init failed", { error: err.message });
        }
    }

    io.to(path).emit("user-joined", socket.id, participants);

    // Replay message history to the new joiner
    if (messages.has(path)) {
        for (const msg of messages.get(path)) {
            socket.emit("chat-message", msg.data, msg.sender, msg.socketId, msg.timestamp);
        }
    }

    logger.info("User joined room", {
        socketId: socket.id, username,
        room: path.slice(-20), participants: participants.length, sfu: sfuEnabled,
    });
}

/** Send the current waiting list to the host */
function sendWaitingListToHost(io, path) {
    const hostId = roomHosts.get(path);
    if (!hostId) return;
    const waiting = waitingRoom.get(path);
    const list = waiting ? [...waiting].map(([sid, info]) => ({ socketId: sid, ...info })) : [];
    io.to(hostId).emit("waiting-room-update", list);
}

export const connectToSocket = async (server) => {
    const io = new Server(server, {
        cors: {
            origin: true,
            methods: ["GET", "POST"],
            credentials: true,
        },
        pingInterval: 25_000,
        pingTimeout: 20_000,
    });

    // Attach Redis adapter BEFORE accepting connections so the first
    // socket always gets cross-instance broadcasting.
    const redis = getRedis();
    if (redis) {
        try {
            const pubClient = redis.duplicate();
            const subClient = redis.duplicate();
            await Promise.all([pubClient.connect(), subClient.connect()]);
            io.adapter(createAdapter(pubClient, subClient));
            logger.info("Socket.IO Redis adapter attached");
        } catch (err) {
            logger.warn("Socket.IO Redis adapter failed, using in-memory", { error: err.message });
        }
    }

    io.on("connection", (socket) => {
        // Attach a request-ID to every socket for tracing (mirrors HTTP x-request-id)
        socket.requestId = socket.handshake.headers["x-request-id"] || socket.id;
        logger.info("Socket connected", { socketId: socket.id, requestId: socket.requestId, sfu: isSfuAvailable() });

        // ── Join room (with waiting room) ────────────────────────────────
        socket.on("join-call", async (rawPath, username = "Guest", avatar = "😊") => {
            username = String(username).slice(0, 40) || "Guest";
            avatar   = String(avatar).slice(0, 4)   || "😊";
            const path = normalizePath(rawPath);

            leaveCurrentRoom(socket, io);

            // First person becomes host — joins immediately
            if (!roomHosts.has(path) || !rooms.has(path) || rooms.get(path).size === 0) {
                roomHosts.set(path, socket.id);
                store.setHost(path, socket.id).catch(err => logger.warn("Redis store write failed", { error: err.message }));
                await addUserToRoom(socket, io, path, username, avatar);
                socket.emit("host-status", true);
                logger.info("User is host", { socketId: socket.id, room: path.slice(-20) });
                return;
            }

            // Otherwise — put in waiting room
            if (!waitingRoom.has(path)) waitingRoom.set(path, new Map());
            waitingRoom.get(path).set(socket.id, { username, avatar });
            // Track the path for this socket so we can clean up on disconnect
            socketRoom.set(socket.id, path);
            store.addToWaitingRoom(path, socket.id, { username, avatar }).catch(err => logger.warn("Redis store write failed", { error: err.message }));
            store.setSocketRoom(socket.id, path).catch(err => logger.warn("Redis store write failed", { error: err.message }));

            socket.emit("waiting-room-status", { status: "waiting" });
            sendWaitingListToHost(io, path);
            logger.info("User in waiting room", { socketId: socket.id, username, room: path.slice(-20) });
        });

        // ── Host admits a user ───────────────────────────────────────────
        socket.on("admit-user", async (targetSocketId) => {
            const path = socketRoom.get(socket.id);
            if (!path || roomHosts.get(path) !== socket.id) return;

            const waiting = waitingRoom.get(path);
            if (!waiting || !waiting.has(targetSocketId)) return;

            const { username, avatar } = waiting.get(targetSocketId);
            waiting.delete(targetSocketId);
            if (waiting.size === 0) waitingRoom.delete(path);

            // Remove the temporary socketRoom entry (addUserToRoom will re-set it)
            socketRoom.delete(targetSocketId);
            store.removeFromWaitingRoom(path, targetSocketId).catch(err => logger.warn("Redis store write failed", { error: err.message }));
            store.deleteSocketRoom(targetSocketId).catch(err => logger.warn("Redis store write failed", { error: err.message }));

            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (!targetSocket) return;

            targetSocket.emit("waiting-room-status", { status: "admitted" });
            await addUserToRoom(targetSocket, io, path, username, avatar);
            sendWaitingListToHost(io, path);
        });

        // ── Host rejects a user ──────────────────────────────────────────
        socket.on("reject-user", (targetSocketId) => {
            const path = socketRoom.get(socket.id);
            if (!path || roomHosts.get(path) !== socket.id) return;

            const waiting = waitingRoom.get(path);
            if (!waiting || !waiting.has(targetSocketId)) return;

            waiting.delete(targetSocketId);
            if (waiting.size === 0) waitingRoom.delete(path);

            socketRoom.delete(targetSocketId);
            store.removeFromWaitingRoom(path, targetSocketId).catch(err => logger.warn("Redis store write failed", { error: err.message }));
            store.deleteSocketRoom(targetSocketId).catch(err => logger.warn("Redis store write failed", { error: err.message }));

            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.emit("waiting-room-status", { status: "rejected" });
            }
            sendWaitingListToHost(io, path);
        });

        // ── Host admits all waiting users ────────────────────────────────
        socket.on("admit-all", async () => {
            const path = socketRoom.get(socket.id);
            if (!path || roomHosts.get(path) !== socket.id) return;

            const waiting = waitingRoom.get(path);
            if (!waiting) return;

            for (const [sid, { username, avatar }] of [...waiting]) {
                waiting.delete(sid);
                socketRoom.delete(sid);
                store.deleteSocketRoom(sid).catch(err => logger.warn("Redis store write failed", { error: err.message }));
                const targetSocket = io.sockets.sockets.get(sid);
                if (targetSocket) {
                    targetSocket.emit("waiting-room-status", { status: "admitted" });
                    await addUserToRoom(targetSocket, io, path, username, avatar);
                }
            }
            waitingRoom.delete(path);
            store.clearWaitingRoom(path).catch(err => logger.warn("Redis store write failed", { error: err.message }));
            sendWaitingListToHost(io, path);
        });

        // ── P2P signaling ────────────────────────────────────────────────
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        // ── Delegate to focused handler modules ──────────────────────────
        registerChatHandlers(socket, io);
        registerSfuHandlers(socket, io);

        // ── Disconnect ───────────────────────────────────────────────────
        socket.on("disconnect", () => {
            logger.info("Socket disconnected", { socketId: socket.id });
            leaveCurrentRoom(socket, io);
            clearRateLimitState(socket.id);
        });
    });

    return io;
};

// ── Room leave / cleanup ───────────────────────────────────────────────────

function leaveCurrentRoom(socket, io) {
    const path = socketRoom.get(socket.id);
    if (!path) return;

    socketRoom.delete(socket.id);
    store.deleteSocketRoom(socket.id).catch(err => logger.warn("Redis store write failed", { error: err.message }));

    // Remove from waiting room if they were waiting
    const waiting = waitingRoom.get(path);
    if (waiting && waiting.has(socket.id)) {
        waiting.delete(socket.id);
        if (waiting.size === 0) waitingRoom.delete(path);
        store.removeFromWaitingRoom(path, socket.id).catch(err => logger.warn("Redis store write failed", { error: err.message }));
        sendWaitingListToHost(io, path);
        socket.leave(path);
        return; // wasn't in the actual room, just waiting
    }

    // SFU cleanup
    const sfuRoom = sfuRooms.get(path);
    if (sfuRoom) {
        const closedProducerIds = sfuRoom.removePeer(socket.id);
        for (const producerId of closedProducerIds) {
            io.to(path).emit("producer-closed", { producerId });
        }
        if (sfuRoom.isEmpty()) {
            sfuRoom.close();
            sfuRooms.delete(path);
        }
    }

    // P2P cleanup
    const room = rooms.get(path);
    if (room) {
        room.delete(socket.id);
        store.removeParticipant(path, socket.id).catch(err => logger.warn("Redis store write failed", { error: err.message }));
        io.to(path).emit("user-left", socket.id);

        // Host left — promote next participant
        if (roomHosts.get(path) === socket.id) {
            if (room.size > 0) {
                const newHostId = room.keys().next().value;
                roomHosts.set(path, newHostId);
                store.setHost(path, newHostId).catch(err => logger.warn("Redis store write failed", { error: err.message }));
                io.to(newHostId).emit("host-status", true);
                sendWaitingListToHost(io, path);
                logger.info("Host promoted", { newHost: newHostId, room: path.slice(-20) });
            } else {
                roomHosts.delete(path);
                store.deleteHost(path).catch(err => logger.warn("Redis store write failed", { error: err.message }));
                // Auto-admit any waiting users since room is empty
                const pendingWaiting = waitingRoom.get(path);
                if (pendingWaiting && pendingWaiting.size > 0) {
                    // Reject all since nobody is left to host
                    for (const [sid] of pendingWaiting) {
                        const ws = io.sockets.sockets.get(sid);
                        if (ws) ws.emit("waiting-room-status", { status: "rejected" });
                        socketRoom.delete(sid);
                        store.deleteSocketRoom(sid).catch(err => logger.warn("Redis store write failed", { error: err.message }));
                    }
                    waitingRoom.delete(path);
                    store.clearWaitingRoom(path).catch(err => logger.warn("Redis store write failed", { error: err.message }));
                }
            }
        }

        if (room.size === 0) {
            rooms.delete(path);
            messages.delete(path);
            roomLastActivity.delete(path);
            roomHosts.delete(path);
            waitingRoom.delete(path);
            store.deleteRoom(path).catch(err => logger.warn("Redis store write failed", { error: err.message }));
        }
    }

    socket.leave(path);
}
