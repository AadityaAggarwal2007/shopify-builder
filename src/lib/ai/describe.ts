// "AI description": a product description from the title, type, tags, options and whatever the CSV
// already said. English, INR store, no invented facts (no materials, sizes, delivery days or prices
// the input does not carry). Returns HTML with <p> and one <ul> at most.
import { askText, estimateCost } from './models';
import { query } from '@/lib/db';

export const DESCRIBE_SYSTEM = `You write product descriptions for an Indian online store (English, prices in INR).
Rules:
- Use ONLY the facts given. Never invent materials, sizes, weights, delivery times, warranties, discounts or prices.
- If the input already has a description, improve its grammar and flow and keep every fact in it.
- Tone: warm, clear, confident; no hype words like "best ever", no emojis, no exclamation marks.
- Length: 60 to 140 words. Output HTML only: two or three <p>, optionally one <ul> with 3 to 5 <li> for features that are in the facts.
- Never mention the store name, the vendor name or that this text was written by AI.
- Output the HTML only, no code fences, no title.`;

export interface DescribeInput { title: string; productType: string; tags: string[]; optionNames: string[]; optionValues: string[]; currentHtml: string; storeNotes?: string }

export function describePrompt(p: DescribeInput): string {
  const lines = [
    `Title: ${p.title}`,
    p.productType ? `Type: ${p.productType}` : '',
    p.tags.length ? `Tags: ${p.tags.join(', ')}` : '',
    p.optionNames.length ? `Options: ${p.optionNames.map((n, i) => `${n} (${p.optionValues[i] || ''})`).join('; ')}` : '',
    p.currentHtml ? `Current description (keep its facts):\n${p.currentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)}` : 'Current description: none',
    p.storeNotes ? `Store notes: ${p.storeNotes}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// Keep only harmless tags; drop anything the model should not have produced.
export function cleanHtml(html: string): string {
  let s = html.replace(/```[a-z]*\n?/gi, '').trim();
  s = s.replace(/<(?!\/?(p|ul|li|strong|em|br)\b)[^>]*>/gi, '');
  s = s.replace(/\son\w+="[^"]*"/gi, '');
  if (!/<p>/i.test(s)) s = `<p>${s}</p>`;
  return s.trim();
}

export async function describeProduct(projectId: string, p: DescribeInput): Promise<string> {
  const a = await askText(DESCRIBE_SYSTEM, describePrompt(p), { temperature: 0.6, maxTokens: 600 });
  query(`INSERT INTO ai_runs (project_id, kind, model, prompt_tokens, output_tokens, cost_usd, ms, ok) VALUES ($1, 'describe', $2, $3, $4, $5, $6, true)`,
    [projectId, a.model, a.promptTokens, a.outputTokens, estimateCost(a.model, a.promptTokens, a.outputTokens), a.ms]).catch(() => {});
  return cleanHtml(a.text);
}
