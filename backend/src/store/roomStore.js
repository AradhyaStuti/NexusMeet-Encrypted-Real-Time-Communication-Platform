/**
 * Redis-backed room state store.
 *
 * When Redis is available, room data is persisted there so multiple
 * server instances can share state. When Redis is unavailable, falls
 * back to the in-memory Maps in socketHandlers/state.js.
 *
 * Redis key schema:
 *   room:{path}:participants   → Hash  { socketId → JSON({username, avatar}) }
 *   room:{path}:host           → String socketId
 *   room:{path}:waiting        → Hash  { socketId → JSON({username, avatar}) }
 *   room:{path}:messages       → List  of JSON({sender, data, socketId, timestamp})
 *   room:{path}:activity       → String timestamp
 *   socket:{socketId}:room     → String path
 *   ratelimit:{socketId}       → List  of timestamps
 */
import { getRedis } from "../utils/redis.js";
import logger from "../utils/logger.js";

const KEY_TTL = 86400; // 24 hours — matches the in-memory TTL
const MAX_MESSAGES = 200;
const MESSAGE_RATE_LIMIT = 10;
const MESSAGE_RATE_WINDOW = 10; // seconds

// ── Helpers ──

function rk(...parts) {
    return parts.join(":");
}

// ── Participant management ──

export async function addParticipant(path, socketId, { username, avatar }) {
    const redis = getRedis();
    if (!redis) return;
    const key = rk("room", path, "participants");
    await redis.hSet(key, socketId, JSON.stringify({ username, avatar }));
    await redis.expire(key, KEY_TTL);
}

export async function removeParticipant(path, socketId) {
    const redis = getRedis();
    if (!redis) return;
    await redis.hDel(rk("room", path, "participants"), socketId);
}

export async function getParticipants(path) {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.hGetAll(rk("room", path, "participants"));
    if (!raw || Object.keys(raw).length === 0) return null;
    return new Map(Object.entries(raw).map(([sid, json]) => [sid, JSON.parse(json)]));
}

export async function getParticipantCount(path) {
    const redis = getRedis();
    if (!redis) return null;
    return redis.hLen(rk("room", path, "participants"));
}

// ── Host ──

export async function setHost(path, socketId) {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(rk("room", path, "host"), socketId, { EX: KEY_TTL });
}

export async function getHost(path) {
    const redis = getRedis();
    if (!redis) return null;
    return redis.get(rk("room", path, "host"));
}

export async function deleteHost(path) {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(rk("room", path, "host"));
}

// ── Waiting room ──

export async function addToWaitingRoom(path, socketId, { username, avatar }) {
    const redis = getRedis();
    if (!redis) return;
    const key = rk("room", path, "waiting");
    await redis.hSet(key, socketId, JSON.stringify({ username, avatar }));
    await redis.expire(key, KEY_TTL);
}

export async function removeFromWaitingRoom(path, socketId) {
    const redis = getRedis();
    if (!redis) return;
    await redis.hDel(rk("room", path, "waiting"), socketId);
}

export async function getWaitingRoom(path) {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.hGetAll(rk("room", path, "waiting"));
    if (!raw || Object.keys(raw).length === 0) return null;
    return new Map(Object.entries(raw).map(([sid, json]) => [sid, JSON.parse(json)]));
}

export async function clearWaitingRoom(path) {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(rk("room", path, "waiting"));
}

// ── Socket → Room mapping ──

export async function setSocketRoom(socketId, path) {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(rk("socket", socketId, "room"), path, { EX: KEY_TTL });
}

export async function getSocketRoom(socketId) {
    const redis = getRedis();
    if (!redis) return null;
    return redis.get(rk("socket", socketId, "room"));
}

export async function deleteSocketRoom(socketId) {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(rk("socket", socketId, "room"));
}

// ── Chat messages ──

export async function pushMessage(path, msg) {
    const redis = getRedis();
    if (!redis) return;
    const key = rk("room", path, "messages");
    await redis.rPush(key, JSON.stringify(msg));
    await redis.lTrim(key, -MAX_MESSAGES, -1);
    await redis.expire(key, KEY_TTL);
}

export async function getMessages(path) {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.lRange(rk("room", path, "messages"), 0, -1);
    return raw.map(json => JSON.parse(json));
}

// ── Activity tracking ──

export async function setActivity(path) {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(rk("room", path, "activity"), Date.now().toString(), { EX: KEY_TTL });
}

// ── Rate limiting ──

export async function isRateLimitedRedis(socketId) {
    const redis = getRedis();
    if (!redis) return null; // fallback to in-memory
    const key = rk("ratelimit", socketId);
    const now = Date.now();
    await redis.zRemRangeByScore(key, "-inf", String(now - MESSAGE_RATE_WINDOW * 1000));
    const count = await redis.zCard(key);
    if (count >= MESSAGE_RATE_LIMIT) return true;
    await redis.zAdd(key, { score: now, value: String(now) });
    await redis.expire(key, MESSAGE_RATE_WINDOW);
    return false;
}

// ── Room cleanup ──

export async function deleteRoom(path) {
    const redis = getRedis();
    if (!redis) return;
    await Promise.all([
        redis.del(rk("room", path, "participants")),
        redis.del(rk("room", path, "host")),
        redis.del(rk("room", path, "waiting")),
        redis.del(rk("room", path, "messages")),
        redis.del(rk("room", path, "activity")),
    ]);
    logger.info("Redis room keys cleaned", { room: path.slice(-20) });
}

export async function clearRateLimitRedis(socketId) {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(rk("ratelimit", socketId));
}
