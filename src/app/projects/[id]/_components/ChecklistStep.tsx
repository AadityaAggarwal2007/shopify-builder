'use client';
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/client';

interface Item { key: string; title: string; why: string; url: string; done_at: string | null }

// Step 6: what the Admin API cannot set. Links straight into Shopify admin; the tool keeps the ticks.
export default function ChecklistStep({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const load = useCallback(() => api<{ items: Item[] }>(`/api/projects/${projectId}/checklist`).then((r) => setItems(r.items)).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);
  async function toggle(it: Item) { await api(`/api/projects/${projectId}/checklist`, { method: 'PATCH', json: { key: it.key, done: !it.done_at } }); load(); }
  const done = items.filter((i) => i.done_at).length;
  return (
    <div className="card">
      <h2>6. Checklist: by hand in Shopify</h2>
      <p className="muted small">Shopify gives no API for these. Open each link, do it, tick it. {items.length ? `${done} of ${items.length} done.` : ''}</p>
      <table style={{ marginTop: 8 }}>
        <tbody>
          {items.map((it) => (
            <tr key={it.key}>
              <td style={{ width: 30 }}><input type="checkbox" checked={!!it.done_at} onChange={() => toggle(it)} /></td>
              <td><b style={{ textDecoration: it.done_at ? 'line-through' : 'none' }}>{it.title}</b><div className="muted small">{it.why}</div></td>
              <td style={{ width: 120 }}><a className="btn btn-sm" href={it.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
