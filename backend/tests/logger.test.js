import { describe, it } from "node:test";
import assert from "node:assert/strict";
import logger from "../src/utils/logger.js";

describe("Logger", () => {
    it("should be a Winston logger instance", () => {
        assert.ok(logger, "Logger should exist");
        assert.ok(typeof logger.info === "function", "Should have info method");
        assert.ok(typeof logger.error === "function", "Should have error method");
        assert.ok(typeof logger.warn === "function", "Should have warn method");
        assert.ok(typeof logger.debug === "function", "Should have debug method");
    });

    it("should log without throwing", () => {
        assert.doesNotThrow(() => {
            logger.info("Test info message", { test: true });
        });
        assert.doesNotThrow(() => {
            logger.error("Test error message", { code: 500 });
        });
        assert.doesNotThrow(() => {
            logger.warn("Test warning", { rateLimit: true });
        });
    });

    it("should have correct default meta", () => {
        assert.ok(logger.defaultMeta, "Should have defaultMeta");
        assert.equal(logger.defaultMeta.service, "meetsync-api");
    });

    it("should have multiple transports", () => {
        assert.ok(logger.transports.length >= 2, "Should have at least console + file transports");
    });
});
