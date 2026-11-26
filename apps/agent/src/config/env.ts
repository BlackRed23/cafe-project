import * as dotenv from 'dotenv';
import * as path from 'path';

// Ensure env files are loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

export const env = {
    DATABASE_URL: process.env.DATABASE_URL as string,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_TIMEOUT_MS: Number(process.env.LLM_TIMEOUT_MS) > 0 ? Number(process.env.LLM_TIMEOUT_MS) : 30000,
    AGENT_SCAN_CRON: process.env.AGENT_SCAN_CRON || '*/10 * * * *',
    RUN_ON_START: process.env.RUN_ON_START === 'true',
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
};

if (!env.DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL in environment variables.');
}
