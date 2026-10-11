import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { HttpError } from './auth.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
export const publicRun = row => ({ id: row.id, status: row.status, graph_version: row.graph_version,
  approval_version: row.approval_version, error_code: row.error_code,
  created_at: row.created_at, updated_at: row.updated_at });

export class Store {
  constructor(url) {
    this.pool = new pg.Pool({ connectionString: url, max: 6, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000, statement_timeout: 15000 });
  }
  async transaction(fn) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      await c.query('COMMIT'); return result;
    } catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }
  async event(c, id, type, data = {}) {
    await c.query('INSERT INTO events(run_id,type,data) VALUES($1,$2,$3)', [id,type,data]);
  }
  async create(identity, key, input) {
    const hash = sha(JSON.stringify(input));
    return this.transaction(async c => {
      const inserted = await c.query(`INSERT INTO runs(id,tenant_id,user_id,idempotency_key,input_hash,input)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,user_id,idempotency_key) DO NOTHING RETURNING *`,
      [randomUUID(),identity.tenant,identity.user,key,hash,input]);
      if (inserted.rowCount) {
        await this.event(c,inserted.rows[0].id,'queued'); return inserted.rows[0];
      }
      const old = (await c.query('SELECT * FROM runs WHERE tenant_id=$1 AND user_id=$2 AND idempotency_key=$3',
        [identity.tenant,identity.user,key])).rows[0];
      if (old.input_hash !== hash) throw new HttpError(409,'idempotency_conflict');
      return old;
    });
  }
  async owned(c, id, who, lock = false) {
    const { rows } = await c.query(`SELECT * FROM runs WHERE id=$1 AND tenant_id=$2 AND user_id=$3${lock ? ' FOR UPDATE' : ''}`,
      [id,who.tenant,who.user]);
    if (!rows.length) throw new HttpError(404,'run_not_found');
    return rows[0];
  }
  async decide(id, who, version, approve) {
    return this.transaction(async c => {
      const row = await this.owned(c,id,who,true);
      if (row.approval_version !== version) throw new HttpError(409,'stale_approval');
      if (row.decision !== null) {
        if (row.decision === approve) return row;
        throw new HttpError(409,'decision_conflict');
      }
      if (row.status !== 'waiting') throw new HttpError(409,'not_waiting');
      const updated = (await c.query(`UPDATE runs SET decision=$2,status=$3,dispatch_version=dispatch_version+1,
        updated_at=now() WHERE id=$1 RETURNING *`, [id,approve,approve ? 'queued' : 'cancelled'])).rows[0];
      await this.event(c,id,approve ? 'approved' : 'cancelled',{ approval_version: version });
      return updated;
    });
  }
  async cancel(id, who) {
    return this.transaction(async c => {
      const row = await this.owned(c,id,who,true);
      if (row.status === 'completed') throw new HttpError(409,'already_completed');
      if (row.status === 'cancelled') return row;
      const result = await c.query("UPDATE runs SET status='cancelled',updated_at=now() WHERE id=$1 RETURNING *",[id]);
      await this.event(c,id,'cancelled'); return result.rows[0];
    });
  }
  async report(id, content) {
    return this.transaction(async c => {
      const row = (await c.query('SELECT * FROM runs WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (row.status === 'cancelled') throw new HttpError(409,'cancelled');
      const hash = sha(content);
      await c.query('INSERT INTO artifacts(run_id,content,sha256) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,content,hash]);
      const artifact = (await c.query('SELECT * FROM artifacts WHERE run_id=$1',[id])).rows[0];
      if (artifact.sha256 !== hash) throw new Error('artifact_conflict');
      return { sha256: hash };
    });
  }
  async close() { await this.pool.end(); }
}
