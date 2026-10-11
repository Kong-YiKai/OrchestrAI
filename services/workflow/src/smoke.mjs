import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';

// Deterministic post-deployment check through the HTTP API and separate worker.
const key = new TextEncoder().encode(process.env.DELEGATION_SECRET);
const token = await new SignJWT({ tenant:'deployment-check', scopes:['runs:read','runs:write'] })
  .setProtectedHeader({alg:'HS256'}).setIssuer('orchestrai-chat').setAudience('orchestrai-workflow')
  .setSubject('deployment-check').setIssuedAt().setJti(randomUUID()).setExpirationTime('2m').sign(key);
const base = process.env.SMOKE_BASE_URL || 'http://workflow-api:8090';
async function request(path, body) {
  const response = await fetch(base+path, { method:body ? 'POST' : 'GET',
    headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json', 'idempotency-key':randomUUID() },
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(5000) });
  assert.ok(response.ok, `smoke HTTP ${response.status}`);
  return response.json();
}
async function wait(id,status) {
  for (let i=0;i<100;i++) {
    const run=await request(`/runs/${id}`);
    if (run.status === status) return;
    assert.notEqual(run.status,'failed');
    await new Promise(r=>setTimeout(r,300));
  }
  throw new Error(`smoke did not reach ${status}`);
}
await request('/health/ready');
const run=await request('/runs',{text:'deployment verification'});
await wait(run.id,'waiting');
await request(`/runs/${run.id}/approval`,{version:1,approve:true});
await wait(run.id,'completed');
assert.equal((await request(`/runs/${run.id}/artifact`)).content,'OrchestrAI report\ndeployment verification\n');
console.log(JSON.stringify({smoke:'passed',run_id:run.id}));
