import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import pg from 'pg';

// Deterministic post-deployment check through the HTTP API, without model calls: a
// project with an explicit plan round-trips, edits are versioned, and a live worker
// heartbeat proves the separate worker container is consuming the database.
const key = new TextEncoder().encode(process.env.DELEGATION_SECRET);
const token = await new SignJWT({ tenant: 'deployment-check', scopes: ['runs:read', 'runs:write'] })
  .setProtectedHeader({ alg: 'HS256' }).setIssuer('orchestrai-chat').setAudience('orchestrai-workflow')
  .setSubject('deployment-check').setIssuedAt().setJti(randomUUID()).setExpirationTime('2m').sign(key);
const base = process.env.SMOKE_BASE_URL || 'http://workflow-api:8090';
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, { method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok, `smoke ${method} ${path} HTTP ${response.status}`);
  return response.json();
}
const plan = {
  summary: 'deployment check',
  roles: [{ id: 'writer', name: '写作', description: '写文档', instructions: '写一个文件' },
    { id: 'checker', name: '审批', description: '检查文档', instructions: '检查文件' }],
  tasks: [{ id: 'draft', title: '起草', description: '写 README.md', role: 'writer', depends_on: [],
    review: { mode: 'review', reviewers: ['checker'], max_rounds: 1 } }],
};
const project = await request('/projects', 'POST', { goal: 'deployment verification', workspace_name: 'deployment-check', plan });
assert.equal(project.status, 'ready');
const edited = await request(`/projects/${project.id}/plan`, 'PUT', { version: project.plan_version, plan: { ...plan, summary: 'edited' } });
assert.equal(edited.plan_version, project.plan_version + 1);
assert.equal((await request(`/projects/${project.id}`)).plan.summary, 'edited');
await request(`/projects/${project.id}`, 'DELETE');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  let alive = 0;
  for (let i = 0; i < 40 && !alive; i++) {
    alive = (await db.query("SELECT count(*)::int AS n FROM team_workers WHERE seen_at > now() - interval '1 minute'")).rows[0].n;
    if (!alive) await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(alive, 'no live workflow worker');
} finally { await db.end(); }
console.log(JSON.stringify({ smoke: 'passed', project_id: project.id }));
