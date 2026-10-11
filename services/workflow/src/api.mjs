import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { authenticate, HttpError } from './auth.mjs';
import { Store, publicRun } from './store.mjs';
import { config, log } from './config.mjs';
import { queueName } from './worker.mjs';

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415,'json_required');
  let size=0; const chunks=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>16384) throw new HttpError(413,'body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new HttpError(400,'invalid_json'); }
}
export function createApi(settings) {
  const store = new Store(settings.databaseUrl);
  const queue = new Queue(queueName,{ connection:{ ...settings.redis,maxRetriesPerRequest:1 } });
  queue.on('error',() => log('queue_unavailable'));
  const server = http.createServer(async (req,res) => {
    const trace = randomUUID();
    res.setHeader('content-type','application/json');
    res.setHeader('cache-control','no-store');
    res.setHeader('x-request-id',trace);
    const send = (status,value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url,'http://workflow');
      if (req.method==='GET' && url.pathname==='/health/live') return send(200,{ status:'ok',service:'workflow' });
      if (req.method==='GET' && url.pathname==='/health/ready') {
        try {
          const r=await store.pool.query("SELECT version FROM schema_migrations WHERE version='001_runs.sql'");
          if (!r.rowCount) throw new Error('migration_missing');
          await (await queue.client).ping(); return send(200,{ status:'ready' });
        } catch { return send(503,{ status:'unavailable' }); }
      }
      const who = await authenticate(req.headers.authorization,settings.delegationSecret,req.method==='GET' ? 'runs:read' : 'runs:write');
      if (req.method==='POST' && url.pathname==='/runs') {
        const input=await body(req);
        if (!input || Object.keys(input).some(k=>k!=='text') || typeof input.text!=='string' || !input.text.trim() || input.text.length>4000)
          throw new HttpError(400,'invalid_input');
        const key=req.headers['idempotency-key'];
        if (typeof key!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new HttpError(400,'invalid_idempotency_key');
        const run=await store.create(who,key,{ text:input.text });
        return send(202,publicRun(run));
      }
      const match=url.pathname.match(/^\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(events|approval|cancel|artifact))?$/i);
      if (!match) throw new HttpError(404,'not_found');
      const [,id,action]=match;
      if (req.method==='POST' && action==='approval') {
        const input=await body(req);
        if (!input || Object.keys(input).some(k=>!['version','approve'].includes(k)) || !Number.isInteger(input.version) || typeof input.approve!=='boolean')
          throw new HttpError(400,'invalid_decision');
        return send(200,publicRun(await store.decide(id,who,input.version,input.approve)));
      }
      if (req.method==='POST' && action==='cancel') return send(200,publicRun(await store.cancel(id,who)));
      if (req.method!=='GET') throw new HttpError(405,'method_not_allowed');
      const run=await store.owned(store.pool,id,who);
      if (!action) return send(200,publicRun(run));
      if (action==='events') {
        const after=url.searchParams.get('after') || '0';
        if (!/^\d{1,15}$/.test(after)) throw new HttpError(400,'invalid_cursor');
        const {rows}=await store.pool.query('SELECT seq,type,data,created_at FROM events WHERE run_id=$1 AND seq>$2 ORDER BY seq LIMIT 100',[id,after]);
        return send(200,{ events:rows,next_cursor:rows.at(-1)?.seq || after });
      }
      if (action==='artifact') {
        if (run.status!=='completed') throw new HttpError(409,'artifact_not_ready');
        const {rows}=await store.pool.query('SELECT content,sha256 FROM artifacts WHERE run_id=$1',[id]);
        if (!rows.length) throw new HttpError(404,'artifact_not_found');
        return send(200,rows[0]);
      }
      throw new HttpError(404,'not_found');
    } catch (error) {
      const status=error instanceof HttpError ? error.status : 503;
      if (status>=500) log('request_failed',{ request_id:trace });
      send(status,{ error:error instanceof HttpError ? error.message : 'service_unavailable',request_id:trace });
    }
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  return { server,close:async () => { await new Promise(resolve=>server.close(resolve)); await queue.close(); await store.close(); } };
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const settings=config(); const api=createApi(settings);
  api.server.listen(settings.port,'0.0.0.0',()=>log('api_started',{ port:settings.port }));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{ await api.close(); process.exit(0); });
}
