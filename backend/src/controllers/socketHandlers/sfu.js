/**
 * mediasoup SFU signalling handlers.
 *
 * All events here are only useful when isSfuAvailable() is true.
 * Each handler validates that the socket is in a room with an SFU
 * instance before proceeding.
 */
import logger from "../../utils/logger.js";
import { socketRoom, sfuRooms } from "./state.js";

/** Wraps async socket handlers so uncaught rejections don't silently vanish. */
const guard = (event, fn) => async (...args) => {
    try {
        await fn(...args);
    } catch (err) {
        logger.error(`SFU handler error [${event}]`, { error: err.message, stack: err.stack });
        // Last arg may be a callback — surface the error to the client
        const cb = args[args.length - 1];
        if (typeof cb === "function") cb({ error: err.message });
    }
};

export function registerSfuHandlers(socket, io) {

    socket.on("get-rtp-capabilities", (callback) => {
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });
        callback?.({ rtpCapabilities: sfuRoom.getRtpCapabilities() });
    });

    socket.on("create-send-transport", guard("create-send-transport", async (callback) => {
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });

        const transport = await sfuRoom.createTransport(socket.id);
        sfuRoom.setSendTransport(socket.id, transport._transport);
        callback?.({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters,
        });
    }));

    socket.on("create-recv-transport", guard("create-recv-transport", async (callback) => {
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });

        const transport = await sfuRoom.createTransport(socket.id);
        sfuRoom.setRecvTransport(socket.id, transport._transport);
        callback?.({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters,
        });
    }));

    socket.on("connect-transport", guard("connect-transport", async ({ transportId, dtlsParameters } = {}, callback) => {
        if (!transportId || !dtlsParameters) return callback?.({ error: "transportId and dtlsParameters are required" });
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });

        await sfuRoom.connectTransport(socket.id, transportId, dtlsParameters);
        callback?.({});
    }));

    socket.on("produce", guard("produce", async ({ kind, rtpParameters, appData } = {}, callback) => {
        if (!kind || !rtpParameters) return callback?.({ error: "kind and rtpParameters are required" });
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });

        const producer = await sfuRoom.produce(socket.id, kind, rtpParameters, {
            ...appData, socketId: socket.id,
        });
        if (!producer) return callback?.({ error: "Produce failed" });

        socket.to(path).emit("new-producer", {
            producerId: producer.id,
            socketId: socket.id,
            kind: producer.kind,
        });
        callback?.({ producerId: producer.id });
    }));

    socket.on("consume", guard("consume", async ({ producerId, rtpCapabilities } = {}, callback) => {
        if (!producerId || !rtpCapabilities) return callback?.({ error: "producerId and rtpCapabilities are required" });
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });

        const consumerData = await sfuRoom.consume(socket.id, producerId, rtpCapabilities);
        if (!consumerData) return callback?.({ error: "Cannot consume" });
        callback?.(consumerData);
    }));

    socket.on("consumer-resume", guard("consumer-resume", async ({ consumerId } = {}, callback) => {
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        const peer = sfuRoom?.peers?.get(socket.id);
        const consumer = peer?.consumers?.get(consumerId);
        if (consumer) await consumer.resume();
        callback?.({});
    }));

    socket.on("get-producers", (callback) => {
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.([]);
        callback?.(sfuRoom.getProducerIds(socket.id));
    });

    socket.on("set-consumer-layers", guard("set-consumer-layers", async ({ consumerId, spatialLayer, temporalLayer } = {}, callback) => {
        const path = socketRoom.get(socket.id);
        const sfuRoom = path && sfuRooms.get(path);
        if (!sfuRoom) return callback?.({ error: "No SFU room" });
        await sfuRoom.setConsumerLayers(socket.id, consumerId, spatialLayer ?? 2, temporalLayer ?? 2);
        callback?.({});
    }));
}
