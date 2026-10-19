import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { OpenMultiAgent, createAdapter, defineTool } from '@open-multi-agent/core';
import { z } from 'zod';
import { log } from './config.mjs';

const FILE_LIMIT = 2 * 1024 * 1024;
const RUN_FILE_LIMIT = 20 * 1024 * 1024;
const MAX_FILES = 200;
const TYPES = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', json: 'application/json', csv: 'text/csv', svg: 'image/svg+xml', xml: 'application/xml',
  yaml: 'text/yaml', yml: 'text/yaml', py: 'text/x-python', ts: 'text/plain', tsx: 'text/plain' };
const mediaType = path => TYPES[path.split('.').pop()?.toLowerCase()] ?? 'application/octet-stream';
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const clip = (value, max) => (value.length > max ? `${value.slice(0, max)}…` : value);

/** Designer settings: the commander only needs a chat model, no recording. */
export function modelSettings(settings, adapter) {
  if (adapter) return { model: 'test-model', adapter };
  if (!settings.gateway) throw Object.assign(new Error('model_not_configured'), { code: 'model_not_configured' });
  return { provider: 'openai', baseURL: settings.gateway.url, apiKey: settings.gateway.key, model: settings.gateway.model };
}

/** Wraps a model adapter so every reply is recorded (text for the work log, usage for the bill). */
function recording(base, onReply) {
  const wrapped = Object.create(base);
  wrapped.chat = async (messages, options) => { const reply = await base.chat(messages, options); onReply(reply); return reply; };
  wrapped.stream = async function* (messages, options) {
    for await (const event of base.stream(messages, options)) { if (event.type === 'done') onReply(event.data); yield event; }
  };
  return wrapped;
}

const RULES = workspace => `\n\n## 工作区\n团队共享工作目录是 ${workspace}。工具里的文件路径必须是以它开头的绝对路径。` +
  '交付物必须写成文件保存在这个目录（可以用子目录区分模块，文件名简洁可读，不要再建一层以项目命名的外层文件夹）；单次写入过长时先写主体再用 file_edit 补充。' +
  '开始前先用 glob 查看已有文件，只读取你真正需要的文件，同一个文件不要反复读取；在其基础上继续，除非任务要求，不要覆盖别人的文件。' +
  '最后用几句话说明你写入或修改了哪些文件、完成了什么；没完成的部分如实说明，不要声称做了没做的事。';

// The gateway caps a request at 200 KB of context. OMA estimates 4 chars per token, so
// compacting at 16000 keeps even all-CJK conversations (3 bytes per char) under the cap.
// timeoutMs bounds one agent run so a stuck node fails instead of holding the team.
const LIMITS = { maxTokens: 8192, maxToolOutputChars: 12000, callTimeoutMs: 240000, timeoutMs: 15 * 60 * 1000,
  contextStrategy: { type: 'compact', maxTokens: 16000, preserveRecentTurns: 3 },
  loopDetection: { maxRepetitions: 3, onLoopDetected: 'warn' } };

const JUDGE = {
  review: '你负责审查这个任务。先用 glob 和 file_read 打开工作区里与任务相关的文件，对照任务要求逐项检查，只根据文件的实际内容评判，' +
    '不要轻信作者的描述。有明确缺陷才不通过（accept=false），并在 critique 里具体指出要改哪个文件的哪部分；通过时 critique 留空。',
  discussion: '你从自己的专业角度参与讨论这个任务的成果。先用 glob 和 file_read 查看相关文件，只提出你的专业视角下真正重要的改进意见' +
    '（accept=false，写在 critique 里）；没有重要问题就通过（accept=true，critique 留空）。',
};
const verdict = z.object({ accept: z.boolean(), critique: z.string().max(4000) });
const FINAL = '\n\n## 交付\n你负责团队的最后一步。完成后调用 deliver 工具，登记要交给用户的最终文件（可以包括其他角色写的文件，' +
  '路径相对于工作目录，例如 site/index.html）；草稿、过程记录和中间文件不要登记。';

/** The final node names the files the user receives; paths must exist in the workspace. */
function deliverTool(workspace, chosen) {
  return defineTool({
    name: 'deliver',
    description: '登记交给用户的最终交付文件（路径相对于团队工作目录）。可以多次调用，以最后一次为准。',
    inputSchema: z.object({ paths: z.array(z.string().min(1).max(200)).min(1).max(100) }),
    execute: async ({ paths }) => {
      const missing = [];
      for (const path of paths) {
        const full = join(workspace, ...path.split('/'));
        if (!full.startsWith(workspace + sep) || !(await stat(full).then(s => s.isFile(), () => false))) missing.push(path);
      }
      if (missing.length) return { data: `这些文件不存在：${missing.join('、')}`, isError: true };
      chosen.splice(0, chosen.length, ...paths);
      return { data: `已登记 ${paths.length} 个交付文件。`, isError: false };
    },
  });
}

/** Everything an agent needs about one node: its task, what upstream nodes produced, the goal. */
export function nodeBrief(plan, task, states, owned) {
  const roles = new Map(plan.roles.map(r => [r.id, r.name]));
  const byId = new Map(plan.tasks.map(t => [t.id, t]));
  const upstream = task.depends_on.map(id => {
    const dep = byId.get(id);
    const files = owned(id);
    return `### 「${dep.title}」（${roles.get(dep.role) ?? dep.role}）\n${clip(states[id]?.output ?? '（没有说明）', 1500)}` +
      (files.length ? `\n写入的文件：${files.join('、')}` : '');
  });
  return `## 你的任务：${task.title}\n${task.description}` +
    (upstream.length ? `\n\n## 前置节点的成果（需要时用 file_read 打开这些文件）\n${upstream.join('\n\n')}` : '') +
    (states[task.id]?.resumed ? '\n\n这个任务之前被暂停过，工作区里可能已有写了一半的文件：先查看，再在其基础上继续完成。' : '') +
    `\n\n## 团队目标\n${plan.summary}`;
}

export function createEngine(store, settings, { adapter, onStall, onAbandoned } = {}) {
  const stallMs = settings.stallMs ?? 8 * 60 * 1000;
  const abandonMs = settings.abandonMs ?? 60 * 1000;
  const concurrency = settings.concurrency ?? 2;
  let gateway;
  async function baseAdapter() {
    if (adapter) return { adapter, model: 'test-model' };
    if (!settings.gateway) throw Object.assign(new Error('model_not_configured'), { code: 'model_not_configured' });
    gateway ??= await createAdapter('openai', settings.gateway.key, settings.gateway.url);
    return { adapter: gateway, model: settings.gateway.model };
  }

  /** Copies changed workspace files into the run; `owners` attributes paths to the node that wrote them. */
  async function syncFiles(runId, workspace, owners) {
    const entries = await readdir(workspace, { recursive: true, withFileTypes: true }).catch(() => []);
    let total = 0, count = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath ?? entry.path, entry.name);
      const path = relative(workspace, full).split(sep).join('/');
      if (path.startsWith('.') || path.includes('/.')) continue;
      const size = (await stat(full)).size;
      if (size > FILE_LIMIT || total + size > RUN_FILE_LIMIT || ++count > MAX_FILES) {
        await store.event(store.pool, runId, 'file_skipped', owners.get(path) ?? null, { path, size });
        continue;
      }
      total += size;
      const content = await readFile(full);
      await store.pool.query(`INSERT INTO team_files(id,run_id,path,task_id,media_type,size,sha256,content)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(run_id,path) DO UPDATE SET content=EXCLUDED.content,size=EXCLUDED.size,sha256=EXCLUDED.sha256,
          task_id=COALESCE(EXCLUDED.task_id,team_files.task_id),media_type=EXCLUDED.media_type,updated_at=now()
        WHERE team_files.sha256<>EXCLUDED.sha256 OR team_files.task_id IS DISTINCT FROM COALESCE(EXCLUDED.task_id,team_files.task_id)`,
      [randomUUID(), runId, path, owners.get(path) ?? null, mediaType(path), size, sha(content), content]);
    }
  }

  async function rehydrate(runId, workspace) {
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    const { rows } = await store.pool.query('SELECT path,content,task_id FROM team_files WHERE run_id=$1', [runId]);
    for (const row of rows) {
      const full = join(workspace, ...row.path.split('/'));
      if (!full.startsWith(workspace + sep)) continue;
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, row.content);
    }
    return new Map(rows.filter(r => r.task_id).map(r => [r.path, r.task_id]));
  }

  async function execute(runId, version) {
    const lock = await store.pool.connect();
    const workspace = join(tmpdir(), 'team-runs', runId);
    const active = new Map();
    const pending = [];
    let watcher, giveUp, stalled = false, budgetHit = false, budgetPaused = false, progress = Date.now();
    const abandoned = new Promise(resolve => { giveUp = resolve; });
    try {
      await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [runId]);
      const run = (await lock.query('SELECT * FROM team_runs WHERE id=$1', [runId])).rows[0];
      if (!run || run.dispatch_version !== version || !['queued', 'running'].includes(run.status)) return;
      const model = await baseAdapter();
      await store.transaction(async c => {
        await c.query("UPDATE team_runs SET status='running',updated_at=now() WHERE id=$1 AND dispatch_version=$2", [runId, version]);
        await store.event(c, runId, 'running');
      });
      await store.recoverNodes(runId);
      const owners = await rehydrate(runId, workspace);
      const owned = id => [...owners].filter(([, owner]) => owner === id).map(([path]) => path).sort();
      // Work records are written one after another so their order matches what happened.
      let chain = Promise.resolve();
      const record = (taskId, data) => {
        chain = chain.then(() => store.event(store.pool, runId, 'log', taskId, data)).catch(() => log('log_unavailable', { run_id: runId }));
        pending.push(chain);
      };

      watcher = setInterval(() => {
        // No model reply, tool call or node change for stallMs: profile, stop everything,
        // and if the framework ignores the abort, give up on it after abandonMs.
        if (!stalled && Date.now() - progress > stallMs) {
          stalled = true;
          log('run_stalled', { run_id: runId, idle_ms: Date.now() - progress });
          onStall?.(runId);
          for (const node of active.values()) node.abort.abort('stalled');
          setTimeout(() => giveUp({ abandoned: true }), abandonMs).unref();
        }
      }, 2000);

      /** One agent turn sequence, recorded under the node and billed to the run. */
      async function agentRun(task, role, phase, prompt, signal, { judge = false, delivered } = {}) {
        const label = role.id;
        const priced = settings.prices?.[model.model] ?? { input: 0, output: 0 };
        const replies = recording(model.adapter, reply => {
          progress = Date.now();
          const text = reply.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
          if (text && !judge) record(task.id, { kind: 'text', agent: label, phase, text: clip(text, 4000) });
          const input = reply.usage?.input_tokens ?? 0, output = reply.usage?.output_tokens ?? 0;
          pending.push(store.spend(runId, input, output, (input * priced.input + output * priced.output) / 1e6)
            .then(over => { if (over && !budgetHit) budgetHit = true; })
            .catch(() => log('spend_unavailable', { run_id: runId })));
          pending.push(store.activity(runId, task.id, { kind: 'model', agent: label, phase })
            .catch(() => log('activity_unavailable', { run_id: runId })));
        });
        const onTrace = trace => {
          progress = Date.now();
          if (trace.type !== 'tool_call') return;
          const local = typeof trace.input?.path === 'string' ? relative(workspace, trace.input.path).split(sep).join('/') : '';
          const path = local && !local.startsWith('..') ? local.slice(0, 200) : undefined;
          if (path && !trace.isError && ['file_write', 'file_edit'].includes(trace.tool)) owners.set(path, task.id);
          const entry = { kind: 'tool', agent: label, phase, tool: trace.tool, ...(path ? { path } : {}), ...(trace.isError ? { error: true } : {}) };
          record(task.id, entry);
          pending.push(store.activity(runId, task.id, entry).catch(() => log('activity_unavailable', { run_id: runId })));
        };
        const oma = new OpenMultiAgent({ defaultCwd: workspace, onTrace });
        const agent = { name: `${task.id}-${label}-${phase}`, ...LIMITS, model: model.model, adapter: replies,
          systemPrompt: `你是团队中的「${role.name}」。${role.description}\n\n${role.instructions}${RULES(workspace)}` +
            (judge ? `\n\n${JUDGE[task.review.mode]}` : '') + (delivered ? FINAL : ''),
          tools: judge ? ['file_read', 'glob'] : ['file_read', 'file_write', 'file_edit', 'glob', ...(delivered ? ['deliver'] : [])],
          ...(delivered ? { customTools: [deliverTool(workspace, delivered)] } : {}),
          maxTurns: judge ? 6 : 12, ...(judge ? { outputSchema: verdict } : {}) };
        record(task.id, { kind: 'start', agent: label, phase });
        const result = await oma.runAgent(agent, prompt, { abortSignal: signal });
        if (signal.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted' });
        if (!result.success) throw Object.assign(new Error(String(result.error?.message ?? result.output ?? 'agent_failed')), { code: 'agent_failed' });
        return result;
      }

      /** Author works, reviewers judge, the author revises on dissent, up to max_rounds. */
      async function runNode(plan, task, states, signal, delivered) {
        const roles = new Map(plan.roles.map(r => [r.id, r]));
        const brief = nodeBrief(plan, task, states, owned);
        let result = await agentRun(task, roles.get(task.role), 'work', brief, signal, { delivered });
        for (let round = 1; task.review && round <= task.review.max_rounds; round++) {
          const opinions = [];
          for (const reviewer of task.review.reviewers) {
            const judged = await agentRun(task, roles.get(reviewer), 'review',
              `${brief}\n\n## 作者的说明\n${clip(result.output, 3000)}\n\n请检查工作区里的相关文件后给出结论。`, signal, { judge: true });
            const said = verdict.safeParse(judged.structured);
            const accept = said.success ? said.data.accept : true;
            const critique = said.success ? said.data.critique.trim() : '';
            record(task.id, { kind: 'verdict', agent: reviewer, round, accept, critique: clip(critique, 2000) });
            if (!accept && critique) opinions.push(`- 「${roles.get(reviewer).name}」：${critique}`);
          }
          if (!opinions.length) break;
          result = await agentRun(task, roles.get(task.role), 'revise',
            `${brief}\n\n## 你已完成初稿\n${clip(result.output, 2000)}\n\n## ${task.review.mode === 'discussion' ? '讨论意见' : '审查意见'}\n${opinions.join('\n')}\n\n请据此修改相关文件，最后说明改了什么。`, signal, { delivered });
        }
        return result.output;
      }

      function start(plan, task, states) {
        const abort = new AbortController();
        const node = { abort, done: false };
        // Final nodes (nothing depends on them) register the team's deliverables.
        const delivered = plan.tasks.some(t => t.depends_on.includes(task.id)) ? undefined : [];
        node.promise = (async () => {
          let status = 'completed', output, error = null;
          for (let attempt = 0; ; attempt++) {
            try { output = await runNode(plan, task, states, abort.signal, delivered); break; }
            catch (failure) {
              if (abort.signal.aborted) { status = abort.signal.reason === 'stalled' ? 'failed' : 'paused'; error = abort.signal.reason === 'stalled' ? 'stalled' : null; break; }
              // The gateway's CNY limit is the usual reason a healthy team stops; never retry it.
              const code = /provider_budget_exceeded/.test(String(failure?.message)) ? 'model_budget_exhausted' : 'agent_failed';
              if (attempt === 0 && code === 'agent_failed') { record(task.id, { kind: 'retry' }); continue; }
              status = 'failed'; error = code;
              log('node_failed', { run_id: runId, task_id: task.id, error_code: error });
              break;
            }
          }
          await Promise.allSettled(pending.splice(0));
          await syncFiles(runId, workspace, owners).catch(() => log('file_sync_unavailable', { run_id: runId }));
          await store.nodeState(runId, task.id, { status, error, finished_at: new Date().toISOString(),
            ...(status === 'paused' ? { resumed: true } : {}), ...(output !== undefined ? { output: clip(output, 6000), resumed: false } : {}),
            ...(status === 'completed' && delivered ? { deliverables: delivered.length ? delivered : owned(task.id) } : {}) });
          record(task.id, { kind: 'end', status, ...(error ? { error } : {}) });
          progress = Date.now();
          node.done = true;
        })();
        active.set(task.id, node);
      }

      while (!stalled) {
        const [{ rows: [project] }, { rows: [current] }] = await Promise.all([
          store.pool.query('SELECT plan,budget_cny FROM team_projects WHERE id=$1', [run.project_id]),
          store.pool.query('SELECT status,task_states,spent_cny FROM team_runs WHERE id=$1', [runId]),
        ]);
        if (!project || !current) break;
        const plan = project.plan, states = current.task_states;
        if (!budgetHit && Number(current.spent_cny) >= Number(project.budget_cny)) budgetHit = true;
        if (budgetHit && !budgetPaused) { budgetPaused = true; await store.pauseAll(runId); continue; }
        for (const [id, node] of active) if (states[id]?.status === 'pausing') node.abort.abort('pause');
        for (const [id, node] of active) if (node.done) active.delete(id);
        const ready = budgetHit ? [] : plan.tasks.filter(t => states[t.id]?.status === 'queued' && !active.has(t.id) &&
          t.depends_on.every(d => states[d]?.status === 'completed'));
        for (const task of ready) {
          if (active.size >= concurrency) break;
          if (await store.nodeState(runId, task.id, { status: 'running', started_at: new Date().toISOString(), error: null }, ['queued'])) {
            progress = Date.now();
            start(plan, task, states);
          }
        }
        if (!active.size) {
          // Nothing can run: queued nodes left are waiting on an upstream node that is not coming.
          const blocked = plan.tasks.filter(t => states[t.id]?.status === 'queued');
          for (const t of blocked) { await store.nodeState(runId, t.id, { status: 'pending', error: 'upstream_not_ready' }, ['queued']); record(t.id, { kind: 'blocked' }); }
          break;
        }
        await Promise.race([new Promise(r => setTimeout(r, 1000)), ...[...active.values()].map(n => n.promise)]);
      }
      const outcome = await Promise.race([Promise.allSettled([...active.values()].map(n => n.promise)).then(() => ({})), abandoned]);
      await Promise.allSettled(pending);
      await syncFiles(runId, workspace, owners).catch(() => log('file_sync_unavailable', { run_id: runId }));
      await store.settleRun(runId, version, stalled ? 'stalled' : budgetHit ? 'budget_exhausted' : null);
      // The framework kept running after the abort; only a process restart stops it.
      if (outcome.abandoned) onAbandoned?.(runId);
    } finally {
      clearInterval(watcher);
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      try { await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [runId]); } finally { lock.release(); }
    }
  }
  return { execute };
}
