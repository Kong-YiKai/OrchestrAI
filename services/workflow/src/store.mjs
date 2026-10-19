import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { HttpError } from './auth.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

export const publicProject = (row, runs, extra = {}) => ({ id: row.id, goal: row.goal, workspace_name: row.workspace_name,
  status: row.status, plan: row.plan, plan_version: row.plan_version, error_code: row.error_code,
  budget_cny: Number(row.budget_cny), created_at: row.created_at, updated_at: row.updated_at,
  ...(runs ? { runs: runs.map(r => publicRun(r)) } : {}), ...extra });
export const publicRun = (row, withPlan = false) => ({ id: row.id, project_id: row.project_id, status: row.status,
  plan_version: row.plan_version, task_states: row.task_states, error_code: row.error_code,
  spent_cny: Number(row.spent_cny ?? 0), tokens: row.tokens, created_at: row.created_at, updated_at: row.updated_at,
  ...(withPlan ? { plan: row.plan } : {}) });

const STARTED = ['completed', 'running', 'queued', 'pausing'];
const LEGACY = { skipped: 'pending', retrying: 'failed' };
/** Every task of the plan gets a state; statuses from older releases map onto the node model. */
const normalize = (plan, states = {}) => Object.fromEntries(plan.tasks.map(t => {
  const state = states[t.id] ?? {};
  return [t.id, { ...state, status: LEGACY[state.status] ?? state.status ?? 'pending' }];
}));
/** A run is complete when every node is, paused while any node is, otherwise idle. */
const runStatus = (plan, states) => plan.tasks.every(t => states[t.id]?.status === 'completed') ? 'completed'
  : plan.tasks.some(t => ['running', 'queued', 'pausing'].includes(states[t.id]?.status)) ? 'running'
    : plan.tasks.some(t => states[t.id]?.status === 'paused') ? 'paused' : 'idle';

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
      const inserted = await c.query(`INSERT INTO team_projects(id,tenant_id,user_id,idempotency_key,input_hash,goal,workspace_name,status,plan,plan_version,budget_cny)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(tenant_id,user_id,idempotency_key) DO NOTHING RETURNING *`,
      [randomUUID(), who.tenant, who.user, key, hash, input.goal, input.workspace_name,
        plan ? 'ready' : 'planning', plan ?? null, plan ? 1 : 0, input.budget_cny]);
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
  async latestRun(c, projectId, lock = false) {
    return (await c.query(`SELECT * FROM team_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [projectId])).rows[0];
  }
  /** Edits never touch nodes that started or finished (`violations` decides, from the live run). */
  async savePlan(id, who, version, plan, violations) {
    return this.transaction(async c => {
      const row = await this.project(c, id, who, true);
      if (row.status === 'planning') throw new HttpError(409, 'plan_in_progress');
      if (row.plan_version !== version) throw new HttpError(409, 'stale_plan');
      const run = await this.latestRun(c, id);
      const problems = run && row.plan ? violations(row.plan, plan, run.task_states) : [];
      if (problems.length) throw Object.assign(new HttpError(409, 'task_locked'), { detail: problems });
      return (await c.query(`UPDATE team_projects SET plan=$2,plan_version=plan_version+1,status='ready',error_code=NULL,
        updated_at=now() WHERE id=$1 RETURNING *`, [id, plan])).rows[0];
    });
  }
  async setBudget(id, who, budget) {
    return this.transaction(async c => {
      await this.project(c, id, who, true);
      return (await c.query('UPDATE team_projects SET budget_cny=$2,updated_at=now() WHERE id=$1 RETURNING *', [id, budget])).rows[0];
    });
  }
  /** The commander redesigns from the user's instructions; started nodes stay as they are. */
  async redesign(id, who, goal, note) {
    return this.transaction(async c => {
      const row = await this.project(c, id, who, true);
      if (row.status === 'planning') return row;
      const run = await this.latestRun(c, id);
      if (run && Object.values(run.task_states).some(t => ['running', 'queued', 'pausing'].includes(t.status)))
        throw new HttpError(409, 'run_active');
      return (await c.query(`UPDATE team_projects SET status='planning',goal=$2,design_note=$3,error_code=NULL,
        dispatch_version=dispatch_version+1,updated_at=now() WHERE id=$1 RETURNING *`, [id, goal ?? row.goal, note ?? null])).rows[0];
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

  // Runs: one live run per project. Nodes are queued, paused and resumed individually and
  // the worker executes whatever is queued and ready.
  async run(c, id, who, lock = false) {
    const { rows } = await c.query(`SELECT * FROM team_runs WHERE id=$1 AND tenant_id=$2 AND user_id=$3${lock ? ' FOR UPDATE' : ''}`,
      [id, who.tenant, who.user]);
    if (!rows.length) throw new HttpError(404, 'run_not_found');
    return rows[0];
  }
  async control(projectId, who, action, taskId, runnable) {
    return this.transaction(async c => {
      const project = await this.project(c, projectId, who, true);
      if (project.status !== 'ready') throw new HttpError(409, 'plan_not_ready');
      const plan = project.plan;
      if (taskId && !plan.tasks.some(t => t.id === taskId)) throw new HttpError(404, 'task_not_found');
      let run = await this.latestRun(c, projectId, true);
      const states = normalize(plan, run?.task_states);
      const titles = new Map(plan.tasks.map(t => [t.id, `「${t.title}」`]));
      if (action === 'pause') {
        if (!run) throw new HttpError(409, 'not_running');
        for (const id of taskId ? [taskId] : Object.keys(states)) {
          const status = states[id].status;
          if (status === 'running') states[id] = { ...states[id], status: 'pausing' };
          else if (status === 'queued') states[id] = { ...states[id], status: 'paused', resumed: false };
          else if (taskId && status !== 'pausing') throw new HttpError(409, 'not_running');
        }
        const row = (await c.query('UPDATE team_runs SET task_states=$2,updated_at=now() WHERE id=$1 RETURNING *', [run.id, states])).rows[0];
        await this.event(c, run.id, 'pause', taskId ?? null);
        return row;
      }
      // One working team per user keeps the shared daily model budget predictable.
      const other = await c.query(`SELECT 1 FROM team_runs WHERE tenant_id=$1 AND user_id=$2 AND project_id<>$3 AND status IN ('queued','running')`,
        [who.tenant, who.user, projectId]);
      if (other.rowCount) throw new HttpError(409, 'run_active');
      if (!taskId) {
        const checked = runnable(plan);
        if (!checked.ok) throw Object.assign(new HttpError(422, checked.error), { detail: checked.detail });
      }
      if (run && Number(run.spent_cny) >= Number(project.budget_cny)) throw new HttpError(409, 'budget_exhausted');
      if (taskId) {
        const status = states[taskId].status;
        if (status === 'completed') throw new HttpError(409, 'task_locked');
        if (!['running', 'queued', 'pausing'].includes(status)) {
          const waiting = plan.tasks.find(t => t.id === taskId).depends_on
            .filter(d => !['completed', 'queued', 'running'].includes(states[d].status));
          if (waiting.length) throw Object.assign(new HttpError(409, 'upstream_not_ready'), { detail: waiting.map(d => titles.get(d)) });
          states[taskId] = { ...states[taskId], status: 'queued', error: null };
        }
      } else {
        for (const [id, state] of Object.entries(states)) if (!STARTED.includes(state.status)) states[id] = { ...state, status: 'queued', error: null };
      }
      run ??= await this.newRun(c, project, who, states);
      // A new dispatch version wakes the worker; it waits for any job still holding the run.
      const row = (await c.query(`UPDATE team_runs SET task_states=$2,status='queued',error_code=NULL,plan=$3,plan_version=$4,
        dispatch_version=dispatch_version+1,updated_at=now() WHERE id=$1 RETURNING *`, [run.id, states, plan, project.plan_version])).rows[0];
      await this.event(c, run.id, 'queued', taskId ?? null);
      await c.query('UPDATE team_projects SET updated_at=now() WHERE id=$1', [projectId]);
      return row;
    });
  }
  async newRun(c, project, who, states) {
    return (await c.query(`INSERT INTO team_runs(id,project_id,tenant_id,user_id,idempotency_key,plan,plan_version,task_states,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'idle') RETURNING *`,
    [randomUUID(), project.id, who.tenant, who.user, randomUUID(), project.plan, project.plan_version, states ?? normalize(project.plan)])).rows[0];
  }
  /** A node the user may still change: it exists and has not started or finished. */
  async editableNode(c, projectId, who, taskId) {
    const project = await this.project(c, projectId, who, true);
    if (project.status !== 'ready') throw new HttpError(409, 'plan_not_ready');
    if (!project.plan.tasks.some(t => t.id === taskId)) throw new HttpError(404, 'task_not_found');
    const run = await this.latestRun(c, projectId, true);
    const status = normalize(project.plan, run?.task_states)[taskId].status;
    if (!['pending', 'paused', 'failed'].includes(status)) throw new HttpError(409, 'task_locked');
    return { project, run };
  }
  /** Files the user attaches to a node live under inputs/<node>/ in the project's live run. */
  async addInput(projectId, who, taskId, name, content, mediaType) {
    return this.transaction(async c => {
      const { project } = await this.editableNode(c, projectId, who, taskId);
      const run = (await this.latestRun(c, projectId, true)) ?? await this.newRun(c, project, who);
      const path = `inputs/${taskId}/${name}`;
      const used = (await c.query('SELECT COALESCE(sum(size),0)::int AS n, count(*)::int AS files FROM team_files WHERE run_id=$1 AND path<>$2', [run.id, path])).rows[0];
      if (used.n + content.length > 20 * 1024 * 1024 || used.files >= 200) throw new HttpError(413, 'run_storage_full');
      const row = (await c.query(`INSERT INTO team_files(id,run_id,path,task_id,media_type,size,sha256,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(run_id,path) DO UPDATE SET content=EXCLUDED.content,size=EXCLUDED.size,sha256=EXCLUDED.sha256,media_type=EXCLUDED.media_type,updated_at=now()
        RETURNING id,path,task_id,media_type,size,sha256`, [randomUUID(), run.id, path, taskId, mediaType, content.length, sha(content), content])).rows[0];
      await this.event(c, run.id, 'input', taskId, { path });
      return { ...row, run_id: run.id };
    });
  }
  async removeInput(projectId, who, fileId) {
    return this.transaction(async c => {
      const run = await this.latestRun(c, (await this.project(c, projectId, who, true)).id, true);
      const file = run && (await c.query('SELECT path,task_id FROM team_files WHERE run_id=$1 AND id=$2', [run.id, fileId])).rows[0];
      if (!file || !file.path.startsWith('inputs/')) throw new HttpError(404, 'file_not_found');
      await this.editableNode(c, projectId, who, file.task_id);
      await c.query('DELETE FROM team_files WHERE run_id=$1 AND id=$2', [run.id, fileId]);
    });
  }
  async chats(projectId, taskId) {
    return (await this.pool.query('SELECT role,content,created_at FROM team_chats WHERE project_id=$1 AND task_id=$2 ORDER BY seq LIMIT 200',
      [projectId, taskId])).rows;
  }
  async addChat(projectId, taskId, role, content) {
    await this.pool.query('INSERT INTO team_chats(project_id,task_id,role,content) VALUES($1,$2,$3,$4)', [projectId, taskId, role, content]);
  }
  /** Worker restart: nodes a dead worker was running go back to the queue (or to paused). */
  async recoverNodes(runId) {
    await this.transaction(async c => {
      const run = (await c.query('SELECT task_states FROM team_runs WHERE id=$1 FOR UPDATE', [runId])).rows[0];
      const states = run.task_states;
      for (const [id, state] of Object.entries(states)) {
        if (state.status === 'running') states[id] = { ...state, status: 'queued', resumed: true };
        if (state.status === 'pausing') states[id] = { ...state, status: 'paused', resumed: true };
      }
      await c.query('UPDATE team_runs SET task_states=$2 WHERE id=$1', [runId, states]);
    });
  }
  /** Merges `patch` into one node's state; with `onlyIf`, only from those statuses. */
  async nodeState(runId, taskId, patch, onlyIf) {
    return this.transaction(async c => {
      const run = (await c.query('SELECT task_states FROM team_runs WHERE id=$1 FOR UPDATE', [runId])).rows[0];
      const state = run.task_states[taskId] ?? { status: 'pending' };
      if (onlyIf && !onlyIf.includes(state.status)) return false;
      // A node the user paused while it finished keeps the user's decision unless it completed.
      const status = state.status === 'pausing' && patch.status === 'failed' ? 'paused' : patch.status;
      await c.query(`UPDATE team_runs SET task_states=jsonb_set(task_states,ARRAY[$2::text],$3::jsonb),updated_at=now() WHERE id=$1`,
        [runId, taskId, { ...state, ...patch, status }]);
      await this.event(c, runId, 'task', taskId, { status });
      return true;
    });
  }
  async pauseAll(runId) {
    await this.transaction(async c => {
      const run = (await c.query('SELECT task_states FROM team_runs WHERE id=$1 FOR UPDATE', [runId])).rows[0];
      const states = run.task_states;
      for (const [id, state] of Object.entries(states)) {
        if (state.status === 'running') states[id] = { ...state, status: 'pausing' };
        if (state.status === 'queued') states[id] = { ...state, status: 'paused' };
      }
      await c.query('UPDATE team_runs SET task_states=$2 WHERE id=$1', [runId, states]);
      await this.event(c, runId, 'pause', null, { reason: 'budget_exhausted' });
    });
  }
  /** Adds one model call to the run's bill; true once the team's budget is used up. */
  async spend(runId, input, output, cny) {
    const { rows } = await this.pool.query(`UPDATE team_runs r SET spent_cny=r.spent_cny+$4,
      tokens=jsonb_build_object('input',COALESCE((r.tokens->>'input')::bigint,0)+$2,'output',COALESCE((r.tokens->>'output')::bigint,0)+$3)
      FROM team_projects p WHERE r.id=$1 AND p.id=r.project_id RETURNING r.spent_cny>=p.budget_cny AS over`, [runId, input, output, cny]);
    return rows[0]?.over ?? false;
  }
  /** The worker is done with the run: leftover states settle and the run gets its status. */
  async settleRun(runId, version, errorCode) {
    await this.transaction(async c => {
      const run = (await c.query('SELECT * FROM team_runs WHERE id=$1 FOR UPDATE', [runId])).rows[0];
      if (!run || run.dispatch_version !== version) return;
      const plan = (await c.query('SELECT plan FROM team_projects WHERE id=$1', [run.project_id])).rows[0].plan;
      const states = normalize(plan, run.task_states);
      for (const [id, state] of Object.entries(states)) {
        if (errorCode === 'stalled' && ['running', 'pausing', 'queued'].includes(state.status)) states[id] = { ...state, status: 'failed', error: 'stalled' };
        else if (['running', 'pausing'].includes(state.status)) states[id] = { ...state, status: 'paused', resumed: true };
        else if (state.status === 'queued') states[id] = { ...state, status: 'pending' };
      }
      const status = runStatus(plan, states);
      const failed = Object.values(states).filter(t => t.status === 'failed');
      const error = errorCode ?? (failed.some(t => t.error === 'model_budget_exhausted') ? 'model_budget_exhausted' : failed.length ? 'tasks_failed' : null);
      await c.query('UPDATE team_runs SET status=$2,error_code=$3,task_states=$4,updated_at=now() WHERE id=$1', [runId, status, error, states]);
      const done = plan.tasks.filter(t => states[t.id].status === 'completed').length;
      await this.event(c, runId, status, null, { completed: done, total: plan.tasks.length, spent_cny: Number(run.spent_cny), ...(error ? { error_code: error } : {}) });
    });
  }
  async activity(runId, taskId, data) {
    await this.pool.query(`UPDATE team_runs SET task_states=jsonb_set(task_states,ARRAY[$2::text],
      COALESCE(task_states->$2,'{}'::jsonb) || jsonb_build_object('activity',$3::jsonb)) WHERE id=$1`, [runId, taskId, { ...data, at: new Date().toISOString() }]);
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
