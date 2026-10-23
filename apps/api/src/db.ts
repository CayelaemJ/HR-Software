import pg from 'pg';
import type { PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL must be configured (Neon Postgres).');

export const pool = new pg.Pool({
  connectionString,
  max: 8,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined
});

export async function inTenant<T>(
  tenantId: string, userId: string, action: (db: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The migration owner bypasses RLS. Downgrade every tenant-scoped transaction
    // to the NOLOGIN/NOBYPASSRLS role before touching tenant records.
    await client.query('SET LOCAL ROLE cabo_runtime');
    const role=await client.query("SELECT NOT rolbypassrls AND NOT rolsuper AS restricted FROM pg_roles WHERE rolname=current_user");
    if(!role.rows[0]?.restricted || role.rowCount!==1)throw Error('Unsafe database runtime role; refusing tenant access');
    await client.query('SELECT set_config($1,$2,true),set_config($3,$4,true)',
      ['app.tenant_id', tenantId, 'app.user_id', userId]);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function forUser<T>(userId: string, action: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The migration owner bypasses RLS. Downgrade every tenant-scoped transaction
    // to the NOLOGIN/NOBYPASSRLS role before touching tenant records.
    await client.query('SET LOCAL ROLE cabo_runtime');
    const role=await client.query("SELECT NOT rolbypassrls AND NOT rolsuper AS restricted FROM pg_roles WHERE rolname=current_user");
    if(!role.rows[0]?.restricted || role.rowCount!==1)throw Error('Unsafe database runtime role; refusing tenant access');
    await client.query('SELECT set_config($1,$2,true)', ['app.user_id', userId]);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
