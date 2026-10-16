import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export async function migrate(url) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(72100612)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const old = await client.query('SELECT sha256 FROM schema_migrations WHERE version=$1', [file]);
      if (old.rowCount) {
        if (old.rows[0].sha256 !== hash) throw new Error(`Applied migration changed: ${file}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)', [file,hash]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
  await migrate(process.env.DATABASE_URL);
  console.log('Workflow schema migrated');
}
