'use client';
import { useCallback, useEffect, useState } from 'react';
import { Globe, Save, Trash2 } from 'lucide-react';
import { api, fmtWhen } from '@/lib/client';
import { SECTION_MEANING, SECTION_TYPES } from '@/lib/reference/style-sheet';
import { PRODUCT_FEATURES } from '@/lib/reference/product-features';

type Section = { type: string; title: string; note: string; count?: number; items?: string[] };
interface StyleSheet {
  brand: { name: string; tagline: string };
  palette: { primary: string; secondary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string };
  tone: string; sections: Section[]; collections: { title: string; note: string }[]; offers: string[];
  policies: { shipping: string; refund: string };
  productPage?: { features: string[]; offerLine: string; sections: Section[] };
  collectionPage?: { note: string; sections: Section[] };
}
interface ReadSection { place: string; type: string; headings: string[]; items: string[]; collections: number; products: number; images: number; videos: number; buttons: number; marquee: boolean }
interface Read { finalUrl: string; title: string; isShopify: boolean; sectionTypes: string[]; sections?: ReadSection[]; pages?: { collection?: string; product?: string }; collectionPage?: ReadSection[]; productPage?: ReadSection[]; productFeatures?: string[]; productOptions?: string[]; variantCount?: number; colors: { value: string; count: number }[]; fonts: string[]; collections: { title: string }[]; nav: { text: string }[]; errors: string[] }

// One list of sections (home page, product page, collection page): type, title, note, count, lines.
function SectionsTable({ sections, max, onChange }: { sections: Section[]; max: number; onChange: (list: Section[]) => void }) {
  const setSection = (i: number, patch: Partial<Section>) => onChange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const a = [...sections]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <>
      <table>
        <thead><tr><th style={{ width: 60 }}>Order</th><th>Type</th><th>Title</th><th>What goes in it</th><th style={{ width: 70 }}>Count</th><th>Lines (for a running bar / badges / columns; separate with ;)</th><th></th></tr></thead>
        <tbody>
          {sections.map((s, i) => (
            <tr key={i}>
              <td className="row" style={{ gap: 2 }}><button className="btn btn-sm" onClick={() => move(i, -1)}>↑</button><button className="btn btn-sm" onClick={() => move(i, 1)}>↓</button></td>
              <td><select className="select" value={s.type} title={SECTION_MEANING[s.type as keyof typeof SECTION_MEANING] || ''} onChange={(e) => setSection(i, { type: e.target.value })}>{SECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select><div className="muted" style={{ fontSize: 11 }}>{SECTION_MEANING[s.type as keyof typeof SECTION_MEANING] || ''}</div></td>
              <td><input className="input" value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} /></td>
              <td><input className="input" value={s.note} onChange={(e) => setSection(i, { note: e.target.value })} /></td>
              <td><input className="input" type="number" min={1} max={50} value={s.count ?? ''} onChange={(e) => setSection(i, { count: e.target.value ? Number(e.target.value) : undefined })} /></td>
              <td><input className="input" value={(s.items || []).join('; ')} onChange={(e) => setSection(i, { items: e.target.value.split(';').map((x) => x.trim()).filter(Boolean) })} /></td>
              <td><button className="btn btn-sm btn-danger" onClick={() => onChange(sections.filter((_, j) => j !== i))}><Trash2 size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={sections.length >= max} onClick={() => onChange([...sections, { type: 'rich-text', title: '', note: '' }])}>+ Add section</button>
    </>
  );
}

// Step 2: a reference website -> the style sheet (structure, colours, fonts, tone); the owner edits it.
export default function ReferenceStep({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const [url, setUrl] = useState('');
  const [collectionUrl, setCollectionUrl] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [style, setStyle] = useState<StyleSheet | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(() => api<{ reference_url: string | null; reference_read: Read | null; reference_read_at: string | null; style_sheet: StyleSheet | null }>(`/api/projects/${projectId}/reference`)
    .then((r) => { setSavedUrl(r.reference_url); setRead(r.reference_read); setReadAt(r.reference_read_at); setStyle(r.style_sheet); if (r.reference_url && !url) setUrl(r.reference_url); setCollectionUrl((c) => c || r.reference_read?.pages?.collection || ''); setProductUrl((c) => c || r.reference_read?.pages?.product || ''); })
    .catch((e) => setMsg({ kind: 'bad', text: e.message })), [projectId, url]);
  useEffect(() => { load(); }, [load]);

  async function readSite() {
    setBusy('read'); setMsg(null);
    try {
      const r = await api<{ style_sheet: StyleSheet; reference_read: Read }>(`/api/projects/${projectId}/reference`, { method: 'POST', json: { url, collectionUrl, productUrl } });
      setStyle(r.style_sheet); setRead(r.reference_read); setSavedUrl(r.reference_read.finalUrl); setReadAt(new Date().toISOString());
      setMsg({ kind: 'ok', text: 'Read. Check the style sheet below, change what you like, then Save.' }); onChange();
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy('');
  }
  async function save() {
    if (!style) return;
    setBusy('save'); setMsg(null);
    try { const r = await api<{ style_sheet: StyleSheet }>(`/api/projects/${projectId}/reference`, { method: 'PATCH', json: { style_sheet: style } }); setStyle(r.style_sheet); setMsg({ kind: 'ok', text: 'Saved.' }); onChange(); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); }
    setBusy('');
  }
  const set = (patch: Partial<StyleSheet>) => setStyle((s) => (s ? { ...s, ...patch } : s));

  return (
    <>
      <div className="card">
        <h2>2. Reference website</h2>
        <p className="muted small">A competitor, or any store you want the new one to feel like. The tool reads its structure, colours, fonts and tone. It never copies text or photos.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" style={{ maxWidth: 460 }} placeholder="https://example-store.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary" disabled={!url.trim() || busy === 'read'} onClick={readSite}><Globe size={14} /> {busy === 'read' ? 'Reading… (30-60 s)' : style ? 'Read again' : 'Read site'}</button>
        </div>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <div><label className="label">A collection page of theirs (optional; else the first one is read)</label><input className="input" placeholder="https://example-store.com/collections/jhumke" value={collectionUrl} onChange={(e) => setCollectionUrl(e.target.value)} /></div>
          <div><label className="label">A product page of theirs (optional; else the first one is read)</label><input className="input" placeholder="https://example-store.com/products/..." value={productUrl} onChange={(e) => setProductUrl(e.target.value)} /></div>
        </div>
        {savedUrl && <p className="muted small" style={{ marginTop: 8 }}>Last read: {savedUrl} · {fmtWhen(readAt)}{read?.isShopify ? ' · Shopify store' : ''}{read?.errors?.length ? ` · ${read.errors.length} part(s) could not be read` : ''}</p>}
        {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}
        {read && (
          <details style={{ marginTop: 8 }}>
            <summary className="muted small" style={{ cursor: 'pointer' }}>What the reader found</summary>
            <div className="small" style={{ marginTop: 6 }}>
              <div><b>Menu:</b> {read.nav.map((n) => n.text).join(' · ') || '—'}</div>
              {read.sections?.length ? (
                <div style={{ marginTop: 4 }}><b>Home page, top to bottom ({read.sections.length} sections):</b>
                  <table style={{ marginTop: 4 }}>
                    <thead><tr><th>#</th><th>Where</th><th>Type</th><th>Holds</th><th>Headings / items</th></tr></thead>
                    <tbody>{read.sections.map((x, i) => <tr key={i}><td>{i + 1}</td><td>{x.place}</td><td className="mono">{x.type}{x.marquee ? ' (running text)' : ''}</td><td>{[x.collections ? `${x.collections} categories` : '', x.products ? `${x.products} products` : '', x.images ? `${x.images} images` : '', x.videos ? `${x.videos} video` : '', x.buttons ? `${x.buttons} buttons` : ''].filter(Boolean).join(', ') || '—'}</td><td className="muted">{[...x.headings, ...x.items].slice(0, 6).join(' · ')}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <div><b>Home sections:</b> {read.sectionTypes.join(', ') || '— (not a Shopify theme, guessed from headings)'}</div>}
              <div><b>Fonts:</b> {read.fonts.join(', ') || '—'}</div>
              <div className="row" style={{ marginTop: 4 }}><b>Colours:</b> {read.colors.slice(0, 12).map((c) => <span key={c.value} title={`${c.value} ×${c.count}`} style={{ width: 18, height: 18, borderRadius: 4, background: c.value, border: '1px solid #ddd', display: 'inline-block' }} />)}</div>
              {read.collections.length > 0 && <div><b>Their collections:</b> {read.collections.map((c) => c.title).join(' · ')}</div>}
              {read.pages?.product && <div style={{ marginTop: 6 }}><b>Product page</b> ({read.pages.product}): features {read.productFeatures?.map((f) => PRODUCT_FEATURES[f as keyof typeof PRODUCT_FEATURES] || f).join(' · ') || '—'}{read.productOptions?.length ? ` · options: ${read.productOptions.join(', ')} (${read.variantCount} variants)` : ''}<div className="muted">Sections: {read.productPage?.map((x) => x.type).join(' → ') || '—'}</div></div>}
              {read.pages?.collection && <div style={{ marginTop: 6 }}><b>Collection page</b> ({read.pages.collection}): sections {read.collectionPage?.map((x) => x.type).join(' → ') || '—'}</div>}
            </div>
          </details>
        )}
      </div>

      {style && (
        <div className="card">
          <div className="row">
            <h2>Style sheet</h2>
            <div className="grow" />
            <button className="btn btn-primary" disabled={busy === 'save'} onClick={save}><Save size={14} /> {busy === 'save' ? 'Saving…' : 'Save'}</button>
          </div>
          <div className="grid-2">
            <div><label className="label">Store name (on the site)</label><input className="input" value={style.brand.name} onChange={(e) => set({ brand: { ...style.brand, name: e.target.value } })} /></div>
            <div><label className="label">Tagline</label><input className="input" value={style.brand.tagline} onChange={(e) => set({ brand: { ...style.brand, tagline: e.target.value } })} /></div>
          </div>
          <label className="label">Colours</label>
          <div className="row">
            {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map((k) => (
              <label key={k} className="row small" style={{ gap: 6 }}>
                <input type="color" value={style.palette[k]} onChange={(e) => set({ palette: { ...style.palette, [k]: e.target.value } })} />
                {k} <span className="mono muted">{style.palette[k]}</span>
              </label>
            ))}
          </div>
          <div className="grid-2">
            <div><label className="label">Heading font</label><input className="input" value={style.fonts.heading} onChange={(e) => set({ fonts: { ...style.fonts, heading: e.target.value } })} /></div>
            <div><label className="label">Body font</label><input className="input" value={style.fonts.body} onChange={(e) => set({ fonts: { ...style.fonts, body: e.target.value } })} /></div>
          </div>
          <label className="label">Tone (how the store talks)</label>
          <textarea className="textarea" style={{ minHeight: 70 }} value={style.tone} onChange={(e) => set({ tone: e.target.value })} />

          <label className="label">Home page sections, top to bottom</label>
          <SectionsTable sections={style.sections} max={24} onChange={(list) => set({ sections: list })} />

          <label className="label">Product page: what it shows</label>
          <div className="row" style={{ gap: 8 }}>
            {Object.entries(PRODUCT_FEATURES).map(([k, label]) => <label key={k} className="chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={(style.productPage?.features || []).includes(k)} onChange={(e) => { const cur = style.productPage || { features: [], offerLine: '', sections: [] }; set({ productPage: { ...cur, features: e.target.checked ? [...cur.features, k] : cur.features.filter((f) => f !== k) } }); }} /> {label}</label>)}
          </div>
          <label className="label">Offer line on the product page (your own words)</label>
          <input className="input" value={style.productPage?.offerLine || ''} placeholder="Buy 2, get 1 free this week" onChange={(e) => set({ productPage: { ...(style.productPage || { features: [], sections: [] }), offerLine: e.target.value } })} />
          <label className="label">Product page sections below the buy box, top to bottom</label>
          <SectionsTable sections={style.productPage?.sections || []} max={12} onChange={(list) => set({ productPage: { ...(style.productPage || { features: [], offerLine: '' }), sections: list } })} />

          <label className="label">Collection page: grid, filters, sorting, banner (one line)</label>
          <input className="input" value={style.collectionPage?.note || ''} onChange={(e) => set({ collectionPage: { ...(style.collectionPage || { sections: [] }), note: e.target.value } })} />
          <label className="label">Collection page sections (banners / text), top to bottom</label>
          <SectionsTable sections={style.collectionPage?.sections || []} max={8} onChange={(list) => set({ collectionPage: { ...(style.collectionPage || { note: '' }), sections: list } })} />

          <label className="label">Collection ideas</label>
          {style.collections.map((c, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <input className="input" style={{ maxWidth: 260 }} value={c.title} onChange={(e) => set({ collections: style.collections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <input className="input" value={c.note} onChange={(e) => set({ collections: style.collections.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
              <button className="btn btn-sm btn-danger" onClick={() => set({ collections: style.collections.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
            </div>
          ))}
          <button className="btn btn-sm" disabled={style.collections.length >= 10} onClick={() => set({ collections: [...style.collections, { title: '', note: '' }] })}>+ Add collection</button>

          <label className="label">Offers they use (kinds, not numbers)</label>
          <input className="input" value={style.offers.join('; ')} onChange={(e) => set({ offers: e.target.value.split(';').map((o) => o.trim()).filter(Boolean) })} placeholder="free shipping above a threshold; first-order discount" />
          <div className="grid-2">
            <div><label className="label">Their shipping policy reads…</label><input className="input" value={style.policies.shipping} onChange={(e) => set({ policies: { ...style.policies, shipping: e.target.value } })} /></div>
            <div><label className="label">Their refund policy reads…</label><input className="input" value={style.policies.refund} onChange={(e) => set({ policies: { ...style.policies, refund: e.target.value } })} /></div>
          </div>
        </div>
      )}
    </>
  );
}
