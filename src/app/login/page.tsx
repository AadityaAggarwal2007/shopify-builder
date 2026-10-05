'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hammer } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); setBusy(false); return; }
      localStorage.setItem('builder_token', data.token);
      router.push('/projects');
    } catch {
      setError('Network error. Try again.'); setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 12 }}><Hammer size={20} /> <h1>Shopify Builder</h1></div>
        {error && <div className="alert alert-bad">{error}</div>}
        <label className="label">Username</label>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        <label className="label">Password</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
