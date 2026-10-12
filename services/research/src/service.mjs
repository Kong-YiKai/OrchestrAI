import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { jwtVerify } from 'jose';
import { Queue, Worker } from 'bullmq';
import { research } from './engine.mjs';

class HttpError extends Error { constructor(status,message) { super(message);this.status=status; } }
const queueName='orchestrai-research';
const expose=row => ({ id:row.id,query:row.query,status:row.status,phase:row.phase,
  result:row.result,error:row.error_code,created_at:row.created_at,updated_at:row.updated_at });
const digest=value => createHash('sha256').update(value).digest('hex');
async function identity(header,secret,scope) {
  if (!header?.startsWith('Bearer ')) throw new HttpError(401,'authentication_required');
  try {
    const {payload:p}=await jwtVerify(header.slice(7),new TextEncoder().encode(secret), {
      algorithms:['HS256'],issuer:'orchestrai-chat',audience:'orchestrai-research',maxTokenAge:'5m',
      requiredClaims:['sub','tenant','iat','exp','jti'],clockTolerance:5 });
    if (typeof p.sub!=='string' || !p.sub || p.sub.length>128 || typeof p.tenant!=='string' || !p.tenant ||
        p.tenant.length>128 || p.exp-p.iat>300) throw new Error();
    if (!Array.isArray(p.scopes) || !p.scopes.includes(scope)) throw new HttpError(403,'missing_scope');
    return {user:p.sub,tenant:p.tenant};
  } catch(error) { if (error instanceof HttpError) throw error;throw new HttpError(401,'invalid_delegation'); }
}
async function body(req) {
  if (req.headers['content-type']?.split(';')[0]!=='application/json') throw new HttpError(415,'json_required');
  const chunks=[];let size=0;
  for await (const chunk of req) { size+=chunk.length;if(size>8192) throw new HttpError(413,'request_too_large');chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks)); } catch { throw new HttpError(400,'invalid_json'); }
}
export async function createService(settings, engine=research) {
  const pool=new pg.Pool({connectionString:settings.databaseUrl,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});
  const queue=new Queue(queueName,{connection:{...settings.redis,maxRetriesPerRequest:1}});
  queue.on('error',()=>console.error('research_queue_unavailable'));
  // A crash during external I/O has uncertain cost. Fence that operation; a
  // user can explicitly submit a new query, but recovery never repeats it.
  await pool.query("UPDATE queries SET status=CASE WHEN result IS NULL THEN 'failed' ELSE 'partial' END,phase='interrupted',error_code='interrupted_no_automatic_retry',updated_at=now() WHERE status='running'");
  const owned=async(id,who) => {
    const {rows}=await pool.query('SELECT * FROM queries WHERE id=$1 AND tenant_id=$2 AND user_id=$3',[id,who.tenant,who.user]);
    if (!rows.length) throw new HttpError(404,'query_not_found');return rows[0];
  };
  const dispatch=async() => {
    const {rows}=await pool.query("SELECT id FROM queries WHERE status='queued' ORDER BY created_at LIMIT 20");
    for (const row of rows) {
      const old=await queue.getJob(row.id);
      if (old && ['completed','failed'].includes(await old.getState())) await old.remove();
      await queue.add('research',{id:row.id},{jobId:row.id,attempts:1,removeOnComplete:{count:100},removeOnFail:{count:100}});
    }
  };
  const worker=new Worker(queueName,async job => {
    const {rows}=await pool.query("UPDATE queries SET status='running',phase='searching',updated_at=now() WHERE id=$1 AND status='queued' RETURNING *",[job.data.id]);
    if (!rows.length) return;
    const row=rows[0];
    const cancelled=async() => (await pool.query('SELECT status FROM queries WHERE id=$1',[row.id])).rows[0]?.status!=='running';
    const progress=async(phase,data) => { await pool.query("UPDATE queries SET phase=$2,result=COALESCE(result,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE id=$1 AND status='running'",[row.id,phase,JSON.stringify(data)]); };
    try {
      const result=await engine(row,settings,progress,cancelled);
      await pool.query("UPDATE queries SET status=$2,phase='finished',result=$3,error_code=$4,updated_at=now() WHERE id=$1 AND status='running'",[row.id,result.status,result,result.error]);
    } catch {
      await pool.query("UPDATE queries SET status=CASE WHEN result->'sources' IS NULL THEN 'failed' ELSE 'partial' END,phase='finished',error_code='research_failed_or_deadline_exceeded',updated_at=now() WHERE id=$1 AND status='running'",[row.id]);
    }
  },{connection:{...settings.redis,maxRetriesPerRequest:null},concurrency:1});
  worker.on('error',()=>console.error('research_worker_unavailable'));
  let dispatching=false;
  const reconcile=async()=>{ if(dispatching)return;dispatching=true;try{await dispatch();}catch{console.error('research_dispatch_unavailable');}finally{dispatching=false;} };
  await reconcile();const timer=setInterval(reconcile,5000);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const send=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://research');
      if(req.method==='GET' && url.pathname==='/health/live') return send(200,{service:'research',status:'ok'});
      if(req.method==='GET' && url.pathname==='/health/ready') {
        const migration=await pool.query("SELECT sha256 FROM schema_migrations WHERE version='001_research.sql'");
        if(!migration.rowCount) throw new Error('migration_missing');await(await queue.client).ping();
        return send(200,{status:'ready'});
      }
      const who=await identity(req.headers.authorization,settings.secret,req.method==='GET' ? 'research:read' : 'research:write');
      if(req.method==='GET' && url.pathname==='/queries') {
        const {rows}=await pool.query('SELECT * FROM queries WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 10',[who.tenant,who.user]);
        return send(200,{queries:rows.map(expose)});
      }
      if(req.method==='POST' && url.pathname==='/queries') {
        const input=await body(req);const operation=req.headers['idempotency-key'];
        if(!input || Object.keys(input).some(k=>k!=='query') || typeof input.query!=='string' || !input.query.trim() || input.query.length>1000)
          throw new HttpError(400,'invalid_query');
        if(typeof operation!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(operation)) throw new HttpError(400,'invalid_operation');
        const c=await pool.connect();let row;
        try {
          await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(72100614)');
          row=(await c.query('SELECT * FROM queries WHERE tenant_id=$1 AND user_id=$2 AND operation_key=$3',[who.tenant,who.user,operation])).rows[0];
          if(row) { if(row.input_hash!==digest(input.query)) throw new HttpError(409,'operation_content_changed'); }
          else {
            const active=await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE tenant_id=$1 AND user_id=$2)::int AS owned FROM queries WHERE status IN ('queued','running')",[who.tenant,who.user]);
            if(active.rows[0].total>=20 || active.rows[0].owned>=1) throw new HttpError(429,'research_busy');
            row=(await c.query('INSERT INTO queries(id,tenant_id,user_id,operation_key,input_hash,query) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
              [randomUUID(),who.tenant,who.user,operation,digest(input.query),input.query])).rows[0];
          }
          await c.query('COMMIT');
        } catch(error) {await c.query('ROLLBACK');throw error;}finally{c.release();}
        await reconcile();return send(202,expose(row));
      }
      const match=url.pathname.match(/^\/queries\/([0-9a-f-]{36})(?:\/(cancel))?$/);
      if(!match) throw new HttpError(404,'not_found');
      const row=await owned(match[1],who);
      if(req.method==='GET' && !match[2]) return send(200,expose(row));
      if(req.method==='POST' && match[2]==='cancel') {
        await pool.query("UPDATE queries SET status='cancelled',phase='cancelled',updated_at=now() WHERE id=$1 AND status IN ('queued','running')",[row.id]);
        return send(200,expose(await owned(row.id,who)));
      }
      if(req.method==='DELETE' && !match[2]) {
        if(['queued','running'].includes(row.status)) throw new HttpError(409,'cancel_before_delete');
        await pool.query('DELETE FROM queries WHERE id=$1',[row.id]);return send(200,{deleted:true});
      }
      throw new HttpError(405,'method_not_allowed');
    } catch(error) { send(error instanceof HttpError ? error.status : 503,
      {error:error instanceof HttpError ? error.message : 'research_unavailable'}); }
  });
  server.requestTimeout=10000;server.headersTimeout=8000;
  return {server,close:async()=>{clearInterval(timer);await new Promise(resolve=>server.close(resolve));await worker.close();await queue.close();await pool.end();}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const required=['DATABASE_URL','REDIS_URL','RESEARCH_DELEGATION_SECRET','RESEARCH_GATEWAY_KEY','GATEWAY_KEY'];
  if(required.some(k=>!process.env[k])) throw new Error('research_configuration_required');
  const url=new URL(process.env.REDIS_URL);
  const settings={databaseUrl:process.env.DATABASE_URL,secret:process.env.RESEARCH_DELEGATION_SECRET,
    gateway:'http://gateway:4000',transportKey:process.env.RESEARCH_GATEWAY_KEY,modelKey:process.env.GATEWAY_KEY,
    redis:{host:url.hostname,port:Number(url.port||6379),password:decodeURIComponent(url.password),db:Number(url.pathname.slice(1)||0)}};
  const service=await createService(settings);service.server.listen(8091,'0.0.0.0');
  for(const signal of ['SIGTERM','SIGINT']) process.once(signal,async()=>{await service.close();process.exit(0);});
}
