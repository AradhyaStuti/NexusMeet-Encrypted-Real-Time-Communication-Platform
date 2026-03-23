import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";
import logger from "./utils/logger.js";

const app = express();
const server = createServer(app);

// ── Security headers ──
app.use(helmet());

// ── Trust proxy (for rate limiting behind reverse proxy on Render) ──
app.set("trust proxy", 1);

// ── CORS ──
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
    : null; // null = allow all in dev

const corsOptions = allowedOrigins
    ? {
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    }
    : { origin: true, credentials: true }; // allow all if CORS_ORIGINS not set

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Body parsers ──
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

// ── Request logging ──
app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 80),
    });
    next();
});

// ── Rate limiting on auth routes ──
const authLimiter = rateLimit({
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

// ── Health check ──
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        uptime: Math.floor(process.uptime()),
        mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        version: "1.0.0",
    });
});

// ── Socket.io ──
connectToSocket(server, allowedOrigins);

// ── Global error handler ──
app.use((err, _req, res, _next) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
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

    server.listen(PORT, () => {
        logger.info(`Server listening on port ${PORT}`);
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

start();
