import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import { authenticate } from '../src/auth.mjs';
import { config } from '../src/config.mjs';
import { migrate } from '../src/migrate.mjs';
import { Store } from '../src/store.mjs';
import { checkPlan, checkRunnable, estimate, lockViolations } from '../src/plan.mjs';
import { createEngine, nodeBrief } from '../src/engine.mjs';
import { createApi } from '../src/api.mjs';
import { startWorker, publish } from '../src/worker.mjs';
import { fakeModel, PLAN } from './fake-model.mjs';

const secret = 'test-only-delegation-01234567890123456789';
async function token({ user = 'alice', tenant = 'team', scope = ['runs:read', 'runs:write'], audience = 'orchestrai-workflow', expired = false } = {}, key = secret) {
  return new SignJWT({ tenant, scopes: scope }).setProtectedHeader({ alg: 'HS256' }).setIssuer('orchestrai-chat')
    .setAudience(audience).setSubject(user).setJti(randomUUID()).setIssuedAt()
    .setExpirationTime(expired ? Math.floor(Date.now() / 1000) - 60 : '2m').sign(new TextEncoder().encode(key));
}
const clone = value => structuredClone(value);

test('delegation rejects missing, forged, expired and wrong-audience tokens', async () => {
  for (const bearer of [undefined, 'Bearer nope', `Bearer ${await token({}, 'wrong-key')}`, `Bearer ${await token({ expired: true })}`, `Bearer ${await token({ audience: 'other' })}`]) {
    await assert.rejects(authenticate(bearer, secret, 'runs:read'), e => e.status === 401);
  }
  await assert.rejects(authenticate(`Bearer ${await token({ scope: [] })}`, secret, 'runs:read'), e => e.status === 403);
  assert.deepEqual(await authenticate(`Bearer ${await token()}`, secret, 'runs:read'), { user: 'alice', tenant: 'team' });
});

test('configuration requires secrets and only enables models with a gateway key', () => {
  assert.throws(() => config({}), /Missing/);
  assert.throws(() => config({ DATABASE_URL: 'x', REDIS_URL: 'redis://localhost', DELEGATION_SECRET: 'short' }), /32 bytes/);
  const base = { DATABASE_URL: 'x', REDIS_URL: 'redis://localhost', DELEGATION_SECRET: secret };
  assert.equal(config(base).gateway, null);
  assert.deepEqual(config({ ...base, GATEWAY_KEY: 'k' }).gateway, { url: 'http://gateway:4000/v1', key: 'k', model: 'deepseek-flash' });
  assert.deepEqual(config(base).prices['deepseek-flash'], { input: 2.4, output: 9.6 });
});

test('plans reject unknown references, self review, duplicate titles and cycles', () => {
  assert.equal(checkPlan(PLAN).ok, true);
  const broken = [
    p => { p.tasks[1].role = 'nobody'; },
    p => { p.tasks[1].depends_on = ['missing']; },
    p => { p.tasks[2].review.reviewers = [p.tasks[2].role]; },
    p => { p.tasks[1].title = p.tasks[0].title; },
    p => { p.tasks[0].depends_on = [p.tasks.at(-1).id]; },
    p => { p.roles[0].id = 'Bad Id'; },
    p => { p.extra = true; },
  ];
  for (const change of broken) {
    const plan = clone(PLAN); change(plan);
    assert.equal(checkPlan(plan).ok, false, JSON.stringify(plan).slice(0, 80));
  }
});


test('runnable workflows are connected; started nodes are frozen; costs are estimated per node', () => {
  assert.equal(checkRunnable(PLAN).ok, true);
  const loose = clone(PLAN); loose.tasks[3].depends_on = []; loose.tasks.push({ ...loose.tasks[0], id: 'extra', title: '多余', depends_on: [] });
  loose.tasks[3].depends_on = ['style', 'page'];
  const result = checkRunnable(loose);
  assert.equal(result.error, 'workflow_invalid');
  assert.deepEqual(result.detail, ['「多余」没有连到工作流上']);
  const states = { outline: { status: 'completed' }, style: { status: 'running' }, page: { status: 'paused' } };
  const moved = clone(PLAN); moved.tasks[0].position = { x: 5, y: 5 }; moved.tasks[2].description = 'changed while paused';
  assert.deepEqual(lockViolations(PLAN, moved, states), []);
  const edited = clone(PLAN); edited.tasks[0].description = 'changed';
  assert.deepEqual(lockViolations(PLAN, edited, states), ['「大纲」已完成，不能修改']);
  const removed = clone(PLAN); removed.tasks = removed.tasks.filter(t => t.id !== 'style');
  assert.deepEqual(lockViolations(PLAN, removed, states), ['「视觉样式」正在运行，不能删除']);
  const cost = estimate(PLAN, () => ({ input: 2.4, output: 9.6 }));
  assert.equal(cost.tasks.length, 4);
  assert.equal(cost.tasks[0].input_tokens, 60000);
  assert.ok(cost.tasks[2].cost_cny > cost.tasks[0].cost_cny, 'review costs more');
  assert.equal(cost.total_cny, Math.round(cost.tasks.reduce((sum, t) => sum + t.cost_cny, 0) * 100) / 100);
});

test('a node brief carries upstream summaries and the files they wrote', () => {
  const brief = nodeBrief(PLAN, PLAN.tasks[3], { style: { output: '样式写好了' }, page: { output: '页面写好了' }, readme: { resumed: true } },
    id => (id === 'page' ? ['site/index.html'] : []));
  assert.match(brief, /TASK:readme/);
  assert.match(brief, /「视觉样式」（美术）\n样式写好了/);
  assert.match(brief, /写入的文件：site\/index\.html/);
  assert.match(brief, /之前被暂停过/);
});

const integration = process.env.INTEGRATION === '1';
let settings, store, api, base;
before(async () => {
  if (!integration) return;
  settings = { ...config({ ...process.env, DELEGATION_SECRET: secret }), prices: { 'test-model': { input: 1, output: 1 } } };
  await migrate(settings.databaseUrl); await migrate(settings.databaseUrl);
  store = new Store(settings.databaseUrl);
  api = createApi(settings);
  await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${api.server.address().port}`;
});
after(async () => { if (api) await api.close(); if (store) await store.close(); });
async function request(path, { method = 'GET', body, who = {}, key } = {}) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(who)}`,
    ...(key ? { 'idempotency-key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const project = async (who = {}, extra = {}) => (await request('/projects', { method: 'POST', who, key: randomUUID(),
  body: { goal: '写一份调研报告', workspace_name: 'report', plan: PLAN, ...extra } })).body;
const control = (id, body, who = {}) => request(`/projects/${id}/control`, { method: 'POST', who, body });
async function until(read, done, label) {
  for (let i = 0; i < 300; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting for ${label}`);
}
const idle = r => !['queued', 'running'].includes(r.status);
const runOf = async (id, who = {}) => (await request(`/projects/${id}`, { who })).body.runs[0];
const userOf = who => ({ user: 'alice', tenant: 'team', ...who });
/** Runs the engine in-process for the project's live run, as the worker would. */
async function work(id, model, who = {}, extra = {}) {
  const row = await store.latestRun(store.pool, id);
  await createEngine(store, { ...settings, ...extra }, { adapter: model.adapter }).execute(row.id, row.dispatch_version);
  return store.run(store.pool, row.id, userOf(who));
}

test('readiness, least-privilege database identity and tenant isolation', { skip: !integration }, async () => {
  assert.equal((await fetch(base + '/health/ready')).status, 200);
  assert.equal((await fetch(base + '/projects')).status, 401);
  assert.equal((await store.pool.query("SELECT current_setting('is_superuser') AS value")).rows[0].value, 'off');
  const mine = await project();
  assert.equal((await request(`/projects/${mine.id}`, { who: { user: 'bob' } })).status, 404);
  assert.equal((await request(`/projects/${mine.id}`, { who: { tenant: 'other' } })).status, 404);
  assert.equal((await control(mine.id, { action: 'run' }, { user: 'bob' })).status, 404);
  assert.ok(!(await request('/projects', { who: { user: 'bob' } })).body.projects.some(p => p.id === mine.id));
  assert.equal((await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: 'x', workspace_name: '../etc' } })).status, 400);
  assert.equal((await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: 'x', workspace_name: 'x', budget_cny: 0 } })).status, 400);
  const bad = await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: 'x', workspace_name: 'x', plan: { ...PLAN, tasks: [] } } });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.detail.length);
});

test('concurrent retries create one project; edits and budgets are versioned and validated', { skip: !integration }, async () => {
  const key = randomUUID();
  const body = { goal: 'one', workspace_name: 'one', plan: PLAN, budget_cny: 3 };
  const replies = await Promise.all(Array.from({ length: 12 }, () => request('/projects', { method: 'POST', body, key })));
  assert.ok(replies.every(r => r.status === 202));
  assert.equal(new Set(replies.map(r => r.body.id)).size, 1);
  assert.equal((await request('/projects', { method: 'POST', body: { ...body, goal: 'two' }, key })).status, 409);
  const { id, plan_version } = replies[0].body;
  const edited = clone(PLAN); edited.summary = 'edited';
  assert.equal((await request(`/projects/${id}/plan`, { method: 'PUT', body: { version: plan_version, plan: edited } })).status, 200);
  assert.equal((await request(`/projects/${id}/plan`, { method: 'PUT', body: { version: plan_version, plan: edited } })).status, 409);
  const read = (await request(`/projects/${id}`)).body;
  assert.equal(read.plan.summary, 'edited');
  assert.equal(read.budget_cny, 3);
  assert.equal(read.estimate.tasks.length, PLAN.tasks.length);
  assert.equal((await request(`/projects/${id}/budget`, { method: 'PUT', body: { budget_cny: 12.345 } })).body.budget_cny, 12.35);
  const loose = clone(PLAN); loose.tasks.push({ ...PLAN.tasks[0], id: 'extra', title: '多余' });
  const saved = await request(`/projects/${id}/plan`, { method: 'PUT', body: { version: read.plan_version, plan: loose } });
  assert.equal(saved.status, 200, 'an unfinished canvas can be saved');
  const refused = await control(id, { action: 'run' });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.error, 'workflow_invalid');
});

test('the commander designs, the whole team runs in parallel with review, and every node keeps its record', { skip: !integration }, async () => {
  const model = fakeModel();
  const close = await startWorker(settings, { adapter: model.adapter, watchdog: false });
  try {
    const created = await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: '做一个网页', workspace_name: 'site', budget_cny: 5 } });
    assert.equal(created.body.status, 'planning');
    const ready = await until(async () => (await request(`/projects/${created.body.id}`)).body, p => p.status !== 'planning', 'design');
    assert.equal(ready.status, 'ready', JSON.stringify(ready));
    assert.deepEqual(ready.plan.tasks.map(t => t.id), PLAN.tasks.map(t => t.id));
    assert.equal((await control(ready.id, { action: 'run' })).status, 200);
    const done = await until(() => runOf(ready.id), idle, 'run');
    assert.equal(done.status, 'completed', JSON.stringify(done));
    assert.ok(Object.values(done.task_states).every(t => t.status === 'completed' && t.output));
    assert.ok(model.overlap() >= 2, 'independent nodes ran in parallel');
    assert.ok(model.judged() >= 2, 'review and discussion judges ran');
    assert.ok(done.spent_cny > 0 && done.tokens.input > 0);
    assert.deepEqual(done.task_states.readme.deliverables, ['README.md', 'site/index.html'], 'the final node registered the delivery');
    assert.equal(done.task_states.page.deliverables, undefined);
    assert.match(model.prompt('readme'), /「视觉样式」（美术）/, 'downstream sees upstream summaries');
    assert.match(model.prompt('readme'), /写入的文件：site\/index\.html/);
    const files = (await request(`/runs/${done.id}/files`)).body.files;
    assert.deepEqual(files.map(f => [f.path, f.task_id]).sort(), [['README.md', 'readme'], ['docs/outline.md', 'outline'], ['site/index.html', 'page'], ['site/style.css', 'style']]);
    const html = (await request(`/runs/${done.id}/files/${files.find(f => f.path === 'site/index.html').id}`)).body;
    assert.equal(html.encoding, 'utf8');
    const page = (await request(`/runs/${done.id}/events?task=page`)).body.events;
    assert.ok(page.every(e => e.task_id === 'page'));
    assert.ok(page.some(e => e.data.kind === 'tool' && e.data.tool === 'file_write' && e.data.path === 'site/index.html'));
    assert.ok(page.some(e => e.data.kind === 'verdict' && e.data.agent === 'approver' && e.data.accept === true));
    assert.ok(page.some(e => e.data.kind === 'text'));
    assert.equal((await control(ready.id, { action: 'run', task: 'outline' })).body.error, 'task_locked');
    const changed = clone(ready.plan); changed.tasks[0].description = 'TASK:outline FILE:other.md';
    const locked = await request(`/projects/${ready.id}/plan`, { method: 'PUT', body: { version: ready.plan_version, plan: changed } });
    assert.equal(locked.status, 409);
    assert.deepEqual(locked.body.detail, ['「大纲」已完成，不能修改']);
    assert.equal((await request(`/runs/${done.id}/files`, { who: { user: 'bob' } })).status, 404);
  } finally { await close(); }
});

test('single nodes run on their own once upstream is done; the team finishes the rest', { skip: !integration }, async () => {
  const mine = await project({ user: 'ivy' });
  const who = { user: 'ivy' };
  const early = await control(mine.id, { action: 'run', task: 'page' }, who);
  assert.equal(early.status, 409);
  assert.deepEqual(early.body.detail, ['「大纲」']);
  assert.equal((await control(mine.id, { action: 'run', task: 'outline' }, who)).status, 200);
  const model = fakeModel();
  let row = await work(mine.id, model, who);
  assert.equal(row.status, 'idle');
  assert.equal(row.task_states.outline.status, 'completed');
  assert.equal(row.task_states.page.status, 'pending');
  assert.equal((await control(mine.id, { action: 'run' }, who)).status, 200);
  row = await work(mine.id, model, who);
  assert.equal(row.status, 'completed');
  assert.equal(model.calls('outline'), 1, 'finished node was not run again');
});

test('pausing a running node keeps its files; continuing resumes it with that context', { skip: !integration }, async () => {
  const who = { user: 'jay' };
  const mine = await project(who);
  await control(mine.id, { action: 'run', task: 'outline' }, who);
  const model = fakeModel({ slow: { outline: 60000 } });
  const working = work(mine.id, model, who);
  await until(() => runOf(mine.id, who), r => r.task_states.outline?.status === 'running', 'node start');
  assert.equal((await control(mine.id, { action: 'pause', task: 'outline' }, who)).status, 200);
  let row = await working;
  assert.equal(row.task_states.outline.status, 'paused');
  assert.equal(row.status, 'paused');
  assert.equal((await control(mine.id, { action: 'pause', task: 'outline' }, who)).status, 409);
  await control(mine.id, { action: 'run', task: 'outline' }, who);
  row = await work(mine.id, fakeModel(), who);
  assert.equal(row.task_states.outline.status, 'completed');
  const log = (await request(`/runs/${row.id}/events?task=outline`, { who })).body.events.map(e => e.data.kind ?? e.data.status);
  assert.ok(log.includes('paused') && log.lastIndexOf('completed') > log.indexOf('paused'));
});

test('the team budget pauses work when used up and resumes after it is raised', { skip: !integration }, async () => {
  const who = { user: 'kim' };
  const mine = await project(who, { budget_cny: 0.1 });
  await control(mine.id, { action: 'run' }, who);
  const heavy = fakeModel({ usage: { input_tokens: 60000, output_tokens: 1000 } });
  const row = await work(mine.id, heavy, who);
  assert.equal(row.error_code, 'budget_exhausted');
  assert.ok(['paused', 'idle'].includes(row.status), row.status);
  assert.ok(!Object.values(row.task_states).some(t => ['running', 'queued', 'pausing'].includes(t.status)));
  assert.equal((await control(mine.id, { action: 'run' }, who)).body.error, 'budget_exhausted');
  await request(`/projects/${mine.id}/budget`, { method: 'PUT', who, body: { budget_cny: 100 } });
  assert.equal((await control(mine.id, { action: 'run' }, who)).status, 200);
  assert.equal((await work(mine.id, fakeModel(), who)).status, 'completed');
});

test('a redesign follows the user and keeps finished nodes exactly as they were', { skip: !integration }, async () => {
  const who = { user: 'lee' };
  const plan = clone(PLAN); plan.tasks[0].description = 'TASK:outline FILE:docs/kept.md';
  const mine = await project(who, { plan });
  await control(mine.id, { action: 'run', task: 'outline' }, who);
  await work(mine.id, fakeModel(), who);
  const asked = await request(`/projects/${mine.id}/design`, { method: 'POST', who, body: { instructions: '加一个测试任务' } });
  assert.equal(asked.body.status, 'planning');
  const close = await startWorker(settings, { adapter: fakeModel().adapter, watchdog: false });
  try {
    const ready = await until(async () => (await request(`/projects/${mine.id}`, { who })).body, p => p.status !== 'planning', 'redesign');
    assert.equal(ready.status, 'ready');
    assert.equal(ready.plan.tasks.find(t => t.id === 'outline').description, 'TASK:outline FILE:docs/kept.md');
  } finally { await close(); }
});

test('a worker crash mid-run requeues the in-flight node without redoing finished ones', { skip: !integration }, async () => {
  const mine = await project();
  await control(mine.id, { action: 'run' });
  const row = await store.latestRun(store.pool, mine.id);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./crash.mjs', import.meta.url)), row.id, String(row.dispatch_version)], { env: process.env, stdio: 'inherit' });
  assert.equal(await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }), 73);
  assert.equal((await store.run(store.pool, row.id, userOf({}))).task_states.outline.status, 'completed');
  const model = fakeModel();
  const done = await work(mine.id, model);
  assert.equal(done.status, 'completed', JSON.stringify(done));
  assert.equal(model.calls('outline'), 0, 'finished node was not executed again');
  assert.ok(model.sawFile('docs/outline.md'), 'restored workspace contains earlier files');
  assert.equal((await request(`/projects/${mine.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request(`/runs/${row.id}`)).status, 404);
});

test('lost or terminal Redis jobs reconcile from Postgres state', { skip: !integration }, async () => {
  const lost = await project({ user: 'carol' }), exhausted = await project({ user: 'dave' });
  await control(lost.id, { action: 'run' }, { user: 'carol' });
  await control(exhausted.id, { action: 'run' }, { user: 'dave' });
  const lostRun = await store.latestRun(store.pool, lost.id), deadRun = await store.latestRun(store.pool, exhausted.id);
  await assert.rejects(publish(store, { getJob: async () => undefined, add: async () => { throw new Error('offline'); } }));
  const added = [], removed = [];
  await publish(store, {
    getJob: async id => id.includes(lostRun.id) ? undefined : id.includes(deadRun.id)
      ? { getState: async () => 'failed' } : { getState: async () => 'completed', remove: async () => removed.push(id) },
    add: async (name, data) => added.push(data.id),
  });
  assert.ok(added.includes(lostRun.id));
  assert.ok(!added.includes(deadRun.id));
  const dead = await store.run(store.pool, deadRun.id, { user: 'dave', tenant: 'team' });
  assert.equal(dead.status, 'idle');
  assert.equal(dead.error_code, 'execution_failed');
  assert.ok(Object.values(dead.task_states).every(t => t.status === 'pending'));
  await control(lost.id, { action: 'pause' }, { user: 'carol' });
});

test('without a gateway key, model work fails clearly instead of retrying', { skip: !integration }, async () => {
  const close = await startWorker({ ...settings, gateway: null }, { watchdog: false });
  try {
    const created = (await request('/projects', { method: 'POST', who: { user: 'erin' }, key: randomUUID(), body: { goal: 'x', workspace_name: 'x' } })).body;
    const failed = await until(async () => (await request(`/projects/${created.id}`, { who: { user: 'erin' } })).body, p => p.status !== 'planning', 'failure');
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error_code, 'model_not_configured');
    const retried = await request(`/projects/${created.id}/design`, { method: 'POST', who: { user: 'erin' }, body: {} });
    assert.equal(retried.body.status, 'planning');
  } finally { await close(); }
});

test('a run that stops making progress is profiled, stopped and recorded, never left running', { skip: !integration }, async () => {
  const who = { user: 'frank' };
  const mine = await project(who);
  await control(mine.id, { action: 'run' }, who);
  const stuck = { name: 'stuck', chat: () => new Promise(() => {}), async *stream() {} };
  const seen = [];
  const row = await store.latestRun(store.pool, mine.id);
  await createEngine(store, { stallMs: 1000, abandonMs: 1000 }, { adapter: stuck,
    onStall: id => seen.push(['stall', id]), onAbandoned: id => seen.push(['abandoned', id]) }).execute(row.id, row.dispatch_version);
  const after = await store.run(store.pool, row.id, userOf(who));
  assert.equal(after.error_code, 'stalled');
  assert.equal(after.task_states.outline.status, 'failed');
  assert.deepEqual(seen.map(([kind]) => kind), ['stall', 'abandoned']);
});
