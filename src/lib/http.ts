import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest, type AuthUser } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function requireAuth(request: NextRequest | Request): AuthUser {
  const user = getAuthFromRequest(request);
  if (!user) throw new HttpError(401, 'Please sign in again');
  return user;
}

// Wraps a route handler: auth errors and HttpErrors become JSON answers, anything else a 500 with
// the message logged (never the stack to the screen).
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<NextResponse>) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message, ...(err.extra || {}) }, { status: err.status });
      const message = (err as Error)?.message || 'Something went wrong';
      console.error('[route]', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const fwd = (request.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || 'unknown';
}

export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
}

export const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
