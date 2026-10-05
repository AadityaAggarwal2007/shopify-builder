import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// Plain pg against the Builder database (DATABASE_URL). Same helper shape as ShipTrack's db.ts.
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    _pool = new Pool({ connectionString, min: 1, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 3_000, ssl: false });
    _pool.on('error', (err) => console.error('[db] pool error:', err.message));
  }
  return _pool;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
  return getPool().query<T>(sql, params);
}

export async function queryOne<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const r = await query<T>(sql, params);
  return r.rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
