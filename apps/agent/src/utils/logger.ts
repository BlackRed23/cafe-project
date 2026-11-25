import { env } from '../config/env';

export const logger = {
    info: (message: string, ...args: unknown[]) => {
        console.log(`[INFO] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(`[WARN] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
        console.error(`[ERROR] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
        if (env.DEBUG_MODE) {
            console.log(`[DEBUG] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
        }
    }
};
