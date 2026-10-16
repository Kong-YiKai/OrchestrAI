import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Worker as Thread } from 'node:worker_threads';
import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { Store } from './store.mjs';
import { createEngine } from './engine.mjs';
import { createDesigner } from './designer.mjs';
import { config, log } from './config.mjs';

export const queueName = 'orchestrai-teams';
const KNOWN = new Set(['model_not_configured', 'plan_generation_failed']);
const code = error => (KNOWN.has(error?.code) ? error.code : null);

/**
 * Durable outbox: Postgres is the source of truth for pending design and run work.
 * Redis AOF can lose its last second on host failure, so jobs are reconciled every tick
 * and re-added under the same id instead of trusting an old published marker.
 */
export async function publish(store, queue) {
  const work = [
    ...(await store.pool.query(`SELECT 'design' AS kind,id,dispatch_version FROM team_projects
      WHERE status='planning' ORDER BY updated_at LIMIT 20`)).rows,
    ...(await store.pool.query(`SELECT 'execute' AS kind,id,dispatch_version FROM team_runs
      WHERE status IN ('queued','running') ORDER BY created_at LIMIT 20`)).rows,
  ];
  for (const row of work) {
    const jobId = `${row.kind}-${row.id}-${row.dispatch_version}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') { await fail(store, row.kind, row.id, row.dispatch_version, null); continue; }
      // After restoring a database snapshot Redis may hold a newer completion: run again
      // (execution resumes from the restored checkpoint).
      if (state !== 'completed') continue;
      await existing.remove();
    }
    await queue.add(row.kind, { id: row.id, version: row.dispatch_version }, {
      jobId, attempts: row.kind === 'design' ? 2 : 3, backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 },
    });
    const table = row.kind === 'design' ? 'team_projects' : 'team_runs';
    await store.pool.query(`UPDATE ${table} SET published_version=GREATEST(published_version,$2) WHERE id=$1`, [row.id, row.dispatch_version]);
  }
}

async function fail(store, kind, id, version, errorCode) {
  if (kind === 'design') {
    await store.designed(id, version, null, errorCode ?? 'design_failed');
    return;
  }
  await store.transaction(async c => {
    const r = await c.query(`UPDATE team_runs SET status='failed',error_code=$3,updated_at=now()
      WHERE id=$1 AND dispatch_version=$2 AND status IN ('queued','running') RETURNING id`, [id, version, errorCode ?? 'execution_failed']);
    if (r.rowCount) await store.event(c, id, 'failed', null, { error_code: errorCode ?? 'execution_failed' });
  });
}

export function createProcessor(store, settings, options = {}) {
  const engine = createEngine(store, settings, options);
  const designer = createDesigner(settings, options);
  return async job => {
    const { id, version } = job.data;
    try {
      if (job.name === 'execute') return await engine.execute(id, version);
      const project = (await store.pool.query('SELECT * FROM team_projects WHERE id=$1', [id])).rows[0];
      if (!project || project.status !== 'planning' || project.dispatch_version !== version) return;
      const { plan, tokens } = await designer.design(project.goal);
      await store.designed(id, version, plan, null);
      log('plan_designed', { project_id: id, tasks: plan.tasks.length, tokens });
    } catch (error) {
      if (code(error)) throw new UnrecoverableError(code(error));
      throw error;
    }
  };
}

/** Watchdog thread: CPU profile on a stalled run, stack + restart if the loop blocks. */
function startWatchdog(settings) {
  const thread = new Thread(new URL('./watchdog.mjs', import.meta.url), { workerData: { databaseUrl: settings.databaseUrl } });
  thread.unref();
  thread.on('error', () => log('watchdog_unavailable'));
  const beat = setInterval(() => thread.postMessage('beat'), 1000);
  beat.unref();
  return {
    onStall: runId => thread.postMessage({ type: 'profile', reason: runId }),
    // The framework ignored the abort and keeps running: restart the process to stop it.
    onAbandoned: runId => { log('run_abandoned', { run_id: runId }); setTimeout(() => process.exit(1), 10_000).unref(); },
    close: () => { clearInterval(beat); return thread.terminate(); },
  };
}

export async function startWorker(settings, options = {}) {
  const store = new Store(settings.databaseUrl);
  const id = `worker-${randomUUID()}`;
  const watchdog = options.watchdog === false ? null : startWatchdog(settings);
  const queue = new Queue(queueName, { connection: { ...settings.redis, maxRetriesPerRequest: 1 } });
  const worker = new Worker(queueName, createProcessor(store, settings, { onStall: watchdog?.onStall, onAbandoned: watchdog?.onAbandoned, ...options }), {
    connection: { ...settings.redis, maxRetriesPerRequest: null }, concurrency: 3,
  });
  worker.on('completed', job => log('job_completed', { kind: job.name, id: job.data.id }));
  worker.on('error', () => log('queue_unavailable'));
  queue.on('error', () => log('queue_unavailable'));
  worker.on('failed', (job, error) => {
    log('job_failed', { kind: job?.name, id: job?.data.id, attempt: job?.attemptsMade, error_code: code(error) });
    const final = error instanceof UnrecoverableError || (job && job.attemptsMade >= (job.opts.attempts || 1));
    if (job && final) {
      fail(store, job.name, job.data.id, job.data.version, KNOWN.has(error?.message) ? error.message : null)
        .catch(() => log('failure_record_unavailable'));
    }
  });
  let closing = false;
  const loop = (async () => {
    let tick = 0;
    while (!closing) {
      try { await publish(store, queue); } catch { log('outbox_retry'); }
      if (tick++ % 20 === 0) await store.heartbeat(id).catch(() => log('heartbeat_unavailable'));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  })();
  // On SIGTERM an in-flight run is not awaited: its job stalls and the next worker resumes
  // it from the Postgres checkpoint.
  return async (force = false) => { closing = true; await loop; await worker.close(force); await queue.close(); await watchdog?.close(); await store.close(); };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const close = await startWorker(config());
  log('worker_started');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await close(true); process.exit(0); });
}
