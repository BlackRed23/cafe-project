import crypto from 'node:crypto';
import { getVNPayConfig, type VNPayConfig } from './payment-gateway.config';

export interface VNPayIpnQuery {
    vnp_TmnCode?: string;
    vnp_Amount?: string;
    vnp_BankCode?: string;
    vnp_BankTranNo?: string;
    vnp_CardType?: string;
    vnp_PayDate?: string;
    vnp_OrderInfo?: string;
    vnp_TransactionNo?: string;
    vnp_ResponseCode?: string;
    vnp_TransactionStatus?: string;
    vnp_TxnRef?: string;
    vnp_SecureHashType?: string;
    vnp_SecureHash?: string;
    [key: string]: string | undefined;
}

export interface CreateVNPayUrlInput {
    merchantRef: string;
    orderId: string;
    amount: number;
    ipAddr?: string;
    orderInfo?: string;
    now?: Date;
    expiresAt?: Date;
}

export interface CreateVNPayUrlResult {
    payUrl: string;
    requestPayload: Record<string, string>;
}

const removeVietnameseAccents = (str: string): string => {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

export const formatVNPayDateGMT7 = (date: Date): string => {
    const gmt7Ms = date.getTime() + 7 * 60 * 60 * 1000;
    const gmt7 = new Date(gmt7Ms);
    const yyyy = gmt7.getUTCFullYear().toString();
    const MM = String(gmt7.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(gmt7.getUTCDate()).padStart(2, '0');
    const HH = String(gmt7.getUTCHours()).padStart(2, '0');
    const mm = String(gmt7.getUTCMinutes()).padStart(2, '0');
    const ss = String(gmt7.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
};

const encodeVNPayValue = (value: string): string => {
    return encodeURIComponent(value).replace(/%20/g, '+');
};

export const buildVNPaySignData = (params: Record<string, string | undefined>): string => {
    const keys = Object.keys(params)
        .filter((key) => {
            const val = params[key];
            return (
                key !== 'vnp_SecureHash' &&
                key !== 'vnp_SecureHashType' &&
                val !== undefined &&
                val !== null &&
                val !== ''
            );
        })
        .sort();

    return keys.map((key) => `${encodeURIComponent(key)}=${encodeVNPayValue(String(params[key]))}`).join('&');
};

export const signVNPayParams = (params: Record<string, string | undefined>, hashSecret: string): string => {
    const signData = buildVNPaySignData(params);
    return crypto.createHmac('sha512', hashSecret).update(Buffer.from(signData, 'utf-8')).digest('hex');
};

export const verifyVNPaySignature = (
    query: VNPayIpnQuery,
    configOverride?: Pick<VNPayConfig, 'hashSecret'>
): boolean => {
    const receivedHash = query?.vnp_SecureHash;
    if (!receivedHash || typeof receivedHash !== 'string') {
        return false;
    }
    const config = configOverride ?? getVNPayConfig();
    const expectedHash = signVNPayParams(query, config.hashSecret);

    const cleanReceived = receivedHash.trim().toLowerCase();
    const cleanExpected = expectedHash.trim().toLowerCase();
    if (!cleanReceived || cleanReceived.length !== cleanExpected.length) {
        return false;
    }

    const bufA = Buffer.from(cleanReceived, 'utf8');
    const bufB = Buffer.from(cleanExpected, 'utf8');
    if (bufA.length !== bufB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
};

export const createVNPayUrl = (input: CreateVNPayUrlInput): CreateVNPayUrlResult => {
    const config = getVNPayConfig();
    const now = input.now ?? new Date();
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + 15 * 60 * 1000);
    const vnpAmount = Math.round(Number(input.amount) * 100).toString();
    const rawOrderInfo = input.orderInfo || `Thanh toan don hang ${input.orderId}`;
    const orderInfo = removeVietnameseAccents(rawOrderInfo) || `Thanh toan don hang ${input.orderId}`;
    const ipAddr = input.ipAddr || '127.0.0.1';

    const vnpParams: Record<string, string> = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: config.tmnCode,
        vnp_Amount: vnpAmount,
        vnp_CurrCode: 'VND',
        vnp_TxnRef: input.merchantRef,
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: 'other',
        vnp_Locale: 'vn',
        vnp_ReturnUrl: config.returnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: formatVNPayDateGMT7(now),
        vnp_ExpireDate: formatVNPayDateGMT7(expiresAt)
    };

    const signData = buildVNPaySignData(vnpParams);
    const secureHash = signVNPayParams(vnpParams, config.hashSecret);
    const payUrl = `${config.url}?${signData}&vnp_SecureHash=${encodeURIComponent(secureHash)}`;

    return {
        payUrl,
        requestPayload: vnpParams
    };
};
