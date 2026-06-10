import { env } from '../config/env';

export const logger = {
    info: (message: string, ...args: any[]) => {
        console.log(`[INFO] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
        console.warn(`[WARN] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(`[ERROR] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
        if (env.DEBUG_MODE) {
            console.log(`[DEBUG] [${new Date().toLocaleTimeString()}] ${message}`, ...args);
        }
    }
};
