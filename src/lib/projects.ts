import { query, queryOne } from './db';
import { HttpError, isUuid } from './http';

export interface ProjectRow { id: string; store_id: string; name: string; status: string; reference_url: string | null; created_at: string; updated_at: string; store_name?: string; shop_domain?: string }

export async function listProjects(): Promise<(ProjectRow & { product_count: number; pushed_count: number })[]> {
  const r = await query<ProjectRow & { product_count: number; pushed_count: number }>(`
    SELECT p.id, p.store_id, p.name, p.status, p.reference_url, p.created_at, p.updated_at, s.name AS store_name, s.shop_domain,
      (SELECT count(*)::int FROM products x WHERE x.project_id = p.id) AS product_count,
      (SELECT count(*)::int FROM products x WHERE x.project_id = p.id AND x.status = 'pushed') AS pushed_count
    FROM projects p JOIN stores s ON s.id = p.store_id ORDER BY p.updated_at DESC`);
  return r.rows;
}

export async function getProject(id: string): Promise<ProjectRow> {
  if (!isUuid(id)) throw new HttpError(404, 'Project not found');
  const row = await queryOne<ProjectRow>(`SELECT p.id, p.store_id, p.name, p.status, p.reference_url, p.created_at, p.updated_at, s.name AS store_name, s.shop_domain FROM projects p JOIN stores s ON s.id = p.store_id WHERE p.id = $1`, [id]);
  if (!row) throw new HttpError(404, 'Project not found');
  return row;
}

export async function touchProject(id: string): Promise<void> {
  await query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [id]);
}
