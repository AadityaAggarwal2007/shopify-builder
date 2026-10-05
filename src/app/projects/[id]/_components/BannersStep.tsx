'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Sparkles, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/client';

interface Banner { id: string; path: string; slot: string; description: string; source: string; width: number | null; height: number | null }
interface State { slots: string[]; banners: Banner[]; products: { id: string; title: string; path: string }[] }
const LABEL: Record<string, string> = { logo: 'Logo', hero: 'Hero banner (desktop, wide)', hero_mobile: 'Hero banner (mobile, tall)', offer: 'Offer strip', about: 'About / story image', collection_1: 'Collection tile 1', collection_2: 'Collection tile 2', collection_3: 'Collection tile 3', collection_4: 'Collection tile 4' };

// Step 3: one image per slot: upload, paste a link, or let the AI make it from a product photo.
export default function BannersStep({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [open, setOpen] = useState<string>('');            // slot with the AI / link panel open
  const [prompt, setPrompt] = useState('');
  const [link, setLink] = useState('');
  const [productId, setProductId] = useState('');
  const [withText, setWithText] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef('');
  const load = useCallback(() => api<State>(`/api/projects/${projectId}/banners`).then(setSt).catch((e) => setMsg({ kind: 'bad', text: e.message })), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function upload(slot: string, file: File) {
    setBusy(slot); setMsg(null);
    try { const fd = new FormData(); fd.append('slot', slot); fd.append('file', file); await api(`/api/projects/${projectId}/banners`, { method: 'POST', body: fd }); setMsg({ kind: 'ok', text: `${LABEL[slot]} uploaded.` }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(''); load(); onChange();
  }
  async function fromLink(slot: string) {
    setBusy(slot); setMsg(null);
    try { await api(`/api/projects/${projectId}/banners`, { method: 'POST', json: { slot, url: link } }); setMsg({ kind: 'ok', text: `${LABEL[slot]} fetched from the link.` }); setLink(''); setOpen(''); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(''); load(); onChange();
  }
  async function fromAi(slot: string) {
    setBusy(slot); setMsg(null);
    try { await api(`/api/projects/${projectId}/banners`, { method: 'POST', json: { slot, ai: true, prompt, product_id: productId || undefined, with_text: withText } }); setMsg({ kind: 'ok', text: `${LABEL[slot]} made by AI (about ₹3-4). Not happy? Generate again with a better instruction.` }); setOpen(''); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(''); load(); onChange();
  }
  async function remove(slot: string) {
    await api(`/api/projects/${projectId}/banners?slot=${slot}`, { method: 'DELETE' }); load(); onChange();
  }

  if (!st) return <div className="card muted">Loading…</div>;
  return (
    <>
      <div className="card">
        <h2>3. Banners and logo</h2>
        <p className="muted small">One image per slot. Upload your own, paste a link, or let the AI make one from a product photo. The Theme step puts them in the home page (hero, offer strip, collection tiles). Skip what you do not need.</p>
        {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && upload(slotRef.current, e.target.files[0])} />
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Slot</th><th>Image</th><th></th></tr></thead>
          <tbody>
            {st.slots.map((slot) => {
              const b = st.banners.find((x) => x.slot === slot);
              return (
                <tr key={slot}>
                  <td style={{ width: 220 }}><b>{LABEL[slot] || slot}</b>{b && <div className="muted small">{b.source === 'ai' ? 'AI' : b.source === 'link' ? 'From link' : 'Uploaded'}{b.width ? ` · ${b.width}×${b.height}` : ''}</div>}</td>
                  <td style={{ width: 260 }}>{b ? <img src={`/uploads/${b.path}`} alt="" style={{ maxWidth: 240, maxHeight: 120, borderRadius: 6, border: '1px solid var(--border)' }} /> : <span className="muted small">empty</span>}</td>
                  <td>
                    <div className="row">
                      <button className="btn btn-sm" disabled={busy === slot} onClick={() => { slotRef.current = slot; fileRef.current?.click(); }}><Upload size={12} /> Upload</button>
                      <button className="btn btn-sm" disabled={busy === slot} onClick={() => { setOpen(open === `link:${slot}` ? '' : `link:${slot}`); setLink(''); }}><Link2 size={12} /> Link</button>
                      <button className="btn btn-sm" disabled={busy === slot} onClick={() => { setOpen(open === `ai:${slot}` ? '' : `ai:${slot}`); setPrompt(''); setProductId(st.products[0]?.id || ''); }}><Sparkles size={12} /> {busy === slot ? 'Working…' : 'AI'}</button>
                      {b && <button className="btn btn-sm btn-danger" onClick={() => remove(slot)}><Trash2 size={12} /></button>}
                    </div>
                    {open === `link:${slot}` && (
                      <div className="row" style={{ marginTop: 8 }}>
                        <input className="input" style={{ maxWidth: 420 }} placeholder="https://… (Drive share links do not work; use a direct image link)" value={link} onChange={(e) => setLink(e.target.value)} />
                        <button className="btn btn-sm btn-primary" disabled={!link.trim() || busy === slot} onClick={() => fromLink(slot)}>Fetch</button>
                      </div>
                    )}
                    {open === `ai:${slot}` && (
                      <div style={{ marginTop: 8, maxWidth: 620 }}>
                        <label className="label" style={{ marginTop: 0 }}>Product photo to build on (optional)</label>
                        <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                          <option value="">None (AI invents the scene)</option>
                          {st.products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <label className="label">What should it look like? (optional)</label>
                        <input className="input" placeholder="e.g. festive Diwali mood, marigold flowers, warm gold light" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                        <label className="row small" style={{ marginTop: 6 }}><input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} /> Allow text in the image (usually better to let the theme write the heading)</label>
                        <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} disabled={busy === slot} onClick={() => fromAi(slot)}><Sparkles size={12} /> {busy === slot ? 'Generating… (20-60 s)' : 'Generate (~₹3-4)'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
