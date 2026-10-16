import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { OpenMultiAgent } from '@open-multi-agent/core';
import { log } from './config.mjs';


const FILE_LIMIT = 2 * 1024 * 1024;
const RUN_FILE_LIMIT = 20 * 1024 * 1024;
const MAX_FILES = 200;
const TYPES = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', json: 'application/json', csv: 'text/csv', svg: 'image/svg+xml', xml: 'application/xml',
  yaml: 'text/yaml', yml: 'text/yaml', py: 'text/x-python', ts: 'text/plain', tsx: 'text/plain' };
const mediaType = path => TYPES[path.split('.').pop()?.toLowerCase()] ?? 'application/octet-stream';
const sha = buffer => createHash('sha256').update(buffer).digest('hex');

/**
 * OMA MemoryStore over Postgres, scoped to one run. Checkpoints survive a worker crash
 * and restore() resumes the remaining tasks. compareAndSet is atomic in SQL.
 */
function checkpointStore(pool, runId) {
  const scope = `${runId}:`;
  const entry = row => row && { key: row.key.slice(scope.length), value: row.value, metadata: row.metadata ?? undefined, createdAt: row.updated_at };
  return {
    async get(key) { return entry((await pool.query('SELECT * FROM team_checkpoints WHERE key=$1', [scope + key])).rows[0]) ?? null; },
    async set(key, value, metadata) {
      await pool.query(`INSERT INTO team_checkpoints(key,value,metadata) VALUES($1,$2,$3)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,metadata=EXCLUDED.metadata,updated_at=now()`, [scope + key, value, metadata ?? null]);
    },
    async compareAndSet(key, expected, value, metadata) {
      const result = expected === null
        ? await pool.query('INSERT INTO team_checkpoints(key,value,metadata) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [scope + key, value, metadata ?? null])
        : await pool.query('UPDATE team_checkpoints SET value=$3,metadata=$4,updated_at=now() WHERE key=$1 AND value=$2', [scope + key, expected, value, metadata ?? null]);
      return result.rowCount === 1;
    },
    async list() { return (await pool.query("SELECT * FROM team_checkpoints WHERE key LIKE $1 || '%' ORDER BY key", [scope])).rows.map(entry); },
    async delete(key) { await pool.query('DELETE FROM team_checkpoints WHERE key=$1', [scope + key]); },
    async clear() { await pool.query("DELETE FROM team_checkpoints WHERE key LIKE $1 || '%'", [scope]); },
  };
}

/** Model access goes through the budgeted gateway; tests inject an adapter instead. */
export function modelSettings(settings, adapter) {
  if (adapter) return { model: 'test-model', adapter };
  if (!settings.gateway) throw Object.assign(new Error('model_not_configured'), { code: 'model_not_configured' });
  return { provider: 'openai', baseURL: settings.gateway.url, apiKey: settings.gateway.key, model: settings.gateway.model };
}

const RULES = workspace => `\n\n## 工作区\n团队共享工作目录是 ${workspace}。工具里的文件路径必须是以它开头的绝对路径。` +
  '交付物必须写成文件保存在这个目录（可以用子目录区分模块，文件名简洁可读，不要再建一层以项目命名的外层文件夹）；单次写入过长时先写主体再用 file_edit 补充。' +
  '开始前先用 glob 查看已有文件，只读取你真正需要的文件，同一个文件不要反复读取；在其基础上继续，除非任务要求，不要覆盖别人的文件。' +
  '最后用几句话说明你写入或修改了哪些文件、完成了什么；没完成的部分如实说明，不要声称做了没做的事。';

// The gateway caps a request at 200 KB of context. OMA estimates 4 chars per token, so
// compacting at 16000 keeps even all-CJK conversations (3 bytes per char) under the cap
// while a summarising task can still hold several files at once.
// timeoutMs bounds one agent run, so a stalled task fails (and retries once) instead of
// holding the whole team forever.
const LIMITS = { maxTokens: 8192, maxToolOutputChars: 12000, callTimeoutMs: 240000, timeoutMs: 15 * 60 * 1000,
  contextStrategy: { type: 'compact', maxTokens: 16000, preserveRecentTurns: 3 },
  loopDetection: { maxRepetitions: 3, onLoopDetected: 'warn' } };

export function roster(plan, workspace, model) {
  return plan.roles.map(role => ({
    name: role.id, description: `${role.name}：${role.description}`.slice(0, 140),
    systemPrompt: `你是团队中的「${role.name}」。${role.description}\n\n${role.instructions}${RULES(workspace)}`,
    tools: ['file_read', 'file_write', 'file_edit', 'glob'], maxTurns: 12, ...LIMITS, ...model,
  }));
}

const JUDGE = {
  review: name => `你是「${name}」，负责审查这个任务。先用 glob 和 file_read 打开工作区里与任务相关的文件，` +
    '对照任务要求逐项检查，只根据文件的实际内容评判，不要轻信回答里的描述。有明确缺陷才不通过，并具体指出要改哪个文件的哪部分。',
  discussion: name => `你是「${name}」，从你的专业角度参与讨论这个任务的成果。先用 glob 和 file_read 查看相关文件，` +
    '只提出你的专业视角下真正重要的改进意见；如果从你的角度没有重要问题，就通过。',
};

export function taskSpecs(plan, agents) {
  const byId = new Map(plan.tasks.map(t => [t.id, t]));
  const names = new Map(plan.roles.map(r => [r.id, r.name]));
  // Reviewers inspect the files but never change them; the author revises.
  const judge = id => { const a = agents.find(x => x.name === id); return { ...a, tools: ['file_read', 'glob'], maxTurns: 6 }; };
  return plan.tasks.map(t => ({
    title: t.title, description: t.description, assignee: t.role,
    dependsOn: t.depends_on.map(d => byId.get(d).title),
    metadata: { planTaskId: t.id },
    maxRetries: 1, retryDelayMs: 3000,
    ...(t.review ? { verify: {
      judges: t.review.reviewers.map(judge),
      mode: t.review.mode === 'discussion' ? 'lens' : 'refute',
      maxRounds: t.review.max_rounds, onDissent: 'revise',
      judgePrompt: id => JUDGE[t.review.mode](names.get(id) ?? id),
    } } : {}),
  }));
}

export function createEngine(store, settings, { adapter } = {}) {
  async function syncFiles(runId, workspace, taskId) {
    const entries = await readdir(workspace, { recursive: true, withFileTypes: true }).catch(() => []);
    let total = 0, count = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath ?? entry.path, entry.name);
      const path = relative(workspace, full).split(sep).join('/');
      if (path.startsWith('.') || path.includes('/.')) continue;
      const size = (await stat(full)).size;
      if (size > FILE_LIMIT || total + size > RUN_FILE_LIMIT || ++count > MAX_FILES) {
        await store.event(store.pool, runId, 'file_skipped', taskId, { path, size });
        continue;
      }
      total += size;
      const content = await readFile(full);
      await store.pool.query(`INSERT INTO team_files(id,run_id,path,task_id,media_type,size,sha256,content)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(run_id,path) DO UPDATE SET content=EXCLUDED.content,size=EXCLUDED.size,sha256=EXCLUDED.sha256,
          task_id=EXCLUDED.task_id,media_type=EXCLUDED.media_type,updated_at=now()
        WHERE team_files.sha256<>EXCLUDED.sha256`,
      [randomUUID(), runId, path, taskId ?? null, mediaType(path), size, sha(content), content]);
    }
  }

  async function rehydrate(runId, workspace) {
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    const { rows } = await store.pool.query('SELECT path,content FROM team_files WHERE run_id=$1', [runId]);
    for (const row of rows) {
      const full = join(workspace, ...row.path.split('/'));
      if (!full.startsWith(workspace + sep)) continue;
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, row.content);
    }
  }

  async function execute(runId, version) {
    const lock = await store.pool.connect();
    const workspace = join(tmpdir(), 'team-runs', runId);
    const abort = new AbortController();
    let watcher;
    try {
      await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [runId]);
      const run = (await lock.query('SELECT * FROM team_runs WHERE id=$1', [runId])).rows[0];
      if (!run || run.dispatch_version !== version || !['queued', 'running'].includes(run.status)) return;
      const model = modelSettings(settings, adapter);
      await store.transaction(async c => {
        await c.query("UPDATE team_runs SET status='running',updated_at=now() WHERE id=$1 AND status IN ('queued','running')", [runId]);
        await store.event(c, runId, 'running');
      });
      await rehydrate(runId, workspace);
      watcher = setInterval(async () => {
        try {
          const { rows } = await store.pool.query('SELECT status FROM team_runs WHERE id=$1', [runId]);
          if (rows[0]?.status === 'cancelled') abort.abort();
        } catch { /* The next tick retries; cancellation is also checked at the end. */ }
      }, 2000);
      const plan = run.plan;
      const agents = roster(plan, workspace, model);
      const ids = new Map();
      const pending = [];
      const STATES = { task_start: 'running', task_complete: 'completed', task_skipped: 'skipped', task_retry: 'retrying', error: 'failed' };
      const onProgress = event => {
        const meta = event.data?.metadata?.planTaskId;
        if (meta && event.task) ids.set(event.task, meta);
        const taskId = ids.get(event.task);
        const state = STATES[event.type];
        if (!taskId || !state) return;
        const output = typeof event.data?.output === 'string' ? event.data.output : undefined;
        pending.push((async () => {
          await store.taskState(runId, taskId, state, output);
          if (event.type === 'task_complete') await syncFiles(runId, workspace, taskId);
        })().catch(() => log('task_state_unavailable', { run_id: runId })));
      };
      // Model turns and tool calls become a live activity line per task, so a long task
      // visibly makes progress instead of sitting on "running".
      const onTrace = trace => {
        if (trace.type !== 'llm_call' && trace.type !== 'tool_call') return;
        const taskId = ids.get(trace.taskId);
        if (!taskId) return;
        const path = typeof trace.input?.path === 'string' ? relative(workspace, trace.input.path).split(sep).join('/').slice(0, 200) : undefined;
        const data = trace.type === 'llm_call'
          ? { kind: 'model', agent: trace.agent, turn: trace.turn, tokens: trace.tokens, ms: trace.durationMs }
          : { kind: 'tool', agent: trace.agent, tool: trace.tool, ...(path ? { path } : {}), ...(trace.isError ? { error: true } : {}), ms: trace.durationMs };
        pending.push(store.activity(runId, taskId, data).catch(() => log('activity_unavailable', { run_id: runId })));
      };
      const oma = new OpenMultiAgent({ maxConcurrency: settings.concurrency ?? 2, defaultCwd: workspace, onProgress, onTrace });
      const team = oma.createTeam(runId, { name: 'team', agents });
      const specs = taskSpecs(plan, agents);
      const checkpoint = { store: checkpointStore(store.pool, runId), runId };
      const options = { checkpoint, abortSignal: abort.signal, maxTokenBudget: settings.runTokenBudget };
      const resumable = (await checkpoint.store.list()).length > 0;
      let result, failure;
      try {
        result = resumable ? await oma.restore(team, specs, options) : await oma.runTasks(team, specs, options);
      } catch (error) {
        failure = error;
      }
      await Promise.allSettled(pending);
      await syncFiles(runId, workspace, null).catch(() => log('file_sync_unavailable', { run_id: runId }));
      // Reconcile from the final record: tasks finished before a restore emit no events.
      const final = {};
      for (const t of result?.tasks ?? []) {
        const id = t.metadata?.planTaskId;
        if (!id) continue;
        const status = { completed: 'completed', skipped: 'skipped', blocked: 'skipped', failed: 'failed' }[t.status] ?? 'failed';
        final[id] = { status, output: result.taskResults?.get(t.id)?.output?.slice(0, 6000) };
      }
      await store.finishTasks(runId, final);
      const done = Object.values(final).filter(t => t.status === 'completed').length;
      let status = result?.success ? 'completed' : done ? 'partial' : 'failed';
      let error = result?.success ? null : String(failure?.code ?? failure?.name ?? (result?.status?.code && result.status.code !== 'ok' ? result.status.code : 'tasks_failed')).slice(0, 80);
      if (abort.signal.aborted) { status = 'cancelled'; error = null; }
      if (failure && !abort.signal.aborted) log('run_failed', { run_id: runId, error_code: error });
      await store.transaction(async c => {
        const updated = await c.query(`UPDATE team_runs SET status=$2,error_code=$3,updated_at=now()
          WHERE id=$1 AND status<>'cancelled' RETURNING id`, [runId, status, error]);
        if (updated.rowCount) await store.event(c, runId, status, null, { completed: done, total: plan.tasks.length,
          tokens: result?.totalTokenUsage ?? null, ...(error ? { error_code: error } : {}) });
      });
    } finally {
      clearInterval(watcher);
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      try { await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [runId]); } finally { lock.release(); }
    }
  }
  return { execute };
}
