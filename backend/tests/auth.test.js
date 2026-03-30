import { describe, it } from "node:test";
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
});
