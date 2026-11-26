import { resolveLlmPlannerConfig } from './llm-planner.service';

export type LlmRecommendation = {
    recommendedQuantity: number;
    recommendedSupplierId: string;
    confidence: number;
    reasoning: string;
    emailDraft: string;
};

function cleanJsonText(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
    return cleaned.trim();
}

function validateRecommendation(raw: unknown): LlmRecommendation {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('LLM response was not a valid recommendation.');
    }
    const data = raw as Record<string, unknown>;
    if (typeof data.recommendedQuantity !== 'number' || !Number.isFinite(data.recommendedQuantity) || data.recommendedQuantity <= 0
        || typeof data.confidence !== 'number' || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1
        || typeof data.recommendedSupplierId !== 'string' || !data.recommendedSupplierId.trim()
        || typeof data.reasoning !== 'string' || !data.reasoning.trim()
        || typeof data.emailDraft !== 'string') {
        throw new Error('LLM response was not a valid recommendation.');
    }
    return {
        recommendedQuantity: data.recommendedQuantity,
        recommendedSupplierId: data.recommendedSupplierId.trim(),
        confidence: data.confidence,
        reasoning: data.reasoning,
        emailDraft: data.emailDraft
    };
}

async function requestRecommendation(prompt: string, config: Record<string, string | undefined>): Promise<string> {
    if (!prompt.trim() || prompt.length > 20000) throw new Error('INVALID_RECOMMENDATION_REQUEST');
    const resolved = resolveLlmPlannerConfig(config);
    const timeout = Number(config.LLM_TIMEOUT_MS || 30000);
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 120000) throw new Error('INVALID_LLM_TIMEOUT');
    const instruction = 'Return only one JSON object with recommendedQuantity, recommendedSupplierId, confidence, reasoning, and emailDraft. Do not add fields or markdown.';
    let response: Response;
    try {
        if (resolved.provider === 'anthropic') {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST', signal: AbortSignal.timeout(timeout),
                headers: { 'x-api-key': resolved.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                body: JSON.stringify({ model: resolved.model, max_tokens: 1024, system: instruction,
                    messages: [{ role: 'user', content: prompt }] })
            });
        } else {
            const baseUrl = resolved.baseUrl!;
            response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST', signal: AbortSignal.timeout(timeout),
                headers: { authorization: `Bearer ${resolved.key}`, 'content-type': 'application/json' },
                body: JSON.stringify({ model: resolved.model,
                    messages: [{ role: 'system', content: instruction }, { role: 'user', content: prompt }],
                    ...(config.LLM_STRUCTURED_OUTPUT === 'json_object' ? { response_format: { type: 'json_object' } } : {}) })
            });
        }
    } catch {
        throw new Error('LLM recommendation request failed.');
    }
    if (!response.ok) throw new Error('LLM recommendation request failed.');
    let body: unknown;
    try { body = await response.json(); } catch { throw new Error('LLM recommendation response was invalid.'); }
    if (resolved.provider === 'anthropic') {
        const content = (body as { content?: unknown })?.content;
        const text = Array.isArray(content) ? content.find(block => block && typeof block === 'object'
            && (block as { type?: unknown }).type === 'text') as { text?: unknown } | undefined : undefined;
        if (typeof text?.text !== 'string') throw new Error('LLM recommendation response was invalid.');
        return text.text;
    }
    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('LLM recommendation response was invalid.');
    return content;
}

export const llmRecommendationService = {
    async getRecommendation(prompt: string, config: Record<string, string | undefined> = process.env): Promise<LlmRecommendation> {
        const text = await requestRecommendation(prompt, config);
        try {
            return validateRecommendation(JSON.parse(cleanJsonText(text)));
        } catch {
            throw new Error('LLM response was not a valid recommendation.');
        }
    }
};
