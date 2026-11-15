import dotenv from 'dotenv';
import path from 'path';

// Ensure env files are loaded
dotenv.config();

export const env = {
    DATABASE_URL: process.env.DATABASE_URL as string,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY as string,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    GEMINI_TIMEOUT_MS: Number(process.env.GEMINI_TIMEOUT_MS) > 0 ? Number(process.env.GEMINI_TIMEOUT_MS) : 10000,
    GEMINI_INPUT_PRICE_PER_1M_USD: process.env.GEMINI_INPUT_PRICE_PER_1M_USD ? Number(process.env.GEMINI_INPUT_PRICE_PER_1M_USD) : undefined,
    GEMINI_OUTPUT_PRICE_PER_1M_USD: process.env.GEMINI_OUTPUT_PRICE_PER_1M_USD ? Number(process.env.GEMINI_OUTPUT_PRICE_PER_1M_USD) : undefined,
    AGENT_RECOMMENDATION_MODE: process.env.AGENT_RECOMMENDATION_MODE || 'gemini',
    AGENT_SCAN_CRON: process.env.AGENT_SCAN_CRON || '*/10 * * * *',
    RUN_ON_START: process.env.RUN_ON_START === 'true',
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
};

if (!env.DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL in environment variables.');
}

if (env.AGENT_RECOMMENDATION_MODE === 'gemini' && !env.GEMINI_API_KEY) {
    console.warn('⚠️ [agent-config] AGENT_RECOMMENDATION_MODE="gemini" but GEMINI_API_KEY is empty — Agent will use deterministic rule-based fallback.');
}
