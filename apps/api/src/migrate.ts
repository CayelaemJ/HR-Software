import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool } from './db.js';
async function migrate() {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock(814259201)');
    locked = true;
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = resolve(process.cwd(),'db/migrations');
    for(const file of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort()){
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[file]);
      if(exists.rowCount)continue;
      // Treat SQL body and migration bookkeeping as one atomic transaction.
      const sql=readFileSync(resolve(dir,file),'utf8')
        .replace(/^\s*BEGIN;\s*/i,'').replace(/\s*COMMIT;\s*$/i,'');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);
        await client.query('COMMIT');
      } catch(error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.info('Migration applied:',file);
    }
  } finally {
    if(locked)await client.query('SELECT pg_advisory_unlock(814259201)');
    client.release();
    await pool.end();
  }
}
migrate().catch(err=>{console.error('Database migration failed:',err.message);process.exitCode=1;});
