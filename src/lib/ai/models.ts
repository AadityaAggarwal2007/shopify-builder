// OpenRouter through the openai SDK, like ShipTrack's ai-models.ts: a cheap model first, then the
// chain; only 401 / 403 stop the chain. Text and image models are separate env settings.
import OpenAI from 'openai';

export const TEXT_CHAIN = ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 'openai/gpt-4.1-mini'];
export const IMAGE_MODEL_DEFAULT = 'google/gemini-2.5-flash-image';

export function textModels(): string[] {
  const first = process.env.AI_TEXT_MODEL?.trim();
  return first ? [first, ...TEXT_CHAIN.filter((m) => m !== first)] : [...TEXT_CHAIN];
}
export function imageModel(): string {
  return process.env.AI_IMAGE_MODEL?.trim() || IMAGE_MODEL_DEFAULT;
}
export function aiBase(): string {
  return `${(process.env.CODEX_URL || 'https://openrouter.ai/api').replace(/\/$/, '')}/v1`;
}
export function aiReady(): boolean {
  return !!process.env.AI_API_KEY;
}
export function getClient(): OpenAI {
  return new OpenAI({ baseURL: aiBase(), apiKey: process.env.AI_API_KEY || 'missing', defaultHeaders: { 'HTTP-Referer': 'https://merchantbuild.in', 'X-Title': 'Shopify Builder' } });
}
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status !== 401 && status !== 403;
}

// Rough prices per million tokens (USD), for the bill column only.
const PRICE: Record<string, { in: number; out: number }> = {
  'deepseek/deepseek-v4-flash': { in: 0.06, out: 0.12 },
  'deepseek/deepseek-v4-pro': { in: 0.5, out: 1.5 },
  'openai/gpt-4.1-mini': { in: 0.4, out: 1.6 },
};
export function estimateCost(model: string, promptTokens: number, outputTokens: number): number {
  const p = PRICE[model] || { in: 1, out: 3 };
  return (promptTokens * p.in + outputTokens * p.out) / 1_000_000;
}

export interface TextAnswer { text: string; model: string; promptTokens: number; outputTokens: number; ms: number; finish: string }

// One text completion over the chain. temperature 0.5 by default; 40 s per model.
export async function askText(system: string, user: string, opts: { temperature?: number; maxTokens?: number; json?: boolean; timeoutMs?: number } = {}): Promise<TextAnswer> {
  if (!aiReady()) throw new Error('AI_API_KEY is not set');
  const client = getClient();
  let lastErr: unknown = null;
  for (const model of textModels()) {
    const t0 = Date.now();
    try {
      const body: Record<string, unknown> = {
        model, temperature: opts.temperature ?? 0.5, max_tokens: opts.maxTokens ?? 1200,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      };
      if (model.startsWith('deepseek/deepseek-v4')) body.reasoning = { enabled: false };
      if (opts.json) body.response_format = { type: 'json_object' };
      const res = await client.chat.completions.create(body as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming, { timeout: opts.timeoutMs ?? 40_000, maxRetries: 0 });
      const text = (res.choices?.[0]?.message?.content || '').trim();
      const finish = String(res.choices?.[0]?.finish_reason || '');
      if (!text) { lastErr = Object.assign(new Error(`${model}: blank answer`), { status: 502 }); continue; }
      if (finish === 'length') console.warn(`[ai] ${model}: answer cut off at ${opts.maxTokens ?? 1200} tokens`);
      return { text, model, promptTokens: res.usage?.prompt_tokens || 0, outputTokens: res.usage?.completion_tokens || 0, ms: Date.now() - t0, finish };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI did not answer');
}
