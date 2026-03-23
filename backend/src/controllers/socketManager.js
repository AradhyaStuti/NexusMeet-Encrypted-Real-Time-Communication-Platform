import { Server } from "socket.io";
import logger from "../utils/logger.js";

/**
 * @typedef {{ username: string, avatar: string }} ParticipantInfo
 *
 * Room state tracked on the server:
 *   rooms      = Map<roomPath, Map<socketId, ParticipantInfo>>
 *   messages   = Map<roomPath, Array<{ sender, data, socketId, timestamp }>>
 *   socketRoom = Map<socketId, roomPath>  — reverse index for O(1) lookup
 */
const rooms = new Map();
const messages = new Map();
const socketRoom = new Map();

/** @type {Map<string, number[]>} Per-socket message timestamps for rate limiting */
const socketMessageTimestamps = new Map();

const MESSAGE_RATE_LIMIT = 10;    // max messages
const MESSAGE_RATE_WINDOW = 10_000; // per 10 seconds

/**
 * Check if a socket is rate-limited for chat messages
 * @param {string} socketId
 * @returns {boolean}
 */
function isRateLimited(socketId) {
    const now = Date.now();
    const timestamps = socketMessageTimestamps.get(socketId) || [];

    // Remove timestamps outside the window
    const recent = timestamps.filter(t => now - t < MESSAGE_RATE_WINDOW);
    socketMessageTimestamps.set(socketId, recent);

    if (recent.length >= MESSAGE_RATE_LIMIT) {
        return true;
    }

    recent.push(now);
    return false;
}

/**
 * Initialize Socket.io with the HTTP server
 * @param {import('http').Server} server
 * @param {string[]} allowedOrigins
 * @returns {Server}
 */
export const connectToSocket = (server, allowedOrigins = ["*"]) => {
    const io = new Server(server, {
        cors: {
            origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
            methods: ["GET", "POST"],
        },
        pingInterval: 25_000,
        pingTimeout: 20_000,
    });

    io.on("connection", (socket) => {
        logger.info("Socket connected", { socketId: socket.id });

        // ── Join a meeting room ──
        socket.on("join-call", (path, username = "Guest", avatar = "😊") => {
            username = String(username).slice(0, 40) || "Guest";
            avatar = String(avatar).slice(0, 4) || "😊";

            leaveCurrentRoom(socket, io);

            socket.join(path);
            socketRoom.set(socket.id, path);

            if (!rooms.has(path)) rooms.set(path, new Map());
            rooms.get(path).set(socket.id, { username, avatar });

            /** @type {Array<{ socketId: string, username: string, avatar: string }>} */
            const participants = [];
            for (const [sid, info] of rooms.get(path)) {
                participants.push({ socketId: sid, ...info });
            }

            io.to(path).emit("user-joined", socket.id, participants);

            // Send chat history to the new joiner
            if (messages.has(path)) {
                for (const msg of messages.get(path)) {
                    socket.emit("chat-message", msg.data, msg.sender, msg.socketId, msg.timestamp);
                }
            }

            logger.info("User joined room", {
                socketId: socket.id,
                username,
                room: path.slice(-20),
                participants: participants.length,
            });
        });

        // ── WebRTC signaling ──
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        // ── Chat (rate-limited) ──
        socket.on("chat-message", (data, sender) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;

            // Rate limit check
            if (isRateLimited(socket.id)) {
                socket.emit("error-message", "You're sending messages too fast. Please slow down.");
                logger.warn("Chat rate limited", { socketId: socket.id });
                return;
            }

            data = String(data).slice(0, 2000);
            sender = String(sender).slice(0, 40);
            const timestamp = Date.now();

            if (!messages.has(path)) messages.set(path, []);
            const roomMsgs = messages.get(path);

            if (roomMsgs.length >= 200) roomMsgs.shift();
            roomMsgs.push({ sender, data, socketId: socket.id, timestamp });

            io.to(path).emit("chat-message", data, sender, socket.id, timestamp);
        });

        // ── Hand raise ──
        socket.on("hand-raise", (raised) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;
            socket.to(path).emit("hand-raise", socket.id, !!raised);
        });

        // ── Reactions ──
        socket.on("reaction", (emoji) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;
            emoji = String(emoji).slice(0, 4);
            io.to(path).emit("reaction", socket.id, emoji);
        });

        // ── Typing indicator ──
        socket.on("typing", (isTyping) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;
            socket.to(path).emit("typing", socket.id, !!isTyping);
        });

        // ── Disconnect ──
        socket.on("disconnect", () => {
            logger.info("Socket disconnected", { socketId: socket.id });
            leaveCurrentRoom(socket, io);
            socketMessageTimestamps.delete(socket.id);
        });
    });

    return io;
};

/**
 * Remove socket from its current room and notify others
 * @param {import('socket.io').Socket} socket
 * @param {Server} io
 */
function leaveCurrentRoom(socket, io) {
    const path = socketRoom.get(socket.id);
    if (!path) return;

    socketRoom.delete(socket.id);

    const room = rooms.get(path);
    if (room) {
        room.delete(socket.id);
        io.to(path).emit("user-left", socket.id);

        if (room.size === 0) {
            rooms.delete(path);
            messages.delete(path);
            logger.debug("Empty room cleaned up", { room: path.slice(-20) });
        }
    }

    socket.leave(path);
}
