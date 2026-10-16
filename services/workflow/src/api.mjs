import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { authenticate, HttpError } from './auth.mjs';
import { Store, publicProject, publicRun } from './store.mjs';
import { requirePlan } from './plan.mjs';
import { config, log } from './config.mjs';
import { queueName } from './worker.mjs';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTES = [
  ['GET', /^\/projects$/, 'listProjects'],
  ['POST', /^\/projects$/, 'createProject'],
  ['GET', new RegExp(`^/projects/(${UUID})$`, 'i'), 'getProject'],
  ['DELETE', new RegExp(`^/projects/(${UUID})$`, 'i'), 'deleteProject'],
  ['PUT', new RegExp(`^/projects/(${UUID})/plan$`, 'i'), 'savePlan'],
  ['POST', new RegExp(`^/projects/(${UUID})/design$`, 'i'), 'redesign'],
  ['POST', new RegExp(`^/projects/(${UUID})/runs$`, 'i'), 'startRun'],
  ['GET', new RegExp(`^/runs/(${UUID})$`, 'i'), 'getRun'],
  ['GET', new RegExp(`^/runs/(${UUID})/events$`, 'i'), 'events'],
  ['POST', new RegExp(`^/runs/(${UUID})/cancel$`, 'i'), 'cancel'],
  ['GET', new RegExp(`^/runs/(${UUID})/files$`, 'i'), 'files'],
  ['GET', new RegExp(`^/runs/(${UUID})/files/(${UUID})$`, 'i'), 'file'],
];

async function body(req, limit = 16384) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'json_required');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new HttpError(400, 'invalid_json'); }
}
function only(input, keys) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k)))
    throw new HttpError(400, 'invalid_input');
  return input;
}
const goal = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new HttpError(400, 'invalid_goal');
  return value.trim();
};
// Used as a local folder name by the client, so no separators or reserved characters.
const folder = value => {
  if (typeof value !== 'string' || !/^[^\\/:*?"<>|\u0000-\u001f]{1,64}$/.test(value.trim()) || /^\.+$/.test(value.trim()))
    throw new HttpError(400, 'invalid_workspace_name');
  return value.trim();
};
const idempotency = req => {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new HttpError(400, 'invalid_idempotency_key');
  return key;
};
const TEXT = /^(text\/|application\/(json|xml)|image\/svg\+xml)/;

export function createApi(settings) {
  const store = new Store(settings.databaseUrl);
  const queue = new Queue(queueName, { connection: { ...settings.redis, maxRetriesPerRequest: 1 } });
  queue.on('error', () => log('queue_unavailable'));

  const handlers = {
    listProjects: async ({ who }) => [200, { projects: await store.projects(who) }],
    createProject: async ({ who, req }) => {
      const input = only(await body(req, 262144), ['goal', 'workspace_name', 'plan']);
      const value = { goal: goal(input.goal), workspace_name: folder(input.workspace_name) };
      const plan = input.plan === undefined ? undefined : requirePlan(input.plan);
      const row = await store.createProject(who, idempotency(req), { ...value, plan: plan ?? null }, plan);
      return [202, publicProject(row)];
    },
    getProject: async ({ who }, id) => {
      const row = await store.project(store.pool, id, who);
      return [200, publicProject(row, await store.projectRuns(id))];
    },
    deleteProject: async ({ who }, id) => { await store.deleteProject(id, who); return [200, { deleted: true }]; },
    savePlan: async ({ who, req }, id) => {
      const input = only(await body(req, 262144), ['version', 'plan']);
      if (!Number.isInteger(input.version)) throw new HttpError(400, 'invalid_version');
      return [200, publicProject(await store.savePlan(id, who, input.version, requirePlan(input.plan)))];
    },
    redesign: async ({ who, req }, id) => {
      const input = only(await body(req), ['goal']);
      return [202, publicProject(await store.redesign(id, who, input.goal === undefined ? undefined : goal(input.goal)))];
    },
    startRun: async ({ who, req }, id) => [202, publicRun(await store.startRun(id, who, idempotency(req)), true)],
    getRun: async ({ who }, id) => [200, publicRun(await store.run(store.pool, id, who), true)],
    events: async ({ who, url }, id) => {
      await store.run(store.pool, id, who);
      const after = url.searchParams.get('after') || '0';
      if (!/^\d{1,15}$/.test(after)) throw new HttpError(400, 'invalid_cursor');
      const { rows } = await store.pool.query(`SELECT seq,type,task_id,data,created_at FROM team_events
        WHERE run_id=$1 AND seq>$2 ORDER BY seq LIMIT 200`, [id, after]);
      return [200, { events: rows, next_cursor: String(rows.at(-1)?.seq ?? after) }];
    },
    cancel: async ({ who }, id) => [200, publicRun(await store.cancel(id, who))],
    files: async ({ who }, id) => { await store.run(store.pool, id, who); return [200, { files: await store.files(id) }]; },
    // Content is returned inside JSON (never served as a page), so an agent-written HTML
    // file cannot run on the product origin; the client previews it in a sandbox.
    file: async ({ who }, id, fileId) => {
      await store.run(store.pool, id, who);
      const row = await store.file(id, fileId);
      const text = TEXT.test(row.media_type);
      return [200, { id: row.id, path: row.path, media_type: row.media_type, size: row.size, sha256: row.sha256,
        encoding: text ? 'utf8' : 'base64', content: row.content.toString(text ? 'utf8' : 'base64') }];
    },
  };

  const server = http.createServer(async (req, res) => {
    const trace = randomUUID();
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-request-id', trace);
    const send = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://workflow');
      if (req.method === 'GET' && url.pathname === '/health/live') return send(200, { status: 'ok', service: 'workflow' });
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        try {
          const r = await store.pool.query("SELECT version FROM schema_migrations WHERE version='002_teams.sql'");
          if (!r.rowCount) throw new Error('migration_missing');
          await (await queue.client).ping(); return send(200, { status: 'ready' });
        } catch { return send(503, { status: 'unavailable' }); }
      }
      const route = ROUTES.find(([method, pattern]) => pattern.test(url.pathname) && method === req.method);
      if (!route) {
        const known = ROUTES.some(([, pattern]) => pattern.test(url.pathname));
        throw new HttpError(known ? 405 : 404, known ? 'method_not_allowed' : 'not_found');
      }
      const who = await authenticate(req.headers.authorization, settings.delegationSecret, req.method === 'GET' ? 'runs:read' : 'runs:write');
      const [, ...params] = url.pathname.match(route[1]);
      const [status, value] = await handlers[route[2]]({ who, req, url }, ...params.map(p => p.toLowerCase()));
      return send(status, value);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      if (status >= 500) log('request_failed', { request_id: trace });
      send(status, { error: error instanceof HttpError ? error.message : 'service_unavailable', request_id: trace,
        ...(error?.detail ? { detail: error.detail } : {}) });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, close: async () => { await new Promise(resolve => server.close(resolve)); await queue.close(); await store.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const settings = config(); const api = createApi(settings);
  api.server.listen(settings.port, '0.0.0.0', () => log('api_started', { port: settings.port }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await api.close(); process.exit(0); });
}
