import dotenv from 'dotenv';
import { signMoMoIpnPayload, type MoMoIpnPayload } from '../src/modules/payment/momo.gateway';
import { signVNPayParams, formatVNPayDateGMT7 } from '../src/modules/payment/vnpay.gateway';

dotenv.config();

type CliArgs = {
    provider: 'momo' | 'vnpay';
    merchantRef: string;
    amount: number;
    resultCode: string;
    transId: string;
    apiUrl: string;
};

const parseArgs = (): CliArgs => {
    const args = process.argv.slice(2);
    const map: Record<string, string> = {};
    for (const arg of args) {
        const [k, v] = arg.replace(/^--/, '').split('=');
        if (k && v !== undefined) {
            map[k] = v;
        }
    }

    const provider = (map.provider?.toLowerCase() === 'vnpay' ? 'vnpay' : 'momo') as 'momo' | 'vnpay';
    const merchantRef = map.merchantRef || map.orderId || 'order_demo_1';
    const amount = Number(map.amount || 50000);
    const resultCode = map.resultCode ?? (provider === 'momo' ? '0' : '00');
    const transId = map.transId || `${Date.now()}`;
    const port = process.env.PORT || '5000';
    const apiUrl = (map.apiUrl || `http://localhost:${port}`).replace(/\/+$/, '');

    return { provider, merchantRef, amount, resultCode, transId, apiUrl };
};

const run = async () => {
    if (process.env.NODE_ENV === 'production') {
        console.error('Refusing to run webhook simulation in production environment.');
        process.exit(1);
    }

    const cli = parseArgs();

    if (cli.provider === 'momo') {
        const partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMO_PARTNER_TEST';
        const accessKey = process.env.MOMO_ACCESS_KEY;
        const secretKey = process.env.MOMO_SECRET_KEY;

        if (!accessKey || !secretKey) {
            console.error('Missing MOMO_ACCESS_KEY or MOMO_SECRET_KEY in .env');
            process.exit(1);
        }

        const unsignedPayload: MoMoIpnPayload = {
            partnerCode,
            orderId: cli.merchantRef,
            requestId: `${cli.merchantRef}_${Date.now()}`,
            amount: cli.amount,
            orderInfo: `Thanh toan don hang ${cli.merchantRef}`,
            orderType: 'momo_wallet',
            transId: cli.transId,
            resultCode: Number(cli.resultCode),
            message: Number(cli.resultCode) === 0 ? 'Successful.' : 'Transaction failed.',
            payType: 'qr',
            responseTime: Date.now(),
            extraData: '',
            signature: ''
        };

        unsignedPayload.signature = signMoMoIpnPayload(unsignedPayload, accessKey, secretKey);

        const endpoint = `${cli.apiUrl}/api/payments/webhook/momo`;
        console.log(`[SIMULATE][MOMO] POST ${endpoint}`);
        console.log('Payload:', JSON.stringify(unsignedPayload, null, 2));

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(unsignedPayload)
        });
        const text = await res.text();
        console.log(`[SIMULATE][MOMO] Status: ${res.status}`, text);
        return;
    }

    // VNPay IPN simulation
    const tmnCode = process.env.VNPAY_TMN_CODE || 'VNPAY_TEST';
    const hashSecret = process.env.VNPAY_HASH_SECRET;
    if (!hashSecret) {
        console.error('Missing VNPAY_HASH_SECRET in .env');
        process.exit(1);
    }

    const params: Record<string, string> = {
        vnp_TmnCode: tmnCode,
        vnp_Amount: String(Math.round(cli.amount * 100)),
        vnp_BankCode: 'NCB',
        vnp_BankTranNo: `VNP${cli.transId}`,
        vnp_CardType: 'ATM',
        vnp_PayDate: formatVNPayDateGMT7(new Date()),
        vnp_OrderInfo: `Thanh toan don hang ${cli.merchantRef}`,
        vnp_TransactionNo: cli.transId,
        vnp_ResponseCode: cli.resultCode,
        vnp_TransactionStatus: cli.resultCode,
        vnp_TxnRef: cli.merchantRef
    };

    const secureHash = signVNPayParams(params, hashSecret);
    const query = new URLSearchParams({ ...params, vnp_SecureHash: secureHash }).toString();
    const endpoint = `${cli.apiUrl}/api/payments/webhook/vnpay-ipn?${query}`;

    console.log(`[SIMULATE][VNPAY] GET ${endpoint}`);
    const res = await fetch(endpoint, { method: 'GET' });
    const body = await res.text();
    console.log(`[SIMULATE][VNPAY] Status: ${res.status}`, body);
};

run().catch((err) => {
    console.error('[SIMULATE] Error:', err);
    process.exit(1);
});
