import express, { Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.route';
import categoryRoutes from './modules/category/category.route';
import productRoutes from './modules/product/product.route';
import { env } from './common/env';
import { errorHandler } from './common/error-handler';
import { prisma } from './common/prisma';
import { sendError, sendSuccess } from './common/response';

const app = express();
const PORT = env.port;
const SERVER_URL = `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);

app.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, 200, 'Cafe API server is running.', { status: 'OK' });
});

app.get('/test-db', async (_req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany();
        sendSuccess(res, 200, 'Database connection successful.', users);
    } catch (error) {
        console.error('[api] Database connection error:', error);
        sendError(res, 500, 'Database connection failed.');
    }
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`[api] Server is running at ${SERVER_URL}`);
    console.log(`[api] Health check: ${SERVER_URL}/health`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[api] Port ${PORT} is already in use. Stop the existing process or set a different PORT.`);
        return;
    }

    console.error('[api] Server failed to start:', error);
});
