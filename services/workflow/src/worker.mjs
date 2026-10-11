import { pathToFileURL } from 'node:url';
import { Queue, Worker } from 'bullmq';
import { Store } from './store.mjs';
import { runtime } from './runtime.mjs';
import { config, log } from './config.mjs';

export const queueName = 'orchestrai-workflow';
export async function publish(store, queue) {
  const { rows } = await store.pool.query(`SELECT id,dispatch_version FROM runs
    WHERE status IN ('queued','running') ORDER BY created_at LIMIT 50`);
  for (const row of rows) {
    // Redis AOF can lose its last second on host failure. Reconcile with Postgres,
    // the run source of truth, instead of trusting an old published marker forever.
    const jobId = `${row.id}-${row.dispatch_version}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') {
        // Persist terminal retry exhaustion even if Postgres was offline when
        // the worker's failed callback originally tried to record it.
        await store.transaction(async c => {
          const update = await c.query("UPDATE runs SET status='failed',error_code='execution_failed',updated_at=now() WHERE id=$1 AND dispatch_version=$2 AND status IN ('queued','running') RETURNING id",[row.id,row.dispatch_version]);
          if (update.rowCount) await store.event(c,row.id,'failed',{error_code:'execution_failed'});
        });
        continue;
      }
      // After restoring a database snapshot Redis may have a newer completion.
      // Re-run against the restored checkpoint and idempotent artifact record.
      if (state !== 'completed') continue;
      await existing.remove();
    }
    // Durable outbox: a crash between add/update safely repeats the same job ID.
    await queue.add('execute',{ id:row.id,version:row.dispatch_version },{
      jobId,attempts:3,backoff:{ type:'exponential',delay:1000 },
      removeOnComplete:{ age:86400,count:1000 },removeOnFail:{ age:604800,count:1000 },
    });
    await store.pool.query('UPDATE runs SET published_version=GREATEST(published_version,$2) WHERE id=$1',[row.id,row.dispatch_version]);
  }
}
export async function startWorker(settings) {
  const store = new Store(settings.databaseUrl);
  const engine = runtime(settings.databaseUrl,store);
  const queue = new Queue(queueName,{ connection:{ ...settings.redis,maxRetriesPerRequest:1 } });
  const worker = new Worker(queueName,job => engine.execute(job.data.id,job.data.version),{
    connection:{ ...settings.redis,maxRetriesPerRequest:null },concurrency:1,
  });
  worker.on('completed',job => log('job_completed',{ run_id:job.data.id }));
  worker.on('error',() => log('queue_unavailable'));
  queue.on('error',() => log('queue_unavailable'));
  worker.on('failed',(job) => {
    log('job_failed',{ run_id:job?.data.id,attempt:job?.attemptsMade });
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      store.transaction(async c => {
        const r = await c.query("UPDATE runs SET status='failed',error_code='execution_failed',updated_at=now() WHERE id=$1 AND status NOT IN ('cancelled','completed') RETURNING id",[job.data.id]);
        if (r.rowCount) await store.event(c,job.data.id,'failed',{ error_code:'execution_failed' });
      }).catch(() => log('failure_record_unavailable'));
    }
  });
  let closing = false;
  const dispatch = (async () => {
    while (!closing) {
      try { await publish(store,queue); } catch { log('outbox_retry'); }
      await new Promise(resolve => setTimeout(resolve,500));
    }
  })();
  return async () => { closing=true; await dispatch; await worker.close(); await queue.close(); await engine.close(); await store.close(); };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const close = await startWorker(config());
  log('worker_started');
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async () => { await close(); process.exit(0); });
}
