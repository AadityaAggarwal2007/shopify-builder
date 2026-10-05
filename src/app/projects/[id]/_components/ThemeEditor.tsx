'use client';
// The plan, editable by hand: home page sections (add / remove / reorder / settings / blocks), the theme's
// global settings, and the header / footer sections. Every field is one of the theme's own settings.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/client';
import SettingField, { isEditable, prettyLabel, type Def, type Pickers } from './SettingField';

interface SectionDef { type: string; name: string; settings: Def[]; blocks: { type: string; name: string; settings: Def[]; limit?: number }[]; maxBlocks?: number }
interface Schema {
  theme: { name: string; settings: Def[]; sections: Record<string, SectionDef>; allSections: Record<string, SectionDef>; groups: Record<string, { key: string; type: string }[]> };
  assets: { banners: { slot: string; alt: string }[]; collections: { handle: string; title: string }[]; products: { handle: string; title: string }[] };
  fonts: Record<string, string>;
}
export interface Plan { settings: Record<string, unknown>; sections: { type: string; settings: Record<string, unknown>; blocks: { type: string; settings: Record<string, unknown> }[] }[]; groups?: Record<string, Record<string, Record<string, unknown>>>; notes: string[] }
type Vals = Record<string, unknown>;

const setIn = (o: Vals, k: string, v: unknown): Vals => { const n = { ...o }; if (v === undefined) delete n[k]; else n[k] = v; return n; };
const move = <T,>(a: T[], i: number, d: number): T[] => { const n = [...a]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; };
const countSet = (defs: Def[], vals: Vals) => defs.filter((d) => vals[d.id] !== undefined).length;

function Fields({ defs, vals, onChange, pickers }: { defs: Def[]; vals: Vals; onChange: (v: Vals) => void; pickers: Pickers }) {
  const list = defs.filter(isEditable);
  if (!list.length) return <div className="small muted">No editable settings here.</div>;
  return <div className="grid-2" style={{ marginTop: 8 }}>{list.map((d) => <SettingField key={d.id} def={d} value={vals[d.id]} pickers={pickers} onChange={(v) => onChange(setIn(vals, d.id, v))} />)}</div>;
}

export default function ThemeEditor({ projectId, plan, onSaved }: { projectId: string; plan: Plan; onSaved: (p: Plan) => void }) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [draft, setDraft] = useState<Plan>(plan);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'home' | 'theme' | 'groups'>('home');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api<Schema>(`/api/projects/${projectId}/theme/schema`).then(setSchema).catch((e) => setErr(e.message)); }, [projectId]);
  useEffect(() => { setDraft(plan); setDirty(false); }, [plan]);
  const edit = (f: (p: Plan) => Plan) => { setDraft((p) => f(p)); setDirty(true); };

  async function save() {
    setBusy(true); setErr('');
    try { const saved = await api<Plan>(`/api/projects/${projectId}/theme/plan`, { method: 'PATCH', json: { plan: draft } }); setDirty(false); onSaved(saved); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (err && !schema) return <div className="alert alert-bad">{err}</div>;
  if (!schema) return <div className="muted small">Loading the theme&apos;s settings…</div>;
  const pickers: Pickers = { ...schema.assets, fonts: schema.fonts };
  const sectionTypes = Object.values(schema.theme.sections).sort((a, b) => a.name.localeCompare(b.name));
  const groups = schema.theme.groups;
  const globalGroups = Array.from(new Set(schema.theme.settings.map((d) => d.group)));

  return (
    <div style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 4 }}>
          {([['home', `Home page (${draft.sections.length})`], ['theme', `Theme settings (${Object.keys(draft.settings).length})`], ['groups', 'Header & footer']] as const).map(([k, l]) => <button key={k} className={`btn btn-sm${tab === k ? ' btn-primary' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="row">
          {dirty && <span className="chip chip-warn">Unsaved changes</span>}
          <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}><Save size={13} /> {busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
      {err && <div className="alert alert-bad">{err}</div>}
      <p className="small muted" style={{ margin: '6px 0 0' }}>A blank field keeps the theme&apos;s own value. After saving, press <b>Build zip</b>, <b>Send to store</b> and <b>Preview</b> again to see it.</p>

      {tab === 'home' && (
        <div style={{ marginTop: 10 }}>
          {draft.sections.map((s, i) => {
            const def = schema.theme.sections[s.type];
            if (!def) return <div key={i} className="alert alert-warn">Section &quot;{s.type}&quot; is not in this theme.</div>;
            const blockTypes = def.blocks;
            const canAdd = !def.maxBlocks || s.blocks.length < def.maxBlocks;
            return (
              <details key={i} className="card" style={{ padding: 10, marginTop: 8 }}>
                <summary style={{ cursor: 'pointer' }} className="row">
                  <b>{i + 1}. {def.name}</b> <span className="mono small muted">{s.type}</span>
                  <span className="small muted">· {countSet(def.settings, s.settings)} set · {s.blocks.length} block{s.blocks.length === 1 ? '' : 's'}</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-sm" title="Move up" onClick={(e) => { e.preventDefault(); edit((p) => ({ ...p, sections: move(p.sections, i, -1) })); }}><ArrowUp size={12} /></button>
                  <button className="btn btn-sm" title="Move down" onClick={(e) => { e.preventDefault(); edit((p) => ({ ...p, sections: move(p.sections, i, 1) })); }}><ArrowDown size={12} /></button>
                  <button className="btn btn-sm btn-danger" title="Remove section" onClick={(e) => { e.preventDefault(); if (confirm(`Remove "${def.name}" from the home page?`)) edit((p) => ({ ...p, sections: p.sections.filter((_, k) => k !== i) })); }}><Trash2 size={12} /></button>
                </summary>
                <Fields defs={def.settings} vals={s.settings} pickers={pickers} onChange={(v) => edit((p) => ({ ...p, sections: p.sections.map((x, k) => (k === i ? { ...x, settings: v } : x)) }))} />
                {blockTypes.length > 0 && (
                  <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: '3px solid var(--border)' }}>
                    <div className="small"><b>Blocks</b></div>
                    {s.blocks.map((b, j) => {
                      const bd = blockTypes.find((x) => x.type === b.type);
                      return (
                        <details key={j} style={{ marginTop: 6 }}>
                          <summary className="row small" style={{ cursor: 'pointer' }}>
                            <b>{j + 1}. {bd?.name || b.type}</b> <span className="muted">· {bd ? countSet(bd.settings, b.settings) : 0} set</span>
                            <span style={{ flex: 1 }} />
                            <button className="btn btn-sm" onClick={(e) => { e.preventDefault(); edit((p) => ({ ...p, sections: p.sections.map((x, k) => (k === i ? { ...x, blocks: move(x.blocks, j, -1) } : x)) })); }}><ArrowUp size={12} /></button>
                            <button className="btn btn-sm" onClick={(e) => { e.preventDefault(); edit((p) => ({ ...p, sections: p.sections.map((x, k) => (k === i ? { ...x, blocks: move(x.blocks, j, 1) } : x)) })); }}><ArrowDown size={12} /></button>
                            <button className="btn btn-sm btn-danger" onClick={(e) => { e.preventDefault(); edit((p) => ({ ...p, sections: p.sections.map((x, k) => (k === i ? { ...x, blocks: x.blocks.filter((_, m) => m !== j) } : x)) })); }}><Trash2 size={12} /></button>
                          </summary>
                          {bd ? <Fields defs={bd.settings} vals={b.settings} pickers={pickers} onChange={(v) => edit((p) => ({ ...p, sections: p.sections.map((x, k) => (k === i ? { ...x, blocks: x.blocks.map((y, m) => (m === j ? { ...y, settings: v } : y)) } : x)) }))} /> : <div className="small muted">Unknown block type.</div>}
                        </details>
                      );
                    })}
                    <div className="row" style={{ marginTop: 8 }}>
                      <select className="select" style={{ width: 'auto' }} value="" disabled={!canAdd} onChange={(e) => { const t = e.target.value; if (!t) return; const bd = blockTypes.find((x) => x.type === t)!; if (bd.limit && s.blocks.filter((x) => x.type === t).length >= bd.limit) { alert(`This section allows at most ${bd.limit} "${bd.name}" block(s).`); return; } edit((p) => ({ ...p, sections: p.sections.map((x, k) => (k === i ? { ...x, blocks: [...x.blocks, { type: t, settings: {} }] } : x)) })); }}>
                        <option value="">{canAdd ? '+ Add block…' : `Max ${def.maxBlocks} blocks`}</option>
                        {blockTypes.map((b) => <option key={b.type} value={b.type}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </details>
            );
          })}
          <div className="row" style={{ marginTop: 10 }}>
            <Plus size={14} />
            <select className="select" style={{ width: 'auto' }} value="" onChange={(e) => { const t = e.target.value; if (t) edit((p) => ({ ...p, sections: [...p.sections, { type: t, settings: {}, blocks: [] }] })); }}>
              <option value="">Add a section…</option>
              {sectionTypes.map((d) => <option key={d.type} value={d.type}>{d.name} ({d.type})</option>)}
            </select>
          </div>
        </div>
      )}

      {tab === 'theme' && (
        <div style={{ marginTop: 10 }}>
          {globalGroups.map((g) => {
            const defs = schema.theme.settings.filter((d) => d.group === g && isEditable(d));
            if (!defs.length) return null;
            return (
              <details key={g} className="card" style={{ padding: 10, marginTop: 8 }} open={countSet(defs, draft.settings) > 0}>
                <summary style={{ cursor: 'pointer' }}><b>{prettyLabel({ id: g, type: '', label: g, group: g })}</b> <span className="small muted">· {countSet(defs, draft.settings)} of {defs.length} set</span></summary>
                <Fields defs={defs} vals={draft.settings} pickers={pickers} onChange={(v) => edit((p) => ({ ...p, settings: v }))} />
              </details>
            );
          })}
        </div>
      )}

      {tab === 'groups' && (
        <div style={{ marginTop: 10 }}>
          {!Object.keys(groups).length && <div className="small muted">This theme has no header / footer group files.</div>}
          {Object.entries(groups).map(([file, held]) => (
            <div key={file} style={{ marginTop: 8 }}>
              <div className="small"><b>{file}</b></div>
              {held.map((sec) => {
                const def = schema.theme.allSections[sec.type];
                if (!def) return null;
                const vals = draft.groups?.[file]?.[sec.key] || {};
                return (
                  <details key={sec.key} className="card" style={{ padding: 10, marginTop: 6 }} open={Object.keys(vals).length > 0}>
                    <summary style={{ cursor: 'pointer' }}><b>{def.name}</b> <span className="mono small muted">{sec.key}</span> <span className="small muted">· {countSet(def.settings, vals)} set</span></summary>
                    <Fields defs={def.settings} vals={vals} pickers={pickers} onChange={(v) => edit((p) => { const g = { ...(p.groups || {}) }; const byKey = { ...(g[file] || {}) }; if (Object.keys(v).length) byKey[sec.key] = v; else delete byKey[sec.key]; if (Object.keys(byKey).length) g[file] = byKey; else delete g[file]; return { ...p, groups: g }; })} />
                  </details>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
