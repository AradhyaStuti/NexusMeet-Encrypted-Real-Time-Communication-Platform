/**
 * Socket.IO connection orchestrator.
 *
 * Responsibilities:
 *   - Create the Socket.IO server
 *   - Handle join-call / signal / disconnect at the room level
 *   - Delegate chat events   → socketHandlers/chat.js
 *   - Delegate SFU signaling → socketHandlers/sfu.js
 *
 * All mutable state lives in socketHandlers/state.js so each
 * module can import exactly what it needs.
 */
import { Server } from "socket.io";
import logger from "../utils/logger.js";
import { isSfuAvailable } from "../sfu/worker.js";
import { SfuRoom } from "../sfu/room.js";
import {
    rooms, messages, roomLastActivity,
    socketRoom, sfuRooms, clearRateLimitState,
} from "./socketHandlers/state.js";
import { registerChatHandlers } from "./socketHandlers/chat.js";
import { registerSfuHandlers } from "./socketHandlers/sfu.js";

// Re-export so existing tests keep working without path changes
export { isRateLimited } from "./socketHandlers/state.js";

export const connectToSocket = (server, allowedOrigins = ["*"]) => {
    const io = new Server(server, {
        cors: {
            origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
            methods: ["GET", "POST"],
        },
        pingInterval: 25_000,
        pingTimeout: 20_000,
    });

    const sfuEnabled = isSfuAvailable();

    io.on("connection", (socket) => {
        logger.info("Socket connected", { socketId: socket.id, sfu: sfuEnabled });

        // ── Join room ──────────────────────────────────────────────────────
        socket.on("join-call", async (rawPath, username = "Guest", avatar = "😊") => {
            username = String(username).slice(0, 40) || "Guest";
            avatar   = String(avatar).slice(0, 4)   || "😊";

            // Normalize: extract pathname only (strip protocol/host/port),
            // lowercase, and remove trailing slash so all clients match the same room.
            let path = String(rawPath);
            try { path = new URL(path).pathname; } catch { /* already a pathname */ }
            path = path.toLowerCase().replace(/\/+$/, "") || "/";

            leaveCurrentRoom(socket, io);

            socket.join(path);
            socketRoom.set(socket.id, path);

            if (!rooms.has(path)) rooms.set(path, new Map());
            rooms.get(path).set(socket.id, { username, avatar });
            roomLastActivity.set(path, Date.now());

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
        });

        // ── P2P signaling ──────────────────────────────────────────────────
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        // ── Delegate to focused handler modules ────────────────────────────
        registerChatHandlers(socket, io);
        registerSfuHandlers(socket, io);

        // ── Disconnect ─────────────────────────────────────────────────────
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
        io.to(path).emit("user-left", socket.id);
        if (room.size === 0) {
            rooms.delete(path);
            messages.delete(path);
            roomLastActivity.delete(path);
        }
    }

    socket.leave(path);
}
