import dotenv from 'dotenv';
import path from 'path';

// Ensure env files are loaded
dotenv.config();

export const env = {
    DATABASE_URL: process.env.DATABASE_URL as string,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY as string,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    AGENT_SCAN_CRON: process.env.AGENT_SCAN_CRON || '*/10 * * * *',
    RUN_ON_START: process.env.RUN_ON_START === 'true',
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
};

if (!env.DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL in environment variables.');
}

if (!env.GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY in environment variables.');
}
