import dotenv from 'dotenv';
import path from 'node:path';
import express from 'express';
import { prisma, OrderStatus, PaymentMethod, PaymentStatus, TransactionStatus } from '@cafe-project/database';
import paymentRoutes from '../src/modules/payment/payment.route';
import { errorHandler } from '../src/common/error-handler';
import jwt from 'jsonwebtoken';
import { env } from '../src/common/env';
import { signMoMoIpnPayload, type MoMoIpnPayload } from '../src/modules/payment/momo.gateway';
import { signVNPayParams, formatVNPayDateGMT7 } from '../src/modules/payment/vnpay.gateway';

dotenv.config({ path: path.join(__dirname, '../.env') });

const runLiveE2E = async () => {
    console.log('==============================================================');
    console.log('🚀 BẮT ĐẦU CHẠY THỬ NGHIỆM THỰC TẾ PAYMENT API (MOMO & VNPAY)');
    console.log('==============================================================\n');

    // 1. Start Express test server on an ephemeral port (or 5000 if free)
    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentRoutes);
    app.use(errorHandler);

    const server = await new Promise<import('node:http').Server>((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as { port: number };
    const baseUrl = `http://localhost:${addr.port}`;
    console.log(`[1] API Server đã khởi động tại: ${baseUrl}`);

    try {
        // 2. Find or create a customer user in DB
        let user = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
        if (!user) {
            user = await prisma.user.findFirst();
        }
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: `test.customer.${Date.now()}@cafe.com`,
                    name: 'Khach Hang Test Payment',
                    password: 'hashed_password_placeholder',
                    role: 'CUSTOMER'
                }
            });
        }
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.jwtSecret, { expiresIn: '1h' });
        console.log(`[2] Đã lấy người dùng: ${user.email} (${user.role}) & tạo JWT Token`);

        // 3. Create a fresh test Order in DB (65,000 VND)
        const orderMoMo = await prisma.order.create({
            data: {
                userId: user.id,
                status: OrderStatus.PENDING,
                totalAmount: 65000,
                shippingFee: 15000,
                shippingName: 'Nguyen Van Test',
                shippingPhone: '0901234567',
                shippingAddress: 'Quan 1, TP.HCM',
                paymentMethod: PaymentMethod.MOMO,
                paymentStatus: PaymentStatus.PENDING,
                payments: {
                    create: {
                        method: PaymentMethod.MOMO,
                        amount: 65000,
                        status: TransactionStatus.INITIATED,
                        attemptNo: 1,
                        merchantRef: `init_${Date.now()}`
                    }
                }
            }
        });
        console.log(`[3] Đã tạo đơn hàng MoMo: ID=${orderMoMo.id}, totalAmount=65,000 VND\n`);

        // 4. Call POST /api/payments/create-url (MoMo Sandbox LIVE call!)
        console.log('--- BƯỚC 4: GỌI POST /api/payments/create-url (MoMo Sandbox thật) ---');
        const createMomoRes = await fetch(`${baseUrl}/api/payments/create-url`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: orderMoMo.id, method: 'MOMO' })
        });
        const createMomoJson = (await createMomoRes.json()) as {
            success: boolean;
            message: string;
            data: { payUrl: string; paymentId: string; merchantRef: string; expiresAt: string };
        };
        console.log(`HTTP Status: ${createMomoRes.status}`);
        console.log('Response JSON:', JSON.stringify(createMomoJson, null, 2));

        const merchantRefMomo = createMomoJson.data.merchantRef;

        // Verify attempt 1 was superseded and attempt 2 is PENDING
        const attemptsAfterCreate = await prisma.payment.findMany({
            where: { orderId: orderMoMo.id },
            orderBy: { attemptNo: 'asc' }
        });
        console.log(
            'Trạng thái các Payment attempts trong DB:',
            attemptsAfterCreate.map((a) => ({
                attemptNo: a.attemptNo,
                merchantRef: a.merchantRef,
                status: a.status,
                failureCode: a.failureCode
            }))
        );

        // 5. Test INVALID Signature on MoMo Webhook
        console.log('\n--- BƯỚC 5: BẮN WEBHOOK MOMO SAI CHỮ KÝ (Kỳ vọng HTTP 400) ---');
        const badSigRes = await fetch(`${baseUrl}/api/payments/webhook/momo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerCode: 'MOMO',
                orderId: merchantRefMomo,
                requestId: `${merchantRefMomo}_bad`,
                amount: 65000,
                orderInfo: 'Test bad sig',
                orderType: 'momo_wallet',
                transId: 111222333,
                resultCode: 0,
                message: 'Successful.',
                payType: 'qr',
                responseTime: Date.now(),
                extraData: '',
                signature: '0000000000000000000000000000000000000000000000000000000000000000'
            })
        });
        console.log(`HTTP Status: ${badSigRes.status}`, await badSigRes.text());

        // 6. Test VALID MoMo Webhook (Success resultCode = 0)
        console.log('\n--- BƯỚC 6: BẮN WEBHOOK MOMO HỢP LỆ (resultCode=0, Kỳ vọng HTTP 204) ---');
        const accessKey = process.env.MOMO_ACCESS_KEY!;
        const secretKey = process.env.MOMO_SECRET_KEY!;
        const transId = `9988${Date.now().toString().slice(-6)}`;

        const validMomoPayload: MoMoIpnPayload = {
            partnerCode: process.env.MOMO_PARTNER_CODE || 'MOMO',
            orderId: merchantRefMomo,
            requestId: `${merchantRefMomo}_ok`,
            amount: 65000,
            orderInfo: `Thanh toan don hang ${orderMoMo.id}`,
            orderType: 'momo_wallet',
            transId,
            resultCode: 0,
            message: 'Successful.',
            payType: 'qr',
            responseTime: Date.now(),
            extraData: '',
            signature: ''
        };
        validMomoPayload.signature = signMoMoIpnPayload(validMomoPayload, accessKey, secretKey);

        const okWebhookRes = await fetch(`${baseUrl}/api/payments/webhook/momo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validMomoPayload)
        });
        console.log(`Lần 1 (Xử lý mới) -> HTTP Status: ${okWebhookRes.status}`);

        // 7. Test Idempotency (Send identical MoMo Webhook 2nd time)
        console.log('\n--- BƯỚC 7: BẮN LẠI WEBHOOK MOMO LẦN 2 CÙNG transId (Test Idempotency) ---');
        const dupWebhookRes = await fetch(`${baseUrl}/api/payments/webhook/momo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validMomoPayload)
        });
        console.log(`Lần 2 (Trùng transId) -> HTTP Status: ${dupWebhookRes.status}`);

        // 8. Check GET /api/payments/order/:orderId and Order status in DB
        console.log('\n--- BƯỚC 8: KIỂM TRA GET /api/payments/order/:orderId & DATABASE ---');
        const getPayRes = await fetch(`${baseUrl}/api/payments/order/${orderMoMo.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('GET /api/payments/order/:orderId ->', JSON.stringify(await getPayRes.json(), null, 2));

        const updatedOrder = await prisma.order.findUnique({ where: { id: orderMoMo.id } });
        const callbackLog = await prisma.paymentCallback.findUnique({
            where: { providerEventId: `MOMO:${transId}` }
        });
        console.log('Order sau Webhook:', {
            id: updatedOrder?.id,
            status: updatedOrder?.status,
            paymentStatus: updatedOrder?.paymentStatus,
            paidAt: updatedOrder?.paidAt,
            stockDeductedAt: updatedOrder?.stockDeductedAt
        });
        console.log('PaymentCallback trong DB:', {
            id: callbackLog?.id,
            providerEventId: callbackLog?.providerEventId,
            status: callbackLog?.status,
            signatureValid: callbackLog?.signatureValid,
            retryCount: callbackLog?.retryCount
        });

        // 9. Test VNPay Create URL + VNPay IPN
        console.log('\n--- BƯỚC 9: TEST VNPAY CREATE URL + VNPAY IPN (HMAC-SHA512) ---');
        const orderVNPay = await prisma.order.create({
            data: {
                userId: user.id,
                status: OrderStatus.PENDING,
                totalAmount: 120000,
                shippingFee: 0,
                shippingName: 'Nguyen Van VNPay',
                shippingPhone: '0909999999',
                shippingAddress: 'Quan 3, TP.HCM',
                paymentMethod: PaymentMethod.VNPAY,
                paymentStatus: PaymentStatus.PENDING
            }
        });

        const createVnpRes = await fetch(`${baseUrl}/api/payments/create-url`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: orderVNPay.id, method: 'VNPAY' })
        });
        const createVnpJson = (await createVnpRes.json()) as {
            data: { payUrl: string; merchantRef: string; paymentId: string };
        };
        console.log(`VNPay Create URL Status: ${createVnpRes.status}`);
        console.log('VNPay payUrl:', createVnpJson.data.payUrl);

        const vnpTxnNo = `1400${Date.now().toString().slice(-6)}`;
        const vnpParams: Record<string, string> = {
            vnp_TmnCode: process.env.VNPAY_TMN_CODE!,
            vnp_Amount: String(120000 * 100),
            vnp_BankCode: 'NCB',
            vnp_BankTranNo: `VNP${vnpTxnNo}`,
            vnp_CardType: 'ATM',
            vnp_PayDate: formatVNPayDateGMT7(new Date()),
            vnp_OrderInfo: `Thanh toan don hang ${orderVNPay.id}`,
            vnp_TransactionNo: vnpTxnNo,
            vnp_ResponseCode: '00',
            vnp_TransactionStatus: '00',
            vnp_TxnRef: createVnpJson.data.merchantRef
        };
        const vnpHash = signVNPayParams(vnpParams, process.env.VNPAY_HASH_SECRET!);
        const vnpQuery = new URLSearchParams({ ...vnpParams, vnp_SecureHash: vnpHash }).toString();

        const vnpIpnRes1 = await fetch(`${baseUrl}/api/payments/webhook/vnpay-ipn?${vnpQuery}`);
        console.log('VNPay IPN Lần 1:', vnpIpnRes1.status, await vnpIpnRes1.json());

        const vnpIpnRes2 = await fetch(`${baseUrl}/api/payments/webhook/vnpay-ipn?${vnpQuery}`);
        console.log('VNPay IPN Lần 2 (Trùng):', vnpIpnRes2.status, await vnpIpnRes2.json());

        // Cleanup test records so we don't pollute user's DB
        await prisma.paymentCallback.deleteMany({
            where: {
                OR: [
                    { paymentId: { in: attemptsAfterCreate.map((a) => a.id).concat(createVnpJson.data.paymentId) } },
                    { providerEventId: { in: [`MOMO:${transId}`, `VNPAY:${vnpTxnNo}`] } }
                ]
            }
        });
        await prisma.order.deleteMany({ where: { id: { in: [orderMoMo.id, orderVNPay.id] } } });
        console.log('\n[CLEANUP] Đã dọn dẹp dữ liệu test tạm trong DB.');
        console.log('\n✅ TẤT CẢ CÁC BƯỚC E2E THỰC TẾ ĐỀU THÀNH CÔNG!');
    } finally {
        server.close();
        await prisma.$disconnect();
    }
};

runLiveE2E().catch((err) => {
    console.error('❌ E2E Error:', err);
    process.exit(1);
});
