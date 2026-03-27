import os from "node:os";
import logger from "../utils/logger.js";
import { workerSettings } from "./config.js";

/** @type {import('mediasoup').types.Worker[]} */
let workers = [];
let nextWorkerIdx = 0;

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
        const mediasoup = await import("mediasoup");
        const numWorkers = Math.min(os.cpus().length, 4);

        for (let i = 0; i < numWorkers; i++) {
            const worker = await mediasoup.createWorker(workerSettings);

            worker.on("died", () => {
                logger.error(`mediasoup worker ${worker.pid} died, restarting...`);
                workers = workers.filter(w => w.pid !== worker.pid);
                // could restart here but for now just log
            });

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
