/**
 * Chat, reactions, hand-raise, and typing indicator socket handlers.
 */
import logger from "../../utils/logger.js";
import { socketRoom, messages, roomLastActivity, isRateLimited } from "./state.js";

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
        roomMsgs.push({ sender, data, socketId: socket.id, timestamp });
        roomLastActivity.set(path, timestamp);

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
}
