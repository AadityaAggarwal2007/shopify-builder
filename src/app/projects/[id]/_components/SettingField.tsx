'use client';
// One theme setting as a form field, by its schema type. A blank field = the theme's own value.
import { X } from 'lucide-react';

export interface Def { id: string; type: string; label: string; default?: unknown; options?: string[]; group: string }
export interface Pickers {
  banners: { slot: string; alt: string }[];
  collections: { handle: string; title: string }[];
  products: { handle: string; title: string }[];
  fonts: Record<string, string>;   // name -> handle
}

export const EDITABLE = ['color', 'font_picker', 'image_picker', 'text', 'textarea', 'inline_richtext', 'richtext', 'checkbox', 'select', 'radio', 'range', 'number', 'url', 'collection', 'collection_list', 'product', 'product_list'];
export const isEditable = (d: Def) => EDITABLE.includes(d.type);

// Themes often label settings with translation keys ("sections.header.settings.logo.label"): show the last useful word.
export function prettyLabel(d: Def): string {
  let l = d.label || d.id;
  if (l.includes('.')) { const parts = l.split('.').filter((p) => !['label', 'settings', 'blocks', 'sections', 'content', 'name'].includes(p)); l = parts[parts.length - 1] || d.id; }
  l = l.replace(/[_-]+/g, ' ').trim();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const fontName = (fonts: Record<string, string>, handle: unknown) => Object.entries(fonts).find(([, h]) => h === handle)?.[0] || '';

export default function SettingField({ def, value, onChange, pickers }: { def: Def; value: unknown; onChange: (v: unknown) => void; pickers: Pickers }) {
  const set = value !== undefined && value !== null && value !== '';
  const clear = set ? <button type="button" className="btn btn-sm" title="Back to the theme's own value" onClick={() => onChange(undefined)}><X size={12} /></button> : null;
  const str = typeof value === 'string' ? value : '';
  let field: JSX.Element;
  switch (def.type) {
    case 'color':
      field = <div className="row" style={{ gap: 6 }}><input type="color" value={/^#[0-9a-f]{6}$/i.test(str) ? str : '#ffffff'} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 6 }} /><input className="input mono" style={{ width: 110 }} placeholder={typeof def.default === 'string' ? def.default : '#rrggbb'} value={str} onChange={(e) => onChange(e.target.value || undefined)} />{clear}</div>;
      break;
    case 'font_picker':
      field = <div className="row" style={{ gap: 6 }}><select className="select" value={fontName(pickers.fonts, value)} onChange={(e) => onChange(e.target.value ? pickers.fonts[e.target.value] : undefined)}><option value="">(theme&apos;s font)</option>{Object.keys(pickers.fonts).sort().map((n) => <option key={n} value={n}>{n.replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select>{clear}</div>;
      break;
    case 'image_picker': {
      const known = pickers.banners.map((b) => `banner:${b.slot}`);
      field = <div className="row" style={{ gap: 6 }}><select className="select" value={str} onChange={(e) => onChange(e.target.value || undefined)}><option value="">(no image / theme&apos;s)</option>{pickers.banners.map((b) => <option key={b.slot} value={`banner:${b.slot}`}>{b.slot}{b.alt ? ` · ${b.alt.slice(0, 40)}` : ''}</option>)}{str && !known.includes(str) && <option value={str}>{str.replace('shopify://shop_images/', '')}</option>}</select>{clear}</div>;
      break;
    }
    case 'textarea': case 'richtext':
      field = <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}><textarea className="textarea" rows={3} value={str} placeholder={typeof def.default === 'string' ? def.default.replace(/<[^>]+>/g, '').slice(0, 80) : ''} onChange={(e) => onChange(e.target.value || undefined)} />{clear}</div>;
      break;
    case 'checkbox':
      field = <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={value === true || (value === undefined && def.default === true)} onChange={(e) => onChange(e.target.checked)} /> <span className="small muted">{set ? (value ? 'on' : 'off') : `theme's (${def.default === true ? 'on' : 'off'})`}</span>{clear}</label>;
      break;
    case 'select': case 'radio':
      field = <div className="row" style={{ gap: 6 }}><select className="select" value={str} onChange={(e) => onChange(e.target.value || undefined)}><option value="">(theme&apos;s{def.default !== undefined ? `: ${String(def.default)}` : ''})</option>{(def.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>{clear}</div>;
      break;
    case 'range': case 'number':
      field = <div className="row" style={{ gap: 6 }}><input className="input" type="number" style={{ width: 120 }} value={typeof value === 'number' ? value : ''} placeholder={def.default !== undefined ? String(def.default) : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />{clear}</div>;
      break;
    case 'collection':
      field = <div className="row" style={{ gap: 6 }}><select className="select" value={str} onChange={(e) => onChange(e.target.value || undefined)}><option value="">(none)</option>{pickers.collections.map((c) => <option key={c.handle} value={c.handle}>{c.title}</option>)}</select>{clear}</div>;
      break;
    case 'product':
      field = <div className="row" style={{ gap: 6 }}><select className="select" value={str} onChange={(e) => onChange(e.target.value || undefined)}><option value="">(none)</option>{pickers.products.map((c) => <option key={c.handle} value={c.handle}>{c.title}</option>)}</select>{clear}</div>;
      break;
    case 'collection_list': case 'product_list': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const all = def.type === 'collection_list' ? pickers.collections : pickers.products;
      field = <div className="row" style={{ gap: 8 }}>{all.map((c) => <label key={c.handle} className="chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={list.includes(c.handle)} onChange={(e) => { const next = e.target.checked ? [...list, c.handle] : list.filter((h) => h !== c.handle); onChange(next.length ? next : undefined); }} /> {c.title}</label>)}{!all.length && <span className="small muted">none in this project</span>}</div>;
      break;
    }
    default:   // text, inline_richtext, url
      field = <div className="row" style={{ gap: 6 }}><input className="input" value={str} placeholder={typeof def.default === 'string' ? def.default.replace(/<[^>]+>/g, '').slice(0, 60) : ''} onChange={(e) => onChange(e.target.value || undefined)} />{clear}</div>;
  }
  return (
    <div>
      <div className="small" style={{ marginBottom: 3 }}><b>{prettyLabel(def)}</b> <span className="muted mono" style={{ fontSize: 11 }}>{def.id}</span></div>
      {field}
    </div>
  );
}
