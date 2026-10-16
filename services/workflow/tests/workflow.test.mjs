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
import { checkPlan } from '../src/plan.mjs';
import { createEngine, roster, taskSpecs } from '../src/engine.mjs';
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

test('plan maps to OMA tasks: titles for dependencies, read-only reviewers, discussion as lenses', () => {
  const agents = roster(PLAN, '/tmp/ws', { model: 'm' });
  const specs = taskSpecs(PLAN, agents);
  assert.deepEqual(specs[3].dependsOn, [PLAN.tasks[1].title, PLAN.tasks[2].title]);
  assert.deepEqual(specs[2].verify.judges.map(j => j.tools), [['file_read', 'glob']]);
  assert.equal(specs[2].verify.mode, 'refute');
  assert.equal(specs[3].verify.mode, 'lens');
  assert.match(agents[0].systemPrompt, /\/tmp\/ws/);
});

const integration = process.env.INTEGRATION === '1';
let settings, store, api, base;
before(async () => {
  if (!integration) return;
  settings = config({ ...process.env, DELEGATION_SECRET: secret });
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
const who = { user: 'alice', tenant: 'team' };
const project = async (who = {}) => (await request('/projects', { method: 'POST', who, key: randomUUID(),
  body: { goal: '写一份调研报告', workspace_name: 'report', plan: PLAN } })).body;
async function until(read, done, label) {
  for (let i = 0; i < 300; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting for ${label}`);
}

test('readiness, least-privilege database identity and tenant isolation', { skip: !integration }, async () => {
  assert.equal((await fetch(base + '/health/ready')).status, 200);
  assert.equal((await fetch(base + '/projects')).status, 401);
  assert.equal((await store.pool.query("SELECT current_setting('is_superuser') AS value")).rows[0].value, 'off');
  const mine = await project();
  assert.equal((await request(`/projects/${mine.id}`, { who: { user: 'bob' } })).status, 404);
  assert.equal((await request(`/projects/${mine.id}`, { who: { tenant: 'other' } })).status, 404);
  assert.ok(!(await request('/projects', { who: { user: 'bob' } })).body.projects.some(p => p.id === mine.id));
  assert.equal((await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: 'x', workspace_name: '../etc' } })).status, 400);
  const bad = await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: 'x', workspace_name: 'x', plan: { ...PLAN, tasks: [] } } });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.detail.length);
});

test('concurrent retries create one project; edits are versioned', { skip: !integration }, async () => {
  const key = randomUUID();
  const body = { goal: 'one', workspace_name: 'one', plan: PLAN };
  const replies = await Promise.all(Array.from({ length: 12 }, () => request('/projects', { method: 'POST', body, key })));
  assert.ok(replies.every(r => r.status === 202));
  assert.equal(new Set(replies.map(r => r.body.id)).size, 1);
  assert.equal((await request('/projects', { method: 'POST', body: { ...body, goal: 'two' }, key })).status, 409);
  const { id, plan_version } = replies[0].body;
  const edited = clone(PLAN); edited.summary = 'edited';
  assert.equal((await request(`/projects/${id}/plan`, { method: 'PUT', body: { version: plan_version, plan: edited } })).status, 200);
  assert.equal((await request(`/projects/${id}/plan`, { method: 'PUT', body: { version: plan_version, plan: edited } })).status, 409);
  assert.equal((await request(`/projects/${id}`)).body.plan.summary, 'edited');
});

test('commander designs the team, the team runs in parallel with review and writes files', { skip: !integration }, async () => {
  const model = fakeModel();
  const close = await startWorker(settings, { adapter: model.adapter });
  try {
    const created = await request('/projects', { method: 'POST', key: randomUUID(), body: { goal: '做一个网页', workspace_name: 'site' } });
    assert.equal(created.body.status, 'planning');
    const ready = await until(async () => (await request(`/projects/${created.body.id}`)).body, p => p.status !== 'planning', 'design');
    assert.equal(ready.status, 'ready', JSON.stringify(ready));
    assert.deepEqual(ready.plan.tasks.map(t => t.id), PLAN.tasks.map(t => t.id));
    const run = (await request(`/projects/${ready.id}/runs`, { method: 'POST', key: randomUUID(), body: {} })).body;
    assert.equal((await request(`/projects/${ready.id}/runs`, { method: 'POST', key: randomUUID(), body: {} })).status, 409);
    const done = await until(async () => (await request(`/runs/${run.id}`)).body, r => !['queued', 'running'].includes(r.status), 'run');
    assert.equal(done.status, 'completed', JSON.stringify(done));
    assert.ok(Object.values(done.task_states).every(t => t.status === 'completed'));
    assert.ok(model.overlap() >= 2, 'independent tasks ran in parallel');
    assert.ok(model.judged() >= 2, 'review and discussion judges ran');
    const files = (await request(`/runs/${run.id}/files`)).body.files;
    assert.deepEqual(files.map(f => f.path).sort(), ['README.md', 'docs/outline.md', 'site/index.html', 'site/style.css']);
    const html = (await request(`/runs/${run.id}/files/${files.find(f => f.path === 'site/index.html').id}`)).body;
    assert.equal(html.encoding, 'utf8');
    assert.match(html.content, /index\.html/);
    const events = (await request(`/runs/${run.id}/events`)).body;
    assert.equal(events.events[0].type, 'queued');
    assert.equal(events.events.at(-1).type, 'completed');
    assert.ok(events.events.some(e => e.type === 'task' && e.task_id === 'outline' && e.data.status === 'completed'));
    assert.ok(events.events.some(e => e.type === 'activity' && e.task_id === 'page' && e.data.tool === 'file_write' && e.data.path === 'site/index.html'));
    assert.deepEqual((await request(`/runs/${run.id}/events?after=${events.next_cursor}`)).body.events, []);
    assert.equal((await request(`/runs/${run.id}/files`, { who: { user: 'bob' } })).status, 404);
  } finally { await close(); }
});

test('a worker crash mid-run resumes from the checkpoint without redoing finished tasks', { skip: !integration }, async () => {
  const mine = await project();
  const run = (await request(`/projects/${mine.id}/runs`, { method: 'POST', key: randomUUID(), body: {} })).body;
  const child = spawn(process.execPath, [fileURLToPath(new URL('./crash.mjs', import.meta.url)), run.id], { env: process.env, stdio: 'inherit' });
  assert.equal(await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }), 73);
  assert.equal((await store.run(store.pool, run.id, who)).task_states.outline.status, 'completed');
  const model = fakeModel();
  await createEngine(store, settings, { adapter: model.adapter }).execute(run.id, 1);
  const done = await store.run(store.pool, run.id, who);
  assert.equal(done.status, 'completed', JSON.stringify(done));
  assert.equal(model.calls('outline'), 0, 'finished task was not executed again');
  assert.ok(model.sawFile('docs/outline.md'), 'restored workspace contains earlier files');
});

test('cancellation stops a run; failed enqueue keeps the durable outbox pending', { skip: !integration }, async () => {
  const mine = await project();
  const run = (await request(`/projects/${mine.id}/runs`, { method: 'POST', key: randomUUID(), body: {} })).body;
  await assert.rejects(publish(store, { getJob: async () => undefined, add: async () => { throw new Error('offline'); } }));
  assert.equal((await store.run(store.pool, run.id, who)).published_version, 0);
  assert.equal((await request(`/runs/${run.id}/cancel`, { method: 'POST', body: {} })).body.status, 'cancelled');
  const model = fakeModel();
  await createEngine(store, settings, { adapter: model.adapter }).execute(run.id, 1);
  assert.equal(model.calls('outline'), 0);
  assert.equal((await store.run(store.pool, run.id, who)).status, 'cancelled');
  assert.equal((await request(`/projects/${mine.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request(`/runs/${run.id}`)).status, 404);
});

test('lost or terminal Redis jobs reconcile from Postgres state', { skip: !integration }, async () => {
  const lost = (await request(`/projects/${(await project({ user: 'carol' })).id}/runs`, { method: 'POST', who: { user: 'carol' }, key: randomUUID(), body: {} })).body;
  const exhausted = (await request(`/projects/${(await project({ user: 'dave' })).id}/runs`, { method: 'POST', who: { user: 'dave' }, key: randomUUID(), body: {} })).body;
  const added = [], removed = [];
  await publish(store, {
    getJob: async id => id.includes(lost.id) ? undefined : id.includes(exhausted.id)
      ? { getState: async () => 'failed' } : { getState: async () => 'completed', remove: async () => removed.push(id) },
    add: async (name, data) => added.push(data.id),
  });
  assert.ok(added.includes(lost.id));
  assert.ok(!added.includes(exhausted.id));
  assert.equal((await store.run(store.pool, exhausted.id, { user: 'dave', tenant: 'team' })).status, 'failed');
  await store.cancel(lost.id, { user: 'carol', tenant: 'team' });
});

test('without a gateway key, model work fails clearly instead of retrying', { skip: !integration }, async () => {
  const close = await startWorker({ ...settings, gateway: null });
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
  const mine = await project({ user: 'frank' });
  const run = (await request(`/projects/${mine.id}/runs`, { method: 'POST', who: { user: 'frank' }, key: randomUUID(), body: {} })).body;
  const stuck = { name: 'stuck', chat: () => new Promise(() => {}), async *stream() {} };
  const seen = [];
  await createEngine(store, { stallMs: 1000, abandonMs: 1000 }, { adapter: stuck,
    onStall: id => seen.push(['stall', id]), onAbandoned: id => seen.push(['abandoned', id]) }).execute(run.id, 1);
  const row = await store.run(store.pool, run.id, { user: 'frank', tenant: 'team' });
  assert.equal(row.status, 'failed');
  assert.equal(row.error_code, 'stalled');
  assert.deepEqual(seen.map(([kind]) => kind), ['stall', 'abandoned']);
});

test('crossing the run token cap stops the team cleanly instead of livelocking', { skip: !integration }, async () => {
  const mine = await project({ user: 'gina' });
  const run = (await request(`/projects/${mine.id}/runs`, { method: 'POST', who: { user: 'gina' }, key: randomUUID(), body: {} })).body;
  const model = fakeModel();
  const heavy = { ...model.adapter, chat: async (messages, options) => {
    const reply = await model.adapter.chat(messages, options);
    return { ...reply, usage: { input_tokens: 40000, output_tokens: 10 } };
  } };
  const started = Date.now();
  await createEngine(store, { runTokenBudget: 100000, stallMs: 60000 }, { adapter: heavy }).execute(run.id, 1);
  assert.ok(Date.now() - started < 20000, 'run ended promptly');
  const row = await store.run(store.pool, run.id, { user: 'gina', tenant: 'team' });
  assert.ok(['partial', 'failed'].includes(row.status), row.status);
  assert.equal(row.error_code, 'run_token_budget');
});
