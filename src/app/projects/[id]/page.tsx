'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/client';
import ProductsStep from './_components/ProductsStep';
import ReferenceStep from './_components/ReferenceStep';

export interface ProjectInfo { id: string; name: string; store_name: string; shop_domain: string; reference_url: string | null }
export interface Counts { products: number; pushed: number; errors: number; images: number; pending_images: number; described: number }

const STEPS: { key: string; label: string; soon?: boolean }[] = [
  { key: 'products', label: 'Products' },
  { key: 'reference', label: 'Reference site' },
  { key: 'banners', label: 'Banners', soon: true },
  { key: 'theme', label: 'Theme', soon: true },
  { key: 'pages', label: 'Pages & policies', soon: true },
  { key: 'checklist', label: 'Checklist', soon: true },
];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState('products');

  const load = useCallback(() => api<{ project: ProjectInfo; counts: Counts }>(`/api/projects/${id}`).then((r) => { setProject(r.project); setCounts(r.counts); }).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function remove() {
    if (!project) return;
    if (!confirm(`Delete "${project.name}" from this tool? Products already in Shopify stay there.`)) return;
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    router.push('/projects');
  }

  return (
    <AppShell>
      {err && <div className="alert alert-bad">{err}</div>}
      {project && (
        <>
          <div className="page-head">
            <h1>{project.name}</h1>
            <span className="chip">{project.store_name} · <span className="mono">{project.shop_domain}</span></span>
            <div className="grow" />
            <button className="btn btn-sm btn-danger" onClick={remove}><Trash2 size={12} /> Delete project</button>
          </div>
          <div className="project">
            <aside className="card" style={{ padding: 10, alignSelf: 'start' }}>
              <div className="steps">
                {STEPS.map((s, i) => (
                  <button key={s.key} className={`${step === s.key ? 'active' : ''} ${s.soon ? 'soon' : ''}`} disabled={s.soon} onClick={() => setStep(s.key)} title={s.soon ? 'Coming in the next part' : ''}>
                    <span className="num">{i + 1}</span> {s.label}
                  </button>
                ))}
              </div>
            </aside>
            <section>
              {step === 'products' && <ProductsStep projectId={id} counts={counts} onChange={load} />}
              {step === 'reference' && <ReferenceStep projectId={id} onChange={load} />}
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}
