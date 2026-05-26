import dotenv from 'dotenv';

dotenv.config();

type Env = {
    port: number;
    jwtSecret: string;
    jwtExpiresIn: string;
    nodeEnv: string;
};

const requireEnv = (key: string): string => {
    const value = process.env[key];

    if (!value) {
        throw new Error(`${key} is not configured.`);
    }

    return value;
};

export const env: Env = {
    port: Number(process.env.PORT) || 5000,
    jwtSecret: requireEnv('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    nodeEnv: process.env.NODE_ENV ?? 'development'
};
