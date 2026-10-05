// AI banner images through OpenRouter's chat completions with image output (same key as the text
// models). The model gets the brief and, optionally, one product photo to build on; the answer
// carries the image as a data URL in message.images[0].image_url.url. One image per call.
import { aiBase, aiReady, imageModel } from './models';

export const IMAGE_COST_USD = 0.04;   // rough, for the bill column (Gemini 2.5 Flash Image class models)

export interface ImageResult { buffer: Buffer; mime: string; model: string; ms: number }

export async function generateImage(prompt: string, inputImage?: { buffer: Buffer; mime: string }): Promise<ImageResult> {
  if (!aiReady()) throw new Error('AI_API_KEY is not set');
  const model = imageModel();
  const content: unknown[] = [{ type: 'text', text: prompt }];
  if (inputImage) content.push({ type: 'image_url', image_url: { url: `data:${inputImage.mime};base64,${inputImage.buffer.toString('base64')}` } });
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(`${aiBase()}/chat/completions`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}`, 'HTTP-Referer': 'https://merchantbuild.in', 'X-Title': 'Shopify Builder' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], modalities: ['image', 'text'] }),
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Image model answered ${res.status}: ${text.slice(0, 200)}`);
  let json: { choices?: { message?: { images?: { image_url?: { url?: string } }[]; content?: string } }[] };
  try { json = JSON.parse(text); } catch { throw new Error('Image model sent something that is not JSON'); }
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url || '';
  const m = url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error(`The model sent no image${json.choices?.[0]?.message?.content ? `: ${String(json.choices[0].message.content).slice(0, 160)}` : ''}`);
  return { buffer: Buffer.from(m[2], 'base64'), mime: m[1], model, ms: Date.now() - t0 };
}

// The banner brief: the style sheet's colours and tone, the slot's purpose, no text unless asked
// (text in generated images often comes out wrong; the theme writes the heading itself).
export function bannerPrompt(slot: string, custom: string, style: { palette: { primary: string; background: string; accent: string }; tone: string } | null, withText: boolean): string {
  const purpose: Record<string, string> = {
    hero: 'a wide home page hero banner, 16:9, the product as the hero, space on one side for a heading',
    hero_mobile: 'a tall mobile hero banner, 4:5, the product centred, space at the bottom for a heading',
    offer: 'a slim promotional strip, 3:1, festive, product small on one side',
    about: 'a warm lifestyle image for an about / story section, 4:3',
    logo: 'a simple flat logo mark on a plain background, 1:1, no photo',
  };
  const slotLine = purpose[slot] || (slot.startsWith('collection') ? 'a square collection tile image, 1:1, the product group styled on a clean background' : 'a store banner image');
  return [
    `Create ${slotLine}, for an Indian online store. Photorealistic product photography style, soft studio light, clean composition.`,
    style ? `Brand colours: ${style.palette.primary} (primary), ${style.palette.accent} (accent), ${style.palette.background} (background). Mood: ${style.tone.slice(0, 200)}` : '',
    custom ? `Extra instructions: ${custom.slice(0, 400)}` : '',
    withText ? 'Any text must be short, correctly spelled English, and exactly as instructed.' : 'No text, no letters, no watermark, no logo in the image.',
    'If a product photo is given, keep that exact product, its colours and details; restyle only the scene.',
  ].filter(Boolean).join(' ');
}
