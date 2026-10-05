'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { api, fmtWhen } from '@/lib/client';

interface Project { id: string; name: string; status: string; store_name: string; shop_domain: string; product_count: number; pushed_count: number; updated_at: string }
interface Store { id: string; name: string; shop_domain: string }

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects)).catch((e) => setErr(e.message));
    api<{ stores: Store[] }>('/api/stores').then((r) => { setStores(r.stores); if (r.stores.length && !storeId) setStoreId(r.stores[0].id); }).catch(() => {});
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr(''); setCreating(true);
    try {
      const r = await api<{ id: string }>('/api/projects', { method: 'POST', json: { name, store_id: storeId } });
      router.push(`/projects/${r.id}`);
    } catch (e) { setErr((e as Error).message); setCreating(false); }
  }

  return (
    <AppShell>
      <div className="page-head"><h1>Projects</h1></div>
      {err && <div className="alert alert-bad">{err}</div>}
      <div className="card">
        <h2>New project</h2>
        {stores.length === 0 ? (
          <p className="muted" style={{ marginTop: 6 }}>Connect a store first: <Link href="/stores">Stores</Link>.</p>
        ) : (
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" style={{ maxWidth: 320 }} placeholder="Project name (e.g. Diwali store)" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="select" style={{ maxWidth: 280 }} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.shop_domain})</option>)}
            </select>
            <button className="btn btn-primary" disabled={!name.trim() || !storeId || creating} onClick={create}><Plus size={14} /> Create</button>
          </div>
        )}
      </div>
      <div className="card">
        <h2>All projects</h2>
        {projects.length === 0 && <p className="muted" style={{ marginTop: 6 }}>Nothing yet.</p>}
        {projects.length > 0 && (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Project</th><th>Store</th><th>Products</th><th>Updated</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/projects/${p.id}`}><b>{p.name}</b></Link></td>
                  <td>{p.store_name} <span className="muted small mono">{p.shop_domain}</span></td>
                  <td>{p.product_count} <span className="muted small">({p.pushed_count} in Shopify)</span></td>
                  <td className="small">{fmtWhen(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
