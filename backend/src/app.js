import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";
import logger from "./utils/logger.js";
import { initWorkers, isSfuAvailable } from "./sfu/worker.js";

export const app = express();
export const server = createServer(app);

// ── Security headers ──
app.use(helmet({
    // Strict-Transport-Security: only enforce in production (HTTPS)
    hsts: process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    // This is a JSON API — disable browser-sniffing mitigations irrelevant to APIs
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Keep the rest of helmet's defaults (X-Frame-Options, X-Content-Type-Options, etc.)
    referrerPolicy: { policy: "no-referrer" },
}));

// ── HTTP compression ──
app.use(compression());

// ── Trust proxy (for rate limiting behind reverse proxy on Render) ──
app.set("trust proxy", 1);

// ── CORS — allow any origin so meeting links work from anywhere ──
const corsOptions = {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Body parsers ──
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

// ── Correlation ID ──
app.use((req, res, next) => {
    req.id = req.headers["x-request-id"] || randomUUID();
    res.setHeader("x-request-id", req.id);
    next();
});

// ── Request logging ──
app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 80),
    });
    next();
});

// ── Rate limiting on auth routes ──
const authLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()  // no-op in test environment
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: "Too many requests, please try again later." },
    });

// ── Routes ──
app.use("/api/v1/users/login", authLimiter);
app.use("/api/v1/users/register", authLimiter);
app.use("/api/v1/users", userRoutes);

// ── ICE/TURN configuration endpoint — frontend fetches before joining call ──
app.get("/api/v1/ice-config", (_req, res) => {
    // STUN/TURN servers change rarely — cache for 5 minutes
    res.set("Cache-Control", "public, max-age=300");
    const iceServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
    ];

    // Add TURN server if configured via env
    if (process.env.TURN_URL) {
        iceServers.push({
            urls: process.env.TURN_URL,
            username: process.env.TURN_USERNAME || "",
            credential: process.env.TURN_CREDENTIAL || "",
        });
        logger.debug("TURN server included in ICE config");
    }

    res.json({ iceServers });
});

// ── SFU status — frontend checks this to decide P2P vs SFU ──
app.get("/api/v1/sfu-status", (_req, res) => {
    res.set("Cache-Control", "no-store"); // can change at runtime
    res.json({ enabled: isSfuAvailable() });
});

// ── Health check ──
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        uptime: Math.floor(process.uptime()),
        mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        sfu: isSfuAvailable(),
        version: "2.0.0",
    });
});

// ── Metrics (lightweight — no external dependency) ──
const requestCounts = { total: 0, errors: 0 };
app.use((_req, res, next) => {
    requestCounts.total++;
    res.on("finish", () => { if (res.statusCode >= 500) requestCounts.errors++; });
    next();
});
app.get("/api/v1/metrics", (_req, res) => {
    res.json({
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        requests_total: requestCounts.total,
        requests_errors: requestCounts.errors,
        mongo_state: mongoose.connection.readyState,
        sfu_available: isSfuAvailable(),
    });
});

// ── Socket.io ──
connectToSocket(server, ["*"]);

// ── Serve frontend in production ──
import path from "node:path";
import fs from "node:fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try multiple possible paths for the frontend build
const possiblePaths = [
    path.join(__dirname, "../../frontend/build"),
    path.join(process.cwd(), "frontend/build"),
    path.join(process.cwd(), "../frontend/build"),
    path.join(process.cwd(), "build"),
];

let frontendBuild = null;
for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, "index.html"))) {
        frontendBuild = p;
        break;
    }
}

if (frontendBuild) {
    logger.info(`Serving frontend from ${frontendBuild}`);
    app.use(express.static(frontendBuild));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/") || req.path === "/health") return next();
        res.sendFile(path.join(frontendBuild, "index.html"));
    });
} else {
    logger.warn("Frontend build not found, tried: " + possiblePaths.join(", "));
}

// ── Global error handler ──
app.use((err, req, res, _next) => {
    const status = err.status || 500;
    logger.error("Unhandled error", { requestId: req.id, error: err.message, stack: err.stack, status });
    res.status(status).json({
        error: {
            code: err.code || "INTERNAL_ERROR",
            message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
            requestId: req.id,
        },
    });
});

// ── Start ──
const PORT = process.env.PORT || 8000;

const start = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (err) {
        logger.error("MongoDB connection failed", { error: err.message });
        process.exit(1);
    }

    // Initialize mediasoup SFU workers (gracefully falls back to P2P if unavailable)
    await initWorkers();

    server.listen(PORT, () => {
        logger.info(`Server listening on port ${PORT}`, { sfu: isSfuAvailable() });
    });
};

// ── Graceful shutdown ──
const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
        mongoose.connection.close(false).then(() => {
            logger.info("MongoDB connection closed");
            process.exit(0);
        });
    });
    setTimeout(() => process.exit(1), 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: reason?.message || reason });
});

// Only start when executed directly, not when imported by tests
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    start();
}
