import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

export type GeminiRecommendation = {
    recommendedQuantity: number;
    recommendedSupplierId: string;
    confidence: number;
    reasoning: string;
    emailDraft: string;
};

export type GeminiUsageMetrics = {
    modelName: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    inputPricePer1MUsd: number;
    outputPricePer1MUsd: number;
    estimatedCostUsd: number;
    latencyMs: number;
};

export const GEMINI_PRICING_USD_PER_1M: Readonly<Record<string, { input: number; output: number }>> = Object.freeze({
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
});

export const geminiService = {
    resolvePricing(modelName = env.GEMINI_MODEL || 'gemini-1.5-flash'): { input: number; output: number } {
        const base = GEMINI_PRICING_USD_PER_1M[modelName] ?? GEMINI_PRICING_USD_PER_1M['gemini-1.5-flash']!;
        const input = typeof env.GEMINI_INPUT_PRICE_PER_1M_USD === 'number' && Number.isFinite(env.GEMINI_INPUT_PRICE_PER_1M_USD) && env.GEMINI_INPUT_PRICE_PER_1M_USD >= 0
            ? env.GEMINI_INPUT_PRICE_PER_1M_USD
            : base.input;
        const output = typeof env.GEMINI_OUTPUT_PRICE_PER_1M_USD === 'number' && Number.isFinite(env.GEMINI_OUTPUT_PRICE_PER_1M_USD) && env.GEMINI_OUTPUT_PRICE_PER_1M_USD >= 0
            ? env.GEMINI_OUTPUT_PRICE_PER_1M_USD
            : base.output;
        return { input, output };
    },

    estimateCost(
        usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null,
        modelName = env.GEMINI_MODEL || 'gemini-1.5-flash',
        latencyMs = 0
    ): GeminiUsageMetrics {
        const promptTokens = typeof usage?.promptTokenCount === 'number' && Number.isFinite(usage.promptTokenCount) && usage.promptTokenCount >= 0
            ? Math.trunc(usage.promptTokenCount)
            : 0;
        const completionTokens = typeof usage?.candidatesTokenCount === 'number' && Number.isFinite(usage.candidatesTokenCount) && usage.candidatesTokenCount >= 0
            ? Math.trunc(usage.candidatesTokenCount)
            : 0;
        const totalTokens = typeof usage?.totalTokenCount === 'number' && Number.isFinite(usage.totalTokenCount) && usage.totalTokenCount >= 0
            ? Math.trunc(usage.totalTokenCount)
            : promptTokens + completionTokens;
        const pricing = this.resolvePricing(modelName);
        const estimatedCostUsd = Number((((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1_000_000).toFixed(8));
        return {
            modelName,
            promptTokens,
            completionTokens,
            totalTokens,
            inputPricePer1MUsd: pricing.input,
            outputPricePer1MUsd: pricing.output,
            estimatedCostUsd,
            latencyMs: Math.max(0, Math.round(latencyMs))
        };
    },

    async getRecommendationWithMetrics(prompt: string): Promise<{
        recommendation: GeminiRecommendation;
        metrics: GeminiUsageMetrics;
    }> {
        const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY1 || process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY3;
        const modelName = env.GEMINI_MODEL || 'gemini-1.5-flash';

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured in environment variables.');
        }

        let text: string;
        let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
        const startedAt = Date.now();
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            text = result.response.text();
            usageMetadata = (result.response as { usageMetadata?: typeof usageMetadata }).usageMetadata;
        } catch {
            // SDK errors can contain request URLs, credentials or provider content.
            throw new Error('Gemini request failed.');
        }
        const latencyMs = Date.now() - startedAt;

        // Parse JSON from text
        try {
            const cleanedText = this.cleanJsonText(text);
            const data = JSON.parse(cleanedText);
            if (!data || typeof data !== 'object' || Array.isArray(data)
                || typeof data.recommendedQuantity !== 'number' || !Number.isFinite(data.recommendedQuantity) || data.recommendedQuantity <= 0
                || typeof data.confidence !== 'number' || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1
                || typeof data.recommendedSupplierId !== 'string' || !data.recommendedSupplierId.trim()
                || typeof data.reasoning !== 'string' || !data.reasoning.trim()
                || typeof data.emailDraft !== 'string') {
                throw new Error('Invalid recommendation shape.');
            }
            return {
                recommendation: {
                    recommendedQuantity: data.recommendedQuantity,
                    recommendedSupplierId: data.recommendedSupplierId.trim(),
                    confidence: data.confidence,
                    reasoning: data.reasoning,
                    emailDraft: data.emailDraft
                },
                metrics: this.estimateCost(usageMetadata, modelName, latencyMs)
            };
        } catch {
            throw new Error('Gemini response was not a valid recommendation.');
        }
    },

    async getRecommendation(prompt: string): Promise<GeminiRecommendation> {
        const { recommendation } = await this.getRecommendationWithMetrics(prompt);
        return recommendation;
    },

    cleanJsonText(text: string): string {
        let cleaned = text.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.substring(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.substring(0, cleaned.length - 3);
        }
        return cleaned.trim();
    }
};
