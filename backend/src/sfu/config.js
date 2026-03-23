/**
 * mediasoup configuration
 * Adjust ports and IPs based on your deployment environment
 */

export const workerSettings = {
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
    rtcMinPort: Number(process.env.RTC_MIN_PORT) || 10000,
    rtcMaxPort: Number(process.env.RTC_MAX_PORT) || 10100,
};

export const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
            "x-google-start-bitrate": 1000,
        },
    },
    {
        kind: "video",
        mimeType: "video/VP9",
        clockRate: 90000,
        parameters: {
            "profile-id": 2,
            "x-google-start-bitrate": 1000,
        },
    },
    {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1,
            "x-google-start-bitrate": 1000,
        },
    },
];

export const webRtcTransportOptions = {
    listenInfos: [
        {
            protocol: "udp",
            ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
            announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
        },
        {
            protocol: "tcp",
            ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
            announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
        },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    maxSctpMessageSize: 262144,
};
