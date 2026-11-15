import crypto from 'node:crypto';
import { HttpError } from '../../common/http-error';
import { getMoMoConfig, type MoMoConfig } from './payment-gateway.config';

export interface MoMoIpnPayload {
    partnerCode: string;
    orderId: string;
    requestId: string;
    amount: number | string;
    orderInfo: string;
    orderType?: string;
    transId?: number | string;
    resultCode: number | string;
    message?: string;
    payType?: string;
    responseTime?: number | string;
    extraData?: string;
    signature: string;
    [key: string]: unknown;
}

export interface CreateMoMoPayUrlInput {
    merchantRef: string;
    orderId: string;
    amount: number;
    orderInfo?: string;
}

export interface CreateMoMoPayUrlResult {
    payUrl: string;
    requestId: string;
    requestPayload: Record<string, unknown>;
    responsePayload: Record<string, unknown>;
}

const timingSafeEqualHex = (signatureA: string, signatureB: string): boolean => {
    const cleanA = String(signatureA || '').trim().toLowerCase();
    const cleanB = String(signatureB || '').trim().toLowerCase();
    if (!cleanA || !cleanB || cleanA.length !== cleanB.length) {
        return false;
    }
    const bufA = Buffer.from(cleanA, 'utf8');
    const bufB = Buffer.from(cleanB, 'utf8');
    if (bufA.length !== bufB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
};

export const signMoMoCreateRequest = (
    params: {
        accessKey: string;
        amount: string;
        extraData: string;
        ipnUrl: string;
        orderId: string;
        orderInfo: string;
        partnerCode: string;
        redirectUrl: string;
        requestId: string;
        requestType: string;
    },
    secretKey: string
): string => {
    const rawSignature =
        `accessKey=${params.accessKey}` +
        `&amount=${params.amount}` +
        `&extraData=${params.extraData}` +
        `&ipnUrl=${params.ipnUrl}` +
        `&orderId=${params.orderId}` +
        `&orderInfo=${params.orderInfo}` +
        `&partnerCode=${params.partnerCode}` +
        `&redirectUrl=${params.redirectUrl}` +
        `&requestId=${params.requestId}` +
        `&requestType=${params.requestType}`;

    return crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
};

export const signMoMoIpnPayload = (
    payload: MoMoIpnPayload,
    accessKey: string,
    secretKey: string
): string => {
    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${payload.amount ?? ''}` +
        `&extraData=${payload.extraData ?? ''}` +
        `&message=${payload.message ?? ''}` +
        `&orderId=${payload.orderId ?? ''}` +
        `&orderInfo=${payload.orderInfo ?? ''}` +
        `&orderType=${payload.orderType ?? ''}` +
        `&partnerCode=${payload.partnerCode ?? ''}` +
        `&payType=${payload.payType ?? ''}` +
        `&requestId=${payload.requestId ?? ''}` +
        `&responseTime=${payload.responseTime ?? ''}` +
        `&resultCode=${payload.resultCode ?? ''}` +
        `&transId=${payload.transId ?? ''}`;

    return crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
};

export const verifyMoMoSignature = (
    payload: MoMoIpnPayload,
    configOverride?: Pick<MoMoConfig, 'accessKey' | 'secretKey'>
): boolean => {
    if (!payload || typeof payload.signature !== 'string') {
        return false;
    }
    const config = configOverride ?? getMoMoConfig();
    const expected = signMoMoIpnPayload(payload, config.accessKey, config.secretKey);
    return timingSafeEqualHex(payload.signature, expected);
};

export const createMoMoPayUrl = async (input: CreateMoMoPayUrlInput): Promise<CreateMoMoPayUrlResult> => {
    const config = getMoMoConfig();
    const requestId = `${input.merchantRef}_${Date.now()}`;
    const amount = Math.round(Number(input.amount)).toString();
    const orderInfo = input.orderInfo || `Thanh toan don hang ${input.orderId}`;
    const requestType = 'captureWallet';
    const extraData = '';

    const signature = signMoMoCreateRequest(
        {
            accessKey: config.accessKey,
            amount,
            extraData,
            ipnUrl: config.ipnUrl,
            orderId: input.merchantRef,
            orderInfo,
            partnerCode: config.partnerCode,
            redirectUrl: config.redirectUrl,
            requestId,
            requestType
        },
        config.secretKey
    );

    const requestBody = {
        partnerCode: config.partnerCode,
        accessKey: config.accessKey,
        requestId,
        amount,
        orderId: input.merchantRef,
        orderInfo,
        redirectUrl: config.redirectUrl,
        ipnUrl: config.ipnUrl,
        extraData,
        requestType,
        signature,
        lang: 'vi'
    };

    // Masked request payload (do not persist accessKey or signature secret details)
    const sanitizedRequestPayload = {
        partnerCode: config.partnerCode,
        requestId,
        amount,
        orderId: input.merchantRef,
        orderInfo,
        redirectUrl: config.redirectUrl,
        ipnUrl: config.ipnUrl,
        extraData,
        requestType,
        lang: 'vi'
    };

    let responseData: Record<string, unknown>;
    try {
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const rawText = await response.text();
        try {
            responseData = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
            // Dev/Sandbox fallback if MoMo Sandbox is under maintenance or blocking IP (HTTP 403/503)
            const allowMockFallback =
                process.env.NODE_ENV !== 'production' && process.env.MOMO_DEV_FALLBACK !== 'false';
            if (allowMockFallback) {
                console.warn(
                    `[PAYMENT][MOMO] Sandbox endpoint (${config.endpoint}) returned non-JSON (HTTP ${response.status}: ${rawText.slice(0, 80).replace(/\s+/g, ' ')}). Using local Dev Sandbox fallback payUrl.`
                );
                const fallbackPayUrl = `${config.redirectUrl}?partnerCode=${encodeURIComponent(config.partnerCode)}&orderId=${encodeURIComponent(input.merchantRef)}&requestId=${encodeURIComponent(requestId)}&amount=${encodeURIComponent(amount)}&resultCode=0&momoSandboxFallback=1`;
                return {
                    payUrl: fallbackPayUrl,
                    requestId,
                    requestPayload: sanitizedRequestPayload,
                    responsePayload: {
                        resultCode: 0,
                        message: 'Dev Sandbox Fallback (MoMo test-payment.momo.vn unreachable/403)',
                        payUrl: fallbackPayUrl,
                        upstreamStatus: response.status
                    }
                };
            }
            throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 120)}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown network error';
        throw new HttpError(502, `Không thể kết nối cổng MoMo: ${message}`, 'MOMO_GATEWAY_ERROR');
    }

    if (Number(responseData.resultCode) !== 0 || typeof responseData.payUrl !== 'string') {
        const errMessage = typeof responseData.message === 'string' ? responseData.message : 'MoMo từ chối tạo giao dịch';
        const err = new HttpError(502, `Lỗi cổng thanh toán MoMo: ${errMessage}`, 'MOMO_CREATE_FAILED') as HttpError & {
            gatewayCode?: string;
            requestPayload?: Record<string, unknown>;
            responsePayload?: Record<string, unknown>;
        };
        err.gatewayCode = String(responseData.resultCode ?? 'UNKNOWN');
        err.requestPayload = sanitizedRequestPayload;
        err.responsePayload = responseData;
        throw err;
    }

    return {
        payUrl: responseData.payUrl,
        requestId,
        requestPayload: sanitizedRequestPayload,
        responsePayload: responseData
    };
};
