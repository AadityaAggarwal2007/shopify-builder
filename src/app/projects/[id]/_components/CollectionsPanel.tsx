'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

interface Collection { id: string; handle: string; title: string; rule_kind: string; rule_value: string; enabled: boolean; status: string; error: string | null; count: number }

// Collections proposed from Type (one each) and Tags (used by 2+ products). Tick the ones to make.
export default function CollectionsPanel({ projectId }: { projectId: string }) {
  const [cols, setCols] = useState<Collection[]>([]);
  const load = useCallback(() => api<{ collections: Collection[] }>(`/api/projects/${projectId}/collections`).then((r) => setCols(r.collections)).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function toggle(c: Collection) {
    await api(`/api/projects/${projectId}/collections`, { method: 'PATCH', json: { id: c.id, enabled: !c.enabled } }); load();
  }
  async function rename(c: Collection, title: string) {
    if (!title.trim() || title === c.title) return;
    await api(`/api/projects/${projectId}/collections`, { method: 'PATCH', json: { id: c.id, title } }); load();
  }
  if (!cols.length) return null;
  return (
    <div className="card">
      <h2>3. Collections</h2>
      <p className="muted small">Made from the Type and the Tags in the CSV. Products fall into them by themselves. Untick what you do not want.</p>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th></th><th>Collection</th><th>Rule</th><th>Products</th><th>Status</th></tr></thead>
        <tbody>
          {cols.map((c) => (
            <tr key={c.id}>
              <td><input type="checkbox" checked={c.enabled} onChange={() => toggle(c)} /></td>
              <td><input className="input" defaultValue={c.title} onBlur={(e) => rename(c, e.target.value)} /></td>
              <td className="small">{c.rule_kind === 'type' ? 'Type' : 'Tag'} = {c.rule_value}</td>
              <td>{c.count}</td>
              <td>{c.status === 'pushed' ? <span className="chip chip-ok">In Shopify</span> : c.status === 'error' ? <span className="chip chip-bad" title={c.error || ''}>Error</span> : <span className="chip">Draft</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
