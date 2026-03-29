/**
 * Chat, reactions, hand-raise, and typing indicator socket handlers.
 */
import logger from "../../utils/logger.js";
import { socketRoom, messages, roomLastActivity, isRateLimited } from "./state.js";
import * as store from "../../store/roomStore.js";

export function registerChatHandlers(socket, io) {

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
        const msg = { sender, data, socketId: socket.id, timestamp };
        roomMsgs.push(msg);
        roomLastActivity.set(path, timestamp);

        // Sync to Redis
        store.pushMessage(path, msg).catch(() => {});
        store.setActivity(path).catch(() => {});

        io.to(path).emit("chat-message", data, sender, socket.id, timestamp);
    });

    // E2E key exchange — relay key between peers so code-join users get the room key
    socket.on("request-e2e-key", () => {
        const path = socketRoom.get(socket.id);
        if (!path) return;
        socket.to(path).emit("request-e2e-key");
    });

    socket.on("share-e2e-key", (key) => {
        const path = socketRoom.get(socket.id);
        if (!path) return;
        // Send only to peers who don't have the key yet (broadcast to room)
        socket.to(path).emit("e2e-key", String(key).slice(0, 100));
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
}
