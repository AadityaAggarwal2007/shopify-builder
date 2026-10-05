// The one login (owner's answer: "sirf aap, ek password"): ADMIN_USERNAME + ADMIN_PASSWORD from the
// env, compared in constant time. Tokens are signed (HMAC-SHA256 with AUTH_TOKEN_SECRET, 32+ chars),
// live 7 days and travel as `Authorization: Bearer`. Without the secret nobody logs in (fail closed).
// Same shape as ShipTrack's src/lib/auth.ts without the team part.
import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

const TOKEN_VERSION = 'v1';
const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser { username: string }

function tokenSecret(): string | null {
  const s = process.env.AUTH_TOKEN_SECRET || '';
  return s.length >= 32 ? s : null;
}
function signature(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}
function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function generateToken(username: string, now = Date.now()): string {
  const secret = tokenSecret();
  if (!secret) throw new Error('AUTH_TOKEN_SECRET is missing or shorter than 32 characters');
  const payload = Buffer.from(JSON.stringify({ username, exp: now + TOKEN_LIFETIME_MS })).toString('base64url');
  const body = `${TOKEN_VERSION}.${payload}`;
  return `${body}.${signature(body, secret).toString('base64url')}`;
}

export function verifyToken(token: string, now = Date.now()): AuthUser | null {
  const secret = tokenSecret();
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const given = Buffer.from(parts[2], 'base64url');
  const expected = signature(`${parts[0]}.${parts[1]}`, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof p.exp !== 'number' || p.exp < now) return null;
    if (typeof p.username !== 'string' || !p.username) return null;
    // A token outlives a username change in the env only until it expires: refuse it at once.
    const env = process.env.ADMIN_USERNAME || '';
    if (!env || !sameText(p.username, env)) return null;
    return { username: p.username };
  } catch {
    return null;
  }
}

export function checkLogin(username: string, password: string): AuthUser | null {
  const u = process.env.ADMIN_USERNAME || '';
  const p = process.env.ADMIN_PASSWORD || '';
  if (!u || !p) return null;
  const okUser = sameText(username.trim(), u);
  const okPass = sameText(password, p);
  return okUser && okPass ? { username: u } : null;
}

export function getAuthFromRequest(request: NextRequest | Request): AuthUser | null {
  const h = request.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return verifyToken(h.slice(7));
}
