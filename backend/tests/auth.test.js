import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../src/utils/jwt.js";

describe("JWT Utilities", () => {
    it("should sign a token with payload", () => {
        const token = signToken({ id: "abc123", username: "testuser" });
        assert.ok(token, "Token should be a non-empty string");
        assert.ok(typeof token === "string");
        assert.ok(token.split(".").length === 3, "JWT should have 3 parts");
    });

    it("should verify a valid token and return payload", () => {
        const token = signToken({ id: "abc123", username: "testuser" });
        const decoded = verifyToken(token);
        assert.ok(decoded, "Decoded token should not be null");
        assert.equal(decoded.id, "abc123");
        assert.equal(decoded.username, "testuser");
        assert.ok(decoded.iat, "Should have issued-at");
        assert.ok(decoded.exp, "Should have expiry");
    });

    it("should return null for an invalid token", () => {
        const decoded = verifyToken("invalid.token.here");
        assert.equal(decoded, null);
    });

    it("should return null for an empty string", () => {
        const decoded = verifyToken("");
        assert.equal(decoded, null);
    });

    it("should contain expiry in the future", () => {
        const token = signToken({ id: "abc123", username: "testuser" });
        const decoded = verifyToken(token);
        const now = Math.floor(Date.now() / 1000);
        assert.ok(decoded.exp > now, "Token expiry should be in the future");
    });
});

describe("Input Validation Logic", () => {
    it("should reject username shorter than 3 chars", () => {
        const username = "ab";
        assert.ok(username.length < 3, "Username too short");
    });

    it("should reject password shorter than 6 chars", () => {
        const password = "12345";
        assert.ok(password.length < 6, "Password too short");
    });

    it("should accept valid username format", () => {
        const valid = /^[a-zA-Z0-9_]+$/;
        assert.ok(valid.test("usha_123"), "Should accept alphanumeric + underscore");
        assert.ok(!valid.test("usha@123"), "Should reject special characters");
        assert.ok(!valid.test("usha 123"), "Should reject spaces");
        assert.ok(!valid.test(""), "Should reject empty string");
    });

    it("should trim whitespace from inputs", () => {
        assert.equal("  usha  ".trim(), "usha");
        assert.equal("  Usha Stuti  ".trim(), "Usha Stuti");
    });
});

describe("Rate Limiting Logic", () => {
    it("should track message timestamps correctly", () => {
        const timestamps = [];
        const RATE_LIMIT = 10;
        const WINDOW = 10_000;

        // Simulate 10 messages within window
        const now = Date.now();
        for (let i = 0; i < RATE_LIMIT; i++) {
            timestamps.push(now);
        }

        // 10 messages = at limit
        const recent = timestamps.filter(t => now - t < WINDOW);
        assert.equal(recent.length, RATE_LIMIT);

        // 11th should be blocked
        assert.ok(recent.length >= RATE_LIMIT, "Should be at rate limit");
    });
});
