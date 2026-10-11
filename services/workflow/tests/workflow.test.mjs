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
import { runtime } from '../src/runtime.mjs';
import { createApi } from '../src/api.mjs';
import { startWorker, publish } from '../src/worker.mjs';

const secret='test-only-delegation-01234567890123456789';
async function token({user='alice',tenant='team',scope=['runs:read','runs:write'],audience='orchestrai-workflow',expired=false}={}, key=secret) {
  return new SignJWT({tenant,scopes:scope}).setProtectedHeader({alg:'HS256'}).setIssuer('orchestrai-chat')
    .setAudience(audience).setSubject(user).setJti(randomUUID()).setIssuedAt()
    .setExpirationTime(expired ? Math.floor(Date.now()/1000)-60 : '2m').sign(new TextEncoder().encode(key));
}
test('delegation rejects missing, forged, expired and wrong-audience tokens',async()=>{
  for (const bearer of [undefined,'Bearer nope',`Bearer ${await token({},'wrong-key')}`,`Bearer ${await token({expired:true})}`,`Bearer ${await token({audience:'other'})}`]) {
    await assert.rejects(authenticate(bearer,secret,'runs:read'),e=>e.status===401);
  }
  await assert.rejects(authenticate(`Bearer ${await token({scope:[]})}`,secret,'runs:read'),e=>e.status===403);
  assert.deepEqual(await authenticate(`Bearer ${await token()}`,secret,'runs:read'),{user:'alice',tenant:'team'});
});
test('configuration requires secrets instead of using permissive defaults',()=>{
  assert.throws(()=>config({}),/Missing/);
  assert.throws(()=>config({DATABASE_URL:'x',REDIS_URL:'redis://localhost',DELEGATION_SECRET:'short'}),/32 bytes/);
});

const integration=process.env.INTEGRATION==='1';
let settings,store,api,base;
before(async()=>{
  if (!integration) return;
  settings=config({...process.env,DELEGATION_SECRET:secret});
  await migrate(settings.databaseUrl); await migrate(settings.databaseUrl);
  store=new Store(settings.databaseUrl);
  api=createApi(settings);
  await new Promise(resolve=>api.server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${api.server.address().port}`;
});
after(async()=>{ if (api) await api.close(); if (store) await store.close(); });
async function request(path,{method='GET',body,who={},key}={}) {
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',authorization:`Bearer ${await token(who)}`,...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
const who={user:'alice',tenant:'team'};
async function waitFor(id,status) {
  for(let i=0;i<100;i++) {
    const r=await request(`/runs/${id}`);
    if (r.body.status===status) return r.body;
    if (r.body.status==='failed') assert.fail('worker failed');
    await new Promise(r=>setTimeout(r,100));
  }
  assert.fail(`Run did not reach ${status}`);
}
test('real migrations, readiness, least-privilege database identity and tenant isolation',{skip:!integration},async()=>{
  assert.equal((await fetch(base+'/health/ready')).status,200);
  assert.equal((await fetch(base+'/runs')).status,401);
  assert.equal((await store.pool.query("SELECT current_setting('is_superuser') AS value")).rows[0].value,'off');
  const run=await store.create(who,randomUUID(),{text:'owned'});
  assert.equal((await request(`/runs/${run.id}`,{who:{user:'bob'}})).status,404);
  assert.equal((await request(`/runs/${run.id}`,{who:{tenant:'other'}})).status,404);
  assert.equal((await request('/runs',{method:'POST',key:randomUUID(),body:{text:'x',user:'admin'}})).status,400);
});
test('concurrent retries create one run; reusing a key with different input is a conflict',{skip:!integration},async()=>{
  const key=randomUUID();
  const replies=await Promise.all(Array.from({length:12},()=>request('/runs',{method:'POST',body:{text:'one'},key})));
  assert.ok(replies.every(r=>r.status===202));
  assert.equal(new Set(replies.map(r=>r.body.id)).size,1);
  assert.equal((await request('/runs',{method:'POST',body:{text:'different'},key})).status,409);
});
test('real Redis worker pauses, resumes exact approval, persists artifact and replays events',{skip:!integration},async()=>{
  const close=await startWorker(settings);
  try {
    const {body:run}=await request('/runs',{method:'POST',body:{text:'real queue report'},key:randomUUID()});
    await waitFor(run.id,'waiting');
    assert.equal((await request(`/runs/${run.id}/approval`,{method:'POST',body:{version:2,approve:true}})).status,409);
    const approved=await request(`/runs/${run.id}/approval`,{method:'POST',body:{version:1,approve:true}});
    assert.equal(approved.status,200);
    await waitFor(run.id,'completed');
    assert.equal((await request(`/runs/${run.id}/artifact`)).body.content,'OrchestrAI report\nreal queue report\n');
    const events=(await request(`/runs/${run.id}/events`)).body;
    assert.deepEqual(events.events.map(e=>e.type),['queued','waiting','approved','completed']);
    assert.deepEqual((await request(`/runs/${run.id}/events?after=${events.next_cursor}`)).body.events,[]);
    assert.equal((await request(`/runs/${run.id}/approval`,{method:'POST',body:{version:1,approve:false}})).status,409);
  } finally {await close();}
});
test('crash after a real artifact write recovers in a new process without duplicate effects',{skip:!integration},async()=>{
  const run=await store.create(who,randomUUID(),{text:'survives process death'});
  let engine=runtime(settings.databaseUrl,store);
  await engine.execute(run.id,1); await engine.close();
  await store.decide(run.id,who,1,true);
  const child=spawn(process.execPath,[fileURLToPath(new URL('./crash.mjs',import.meta.url)),run.id,'2'],{env:process.env,stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  assert.equal(code,73);
  engine=runtime(settings.databaseUrl,store);
  try {await engine.execute(run.id,2);await engine.execute(run.id,2);} finally {await engine.close();}
  assert.equal((await store.owned(store.pool,run.id,who)).status,'completed');
  assert.equal((await store.pool.query('SELECT count(*)::int AS count FROM artifacts WHERE run_id=$1',[run.id])).rows[0].count,1);
});
test('cancellation blocks queued side effects and failed enqueue keeps durable outbox pending',{skip:!integration},async()=>{
  const run=await store.create(who,randomUUID(),{text:'cancel me'});
  await assert.rejects(publish(store,{getJob:async()=>undefined,add:async()=>{throw new Error('offline');}}));
  assert.equal((await store.owned(store.pool,run.id,who)).published_version,0);
  await store.cancel(run.id,who);
  const engine=runtime(settings.databaseUrl,store);
  try {await engine.execute(run.id,1);} finally {await engine.close();}
  assert.equal((await store.pool.query('SELECT count(*)::int AS count FROM artifacts WHERE run_id=$1',[run.id])).rows[0].count,0);
  assert.equal((await request(`/runs/${run.id}/artifact`)).status,409);
});

test('lost Redis publication is reconstructed from durable run state',{skip:!integration},async()=>{
  const run=await store.create(who,randomUUID(),{text:'survives Redis loss'});
  await store.pool.query('UPDATE runs SET published_version=dispatch_version WHERE id=$1',[run.id]);
  const added=[];
  await publish(store,{getJob:async()=>undefined,add:async(name,data)=>added.push(data.id)});
  assert.ok(added.includes(run.id));
  await store.cancel(run.id,who);
});

test('terminal Redis jobs reconcile after a database restore or failed status write',{skip:!integration},async()=>{
  const recovered=await store.create(who,randomUUID(),{text:'older database snapshot'});
  const exhausted=await store.create(who,randomUUID(),{text:'failure event was not recorded'});
  const added=[],removed=[];
  await publish(store,{
    getJob:async id=>({getState:async()=>id.startsWith(exhausted.id)?'failed':'completed',remove:async()=>removed.push(id)}),
    add:async(name,data)=>added.push(data.id),
  });
  assert.ok(added.includes(recovered.id));
  assert.ok(removed.includes(`${recovered.id}-1`));
  assert.equal((await store.owned(store.pool,exhausted.id,who)).status,'failed');
  assert.ok(!added.includes(exhausted.id));
  await store.cancel(recovered.id,who);
});
