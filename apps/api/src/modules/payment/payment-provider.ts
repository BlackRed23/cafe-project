import crypto from 'node:crypto';
import { Prisma, PaymentMethod } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { getMoMoConfig, getVNPayConfig } from './payment-gateway.config';
import { formatVNPayDateGMT7 } from './vnpay.gateway';

export type ProviderOutcome = 'PAID' | 'FAILED' | 'UNKNOWN';
export interface ProviderQueryResult {
    outcome: ProviderOutcome;
    code: string;
    providerTxnId: string | null;
    evidence: Record<string, string | number | null>;
}

const hmac = (algorithm: 'sha256' | 'sha512', key: string, raw: string) =>
    crypto.createHmac(algorithm, key).update(raw, 'utf8').digest('hex');

const safeHashEquals = (actual: unknown, expected: string): boolean => {
    if (typeof actual !== 'string' || !/^[a-f0-9]+$/i.test(actual) || actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(actual.toLowerCase()), Buffer.from(expected.toLowerCase()));
};

const postProvider = async (url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && endpoint.hostname === '127.0.0.1')) {
        throw new HttpError(500, 'Provider endpoint phải sử dụng HTTPS.', 'PAYMENT_CONFIG_ERROR');
    }
    const res = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(31000)
    });
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}`);
    const raw = await res.text();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Provider response invalid');
    return parsed as Record<string, unknown>;
};

const stringField = (obj: Record<string, unknown>, name: string) => String(obj[name] ?? '');
const integerEqual = (received: unknown, expected: Prisma.Decimal) =>
    /^\d+$/.test(String(received ?? '')) && new Prisma.Decimal(String(received)).eq(expected);

const vnpayResponseChecksum = (response: Record<string, unknown>, hashSecret: string): string => {
    const fields = ['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode',
        'vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo',
        'vnp_TransactionType','vnp_TransactionStatus','vnp_OrderInfo','vnp_PromotionCode','vnp_PromotionAmount'];
    return hmac('sha512', hashSecret, fields.map(field => stringField(response, field)).join('|'));
};

const vnpayEndpoint = () => process.env.VNPAY_API_URL?.trim() || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

export const queryProviderPayment = async (input: {
    method: PaymentMethod;
    merchantRef: string;
    amount: Prisma.Decimal;
    requestPayload: Prisma.JsonValue | null;
    providerTxnId: string | null;
}): Promise<ProviderQueryResult> => {
    if (input.method === PaymentMethod.MOMO) {
        const config = getMoMoConfig();
        const requestId = `Q${crypto.randomBytes(12).toString('hex')}`;
        const orderId = input.merchantRef;
        const signature = hmac('sha256', config.secretKey,
            `accessKey=${config.accessKey}&orderId=${orderId}&partnerCode=${config.partnerCode}&requestId=${requestId}`);
        const endpoint = new URL(config.endpoint);
        endpoint.pathname = '/v2/gateway/api/query';
        const response = await postProvider(endpoint.toString(), { partnerCode: config.partnerCode, orderId, requestId, lang: 'vi', signature });
        const code = stringField(response, 'resultCode');
        const transId = stringField(response, 'transId');
        const identityMatches = stringField(response, 'partnerCode') === config.partnerCode &&
            stringField(response, 'orderId') === orderId && stringField(response, 'requestId') === requestId;
        const amountMatches = integerEqual(response.amount, input.amount);
        const paid = identityMatches && amountMatches && code === '0' && /^\d+$/.test(transId) && transId !== '0';
        const failed = identityMatches && new Set(['1001','1002','1003','1004','1005','1006','1007','1017','1026']).has(code);
        return {
            outcome: paid ? 'PAID' : failed ? 'FAILED' : 'UNKNOWN', code,
            providerTxnId: paid ? `MOMO:${transId}` : null,
            evidence: { provider: 'MOMO', merchantRef: orderId, requestId, code, amountVerified: amountMatches ? 1 : 0,
                identityVerified: identityMatches ? 1 : 0, transId: paid ? transId : null }
        };
    }
    if (input.method !== PaymentMethod.VNPAY) throw new HttpError(409, 'Chỉ hỗ trợ đối soát thanh toán online.');
    const config = getVNPayConfig();
    const source = input.requestPayload && typeof input.requestPayload === 'object' && !Array.isArray(input.requestPayload)
        ? input.requestPayload as Record<string, unknown> : {};
    const originalDate = String(source.vnp_CreateDate ?? '');
    if (!/^\d{14}$/.test(originalDate)) throw new HttpError(409, 'Thiếu ngày tạo VNPay gốc để tra cứu giao dịch.');
    const now = formatVNPayDateGMT7(new Date());
    const request: Record<string, string> = {
        vnp_RequestId: crypto.randomBytes(16).toString('hex'), vnp_Version: '2.1.0', vnp_Command: 'querydr',
        vnp_TmnCode: config.tmnCode, vnp_TxnRef: input.merchantRef, vnp_TransactionDate: originalDate,
        vnp_CreateDate: now, vnp_IpAddr: '127.0.0.1', vnp_OrderInfo: 'Payment reconciliation'
    };
    request.vnp_SecureHash = hmac('sha512', config.hashSecret,
        ['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TxnRef','vnp_TransactionDate',
            'vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'].map(f => request[f]).join('|'));
    const response = await postProvider(vnpayEndpoint(), request);
    const code = stringField(response, 'vnp_ResponseCode');
    const status = stringField(response, 'vnp_TransactionStatus');
    const amountMatches = integerEqual(response.vnp_Amount, input.amount.mul(100));
    const signatureVerified = safeHashEquals(response.vnp_SecureHash, vnpayResponseChecksum(response, config.hashSecret));
    const identityVerified = stringField(response, 'vnp_TmnCode') === config.tmnCode &&
        stringField(response, 'vnp_TxnRef') === input.merchantRef && stringField(response, 'vnp_Command') === 'querydr';
    const transactionNo = stringField(response, 'vnp_TransactionNo');
    const paid = signatureVerified && identityVerified && amountMatches && code === '00' && status === '00' && /^\d+$/.test(transactionNo) && transactionNo !== '0';
    const failed = signatureVerified && identityVerified && code === '00' && status === '02';
    return {
        outcome: paid ? 'PAID' : failed ? 'FAILED' : 'UNKNOWN', code: `${code}:${status}`,
        providerTxnId: paid ? `VNPAY:${transactionNo}` : null,
        evidence: { provider: 'VNPAY', merchantRef: input.merchantRef, requestId: request.vnp_RequestId,
            code, status, signatureVerified: signatureVerified ? 1 : 0, identityVerified: identityVerified ? 1 : 0,
            amountVerified: amountMatches ? 1 : 0, transId: paid ? transactionNo : null }
    };
};

export type ProviderRefundResult = {
    outcome: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    code: string;
    providerRefundId: string | null;
    evidence: Record<string, string | number | null>;
};

export const submitProviderRefund = async (input: {
    method: PaymentMethod;
    merchantRef: string;
    providerTxnId: string;
    refundId: string;
    amount: Prisma.Decimal;
    originalAmount: Prisma.Decimal;
    requestPayload: Prisma.JsonValue | null;
}): Promise<ProviderRefundResult> => {
    if (input.method === PaymentMethod.MOMO) {
        const config = getMoMoConfig();
        const transId = input.providerTxnId.replace(/^MOMO:/, '');
        if (!/^\d+$/.test(transId)) throw new HttpError(409, 'Thiếu mã giao dịch MoMo đã xác thực.');
        const orderId = input.refundId; const requestId = input.refundId;
        const amount = input.amount.toFixed(0);
        const description = 'Refund approved';
        const signature = hmac('sha256', config.secretKey,
            `accessKey=${config.accessKey}&amount=${amount}&description=${description}&orderId=${orderId}` +
            `&partnerCode=${config.partnerCode}&requestId=${requestId}&transId=${transId}`);
        const endpoint = new URL(config.endpoint); endpoint.pathname = '/v2/gateway/api/refund';
        const response = await postProvider(endpoint.toString(), {
            partnerCode: config.partnerCode, orderId, requestId, amount: Number(amount),
            transId: Number(transId), lang: 'vi', description, signature
        });
        const code = stringField(response, 'resultCode');
        const match = stringField(response, 'partnerCode') === config.partnerCode &&
            stringField(response, 'orderId') === orderId && stringField(response, 'requestId') === requestId &&
            integerEqual(response.amount, input.amount);
        const refundTxnId = stringField(response, 'transId');
        const success = match && code === '0' && /^\d+$/.test(refundTxnId) && refundTxnId !== '0';
        const terminalFailed = match && new Set(['1080','1081','1088']).has(code);
        return { outcome: success ? 'SUCCEEDED' : terminalFailed ? 'FAILED' : 'UNKNOWN',
            code, providerRefundId: match && code === '0' && /^\d+$/.test(refundTxnId) ? `MOMO:${refundTxnId}` : null,
            evidence: { provider: 'MOMO', refundId: orderId, code, identityVerified: match ? 1 : 0 } };
    }
    if (input.method !== PaymentMethod.VNPAY) throw new HttpError(409, 'Phương thức chưa hỗ trợ hoàn tiền tự động.');
    const config = getVNPayConfig();
    const source = input.requestPayload && typeof input.requestPayload === 'object' && !Array.isArray(input.requestPayload)
        ? input.requestPayload as Record<string, unknown> : {};
    const originalDate = String(source.vnp_CreateDate ?? '');
    const transactionNo = input.providerTxnId.replace(/^VNPAY:/, '');
    if (!/^\d{14}$/.test(originalDate) || !/^\d+$/.test(transactionNo)) throw new HttpError(409, 'Thiếu dữ liệu giao dịch VNPay gốc.');
    const request: Record<string, string> = {
        vnp_RequestId: input.refundId.slice(0, 32), vnp_Version: '2.1.0', vnp_Command: 'refund',
        vnp_TmnCode: config.tmnCode, vnp_TransactionType: input.amount.eq(input.originalAmount) ? '02' : '03',
        vnp_TxnRef: input.merchantRef, vnp_Amount: input.amount.mul(100).toFixed(0), vnp_TransactionNo: transactionNo,
        vnp_TransactionDate: originalDate, vnp_CreateBy: 'payment-system',
        vnp_CreateDate: formatVNPayDateGMT7(new Date()), vnp_IpAddr: '127.0.0.1', vnp_OrderInfo: 'Approved refund'
    };
    request.vnp_SecureHash = hmac('sha512', config.hashSecret,
        ['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TransactionType','vnp_TxnRef',
            'vnp_Amount','vnp_TransactionNo','vnp_TransactionDate','vnp_CreateBy','vnp_CreateDate',
            'vnp_IpAddr','vnp_OrderInfo'].map(f => request[f]).join('|'));
    const response = await postProvider(vnpayEndpoint(), request);
    const code = stringField(response, 'vnp_ResponseCode');
    const trusted = safeHashEquals(response.vnp_SecureHash, vnpayResponseChecksum(response, config.hashSecret)) &&
        stringField(response, 'vnp_TmnCode') === config.tmnCode && stringField(response, 'vnp_TxnRef') === input.merchantRef &&
        stringField(response, 'vnp_Command') === 'refund' && integerEqual(response.vnp_Amount, input.amount.mul(100));
    const status = stringField(response, 'vnp_TransactionStatus');
    const outcome = trusted && code === '00' && status === '00' ? 'SUCCEEDED' : trusted && code !== '00' ? 'FAILED' : 'UNKNOWN';
    return { outcome, code: `${code}:${status}`, providerRefundId: outcome === 'SUCCEEDED' ? `VNPAY:${stringField(response, 'vnp_TransactionNo')}` : null,
        evidence: { provider: 'VNPAY', refundId: input.refundId, code, status, signatureVerified: trusted ? 1 : 0 } };
};

/** A missing response is never evidence that a refund failed. Query before retry. */
export const queryProviderRefund = async (input: {
    method: PaymentMethod; refundId: string; amount: Prisma.Decimal;
}): Promise<ProviderRefundResult> => {
    if (input.method !== PaymentMethod.MOMO) {
        throw new HttpError(409, 'VNPay không hỗ trợ xác định refundId qua QueryDR; cần bằng chứng từ phía nhà cung cấp.');
    }
    const config = getMoMoConfig();
    const requestId = `RQ${crypto.randomBytes(12).toString('hex')}`;
    const signature = hmac('sha256', config.secretKey,
        `accessKey=${config.accessKey}&orderId=${input.refundId}&partnerCode=${config.partnerCode}&requestId=${requestId}`);
    const endpoint = new URL(config.endpoint);
    endpoint.pathname = '/v2/gateway/api/refund/query';
    const response = await postProvider(endpoint.toString(), {
        partnerCode: config.partnerCode, requestId, orderId: input.refundId, lang: 'vi', signature
    });
    const identity = stringField(response, 'partnerCode') === config.partnerCode &&
        stringField(response, 'requestId') === requestId;
    const code = stringField(response, 'resultCode');
    const transactions = Array.isArray(response.refundTrans) ? response.refundTrans : [];
    const match = transactions.find(item => item && typeof item === 'object' &&
        (item as Record<string, unknown>).orderId === input.refundId) as Record<string, unknown> | undefined;
    const amountVerified = !!match && integerEqual(match.amount, input.amount);
    const txnId = match ? stringField(match, 'transId') : '';
    const success = identity && code === '0' && amountVerified && stringField(match!, 'resultCode') === '0' &&
        /^\d+$/.test(txnId) && txnId !== '0';
    return {
        outcome: success ? 'SUCCEEDED' : 'UNKNOWN', code: `${code}:${match ? stringField(match, 'resultCode') : 'NO_MATCH'}`,
        providerRefundId: success ? `MOMO:${txnId}` : null,
        evidence: { provider: 'MOMO', refundId: input.refundId, requestId, code, identityVerified: identity ? 1 : 0,
            amountVerified: amountVerified ? 1 : 0, matched: match ? 1 : 0 }
    };
};
