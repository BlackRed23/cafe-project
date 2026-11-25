import express, { Request, Response } from 'express';
import cors from 'cors';
import agentRoutes from './modules/agent/agent.route';
import authRoutes from './modules/auth/auth.routes';
import categoryRoutes from './modules/category/category.route';
import { ingredientRoutes } from './modules/ingredient/ingredient.route';
import { inventoryRoutes, inventoryTransactionRoutes } from './modules/inventory/inventory.route';
import orderRoutes from './modules/order/order.route';
import paymentRoutes from './modules/payment/payment.route';
import productRoutes from './modules/product/product.route';
import { productRecipeRoutes, toppingRoutes } from './modules/recipe/recipe.route';
import purchaseRoutes, { purchaseOrderRoutes } from './modules/purchase/purchase.route';
import simulateSaleRoutes from './modules/simulate-sale/simulate-sale.route';
import systemSettingRoutes from './modules/system-setting/system-setting.route';
import { productSupplierRoutes, supplierProductRoutes, supplierRoutes } from './modules/supplier/supplier.route';
import userRoutes from './modules/user/user.route';
import dashboardRoutes from './modules/dashboard/dashboard.route';
import uploadRoutes from './modules/upload/upload.route';
import { env } from './common/env';
import { errorHandler } from './common/error-handler';
import { observeHttp } from './common/http-observability';
import { sendSuccess } from './common/response';
import { scheduleJobs } from './modules/cron/cron.service';
import { ingredientBatchRoutes } from './modules/ingredient/ingredient-batch.route';
import { stocktakeRoutes } from './modules/inventory/stocktake.route';
import { startGraphPurchasingContinuations } from './modules/agent/graph-purchasing-admin';

const app = express();
// PostgreSQL per-ingredient movement cursors are 64-bit. JSON has no BigInt;
// publish these exact values as decimal strings without losing precision.
app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value);
const PORT = env.port;
const SERVER_URL = `http://localhost:${PORT}`;

const allowedOrigins = Array.from(new Set([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    ...(process.env.CORS_ORIGIN || "").split(","),
    ...(process.env.CLIENT_URL || "").split(","),
    ...(process.env.FRONTEND_URL || "").split(",")
].map((origin) => origin.trim()).filter(Boolean)));

app.use(observeHttp);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id']
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/products', productRecipeRoutes);
app.use('/api/toppings', toppingRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/inventories', inventoryRoutes);
app.use('/api/inventory-transactions', inventoryTransactionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/purchase-requests', purchaseRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/supplier-products', supplierProductRoutes);
app.use('/api/products', productSupplierRoutes);
app.use('/api/simulate-sale', simulateSaleRoutes);
app.use('/api/system-settings', systemSettingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ingredient-batches', ingredientBatchRoutes);
app.use('/api/stocktakes', stocktakeRoutes);
app.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, 200, 'Cafe API server is running.', { status: 'OK' });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`[api] Server is running at ${SERVER_URL}`);
    console.log(`[api] Health check: ${SERVER_URL}/health`);

    const configuredApiBaseUrl = (process.env.API_BASE_URL || env.apiBaseUrl || '').trim();
    if (configuredApiBaseUrl.includes('localhost') || configuredApiBaseUrl.includes('127.0.0.1')) {
        console.warn(
            '[PAYMENT] API_BASE_URL đang là localhost – cổng thanh toán sẽ không gọi được IPN. Dùng ngrok/cloudflared để test.'
        );
    }

    scheduleJobs();
    const stopGraphPurchasing = startGraphPurchasingContinuations();
    server.once('close', stopGraphPurchasing);
});

server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[api] Port ${PORT} is already in use. Stop the existing process or set a different PORT.`);
        return;
    }

    console.error('[api] Server failed to start:', error);
});

// Trigger nodemon restart
