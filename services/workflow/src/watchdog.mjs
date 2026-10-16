import { writeSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { Session } from 'node:inspector/promises';
import pg from 'pg';

/**
 * Runs in a worker thread beside the workflow worker. It answers "where is the main
 * thread spending its time?" with a short CPU profile when a run stops making progress,
 * and, if the main thread stops answering heartbeats entirely, records the blocked stack,
 * fails the runs it held and kills the process so the container restarts cleanly.
 */
const BLOCKED_MS = workerData.blockedMs ?? 90_000;
// Written straight to fd 1: a worker thread's console is relayed by the main thread,
// which is exactly the thread that may be stuck.
const log = (event, fields) => writeSync(1, `${JSON.stringify({ timestamp: new Date().toISOString(), service: 'workflow', event, ...fields })}\n`);
const frame = f => `${f.functionName || '(anonymous)'} ${String(f.url || '').replace(/^.*node_modules\//, '')}:${(f.lineNumber ?? 0) + 1}`;
let beat = Date.now();
let busy = false;

async function withSession(fn) {
  const session = new Session();
  session.connectToMainThread();
  try { return await fn(session); } finally { session.disconnect(); }
}

async function profile(reason) {
  if (busy) return;
  busy = true;
  try {
    const top = await withSession(async s => {
      await s.post('Profiler.enable');
      await s.post('Profiler.start');
      await new Promise(r => setTimeout(r, 5000));
      const { profile: p } = await s.post('Profiler.stop');
      const self = new Map();
      const byId = new Map(p.nodes.map(n => [n.id, n]));
      for (const id of p.samples ?? []) {
        const key = frame(byId.get(id).callFrame);
        self.set(key, (self.get(key) ?? 0) + 1);
      }
      return [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${n} ${k}`);
    });
    log('stall_profile', { reason, top });
  } catch (error) {
    log('stall_profile_failed', { reason, error: String(error?.message ?? error).slice(0, 200) });
  } finally { busy = false; }
}

async function blocked() {
  busy = true;
  let stack = [];
  try {
    stack = await Promise.race([
      withSession(async s => {
        const scripts = new Map();
        s.on('Debugger.scriptParsed', ({ params }) => scripts.set(params.scriptId, params.url));
        await s.post('Debugger.enable');
        const paused = new Promise(resolve => s.once('Debugger.paused', ({ params }) => resolve(params.callFrames.slice(0, 25)
          .map(f => frame({ functionName: f.functionName, url: scripts.get(f.location.scriptId), lineNumber: f.location.lineNumber })))));
        await s.post('Debugger.pause');
        return paused;
      }),
      new Promise(resolve => setTimeout(() => resolve(['(no stack: inspector did not answer)']), 10_000)),
    ]);
  } catch (error) { stack = [`(stack failed: ${String(error?.message ?? error).slice(0, 200)})`]; }
  log('worker_blocked', { blocked_ms: Date.now() - beat, stack });
  const client = new pg.Client({ connectionString: workerData.databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query(`UPDATE team_runs SET status='failed',error_code='worker_stalled',updated_at=now()
      WHERE status='running' RETURNING id`);
    for (const row of rows) await client.query("INSERT INTO team_events(run_id,type,data) VALUES($1,'failed',$2)", [row.id, { error_code: 'worker_stalled' }]);
  } catch { log('worker_blocked_record_failed', {}); } finally { await client.end().catch(() => {}); }
  process.kill(process.pid, 'SIGKILL');
}

parentPort.on('message', message => {
  if (message === 'beat') beat = Date.now();
  else if (message?.type === 'profile') profile(message.reason);
});
setInterval(() => { if (!busy && Date.now() - beat > BLOCKED_MS) blocked(); }, 5000);
