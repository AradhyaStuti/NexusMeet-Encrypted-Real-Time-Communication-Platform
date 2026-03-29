import jwt from "jsonwebtoken";
import logger from "./logger.js";

const JWT_SECRET = process.env.JWT_SECRET || "meetsync_dev_secret_change_in_production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Sign a JWT token with user payload
 * @param {{ id: string, username: string }} payload
 * @returns {string} signed JWT
 */
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {{ id: string, username: string, iat: number, exp: number } | null}
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            logger.warn("JWT expired", { token: token.slice(0, 10) + "..." });
        }
        return null;
    }
}
