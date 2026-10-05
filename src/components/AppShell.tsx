'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Hammer, LogOut } from 'lucide-react';
import { api, signOut, token } from '@/lib/client';

export interface Setup { dataKey: boolean; ai: boolean; shopifyApp: boolean }

// Checks the login once, draws the top bar, warns about missing server settings.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);

  useEffect(() => {
    if (!token()) { router.replace('/login'); return; }
    api<{ setup: Setup }>('/api/auth/session').then((r) => { setSetup(r.setup); setReady(true); }).catch(() => {});
  }, [router]);

  if (!ready) return <div className="page muted">Loading…</div>;
  const missing = setup ? [!setup.dataKey && 'BUILDER_DATA_KEY', !setup.ai && 'AI_API_KEY', !setup.shopifyApp && 'SHOPIFY_CLIENT_ID / SECRET'].filter(Boolean) : [];
  return (
    <>
      <header className="topbar">
        <Link href="/projects" className="brand"><Hammer size={18} /> Shopify Builder</Link>
        <nav>
          <Link href="/projects" className={pathname.startsWith('/projects') ? 'active' : ''}>Projects</Link>
          <Link href="/stores" className={pathname.startsWith('/stores') ? 'active' : ''}>Stores</Link>
        </nav>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={signOut}><LogOut size={14} /> Sign out</button>
      </header>
      <main className="page">
        {missing.length > 0 && <div className="alert alert-warn">Server settings missing in /etc/builder/.env: <b>{missing.join(', ')}</b>. Some steps will not work until they are set.</div>}
        {children}
      </main>
    </>
  );
}
