// Files the tool holds (product photos, banners, logos) live OUTSIDE the repo in UPLOADS_DIR and are
// public at /uploads/<path>: that is the URL Shopify downloads. Names are random; nothing a visitor
// could guess. Every image is re-encoded with sharp (strips EXIF, caps the size), so a bad file never
// reaches the disk as it came.
import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_SIDE = 4096;          // Shopify's limit is 4472 x 4472 / 20 MP
export const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
}

export interface Stored { path: string; width: number; height: number; bytes: number; mime: string }

// Returns the relative path (projectId/<random>.<ext>). Throws a plain Error with a message for the screen.
export async function storeImage(projectId: string, buf: Buffer, declaredMime: string): Promise<Stored> {
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error('Image is bigger than 15 MB');
  let img = sharp(buf, { failOn: 'error' });
  let meta: sharp.Metadata;
  try { meta = await img.metadata(); } catch { throw new Error('Not an image file'); }
  const fmt = meta.format;
  if (!fmt || !['jpeg', 'png', 'webp', 'gif'].includes(fmt)) throw new Error(`Unsupported image type (${declaredMime || fmt || 'unknown'})`);
  if ((meta.width || 0) > MAX_SIDE || (meta.height || 0) > MAX_SIDE) img = img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  img = img.rotate(); // honour EXIF orientation, then drop EXIF
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  const out = fmt === 'jpeg' ? await img.jpeg({ quality: 88 }).toBuffer() : fmt === 'png' ? await img.png().toBuffer() : fmt === 'webp' ? await img.webp({ quality: 88 }).toBuffer() : await img.gif().toBuffer();
  const final = await sharp(out).metadata();
  const rel = `${projectId}/${randomBytes(12).toString('base64url')}.${ext}`;
  const abs = path.join(uploadsDir(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, out);
  return { path: rel, width: final.width || 0, height: final.height || 0, bytes: out.length, mime: `image/${fmt}` };
}

export async function removeStored(rel: string): Promise<void> {
  const abs = path.join(uploadsDir(), rel);
  if (!abs.startsWith(uploadsDir())) return;
  try { await unlink(abs); } catch { /* already gone */ }
}

// Fetch a picture from a link (the CSV's Image Src, or a banner link) and store it. 20 s, 15 MB.
export async function storeFromUrl(projectId: string, url: string): Promise<Stored> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a link');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'ShopifyBuilder/1.0' } });
    if (!res.ok) throw new Error(`Link answered ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_UPLOAD_BYTES) throw new Error('Image is bigger than 15 MB');
    const buf = Buffer.from(await res.arrayBuffer());
    return await storeImage(projectId, buf, res.headers.get('content-type') || '');
  } finally {
    clearTimeout(t);
  }
}

export async function storedExists(rel: string): Promise<boolean> {
  try { await stat(path.join(uploadsDir(), rel)); return true; } catch { return false; }
}
