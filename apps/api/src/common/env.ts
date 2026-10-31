import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

type Env = {
    port: number;
    jwtSecret: string;
    jwtExpiresIn: string;
    nodeEnv: string;
    frontendUrl: string;
    clientUrl: string;
    apiBaseUrl: string;
};

const requireEnv = (key: string): string => {
    const value = process.env[key];

    if (!value) {
        throw new Error(`${key} is not configured.`);
    }

    return value;
};

const port = Number(process.env.PORT) || 5000;
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

export const env: Env = {
    port,
    jwtSecret: requireEnv('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    frontendUrl,
    clientUrl: process.env.CLIENT_URL ?? frontendUrl,
    apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${port}`
};
