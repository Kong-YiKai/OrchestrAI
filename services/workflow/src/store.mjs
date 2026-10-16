import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { HttpError } from './auth.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

export const publicProject = (row, runs) => ({ id: row.id, goal: row.goal, workspace_name: row.workspace_name,
  status: row.status, plan: row.plan, plan_version: row.plan_version, error_code: row.error_code,
  created_at: row.created_at, updated_at: row.updated_at, ...(runs ? { runs: runs.map(r => publicRun(r)) } : {}) });
export const publicRun = (row, withPlan = false) => ({ id: row.id, project_id: row.project_id, status: row.status,
  plan_version: row.plan_version, task_states: row.task_states, error_code: row.error_code,
  created_at: row.created_at, updated_at: row.updated_at, ...(withPlan ? { plan: row.plan } : {}) });

export class Store {
  constructor(url) {
    this.pool = new pg.Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 5000,
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
  async event(c, runId, type, taskId = null, data = {}) {
    await c.query('INSERT INTO team_events(run_id,type,task_id,data) VALUES($1,$2,$3,$4)', [runId, type, taskId, data]);
  }

  // Projects: a goal plus the commander's (user-editable) plan.
  async createProject(who, key, input, plan) {
    const hash = sha(JSON.stringify(input));
    return this.transaction(async c => {
      const inserted = await c.query(`INSERT INTO team_projects(id,tenant_id,user_id,idempotency_key,input_hash,goal,workspace_name,status,plan,plan_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,user_id,idempotency_key) DO NOTHING RETURNING *`,
      [randomUUID(), who.tenant, who.user, key, hash, input.goal, input.workspace_name,
        plan ? 'ready' : 'planning', plan ?? null, plan ? 1 : 0]);
      if (inserted.rowCount) return inserted.rows[0];
      const old = (await c.query('SELECT * FROM team_projects WHERE tenant_id=$1 AND user_id=$2 AND idempotency_key=$3',
        [who.tenant, who.user, key])).rows[0];
      if (old.input_hash !== hash) throw new HttpError(409, 'idempotency_conflict');
      return old;
    });
  }
  async project(c, id, who, lock = false) {
    const { rows } = await c.query(`SELECT * FROM team_projects WHERE id=$1 AND tenant_id=$2 AND user_id=$3${lock ? ' FOR UPDATE' : ''}`,
      [id, who.tenant, who.user]);
    if (!rows.length) throw new HttpError(404, 'project_not_found');
    return rows[0];
  }
  async projects(who) {
    const { rows } = await this.pool.query(`SELECT * FROM team_projects WHERE tenant_id=$1 AND user_id=$2
      ORDER BY updated_at DESC LIMIT 50`, [who.tenant, who.user]);
    return rows.map(r => ({ ...publicProject(r), plan: undefined }));
  }
  async projectRuns(id) {
    return (await this.pool.query('SELECT * FROM team_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 10', [id])).rows;
  }
  async savePlan(id, who, version, plan) {
    return this.transaction(async c => {
      const row = await this.project(c, id, who, true);
      if (row.status === 'planning') throw new HttpError(409, 'plan_in_progress');
      if (row.plan_version !== version) throw new HttpError(409, 'stale_plan');
      return (await c.query(`UPDATE team_projects SET plan=$2,plan_version=plan_version+1,status='ready',error_code=NULL,
        updated_at=now() WHERE id=$1 RETURNING *`, [id, plan])).rows[0];
    });
  }
  async redesign(id, who, goal) {
    return this.transaction(async c => {
      const row = await this.project(c, id, who, true);
      if (row.status === 'planning') return row;
      return (await c.query(`UPDATE team_projects SET status='planning',goal=$2,error_code=NULL,
        dispatch_version=dispatch_version+1,updated_at=now() WHERE id=$1 RETURNING *`, [id, goal ?? row.goal])).rows[0];
    });
  }
  async designed(id, version, plan, error) {
    const { rowCount } = await this.pool.query(`UPDATE team_projects SET status=$3,plan=COALESCE($4,plan),
      plan_version=plan_version+CASE WHEN $4::jsonb IS NULL THEN 0 ELSE 1 END,error_code=$5,updated_at=now()
      WHERE id=$1 AND dispatch_version=$2 AND status='planning'`, [id, version, plan ? 'ready' : 'failed', plan ?? null, error ?? null]);
    return rowCount === 1;
  }
  async deleteProject(id, who) {
    return this.transaction(async c => {
      await this.project(c, id, who, true);
      const active = await c.query("SELECT 1 FROM team_runs WHERE project_id=$1 AND status IN ('queued','running')", [id]);
      if (active.rowCount) throw new HttpError(409, 'run_active');
      await c.query('DELETE FROM team_checkpoints WHERE key LIKE ANY (SELECT id::text || \':%\' FROM team_runs WHERE project_id=$1)', [id]);
      await c.query('DELETE FROM team_projects WHERE id=$1', [id]);
    });
  }

  // Runs: an immutable snapshot of the plan executed by the worker.
  async startRun(projectId, who, key) {
    return this.transaction(async c => {
      const project = await this.project(c, projectId, who, true);
      const old = (await c.query('SELECT * FROM team_runs WHERE tenant_id=$1 AND user_id=$2 AND idempotency_key=$3',
        [who.tenant, who.user, key])).rows[0];
      if (old) {
        if (old.project_id !== projectId) throw new HttpError(409, 'idempotency_conflict');
        return old;
      }
      if (project.status !== 'ready') throw new HttpError(409, 'plan_not_ready');
      // One active team per user keeps the daily model budget predictable.
      const active = await c.query(`SELECT 1 FROM team_runs WHERE tenant_id=$1 AND user_id=$2 AND status IN ('queued','running')`,
        [who.tenant, who.user]);
      if (active.rowCount) throw new HttpError(409, 'run_active');
      const states = Object.fromEntries(project.plan.tasks.map(t => [t.id, { status: 'pending' }]));
      const run = (await c.query(`INSERT INTO team_runs(id,project_id,tenant_id,user_id,idempotency_key,plan,plan_version,task_states)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [randomUUID(), projectId, who.tenant, who.user, key, project.plan, project.plan_version, states])).rows[0];
      await this.event(c, run.id, 'queued');
      await c.query('UPDATE team_projects SET updated_at=now() WHERE id=$1', [projectId]);
      return run;
    });
  }
  async run(c, id, who, lock = false) {
    const { rows } = await c.query(`SELECT * FROM team_runs WHERE id=$1 AND tenant_id=$2 AND user_id=$3${lock ? ' FOR UPDATE' : ''}`,
      [id, who.tenant, who.user]);
    if (!rows.length) throw new HttpError(404, 'run_not_found');
    return rows[0];
  }
  async cancel(id, who) {
    return this.transaction(async c => {
      const row = await this.run(c, id, who, true);
      if (!['queued', 'running'].includes(row.status)) return row;
      const result = await c.query("UPDATE team_runs SET status='cancelled',updated_at=now() WHERE id=$1 RETURNING *", [id]);
      await this.event(c, id, 'cancelled'); return result.rows[0];
    });
  }
  async taskState(runId, taskId, status, output) {
    await this.transaction(async c => {
      const value = { status, ...(output !== undefined ? { output: output.slice(0, 6000) } : {}) };
      await c.query(`UPDATE team_runs SET task_states=jsonb_set(task_states,ARRAY[$2::text],
        COALESCE(task_states->$2,'{}'::jsonb) || $3::jsonb),updated_at=now() WHERE id=$1`, [runId, taskId, value]);
      await this.event(c, runId, 'task', taskId, { status });
    });
  }
  async activity(runId, taskId, data) {
    await this.transaction(async c => {
      await c.query(`UPDATE team_runs SET task_states=jsonb_set(task_states,ARRAY[$2::text],
        COALESCE(task_states->$2,'{}'::jsonb) || jsonb_build_object('activity',$3::jsonb)) WHERE id=$1`, [runId, taskId, { ...data, at: new Date().toISOString() }]);
      await this.event(c, runId, 'activity', taskId, data);
    });
  }
  async finishTasks(runId, final) {
    if (!Object.keys(final).length) return;
    await this.transaction(async c => {
      const states = (await c.query('SELECT task_states FROM team_runs WHERE id=$1 FOR UPDATE', [runId])).rows[0]?.task_states ?? {};
      for (const [id, value] of Object.entries(final)) {
        states[id] = { ...states[id], status: value.status, ...(value.output !== undefined ? { output: value.output } : {}) };
      }
      await c.query('UPDATE team_runs SET task_states=$2 WHERE id=$1', [runId, states]);
    });
  }
  async files(runId) {
    return (await this.pool.query(`SELECT id,path,task_id,media_type,size,sha256,updated_at FROM team_files
      WHERE run_id=$1 ORDER BY path`, [runId])).rows;
  }
  async file(runId, fileId) {
    const { rows } = await this.pool.query('SELECT * FROM team_files WHERE run_id=$1 AND id=$2', [runId, fileId]);
    if (!rows.length) throw new HttpError(404, 'file_not_found');
    return rows[0];
  }
  async heartbeat(id) {
    await this.pool.query(`INSERT INTO team_workers(id,seen_at) VALUES($1,now())
      ON CONFLICT(id) DO UPDATE SET seen_at=now()`, [id]);
    await this.pool.query("DELETE FROM team_workers WHERE seen_at < now() - interval '1 hour'");
  }
  async close() { await this.pool.end(); }
}
