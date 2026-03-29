/**
 * Redis client singleton.
 *
 * Falls back gracefully to in-memory state when Redis is unavailable,
 * so local development works without a Redis server.
 *
 * Set REDIS_URL env var to enable (e.g. redis://localhost:6379).
 */
import { createClient } from "redis";
import logger from "./logger.js";

let client = null;
let isConnected = false;

export async function initRedis() {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.info("REDIS_URL not set — using in-memory state");
        return null;
    }

    try {
        client = createClient({ url });
        client.on("error", (err) => {
            logger.error("Redis client error", { error: err.message });
            isConnected = false;
        });
        client.on("connect", () => {
            logger.info("Redis connected");
            isConnected = true;
        });
        client.on("reconnecting", () => logger.info("Redis reconnecting..."));

        await client.connect();
        isConnected = true;
        return client;
    } catch (err) {
        logger.error("Redis connection failed — falling back to in-memory", { error: err.message });
        client = null;
        isConnected = false;
        return null;
    }
}

export function getRedis() {
    return isConnected ? client : null;
}

export function isRedisConnected() {
    return isConnected;
}

export async function shutdownRedis() {
    if (client) {
        try { await client.quit(); } catch { /* already closed */ }
        client = null;
        isConnected = false;
    }
}
