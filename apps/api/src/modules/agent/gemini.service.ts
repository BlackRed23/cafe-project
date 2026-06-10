import { GoogleGenerativeAI } from '@google/generative-ai';

export const geminiService = {
    async getRecommendation(prompt: string): Promise<{
        recommendedQuantity: number;
        recommendedSupplierId: string;
        confidence: number;
        reasoning: string;
        emailDraft: string;
    }> {
        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured in environment variables.');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Parse JSON from text
        const cleanedText = this.cleanJsonText(text);
        try {
            const data = JSON.parse(cleanedText);
            return {
                recommendedQuantity: Number(data.recommendedQuantity),
                recommendedSupplierId: String(data.recommendedSupplierId),
                confidence: Number(data.confidence),
                reasoning: String(data.reasoning),
                emailDraft: String(data.emailDraft)
            };
        } catch (err) {
            throw new Error(`Gemini response was not valid JSON. Response text: ${text}`);
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
