import { Server } from "socket.io";
import logger from "../utils/logger.js";
import { isSfuAvailable } from "../sfu/worker.js";
import { SfuRoom } from "../sfu/room.js";

// ── P2P state (fallback when SFU not available) ──
const rooms = new Map();
const messages = new Map();
const socketRoom = new Map();
const socketMessageTimestamps = new Map();

// ── SFU rooms ──
/** @type {Map<string, SfuRoom>} */
const sfuRooms = new Map();

const MESSAGE_RATE_LIMIT = 10;
const MESSAGE_RATE_WINDOW = 10_000;

function isRateLimited(socketId) {
    const now = Date.now();
    const timestamps = socketMessageTimestamps.get(socketId) || [];
    const recent = timestamps.filter(t => now - t < MESSAGE_RATE_WINDOW);
    socketMessageTimestamps.set(socketId, recent);
    if (recent.length >= MESSAGE_RATE_LIMIT) return true;
    recent.push(now);
    return false;
}

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

        // ── Join room ──
        socket.on("join-call", async (path, username = "Guest", avatar = "😊") => {
            username = String(username).slice(0, 40) || "Guest";
            avatar = String(avatar).slice(0, 4) || "😊";

            leaveCurrentRoom(socket, io);

            socket.join(path);
            socketRoom.set(socket.id, path);

            if (!rooms.has(path)) rooms.set(path, new Map());
            rooms.get(path).set(socket.id, { username, avatar });

            const participants = [];
            for (const [sid, info] of rooms.get(path)) {
                participants.push({ socketId: sid, ...info });
            }

            // ── SFU: create/join SFU room ──
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

            if (messages.has(path)) {
                for (const msg of messages.get(path)) {
                    socket.emit("chat-message", msg.data, msg.sender, msg.socketId, msg.timestamp);
                }
            }

            logger.info("User joined room", {
                socketId: socket.id, username, room: path.slice(-20), participants: participants.length, sfu: sfuEnabled,
            });
        });

        // ── P2P signaling (used when SFU off, or as fallback) ──
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        // ═══════════════════════════════════
        //  SFU signaling events
        // ═══════════════════════════════════

        socket.on("get-rtp-capabilities", (callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback({ error: "No SFU room" });
            callback({ rtpCapabilities: sfuRoom.getRtpCapabilities() });
        });

        socket.on("create-send-transport", async (callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback({ error: "No SFU room" });

            try {
                const transport = await sfuRoom.createTransport(socket.id);
                sfuRoom.setSendTransport(socket.id, transport._transport);
                callback({
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters,
                    sctpParameters: transport.sctpParameters,
                });
            } catch (err) {
                logger.error("create-send-transport failed", { error: err.message });
                callback({ error: err.message });
            }
        });

        socket.on("create-recv-transport", async (callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback({ error: "No SFU room" });

            try {
                const transport = await sfuRoom.createTransport(socket.id);
                sfuRoom.setRecvTransport(socket.id, transport._transport);
                callback({
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters,
                    sctpParameters: transport.sctpParameters,
                });
            } catch (err) {
                logger.error("create-recv-transport failed", { error: err.message });
                callback({ error: err.message });
            }
        });

        socket.on("connect-transport", async ({ transportId, dtlsParameters }, callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback?.({ error: "No SFU room" });

            try {
                await sfuRoom.connectTransport(socket.id, transportId, dtlsParameters);
                callback?.({});
            } catch (err) {
                logger.error("connect-transport failed", { error: err.message });
                callback?.({ error: err.message });
            }
        });

        socket.on("produce", async ({ kind, rtpParameters, appData }, callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback?.({ error: "No SFU room" });

            try {
                const producer = await sfuRoom.produce(socket.id, kind, rtpParameters, {
                    ...appData, socketId: socket.id,
                });
                if (!producer) return callback?.({ error: "Produce failed" });

                // notify all other peers in the room about the new producer
                socket.to(path).emit("new-producer", {
                    producerId: producer.id,
                    socketId: socket.id,
                    kind: producer.kind,
                });

                callback?.({ producerId: producer.id });
            } catch (err) {
                logger.error("produce failed", { error: err.message });
                callback?.({ error: err.message });
            }
        });

        socket.on("consume", async ({ producerId, rtpCapabilities }, callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback?.({ error: "No SFU room" });

            try {
                const consumerData = await sfuRoom.consume(socket.id, producerId, rtpCapabilities);
                if (!consumerData) return callback?.({ error: "Cannot consume" });
                callback?.(consumerData);
            } catch (err) {
                logger.error("consume failed", { error: err.message });
                callback?.({ error: err.message });
            }
        });

        socket.on("consumer-resume", async ({ consumerId }, callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            const peer = sfuRoom?.peers?.get(socket.id);
            const consumer = peer?.consumers?.get(consumerId);
            if (consumer) await consumer.resume();
            callback?.({});
        });

        socket.on("get-producers", (callback) => {
            const path = socketRoom.get(socket.id);
            const sfuRoom = path && sfuRooms.get(path);
            if (!sfuRoom) return callback?.([]);
            callback?.(sfuRoom.getProducerIds(socket.id));
        });

        // ═══════════════════════════════════
        //  Chat, reactions, hand raise, typing
        // ═══════════════════════════════════

        socket.on("chat-message", (data, sender) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;
            if (isRateLimited(socket.id)) {
                socket.emit("error-message", "You're sending messages too fast. Please slow down.");
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

        socket.on("hand-raise", (raised) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;
            socket.to(path).emit("hand-raise", socket.id, !!raised);
        });

        socket.on("reaction", (emoji) => {
            const path = socketRoom.get(socket.id);
            if (!path) return;
            emoji = String(emoji).slice(0, 4);
            io.to(path).emit("reaction", socket.id, emoji);
        });

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

function leaveCurrentRoom(socket, io) {
    const path = socketRoom.get(socket.id);
    if (!path) return;

    socketRoom.delete(socket.id);

    // ── SFU cleanup ──
    const sfuRoom = sfuRooms.get(path);
    if (sfuRoom) {
        const closedProducerIds = sfuRoom.removePeer(socket.id);
        // notify others about closed producers
        for (const producerId of closedProducerIds) {
            io.to(path).emit("producer-closed", { producerId });
        }
        if (sfuRoom.isEmpty()) {
            sfuRoom.close();
            sfuRooms.delete(path);
        }
    }

    // ── P2P cleanup ──
    const room = rooms.get(path);
    if (room) {
        room.delete(socket.id);
        io.to(path).emit("user-left", socket.id);
        if (room.size === 0) {
            rooms.delete(path);
            messages.delete(path);
        }
    }

    socket.leave(path);
}
