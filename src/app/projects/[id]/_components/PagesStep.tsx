'use client';
import { useCallback, useEffect, useState } from 'react';
import { Rocket, Save, Sparkles } from 'lucide-react';
import { api } from '@/lib/client';

interface Facts { store_name: string; email: string; phone: string; whatsapp: string; address: string; city: string; state: string; country: string; gst: string; shipping_days: string; shipping_charge: string; free_shipping_above: string; cod: boolean; return_window_days: string; returns_for: string; about: string }
interface Page { id: string; kind: string; handle: string; title: string; body_html: string; status: string; error: string | null }
interface State { facts: Facts; has_style: boolean; pages: Page[]; kinds: { handle: string; kind: string; title: string }[] }
interface LogItem { kind: string; handle?: string; ok: boolean; message: string }

// Step 5: the owner's facts -> AI drafts of About, Contact, FAQ + the 4 policies -> edit -> publish
// (pages, shop policies, main menu + footer menu).
export default function PagesStep({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [open, setOpen] = useState<string>('');
  const [edit, setEdit] = useState<{ title: string; body: string }>({ title: '', body: '' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [log, setLog] = useState<LogItem[] | null>(null);
  const load = useCallback(() => api<State>(`/api/projects/${projectId}/pages`).then((r) => { setSt(r); setFacts((f) => f || r.facts); }).catch((e) => setMsg({ kind: 'bad', text: e.message })), [projectId]);
  useEffect(() => { load(); }, [load]);

  const f = (k: keyof Facts, v: string | boolean) => setFacts((x) => (x ? { ...x, [k]: v } : x));
  async function saveFacts() {
    setBusy('facts'); setMsg(null);
    try { await api(`/api/projects/${projectId}/pages`, { method: 'POST', json: { action: 'facts', facts } }); setMsg({ kind: 'ok', text: 'Facts saved.' }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy('');
  }
  async function draft() {
    setBusy('draft'); setMsg(null);
    try { await api(`/api/projects/${projectId}/pages`, { method: 'POST', json: { action: 'facts', facts } }); const r = await api<{ pages: unknown[] }>(`/api/projects/${projectId}/pages`, { method: 'POST', json: { action: 'draft' } }); setMsg({ kind: 'ok', text: `${r.pages.length} pages drafted. Open each, read, fix, Save. Then Publish.` }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(''); load(); onChange();
  }
  function openPage(p: Page) { setOpen(p.handle); setEdit({ title: p.title, body: p.body_html }); }
  async function savePage() {
    setBusy('save');
    try { await api(`/api/projects/${projectId}/pages`, { method: 'PATCH', json: { handle: open, title: edit.title, body_html: edit.body } }); setMsg({ kind: 'ok', text: 'Page saved.' }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(''); load();
  }
  async function publish() {
    if (!confirm('Send the pages, the 4 policies and the menus to the store? Existing pages with the same handles are updated.')) return;
    setBusy('publish'); setMsg(null); setLog(null);
    try { const r = await api<{ ok: number; fail: number; log: LogItem[] }>(`/api/projects/${projectId}/pages`, { method: 'POST', json: { action: 'publish' } }); setLog(r.log); setMsg({ kind: r.fail ? 'warn' : 'ok', text: `${r.ok} OK, ${r.fail} failed.` }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy(''); load(); onChange();
  }

  if (!st || !facts) return <div className="card muted">Loading…</div>;
  const In = ({ k, label, ph, w }: { k: keyof Facts; label: string; ph?: string; w?: number }) => (
    <div style={w ? { maxWidth: w } : undefined}><label className="label">{label}</label><input className="input" placeholder={ph} value={String(facts[k] ?? '')} onChange={(e) => f(k, e.target.value)} /></div>
  );
  return (
    <>
      <div className="card">
        <h2>5. Pages, policies and menu</h2>
        <p className="muted small">Fill the facts; the AI writes About, Contact, FAQ and the Shipping / Refund / Privacy / Terms policies from them, in the reference's tone. It never invents a number. {!st.has_style && 'No reference read yet: the tone will be a plain friendly one.'}</p>
        {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}
        <div className="grid-2">
          <In k="store_name" label="Store name" /> <In k="email" label="Support email" ph="help@yourstore.in" />
          <In k="phone" label="Phone" /> <In k="whatsapp" label="WhatsApp number" />
          <In k="address" label="Address (line)" /> <In k="city" label="City" />
          <In k="state" label="State" /> <In k="gst" label="GST number (optional)" />
          <In k="shipping_days" label="Delivery time (days)" ph="5-7" /> <In k="shipping_charge" label="Shipping charge" ph="₹49 flat, or free" />
          <In k="free_shipping_above" label="Free shipping above (₹)" ph="999" /> <In k="return_window_days" label="Return / replacement window (days)" ph="7" />
        </div>
        <In k="returns_for" label="Returns accepted for" ph="damaged, defective or wrong items" />
        <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={!!facts.cod} onChange={(e) => f('cod', e.target.checked)} /> Cash on delivery available</label>
        <label className="label">About the brand, in your words (2-3 lines; the AI builds on it)</label>
        <textarea className="textarea" style={{ minHeight: 70 }} value={facts.about} onChange={(e) => f('about', e.target.value)} placeholder="Started in 2024 from Jaipur; handpicked jewellery for everyday wear; family-run." />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={!!busy} onClick={saveFacts}><Save size={14} /> Save facts</button>
          <button className="btn btn-primary" disabled={!!busy || !facts.store_name.trim()} onClick={draft}><Sparkles size={14} /> {busy === 'draft' ? 'Writing… (30-60 s)' : st.pages.length ? 'Draft again (replaces drafts)' : 'Draft pages with AI'}</button>
        </div>
      </div>

      {st.pages.length > 0 && (
        <div className="card">
          <div className="row">
            <h2>Drafts</h2>
            <div className="grow" />
            <button className="btn btn-primary" disabled={!!busy} onClick={publish}><Rocket size={14} /> {busy === 'publish' ? 'Publishing…' : 'Publish pages + policies + menu'}</button>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Page</th><th>Kind</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {st.pages.map((p) => (
                <tr key={p.handle}>
                  <td><b>{p.title}</b> <span className="muted small mono">/{p.kind === 'policy' ? 'policies' : 'pages'}/{p.handle}</span></td>
                  <td className="small">{p.kind === 'policy' ? 'Policy (Settings › Legal)' : 'Page'}</td>
                  <td>{p.status === 'pushed' ? <span className="chip chip-ok">In Shopify</span> : p.status === 'error' ? <span className="chip chip-bad" title={p.error || ''}>Error</span> : <span className="chip">Draft</span>}</td>
                  <td><button className="btn btn-sm" onClick={() => openPage(p)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {log && <div className="log" style={{ marginTop: 10 }}>{log.map((l, i) => <div key={i} className={l.ok ? 'ok' : 'bad'}>{l.ok ? '✓' : '✗'} {l.handle ? `[${l.handle}] ` : ''}{l.message}</div>)}</div>}
        </div>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen('')}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head"><h2>Edit page</h2><button className="btn btn-sm" onClick={() => setOpen('')}>Close</button></div>
            <label className="label">Title</label>
            <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <label className="label">Text (HTML; &lt;p&gt; for paragraphs, &lt;h2&gt; for headings)</label>
            <textarea className="textarea mono small" style={{ minHeight: 320 }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <div className="row" style={{ marginTop: 10 }}>
              <div className="grow" />
              <button className="btn btn-primary" disabled={busy === 'save'} onClick={savePage}><Save size={14} /> {busy === 'save' ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
