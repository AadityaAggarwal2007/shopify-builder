'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import { api } from '@/lib/client';
import type { Counts } from '../page';
import ProductDialog, { type Product } from './ProductDialog';
import CollectionsPanel from './CollectionsPanel';
import PublishPanel from './PublishPanel';

interface Problem { row: number; handle: string; message: string }

export default function ProductsStep({ projectId, counts, onChange }: { projectId: string; counts: Counts | null; onChange: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState<Product | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string; problems?: Problem[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState<number | null>(null);
  const [describing, setDescribing] = useState<string>('');
  const [filter, setFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<{ products: Product[] }>(`/api/projects/${projectId}/products`).then((r) => setProducts(r.products)).catch((e) => setMsg({ kind: 'bad', text: e.message })), [projectId]);
  useEffect(() => { load(); }, [load]);

  // CSV image links are fetched in batches until none are left.
  const fetchImages = useCallback(async () => {
    setFetching(0);
    try {
      for (let i = 0; i < 400; i++) {
        const r = await api<{ done: number; failed: number; remaining: number }>(`/api/projects/${projectId}/images/fetch`, { method: 'POST' });
        setFetching(r.remaining);
        if (r.remaining === 0) break;
      }
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setFetching(null); load(); onChange();
  }, [projectId, load, onChange]);
  useEffect(() => { if (counts && counts.pending_images > 0 && fetching === null) fetchImages(); }, [counts, fetching, fetchImages]);

  async function upload(file: File) {
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api<{ created: number; updated: number; variants: number; imageLinks: number; problems: Problem[] }>(`/api/projects/${projectId}/csv`, { method: 'POST', body: fd });
      setMsg({ kind: r.problems.length ? 'warn' : 'ok', text: `${r.created} new, ${r.updated} updated, ${r.variants} variants, ${r.imageLinks} photo links queued.`, problems: r.problems });
      await load(); onChange();
    } catch (e) {
      const err = e as Error & { data?: { problems?: Problem[] } };
      setMsg({ kind: 'bad', text: err.message, problems: err.data?.problems });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function describeAll() {
    setDescribing('Writing…');
    try {
      let total = 0;
      for (let i = 0; i < 200; i++) {
        const r = await api<{ done: number; remaining: number; problems: string[] }>(`/api/projects/${projectId}/describe`, { method: 'POST', json: { only_empty: true } });
        total += r.done; setDescribing(`Writing… ${total} done, ${r.remaining} left`);
        if (r.problems.length) { setMsg({ kind: 'bad', text: r.problems[0] }); break; }
        if (r.remaining === 0) break;
      }
      setMsg({ kind: 'ok', text: `AI wrote ${total} description(s).` });
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setDescribing(''); load(); onChange();
  }

  const shown = products.filter((p) => !filter || p.title.toLowerCase().includes(filter.toLowerCase()) || p.handle.includes(filter.toLowerCase()) || p.product_type.toLowerCase().includes(filter.toLowerCase()));
  const noDesc = products.filter((p) => p.body_html.replace(/<[^>]+>/g, '').trim().length < 40).length;

  return (
    <>
      <div className="card">
        <div className="row">
          <div>
            <h2>1. Products CSV</h2>
            <p className="muted small">Shopify's own product CSV (Products &gt; Export). Upload again any time: products are matched by handle, your photos and edits stay.</p>
          </div>
          <div className="grow" />
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload size={14} /> {uploading ? 'Reading…' : products.length ? 'Upload CSV again' : 'Upload CSV'}</button>
        </div>
        {msg && (
          <div className={`alert alert-${msg.kind}`}>
            {msg.text}
            {msg.problems && msg.problems.length > 0 && (
              <ul style={{ margin: '6px 0 0 18px' }} className="small">
                {msg.problems.slice(0, 30).map((p, i) => <li key={i}>{p.row ? `Row ${p.row}` : 'File'}{p.handle ? ` (${p.handle})` : ''}: {p.message}</li>)}
                {msg.problems.length > 30 && <li>…and {msg.problems.length - 30} more</li>}
              </ul>
            )}
          </div>
        )}
        {fetching !== null && <div className="alert alert-warn">Fetching photo links from the CSV… {fetching} left</div>}
      </div>

      {products.length > 0 && (
        <div className="card">
          <div className="row">
            <div>
              <h2>2. Photos and descriptions</h2>
              <p className="muted small">Click a product: drop photos, fix the price, write or improve the description. {counts ? `${counts.images} photos, ${counts.described} AI descriptions.` : ''}</p>
            </div>
            <div className="grow" />
            <input className="input" style={{ maxWidth: 220 }} placeholder="Find…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="btn" disabled={!!describing || noDesc === 0} onClick={describeAll} title="Writes a description for every product that has none"><Sparkles size={14} /> {describing || `AI descriptions (${noDesc} empty)`}</button>
          </div>
          <div className="pgrid" style={{ marginTop: 12 }}>
            {shown.map((p) => {
              const img = p.images.find((i) => i.path);
              const chip = p.status === 'pushed' ? <span className="chip chip-ok">In Shopify</span> : p.status === 'error' ? <span className="chip chip-bad">Error</span> : <span className="chip">Draft</span>;
              return (
                <div key={p.id} className="pcard" onClick={() => setOpen(p)}>
                  <div className="thumb">{img ? <img src={`/uploads/${img.path}`} alt="" loading="lazy" /> : <span>No photo</span>}</div>
                  <div className="body">
                    <div className="title">{p.title}</div>
                    <div className="meta"><span>₹{p.variants[0]?.price ?? '0'}{p.variants.length > 1 ? ` · ${p.variants.length} variants` : ''}</span><span>{p.images.filter((i) => i.path).length} 📷</span></div>
                    <div className="meta">{chip}{p.body_html.replace(/<[^>]+>/g, '').trim().length < 40 && <span className="chip chip-warn">No description</span>}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {products.length > 0 && <CollectionsPanel projectId={projectId} />}
      {products.length > 0 && <PublishPanel projectId={projectId} products={products} onDone={() => { load(); onChange(); }} />}

      {open && <ProductDialog projectId={projectId} product={open} onClose={() => setOpen(null)} onChange={async () => { await load(); onChange(); }} />}
    </>
  );
}
