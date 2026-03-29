import os from "node:os";
import logger from "../utils/logger.js";
import { workerSettings } from "./config.js";

/** @type {import('mediasoup').types.Worker[]} */
let workers = [];
let nextWorkerIdx = 0;
let mediasoupModule = null;

/**
 * Create a single mediasoup worker with a death handler that replaces it.
 */
async function createWorker(index) {
    const worker = await mediasoupModule.createWorker(workerSettings);

    worker.on("died", () => {
        logger.error(`mediasoup worker ${worker.pid} died`, { index });
        workers = workers.filter(w => w.pid !== worker.pid);

        // Attempt to replace the dead worker after a short delay
        setTimeout(async () => {
            try {
                const replacement = await createWorker(index);
                workers.push(replacement);
                logger.info("mediasoup worker replaced", { pid: replacement.pid, index });
            } catch (err) {
                logger.error("Failed to replace dead mediasoup worker", { index, error: err.message });
            }
        }, 2000);
    });

    return worker;
}

/**
 * Create mediasoup workers — one per CPU core (capped at 4)
 * Returns true if SFU is available, false if mediasoup couldn't load
 */
export async function initWorkers() {
    if (process.env.DISABLE_SFU === "true") {
        logger.info("SFU disabled via DISABLE_SFU env var, using P2P mode");
        return false;
    }
    try {
        mediasoupModule = await import("mediasoup");
        const numWorkers = Math.min(os.cpus().length, 4);

        for (let i = 0; i < numWorkers; i++) {
            const worker = await createWorker(i);
            workers.push(worker);
            logger.info(`mediasoup worker created`, { pid: worker.pid, index: i });
        }

        logger.info(`SFU initialized with ${numWorkers} workers`);
        return true;
    } catch (err) {
        logger.warn(`mediasoup not available, falling back to P2P: ${err.message}`);
        return false;
    }
}

/**
 * Get next worker in round-robin fashion
 * @returns {import('mediasoup').types.Worker}
 */
export function getNextWorker() {
    const worker = workers[nextWorkerIdx];
    nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
    return worker;
}

export function isSfuAvailable() {
    return workers.length > 0;
}
