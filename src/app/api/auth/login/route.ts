import { NextRequest, NextResponse } from 'next/server';
import { checkLogin, generateToken } from '@/lib/auth';
import { clientIp } from '@/lib/http';

// 10 wrong passwords per 15 minutes per address (one login, in memory, one process).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map<string, { n: number; until: number }>();

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    const key = clientIp(request);
    const e = fails.get(key);
    if (e && e.until > Date.now() && e.n >= MAX_FAILS) return NextResponse.json({ error: 'Too many wrong tries. Wait 15 minutes.' }, { status: 429 });
    const user = checkLogin(String(username), String(password));
    if (!user) {
      if (!e || e.until < Date.now()) fails.set(key, { n: 1, until: Date.now() + WINDOW_MS }); else e.n++;
      if (fails.size > 5000) fails.clear();
      return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
    }
    fails.delete(key);
    return NextResponse.json({ token: generateToken(user.username), user });
  } catch (err) {
    console.error('[auth] login failed:', (err as Error).message);
    return NextResponse.json({ error: 'Login is not set up (AUTH_TOKEN_SECRET / ADMIN_PASSWORD missing)' }, { status: 500 });
  }
}
