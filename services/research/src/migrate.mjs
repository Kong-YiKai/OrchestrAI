import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const client=new pg.Client({ connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000 });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(72100613)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) {
    const sql=await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8');
    const hash=createHash('sha256').update(sql).digest('hex');
    const old=await client.query('SELECT sha256 FROM schema_migrations WHERE version=$1',[file]);
    if (old.rowCount) { if (old.rows[0].sha256!==hash) throw new Error('applied_migration_changed'); continue; }
    await client.query('BEGIN');
    try { await client.query(sql); await client.query('INSERT INTO schema_migrations VALUES($1,$2,now())',[file,hash]);
      await client.query('COMMIT'); } catch(error) { await client.query('ROLLBACK');throw error; }
  }
  console.log('Research forward migration complete.');
} finally { await client.end(); }
