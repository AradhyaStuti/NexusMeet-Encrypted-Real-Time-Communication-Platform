import { getNextWorker } from "./worker.js";
import { mediaCodecs, webRtcTransportOptions } from "./config.js";
import logger from "../utils/logger.js";

/**
 * SFU Room — wraps a mediasoup Router with transports/producers/consumers
 *
 * Each meeting room gets one SfuRoom. When participants join:
 * 1. They create a send transport → produce their audio/video
 * 2. They create a recv transport → consume everyone else's producers
 */
export class SfuRoom {
    constructor(roomId) {
        this.roomId = roomId;
        /** @type {import('mediasoup').types.Router | null} */
        this.router = null;
        /** @type {Map<string, { sendTransport, recvTransport, producers: Map, consumers: Map }>} */
        this.peers = new Map();
    }

    async init() {
        const worker = getNextWorker();
        this.router = await worker.createRouter({ mediaCodecs });
        logger.info("SFU room created", { roomId: this.roomId.slice(-20) });
    }

    getRtpCapabilities() {
        return this.router.rtpCapabilities;
    }

    async createTransport(socketId) {
        const transportPromise = this.router.createWebRtcTransport(webRtcTransportOptions);
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Transport creation timed out")), 10_000));
        const transport = await Promise.race([transportPromise, timeout]);

        transport.on("dtlsstatechange", (state) => {
            if (state === "closed") {
                transport.close();
            }
        });

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters,
            _transport: transport, // internal ref
        };
    }

    async connectTransport(socketId, transportId, dtlsParameters) {
        const peer = this.peers.get(socketId);
        if (!peer) return;

        const transport =
            peer.sendTransport?.id === transportId ? peer.sendTransport :
            peer.recvTransport?.id === transportId ? peer.recvTransport : null;

        if (transport) {
            await transport.connect({ dtlsParameters });
        }
    }

    async produce(socketId, kind, rtpParameters, appData) {
        const peer = this.peers.get(socketId);
        if (!peer?.sendTransport) return null;

        const producer = await peer.sendTransport.produce({ kind, rtpParameters, appData });

        producer.on("transportclose", () => {
            producer.close();
            peer.producers.delete(producer.id);
        });

        peer.producers.set(producer.id, producer);
        logger.debug("Producer created", { socketId, kind, producerId: producer.id });
        return producer;
    }

    async consume(socketId, producerId, rtpCapabilities) {
        if (!this.router.canConsume({ producerId, rtpCapabilities })) {
            logger.warn("Cannot consume", { socketId, producerId });
            return null;
        }

        const peer = this.peers.get(socketId);
        if (!peer?.recvTransport) return null;

        const consumer = await peer.recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // start paused, client resumes after setup
        });

        consumer.on("transportclose", () => {
            consumer.close();
            peer.consumers.delete(consumer.id);
        });

        consumer.on("producerclose", () => {
            consumer.close();
            peer.consumers.delete(consumer.id);
        });

        peer.consumers.set(consumer.id, consumer);

        return {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            producerSocketId: consumer.appData?.socketId,
        };
    }

    addPeer(socketId) {
        this.peers.set(socketId, {
            sendTransport: null,
            recvTransport: null,
            producers: new Map(),
            consumers: new Map(),
        });
    }

    setSendTransport(socketId, transport) {
        const peer = this.peers.get(socketId);
        if (peer) peer.sendTransport = transport;
    }

    setRecvTransport(socketId, transport) {
        const peer = this.peers.get(socketId);
        if (peer) peer.recvTransport = transport;
    }

    removePeer(socketId) {
        const peer = this.peers.get(socketId);
        if (!peer) return [];

        // collect producer IDs to notify others
        const closedProducerIds = [];

        for (const [id, producer] of peer.producers) {
            closedProducerIds.push(id);
            producer.close();
        }
        for (const [id, consumer] of peer.consumers) {
            consumer.close();
        }
        if (peer.sendTransport) peer.sendTransport.close();
        if (peer.recvTransport) peer.recvTransport.close();

        this.peers.delete(socketId);
        logger.debug("Peer removed from SFU room", { socketId, roomId: this.roomId.slice(-20) });

        return closedProducerIds;
    }

    getProducerIds(excludeSocketId) {
        const ids = [];
        for (const [socketId, peer] of this.peers) {
            if (socketId === excludeSocketId) continue;
            for (const [id, producer] of peer.producers) {
                ids.push({ producerId: id, socketId, kind: producer.kind });
            }
        }
        return ids;
    }

    isEmpty() {
        return this.peers.size === 0;
    }

    close() {
        this.router.close();
        logger.info("SFU room closed", { roomId: this.roomId.slice(-20) });
    }
}
