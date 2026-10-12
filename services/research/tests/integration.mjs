import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import pg from 'pg';
import { Queue } from 'bullmq';
const db=new URL(process.env.DATABASE_URL);db.pathname='/research_fixture';
const client=new pg.Client({connectionString:db.href});await client.connect();
const redis=new URL(process.env.REDIS_URL);
const queue=new Queue('orchestrai-research',{connection:{host:redis.hostname,password:decodeURIComponent(redis.password),db:2}});
let child;
async function start(){child=spawn(process.execPath,['tests/fixture-service.mjs'],{stdio:['ignore','ignore','inherit']});
  for(let i=0;i<600;i++){try{if((await fetch('http://127.0.0.1:8092/health/ready')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw new Error('fixture_not_ready');}
async function stop(signal='SIGTERM'){const process=child;const done=once(process,'exit');process.kill(signal);await done;child=null;}
async function token(user='owner',audience='orchestrai-research'){return new SignJWT({tenant:'fixture',scopes:['research:read','research:write']})
  .setProtectedHeader({alg:'HS256'}).setSubject(user).setIssuer('orchestrai-chat').setAudience(audience)
  .setIssuedAt().setExpirationTime('60s').setJti(randomUUID()).sign(new TextEncoder().encode(process.env.RESEARCH_DELEGATION_SECRET));}
async function request(path,method='GET',value,authorization,key=randomUUID()){
  const response=await fetch('http://127.0.0.1:8092'+path,{method,headers:{'Content-Type':'application/json',
    ...(authorization?{Authorization:'Bearer '+authorization}:{}),'Idempotency-Key':key},
    ...(value!==undefined?{body:JSON.stringify(value)}:{})});
  return {status:response.status,value:await response.json()};}
async function wait(id,status,auth){for(let i=0;i<100;i++){const r=await request('/queries/'+id,'GET',undefined,auth);
  if(status.includes(r.value.status))return r.value;await new Promise(r=>setTimeout(r,100));}throw new Error('state_timeout');}
try {
  // Only this dedicated fixture DB/table and Redis namespace are reset.
  await client.query('DELETE FROM queries');await queue.obliterate({force:true});await start();
  const auth=await token();const foreign=await token('other');const wrongAudience=await token('owner','orchestrai-workflow');
  assert.equal((await request('/queries')).status,401);
  assert.equal((await request('/queries','GET',undefined,wrongAudience)).status,401);
  const operation=randomUUID();const created=await request('/queries','POST',{query:'deterministic'},auth,operation);
  assert.equal(created.status,202);const id=created.value.id;
  assert.equal((await request('/queries','POST',{query:'deterministic'},auth,operation)).value.id,id);
  assert.equal((await request('/queries','POST',{query:'changed'},auth,operation)).status,409);
  await wait(id,['completed'],auth);
  assert.equal((await request('/queries/'+id,'GET',undefined,foreign)).status,404);
  assert.equal((await request('/queries','GET',undefined,foreign)).value.queries.length,0);
  const cancel=(await request('/queries','POST',{query:'cancel'},auth)).value.id;
  await wait(cancel,['running'],auth);assert.equal((await request('/queries/'+cancel+'/cancel','POST',{},auth)).value.status,'cancelled');
  await new Promise(r=>setTimeout(r,200));
  const interrupted=(await request('/queries','POST',{query:'interrupt'},auth)).value.id;
  await wait(interrupted,['running'],auth);await stop('SIGKILL');
  // Rebuild this fixture queue from SQL; a running external operation is fenced.
  await queue.obliterate({force:true});await start();
  const recovered=await wait(interrupted,['partial','failed'],auth);
  assert.equal(recovered.error,'interrupted_no_automatic_retry');
  assert.ok(recovered.result.sources.length); // Prior evidence survives crash.
  assert.equal((await request('/queries/'+id,'GET',undefined,auth)).value.status,'completed');
  assert.equal((await request('/queries/'+id,'DELETE',undefined,foreign)).status,404);
  assert.equal((await request('/queries/'+id,'DELETE',undefined,auth)).status,200);
  console.log('Real SQL/queue fixture passed: identity, ownership, idempotency, cancellation, crash fencing and retained evidence. No provider calls.');
}finally{if(child)await stop('SIGKILL');await queue.close();await client.end();}
