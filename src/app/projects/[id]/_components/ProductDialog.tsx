'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/client';

export interface Product {
  id: string; handle: string; title: string; body_html: string; vendor: string; product_type: string; tags: string[]; option_names: string[];
  status: string; error: string | null; shopify_id: string | null; pushed_at: string | null; ai_described_at: string | null;
  variants: { id: string; options: string[]; sku: string; price: string; compare_at: string | null }[];
  images: { id: string; path: string; position: number; alt: string; source: string; source_url: string | null }[];
}

export default function ProductDialog({ projectId, product, onClose, onChange }: { projectId: string; product: Product; onClose: () => void; onChange: () => Promise<void> }) {
  const [p, setP] = useState<Product>(product);
  const [title, setTitle] = useState(product.title);
  const [body, setBody] = useState(product.body_html);
  const [vendor, setVendor] = useState(product.vendor);
  const [type, setType] = useState(product.product_type);
  const [tags, setTags] = useState(product.tags.join(', '));
  const [variants, setVariants] = useState(product.variants.map((v) => ({ ...v, compare_at: v.compare_at ?? '' })));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [over, setOver] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const dragId = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `/api/projects/${projectId}/products/${p.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function refresh() {
    const r = await api<{ products: Product[] }>(`/api/projects/${projectId}/products`);
    const np = r.products.find((x) => x.id === p.id);
    if (np) setP(np);
    await onChange();
  }

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      await api(base, { method: 'PATCH', json: { title, body_html: body, vendor, product_type: type, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), variants: variants.map((v) => ({ id: v.id, price: v.price, compare_at: v.compare_at === '' ? null : v.compare_at, sku: v.sku })) } });
      await refresh(); setMsg({ kind: 'ok', text: 'Saved' });
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy('');
  }
  async function describe() {
    setBusy('ai'); setMsg(null);
    try { const r = await api<{ body_html: string }>(`${base}/describe`, { method: 'POST' }); setBody(r.body_html); await refresh(); setMsg({ kind: 'ok', text: 'Description written. Edit it if you like, then Save.' }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy('');
  }
  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy('upload'); setMsg(null);
    try {
      const fd = new FormData(); list.forEach((f) => fd.append('files', f));
      const r = await api<{ added: unknown[]; problems: string[] }>(`${base}/images`, { method: 'POST', body: fd });
      if (r.problems.length) setMsg({ kind: 'bad', text: r.problems.join(' · ') });
      await refresh();
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  }
  async function removeImage(id: string) {
    await api(`${base}/images?image=${id}`, { method: 'DELETE' }); await refresh();
  }
  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = p.images.filter((i) => i.path).map((i) => i.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await api(`${base}/images`, { method: 'PATCH', json: { order: ids } }); await refresh();
  }
  async function remove() {
    if (!confirm(`Remove "${p.title}" from this project? If it is already in Shopify it stays there.`)) return;
    await api(base, { method: 'DELETE' }); await onChange(); onClose();
  }

  const photos = p.images.filter((i) => i.path);
  const pendingLinks = p.images.filter((i) => !i.path);
  const plain = body.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{p.title}</h2>
          {p.status === 'pushed' && <span className="chip chip-ok">In Shopify</span>}
          {p.status === 'error' && <span className="chip chip-bad" title={p.error || ''}>Error</span>}
          <button className="btn btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        {p.error && <div className="alert alert-bad small">Last publish: {p.error}</div>}
        {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}

        <label className="label">Photos (first = main photo; drag to reorder)</label>
        <div className="photos">
          {photos.map((im, i) => (
            <div key={im.id} className="photo" draggable onDragStart={() => { dragId.current = im.id; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragId.current) reorder(dragId.current, im.id); dragId.current = null; }}>
              <img src={`/uploads/${im.path}`} alt="" />
              {i === 0 && <span className="main">Main</span>}
              <button className="x" title="Remove" onClick={() => removeImage(im.id)}>×</button>
            </div>
          ))}
          {pendingLinks.map((im) => <div key={im.id} className="photo pending" title={im.source_url || ''}>{im.source === 'csv_failed' ? 'Link failed' : 'Fetching link…'}</div>)}
        </div>
        <div className={`dropzone ${over ? 'over' : ''}`} style={{ marginTop: 8 }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()}>
          {busy === 'upload' ? 'Uploading…' : 'Drop photos here, or click to choose (JPG / PNG / WebP, up to 15 MB each)'}
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>

        <div className="grid-2">
          <div><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label">Handle</label><input className="input mono" value={p.handle} disabled /></div>
          <div><label className="label">Type (collection)</label><input className="input" value={type} onChange={(e) => setType(e.target.value)} /></div>
          <div><label className="label">Vendor</label><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
        </div>
        <label className="label">Tags (comma separated)</label>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />

        <div className="row" style={{ marginTop: 10 }}>
          <label className="label" style={{ margin: 0 }}>Description</label>
          <div className="grow" />
          <button className="btn btn-sm" onClick={() => setShowHtml(!showHtml)}>{showHtml ? 'Plain view' : 'Edit HTML'}</button>
          <button className="btn btn-sm" disabled={busy === 'ai'} onClick={describe}><Sparkles size={12} /> {busy === 'ai' ? 'Writing…' : body.trim() ? 'AI: improve' : 'AI: write'}</button>
        </div>
        {showHtml
          ? <textarea className="textarea mono small" value={body} onChange={(e) => setBody(e.target.value)} />
          : <textarea className="textarea" value={plain} onChange={(e) => setBody(e.target.value.split('\n').filter((l) => l.trim()).map((l) => `<p>${l.trim()}</p>`).join(''))} placeholder="No description yet. Press AI: write, or type here." />}

        <label className="label">Variants and prices (INR)</label>
        <table>
          <thead><tr>{p.option_names.length ? p.option_names.map((n) => <th key={n}>{n}</th>) : <th>Variant</th>}<th>SKU</th><th>Price</th><th>Compare-at</th></tr></thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={v.id}>
                {p.option_names.length ? v.options.map((o, k) => <td key={k}>{o}</td>) : <td>Default</td>}
                <td><input className="input" value={v.sku} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))} /></td>
                <td><input className="input" style={{ width: 110 }} value={v.price} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} /></td>
                <td><input className="input" style={{ width: 110 }} value={v.compare_at} placeholder="—" onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, compare_at: e.target.value } : x))} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-danger btn-sm" onClick={remove}><Trash2 size={12} /> Remove from project</button>
          <div className="grow" />
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
