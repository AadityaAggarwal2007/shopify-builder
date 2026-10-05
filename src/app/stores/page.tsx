'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plug, RefreshCw, Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { api, fmtWhen, token } from '@/lib/client';

interface Store { id: string; name: string; shop_domain: string; scopes: string; connected_via: string; last_ok_at: string | null }

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [shop, setShop] = useState('');
  const [pasteShop, setPasteShop] = useState('');
  const [pasteToken, setPasteToken] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ stores: Store[] }>('/api/stores').then((r) => setStores(r.stores)).catch((e) => setMsg({ kind: 'bad', text: e.message })), []);
  useEffect(() => { load(); }, [load]);
  // The OAuth callback comes back here with ?connected=<name> or ?error=<text>.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('connected')) setMsg({ kind: 'ok', text: `Connected: ${sp.get('connected')}` });
    else if (sp.get('error')) setMsg({ kind: 'bad', text: sp.get('error') || '' });
    if (sp.toString()) window.history.replaceState(null, '', '/stores');
  }, []);

  function connect() {
    if (!shop.trim()) return;
    window.location.href = `/api/shopify/connect?shop=${encodeURIComponent(shop.trim())}&token=${encodeURIComponent(token())}`;
  }
  // The app's own client credentials: for a store of the same Shopify organization, no browser round trip.
  async function connectDirect() {
    if (!shop.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ shop: { name: string }; scope: string }>('/api/stores/direct', { method: 'POST', json: { shop: shop.trim() } });
      setMsg({ kind: 'ok', text: `Connected directly: ${r.shop.name}` }); setShop(''); load();
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(false);
  }
  async function paste() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ store: Store; shop: { name: string } }>('/api/stores', { method: 'POST', json: { shop: pasteShop, token: pasteToken } });
      setMsg({ kind: 'ok', text: `Connected: ${r.shop.name}` }); setPasteShop(''); setPasteToken(''); load();
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(false);
  }
  async function test(s: Store) {
    const r = await api<{ ok: boolean; error?: string; shop?: { name: string; plan: string } }>(`/api/stores/${s.id}`);
    setMsg(r.ok ? { kind: 'ok', text: `${s.name}: connection OK (${r.shop?.plan || 'plan ?'})` } : { kind: 'bad', text: `${s.name}: ${r.error}` });
    load();
  }
  async function remove(s: Store) {
    if (!confirm(`Forget ${s.name} in this tool? Nothing changes in Shopify.`)) return;
    try { await api(`/api/stores/${s.id}`, { method: 'DELETE' }); load(); } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
  }

  return (
    <AppShell>
      <div className="page-head"><h1>Stores</h1></div>
      {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}
      <div className="card">
        <h2>Connect a store</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>The Shopify app (Dev Dashboard, custom distribution) must be installed on the store. Press Connect, approve in Shopify, and you come back here.</p>
        <div className="row">
          <input className="input" style={{ maxWidth: 360 }} placeholder="mystore.myshopify.com" value={shop} onChange={(e) => setShop(e.target.value)} />
          <button className="btn btn-primary" onClick={connect}><Plug size={14} /> Connect with Shopify</button>
          <button className="btn" disabled={busy} onClick={connectDirect} title="Your own store (same Shopify organization as the app): no Shopify page, the app's credentials get the token">Connect directly</button>
        </div>
        <details style={{ marginTop: 14 }}>
          <summary className="muted small" style={{ cursor: 'pointer' }}>Old store with a legacy custom app? Paste its Admin API token instead</summary>
          <div className="grid-2" style={{ marginTop: 8 }}>
            <input className="input" placeholder="mystore.myshopify.com" value={pasteShop} onChange={(e) => setPasteShop(e.target.value)} />
            <input className="input" placeholder="shpat_…" value={pasteToken} onChange={(e) => setPasteToken(e.target.value)} />
          </div>
          <button className="btn" style={{ marginTop: 8 }} disabled={busy || !pasteShop || !pasteToken} onClick={paste}>Save token</button>
        </details>
      </div>
      <div className="card">
        <h2>Connected</h2>
        {stores.length === 0 && <p className="muted" style={{ marginTop: 6 }}>No store yet.</p>}
        {stores.length > 0 && (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Store</th><th>Domain</th><th>Via</th><th>Last OK</th><th></th></tr></thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td className="mono small">{s.shop_domain}</td>
                  <td>{s.connected_via === 'oauth' ? 'Shopify app' : s.connected_via === 'client_credentials' ? 'Direct (auto-renews)' : 'Pasted token'}</td>
                  <td className="small">{fmtWhen(s.last_ok_at) || '—'}</td>
                  <td className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm" onClick={() => test(s)}><RefreshCw size={12} /> Test</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s)}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
