
import OpenAI from 'openai';
import { env } from '../config/env';
import { INVENTORY_SYSTEM_PROMPT } from '../config/system-prompt';

export interface AgentRecommendation {
    recommendedQuantity: number;
    recommendedSupplierId: string;
    confidence: number;
    reasoning: string;
    emailDraft: string;
}

const API_BASE_URL = 'https://freemodel.in/v1';

export const geminiService = {
    async getRecommendation(
        prompt: string
    ): Promise<AgentRecommendation> {
        const apiKey =
            env.GEMINI_API_KEY 

        const modelName =
            process.env.GEMINI_MODEL ||
            env.GEMINI_MODEL;

        if (!apiKey) {
            throw new Error(
                'GEMINI_API_KEY is not configured.'
            );
        }

        if (!modelName) {
            throw new Error(
                'GEMINI_MODEL is not configured.'
            );
        }

        const client = new OpenAI({
            apiKey,
            baseURL: API_BASE_URL,
            timeout: 30000,
            maxRetries: 1
        });

        let responseText: string;

        try {
            const response =
                await client.chat.completions.create({
                    model: modelName,
                    messages: [
                        {
                            role: 'system',
                            content: INVENTORY_SYSTEM_PROMPT
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                });

            const content =
                response.choices[0]?.message?.content;

            if (typeof content !== 'string' ||
                !content.trim()) {
                throw new Error('Empty AI response.');
            }

            responseText = content;
        } catch {
            // Do not expose request headers, API keys,
            // provider response bodies, or raw prompts.
            throw new Error(
                'FreeModel request failed.'
            );
        }

        let data: unknown;

        try {
            data = JSON.parse(
                this.cleanJsonText(responseText)
            );
        } catch {
            throw new Error(
                'AI response was not valid JSON.'
            );
        }

        if (!this.isValidRecommendation(data)) {
            throw new Error(
                'AI response was not a valid recommendation.'
            );
        }

        return {
            recommendedQuantity: data.recommendedQuantity,
            recommendedSupplierId:
                data.recommendedSupplierId.trim(),
            confidence: data.confidence,
            reasoning: data.reasoning,
            emailDraft: data.emailDraft
        };
    },

    isValidRecommendation(
        data: unknown
    ): data is AgentRecommendation {
        if (
            data === null ||
            typeof data !== 'object' ||
            Array.isArray(data)
        ) {
            return false;
        }

        const value =
            data as Record<string, unknown>;

        return (
            typeof value.recommendedQuantity === 'number' &&
            Number.isFinite(value.recommendedQuantity) &&
            value.recommendedQuantity > 0 &&

            typeof value.recommendedSupplierId === 'string' &&
            value.recommendedSupplierId.trim().length > 0 &&

            typeof value.confidence === 'number' &&
            Number.isFinite(value.confidence) &&
            value.confidence >= 0 &&
            value.confidence <= 1 &&

            typeof value.reasoning === 'string' &&
            value.reasoning.trim().length > 0 &&

            typeof value.emailDraft === 'string'
        );
    },

    cleanJsonText(text: string): string {
        let cleaned = text.trim();

        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.substring(3);
        }

        if (cleaned.endsWith('```')) {
            cleaned = cleaned.substring(
                0,
                cleaned.length - 3
            );
        }

        return cleaned.trim();
    }
};
