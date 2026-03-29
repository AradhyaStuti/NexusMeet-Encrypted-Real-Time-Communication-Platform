import { Device } from "mediasoup-client";

/**
 * mediasoup-client wrapper for SFU connections
 * Handles device setup, transport creation, producing and consuming
 */
export class SfuClient {
    constructor(socket) {
        this.socket = socket;
        this.device = new Device();
        this.sendTransport = null;
        this.recvTransport = null;
        this.producers = new Map();  // kind -> producer
        this.consumers = new Map();  // consumerId -> consumer
    }

    /** Load router RTP capabilities into the device */
    async load() {
        const { rtpCapabilities, error } = await this._request("get-rtp-capabilities");
        if (error) throw new Error(error);
        await this.device.load({ routerRtpCapabilities: rtpCapabilities });
    }

    /** Create the send transport (for producing our audio/video) */
    async createSendTransport() {
        const data = await this._request("create-send-transport");
        if (data.error) throw new Error(data.error);

        this.sendTransport = this.device.createSendTransport(data);

        this.sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            this.socket.emit("connect-transport", {
                transportId: this.sendTransport.id,
                dtlsParameters,
            }, (res) => {
                if (res?.error) errback(new Error(res.error));
                else callback();
            });
        });

        this.sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
            this.socket.emit("produce", { kind, rtpParameters, appData }, (res) => {
                if (res?.error) errback(new Error(res.error));
                else callback({ id: res.producerId });
            });
        });

        return this.sendTransport;
    }

    /** Create the receive transport (for consuming others' media) */
    async createRecvTransport() {
        const data = await this._request("create-recv-transport");
        if (data.error) throw new Error(data.error);

        this.recvTransport = this.device.createRecvTransport(data);

        this.recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            this.socket.emit("connect-transport", {
                transportId: this.recvTransport.id,
                dtlsParameters,
            }, (res) => {
                if (res?.error) errback(new Error(res.error));
                else callback();
            });
        });

        return this.recvTransport;
    }

    /** Produce a media track (audio or video). Enables simulcast for video. */
    async produce(track) {
        if (!this.sendTransport) await this.createSendTransport();

        const options = { track };

        // Simulcast: send 3 spatial layers so the SFU can forward the
        // appropriate quality to each consumer based on bandwidth.
        if (track.kind === 'video') {
            options.encodings = [
                { maxBitrate: 100000, scaleResolutionDownBy: 4 },   // low  (quarter res)
                { maxBitrate: 300000, scaleResolutionDownBy: 2 },   // mid  (half res)
                { maxBitrate: 900000 },                              // high (full res)
            ];
            options.codecOptions = { videoGoogleStartBitrate: 1000 };
        }

        const producer = await this.sendTransport.produce(options);
        this.producers.set(producer.kind, producer);
        return producer;
    }

    /** Consume a remote producer */
    async consume(producerId) {
        if (!this.recvTransport) await this.createRecvTransport();

        const data = await this._request("consume", {
            producerId,
            rtpCapabilities: this.device.rtpCapabilities,
        });

        if (data.error) {
            console.warn("[SFU] consume failed:", data.error);
            return null;
        }

        const consumer = await this.recvTransport.consume({
            id: data.id,
            producerId: data.producerId,
            kind: data.kind,
            rtpParameters: data.rtpParameters,
        });

        this.consumers.set(consumer.id, consumer);

        // resume on server side
        this.socket.emit("consumer-resume", { consumerId: consumer.id }, () => {});

        return consumer;
    }

    /** Get list of existing producers in the room */
    async getExistingProducers() {
        return this._request("get-producers");
    }

    /** Replace a track on an existing producer (e.g. camera switch, screen share) */
    async replaceTrack(kind, newTrack) {
        const producer = this.producers.get(kind);
        if (producer) {
            await producer.replaceTrack({ track: newTrack });
        }
    }

    /** Close a producer by kind */
    closeProducer(kind) {
        const producer = this.producers.get(kind);
        if (producer) {
            producer.close();
            this.producers.delete(kind);
        }
    }

    /** Request a specific simulcast layer for all consumers.
     *  spatialLayer: 0 = low (quarter), 1 = mid (half), 2 = high (full) */
    setPreferredLayer(spatialLayer) {
        for (const [consumerId] of this.consumers) {
            this.socket.emit("set-consumer-layers", {
                consumerId,
                spatialLayer,
                temporalLayer: spatialLayer, // match temporal to spatial
            }, () => {});
        }
    }

    /** Clean up everything */
    close() {
        for (const [, producer] of this.producers) producer.close();
        for (const [, consumer] of this.consumers) consumer.close();
        this.sendTransport?.close();
        this.recvTransport?.close();
        this.producers.clear();
        this.consumers.clear();
    }

    /** Promise wrapper for socket emit with callback */
    _request(event, data = {}) {
        return new Promise((resolve) => {
            this.socket.emit(event, data, (response) => {
                resolve(response);
            });
        });
    }
}
