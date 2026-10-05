'use client';
import { useCallback, useEffect, useState } from 'react';
import { Rocket } from 'lucide-react';
import { api, fmtWhen } from '@/lib/client';
import type { Product } from './ProductDialog';

interface LogItem { kind: string; handle?: string; ok: boolean; message: string }
interface Run { id: string; step: string; started_at: string; finished_at: string | null; ok_count: number; fail_count: number; log: LogItem[] }

export default function PublishPanel({ projectId, products, onDone }: { projectId: string; products: Product[]; onDone: () => void }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; log: LogItem[] } | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api<{ runs: Run[] }>(`/api/projects/${projectId}/runs`).then((r) => setRuns(r.runs)).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);

  const drafts = products.filter((p) => p.status !== 'pushed').length;
  const noPhoto = products.filter((p) => !p.images.some((i) => i.path)).length;

  async function publish(onlyChanged: boolean) {
    const ids = onlyChanged ? products.filter((p) => p.status !== 'pushed').map((p) => p.id) : [];
    if (!confirm(onlyChanged ? `Send ${ids.length} changed product(s) to Shopify?` : `Send all ${products.length} products to Shopify? Products already there are updated, nothing is duplicated.`)) return;
    setBusy(true); setErr(''); setResult(null);
    try {
      const r = await api<{ ok: number; fail: number; log: LogItem[] }>(`/api/projects/${projectId}/publish`, { method: 'POST', json: { product_ids: ids } });
      setResult(r);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false); load(); onDone();
  }

  return (
    <div className="card">
      <div className="row">
        <div>
          <h2>4. Publish products</h2>
          <p className="muted small">Products, their photos and the ticked collections go to the store and are published to the Online Store. Press again after changes: same handle = update, never a duplicate.</p>
        </div>
        <div className="grow" />
        <button className="btn" disabled={busy || drafts === 0} onClick={() => publish(true)}>Changed only ({drafts})</button>
        <button className="btn btn-primary" disabled={busy || products.length === 0} onClick={() => publish(false)}><Rocket size={14} /> {busy ? 'Publishing…' : 'Publish all'}</button>
      </div>
      {noPhoto > 0 && <div className="alert alert-warn small">{noPhoto} product(s) have no photo. They are sent anyway; add photos and publish again later.</div>}
      {busy && <div className="alert alert-warn">Talking to Shopify… this can take a minute for a big catalogue. Keep this tab open.</div>}
      {err && <div className="alert alert-bad">{err}</div>}
      {result && (
        <>
          <div className={`alert ${result.fail ? 'alert-warn' : 'alert-ok'}`}>{result.ok} OK, {result.fail} failed.</div>
          <div className="log">{result.log.map((l, i) => <div key={i} className={l.ok ? 'ok' : 'bad'}>{l.ok ? '✓' : '✗'} {l.handle ? `[${l.handle}] ` : ''}{l.message}</div>)}</div>
        </>
      )}
      {runs.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="muted small" style={{ cursor: 'pointer' }}>Earlier runs ({runs.length})</summary>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>When</th><th>Step</th><th>OK</th><th>Failed</th></tr></thead>
            <tbody>{runs.map((r) => <tr key={r.id}><td className="small">{fmtWhen(r.started_at)}</td><td>{r.step}</td><td>{r.ok_count}</td><td>{r.fail_count}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}
