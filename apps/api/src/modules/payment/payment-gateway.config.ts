import { HttpError } from '../../common/http-error';
import { env } from '../../common/env';

export type MoMoConfig = {
    partnerCode: string;
    accessKey: string;
    secretKey: string;
    endpoint: string;
    redirectUrl: string;
    ipnUrl: string;
};

export type VNPayConfig = {
    tmnCode: string;
    hashSecret: string;
    url: string;
    returnUrl: string;
};

const requireGatewayEnv = (key: string): string => {
    const value = process.env[key]?.trim();
    if (!value) {
        throw new HttpError(500, `Cấu hình cổng thanh toán thiếu biến môi trường: ${key}`, 'PAYMENT_CONFIG_ERROR');
    }
    return value;
};

export const getMoMoConfig = (): MoMoConfig => {
    const clientUrl = (process.env.CLIENT_URL || env.clientUrl).replace(/\/+$/, '');
    const apiBaseUrl = (process.env.API_BASE_URL || env.apiBaseUrl).replace(/\/+$/, '');

    return {
        partnerCode: requireGatewayEnv('MOMO_PARTNER_CODE'),
        accessKey: requireGatewayEnv('MOMO_ACCESS_KEY'),
        secretKey: requireGatewayEnv('MOMO_SECRET_KEY'),
        endpoint: process.env.MOMO_ENDPOINT?.trim() || 'https://test-payment.momo.vn/v2/gateway/api/create',
        redirectUrl: `${clientUrl}/payment/result`,
        ipnUrl: `${apiBaseUrl}/api/payments/webhook/momo`
    };
};

export const getVNPayConfig = (): VNPayConfig => {
    const clientUrl = (process.env.CLIENT_URL || env.clientUrl).replace(/\/+$/, '');

    return {
        tmnCode: requireGatewayEnv('VNPAY_TMN_CODE'),
        hashSecret: requireGatewayEnv('VNPAY_HASH_SECRET'),
        url: process.env.VNPAY_URL?.trim() || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        returnUrl: process.env.VNPAY_RETURN_URL?.trim() || `${clientUrl}/payment/result`
    };
};
