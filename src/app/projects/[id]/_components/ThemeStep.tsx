'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Pencil, Rocket, Sparkles, Upload } from 'lucide-react';
import { api, token } from '@/lib/client';
import ThemeEditor, { type Plan } from './ThemeEditor';

interface State {
  has_zip: boolean; has_style: boolean;
  theme: { name: string; version: string; sections: string[]; settings: number; index_sections: number } | null;
  plan: Plan | null;
  built_at: string | null; shopify_theme_id: string | null; preview_url: string | null;
}

// Step 4: the owner's theme zip -> the AI fills settings + home page from the style sheet -> new zip
// -> pushed to the store as an unpublished theme (or downloaded) -> preview -> Publish.
export default function ThemeStep({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<State>(`/api/projects/${projectId}/theme`).then(setSt).catch((e) => setMsg([{ kind: 'bad', text: e.message }])), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function run(step: 'plan' | 'build' | 'push' | 'publish', confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(step); setMsg([]);
    try {
      const r = await api<Record<string, unknown>>(`/api/projects/${projectId}/theme/${step}`, { method: 'POST' });
      const out: typeof msg = [];
      if (step === 'plan') out.push({ kind: 'ok', text: `Plan ready: ${(r as { sections: unknown[] }).sections.length} home page sections, ${Object.keys((r as { settings: object }).settings).length} theme settings.` });
      if (step === 'build') { out.push({ kind: 'ok', text: `Theme zip built${(r.uploaded as string[]).length ? `; ${(r.uploaded as string[]).length} image(s) uploaded to Shopify Files` : ''}.` }); for (const w of r.warnings as string[]) out.push({ kind: 'warn', text: w }); }
      if (step === 'push') out.push({ kind: 'ok', text: r.processing ? 'Theme sent; Shopify is still unpacking it. Refresh in a minute, then Preview.' : 'Theme is in the store (unpublished). Press Preview to see it.' });
      if (step === 'publish') out.push({ kind: 'ok', text: 'Published: this theme is now live on the store.' });
      setMsg(out);
    } catch (e) { setMsg([{ kind: 'bad', text: (e as Error).message }]); }
    setBusy(''); load(); onChange();
  }
  async function upload(file: File) {
    setBusy('upload'); setMsg([]);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api<{ name: string; version: string; sections: string[]; settings: number }>(`/api/projects/${projectId}/theme/upload`, { method: 'POST', body: fd });
      setMsg([{ kind: 'ok', text: `Theme read: ${r.name || file.name} ${r.version}; ${r.sections.length} home page section types, ${r.settings} settings.` }]);
    } catch (e) { setMsg([{ kind: 'bad', text: (e as Error).message }]); }
    setBusy(''); if (fileRef.current) fileRef.current.value = ''; load(); onChange();
  }

  if (!st) return <div className="card muted">Loading…</div>;
  return (
    <>
      <div className="card">
        <h2>4. Theme</h2>
        <p className="muted small">Upload the theme you want on the store (a .zip: from the Theme Store purchase, or Online Store › Themes › ⋯ › Download). The tool fills its colours, fonts, logo and home page from the style sheet, then puts it in the store unpublished so you can preview before publishing.</p>
        {!st.has_style && <div className="alert alert-warn">Read a reference site first (step 2): the theme is filled from its style sheet.</div>}
        <div className="row" style={{ marginTop: 10 }}>
          <input ref={fileRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn btn-primary" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()}><Upload size={14} /> {busy === 'upload' ? 'Reading zip…' : st.has_zip ? 'Upload another theme zip' : 'Upload theme zip'}</button>
          {st.theme && <span className="chip">{st.theme.name} {st.theme.version} · {st.theme.sections.length} section types</span>}
        </div>
        {msg.map((m, i) => <div key={i} className={`alert alert-${m.kind}`}>{m.text}</div>)}
      </div>

      {st.has_zip && (
        <div className="card">
          <h2>Fill and preview</h2>
          <ol className="small" style={{ margin: '6px 0 10px 18px', lineHeight: 1.8 }}>
            <li><b>Plan</b>: the AI maps the style sheet onto this theme's real settings and sections (nothing is sent yet).</li>
            <li><b>Build</b>: writes the new theme zip; banners / logo (step 3) go to Shopify Files.</li>
            <li><b>Send to store</b>: the zip becomes an unpublished theme in Shopify. <b>Preview</b> opens it. Nothing changes for customers.</li>
            <li><b>Publish</b>: makes it the live theme. <b>Edit</b> opens every setting of the plan (sections, colours, fonts, header, footer) to change by hand; save, then Build → Send → Preview again.</li>
          </ol>
          <div className="row">
            <button className="btn" disabled={!!busy || !st.has_style} onClick={() => run('plan', st.plan ? 'Plan again with the AI? Your own edits to the current plan will be replaced.' : undefined)}><Sparkles size={14} /> {busy === 'plan' ? 'Planning… (30-60 s)' : st.plan ? 'Plan again' : '1. Plan'}</button>
            {st.plan && <button className={`btn${editing ? ' btn-primary' : ''}`} disabled={!!busy} onClick={() => setEditing((e) => !e)}><Pencil size={14} /> {editing ? 'Close editor' : 'Edit'}</button>}
            <button className="btn" disabled={!!busy || !st.plan} onClick={() => run('build')}>{busy === 'build' ? 'Building…' : '2. Build zip'}</button>
            <button className="btn" disabled={!!busy || !st.built_at} onClick={() => run('push')}>{busy === 'push' ? 'Sending… (up to 1 min)' : '3. Send to store'}</button>
            {st.built_at && <a className="btn" href={`/api/projects/${projectId}/theme/download?token=${encodeURIComponent(token())}`}><Download size={14} /> Download zip</a>}
            {st.preview_url && <a className="btn" href={st.preview_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Preview</a>}
            <button className="btn btn-primary" disabled={!!busy || !st.shopify_theme_id} onClick={() => run('publish', 'Make this theme LIVE on the store for customers?')}><Rocket size={14} /> {busy === 'publish' ? 'Publishing…' : '4. Publish'}</button>
          </div>
          {st.plan && editing && <ThemeEditor projectId={projectId} plan={st.plan} onSaved={(p) => { setSt((s) => (s ? { ...s, plan: p, built_at: null } : s)); setMsg([{ kind: 'ok', text: `Saved${p.notes.length ? `; left out: ${p.notes.slice(0, 5).join(' · ')}` : ''}. Now Build zip → Send to store → Preview.` }]); onChange(); }} />}
          {st.plan && !editing && (
            <details style={{ marginTop: 12 }}>
              <summary className="muted small" style={{ cursor: 'pointer' }}>The plan: {st.plan.sections.length} sections, {Object.keys(st.plan.settings).length} settings{st.plan.notes.length ? `, ${st.plan.notes.length} note(s)` : ''}</summary>
              <table style={{ marginTop: 6 }}>
                <thead><tr><th>#</th><th>Section type</th><th>Settings</th><th>Blocks</th></tr></thead>
                <tbody>{st.plan.sections.map((s, i) => <tr key={i}><td>{i + 1}</td><td className="mono small">{s.type}</td><td className="small">{Object.entries(s.settings).map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v)}`).join(' · ')}</td><td className="small">{s.blocks.map((b) => b.type).join(', ')}</td></tr>)}</tbody>
              </table>
              <div className="small" style={{ marginTop: 6 }}><b>Theme settings:</b> {Object.entries(st.plan.settings).map(([k, v]) => `${k}=${String(v)}`).join(' · ') || '—'}</div>
              {Object.entries(st.plan.groups || {}).map(([file, byKey]) => <div key={file} className="small" style={{ marginTop: 6 }}><b>{file}:</b> {Object.entries(byKey).map(([key, settings]) => `${key} (${Object.entries(settings).map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v)}`).join(', ')})`).join(' · ')}</div>)}
              {st.plan.notes.length > 0 && <div className="small muted" style={{ marginTop: 6 }}><b>Left out:</b> {st.plan.notes.slice(0, 20).join(' · ')}</div>}
            </details>
          )}
        </div>
      )}
    </>
  );
}
