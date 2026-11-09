import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

export const geminiService = {
    async getRecommendation(prompt: string): Promise<{
        recommendedQuantity: number;
        recommendedSupplierId: string;
        confidence: number;
        reasoning: string;
        emailDraft: string;
    }> {
        const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY1 || process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY3;
        const modelName = env.GEMINI_MODEL || 'gemini-1.5-flash';

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured in environment variables.');
        }

        let text: string;
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            text = result.response.text();
        } catch {
            // SDK errors can contain request URLs, credentials or provider content.
            throw new Error('Gemini request failed.');
        }

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
                recommendedQuantity: data.recommendedQuantity,
                recommendedSupplierId: data.recommendedSupplierId.trim(),
                confidence: data.confidence,
                reasoning: data.reasoning,
                emailDraft: data.emailDraft
            };
        } catch {
            throw new Error('Gemini response was not a valid recommendation.');
        }
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
