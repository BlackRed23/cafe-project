import express, { Request, Response } from 'express';
import cors from 'cors';
import agentRoutes from './modules/agent/agent.route';
import authRoutes from './modules/auth/auth.routes';
import categoryRoutes from './modules/category/category.route';
import { inventoryRoutes, inventoryTransactionRoutes } from './modules/inventory/inventory.route';
import orderRoutes from './modules/order/order.route';
import paymentRoutes from './modules/payment/payment.route';
import productRoutes from './modules/product/product.route';
import purchaseRoutes from './modules/purchase/purchase.route';
import simulateSaleRoutes from './modules/simulate-sale/simulate-sale.route';
import systemSettingRoutes from './modules/system-setting/system-setting.route';
import { productSupplierRoutes, supplierProductRoutes, supplierRoutes } from './modules/supplier/supplier.route';
import userRoutes from './modules/user/user.route';
import dashboardRoutes from './modules/dashboard/dashboard.route';
import uploadRoutes from './modules/upload/upload.route';
import { env } from './common/env';
import { errorHandler } from './common/error-handler';
import { prisma } from '@cafe-project/database';
import { sendError, sendSuccess } from './common/response';
import { scheduleJobs } from './modules/cron/cron.service';

const app = express();
const PORT = env.port;
const SERVER_URL = `http://localhost:${PORT}`;

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventories', inventoryRoutes);
app.use('/api/inventory-transactions', inventoryTransactionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/purchase-requests', purchaseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/supplier-products', supplierProductRoutes);
app.use('/api/products', productSupplierRoutes);
app.use('/api/simulate-sale', simulateSaleRoutes);
app.use('/api/system-settings', systemSettingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);

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
    scheduleJobs();
});

server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[api] Port ${PORT} is already in use. Stop the existing process or set a different PORT.`);
        return;
    }

    console.error('[api] Server failed to start:', error);
});

// Trigger nodemon restart
