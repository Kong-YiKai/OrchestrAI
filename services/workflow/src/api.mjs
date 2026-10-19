import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { authenticate, HttpError } from './auth.mjs';
import { Store, publicProject, publicRun } from './store.mjs';
import { checkRunnable, estimate, lockViolations, requirePlan } from './plan.mjs';
import { config, log } from './config.mjs';
import { createCatalog } from './models.mjs';
import { mediaType, nodeBrief } from './engine.mjs';
import { queueName } from './worker.mjs';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTES = [
  ['GET', /^\/models$/, 'models'],
  ['GET', /^\/projects$/, 'listProjects'],
  ['POST', /^\/projects$/, 'createProject'],
  ['GET', new RegExp(`^/projects/(${UUID})$`, 'i'), 'getProject'],
  ['DELETE', new RegExp(`^/projects/(${UUID})$`, 'i'), 'deleteProject'],
  ['PUT', new RegExp(`^/projects/(${UUID})/plan$`, 'i'), 'savePlan'],
  ['POST', new RegExp(`^/projects/(${UUID})/design$`, 'i'), 'redesign'],
  ['PUT', new RegExp(`^/projects/(${UUID})/budget$`, 'i'), 'setBudget'],
  ['POST', new RegExp(`^/projects/(${UUID})/control$`, 'i'), 'control'],
  ['POST', new RegExp(`^/projects/(${UUID})/inputs$`, 'i'), 'addInput'],
  ['DELETE', new RegExp(`^/projects/(${UUID})/inputs/(${UUID})$`, 'i'), 'removeInput'],
  ['GET', new RegExp(`^/projects/(${UUID})/chat$`, 'i'), 'chat'],
  ['POST', new RegExp(`^/projects/(${UUID})/chat$`, 'i'), 'say'],
  ['GET', new RegExp(`^/runs/(${UUID})$`, 'i'), 'getRun'],
  ['GET', new RegExp(`^/runs/(${UUID})/events$`, 'i'), 'events'],
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
const budget = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 10000) throw new HttpError(400, 'invalid_budget');
  return Math.round(value * 100) / 100;
};
const TASK_ID = /^[a-z][a-z0-9-]{0,39}$/;
const task = value => {
  if (typeof value !== 'string' || !TASK_ID.test(value)) throw new HttpError(400, 'invalid_task');
  return value;
};
// Agents read text files only, so node attachments are text formats up to 2 MiB.
const ATTACHABLE = /\.(md|txt|csv|json|html|htm|css|js|svg|py|yaml|yml|xml)$/i;
const attachment = (name, content) => {
  if (typeof name !== 'string' || !/^[^\\/:*?"<>|\u0000-\u001f]{1,80}$/.test(name) || /^\./.test(name) || !ATTACHABLE.test(name))
    throw new HttpError(400, 'invalid_attachment_name');
  if (typeof content !== 'string' || content.length > 2_900_000) throw new HttpError(413, 'attachment_too_large');
  const buffer = Buffer.from(content, 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new HttpError(413, 'attachment_too_large');
  if (new TextDecoder('utf-8', { fatal: false }).decode(buffer).includes('\uFFFD')) throw new HttpError(400, 'attachment_not_text');
  return buffer;
};
const CHAT_RULES = '\n\n现在用户在和你讨论你将要负责的这个任务。回答问题、澄清需求、提出建议，简洁一些；你现在不能读写文件，' +
  '不要假装已经完成了工作。讨论的内容会在你开始工作时作为用户的补充要求交给你。\n\n';
const idempotency = req => {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new HttpError(400, 'invalid_idempotency_key');
  return key;
};
const TEXT = /^(text\/|application\/(json|xml)|image\/svg\+xml)/;

/** One model reply through the budgeted gateway (node chat has no tools). */
function gatewayCompletion(settings) {
  return async ({ model, messages }) => {
    if (!settings.gateway) throw new HttpError(503, 'model_not_configured');
    const response = await fetch(`${settings.gateway.url}/chat/completions`, { method: 'POST',
      headers: { authorization: `Bearer ${settings.gateway.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 1500 }), signal: AbortSignal.timeout(90000) }).catch(() => null);
    const value = await response?.json().catch(() => ({})) ?? {};
    if (!response?.ok) {
      const said = JSON.stringify(value);
      throw new HttpError(response?.status === 429 ? 429 : 502,
        /model_not_allowed/.test(said) ? 'model_unavailable' : /provider_budget_exceeded/.test(said) ? 'model_budget_exhausted' : 'model_failed');
    }
    return { text: String(value.choices?.[0]?.message?.content ?? '').trim(),
      usage: { input: value.usage?.prompt_tokens ?? 0, output: value.usage?.completion_tokens ?? 0 } };
  };
}

export function createApi(settings, { complete = gatewayCompletion(settings) } = {}) {
  const store = new Store(settings.databaseUrl);
  const queue = new Queue(queueName, { connection: { ...settings.redis, maxRetriesPerRequest: 1 } });
  queue.on('error', () => log('queue_unavailable'));

  // The estimate uses the same catalog prices the run is billed with.
  const catalog = createCatalog(settings);
  const detailed = async row => {
    const models = row.plan ? await catalog.list() : [];
    return publicProject(row, await store.projectRuns(row.id), row.plan ? { estimate: estimate(row.plan, t => catalog.priceOf(models, t.model)) } : {});
  };

  const handlers = {
    models: async () => [200, { models: await catalog.list(), default: catalog.defaultModel }],
    listProjects: async ({ who }) => [200, { projects: await store.projects(who) }],
    createProject: async ({ who, req }) => {
      const input = only(await body(req, 262144), ['goal', 'workspace_name', 'budget_cny', 'plan']);
      const value = { goal: goal(input.goal), workspace_name: folder(input.workspace_name),
        budget_cny: input.budget_cny === undefined ? 5 : budget(input.budget_cny) };
      const plan = input.plan === undefined ? undefined : requirePlan(input.plan);
      const row = await store.createProject(who, idempotency(req), { ...value, plan: plan ?? null }, plan);
      return [202, publicProject(row)];
    },
    getProject: async ({ who }, id) => [200, await detailed(await store.project(store.pool, id, who))],
    deleteProject: async ({ who }, id) => { await store.deleteProject(id, who); return [200, { deleted: true }]; },
    savePlan: async ({ who, req }, id) => {
      const input = only(await body(req, 262144), ['version', 'plan']);
      if (!Number.isInteger(input.version)) throw new HttpError(400, 'invalid_version');
      return [200, await detailed(await store.savePlan(id, who, input.version, requirePlan(input.plan), lockViolations))];
    },
    setBudget: async ({ who, req }, id) => {
      const input = only(await body(req), ['budget_cny']);
      return [200, await detailed(await store.setBudget(id, who, budget(input.budget_cny)))];
    },
    redesign: async ({ who, req }, id) => {
      const input = only(await body(req), ['goal', 'instructions']);
      const note = input.instructions === undefined ? undefined : goal(input.instructions);
      return [202, publicProject(await store.redesign(id, who, input.goal === undefined ? undefined : goal(input.goal), note))];
    },
    addInput: async ({ who, req }, id) => {
      const input = only(await body(req, 3_000_000), ['task', 'name', 'content']);
      const name = typeof input.name === 'string' ? input.name.trim() : input.name;
      const buffer = attachment(name, input.content);
      return [201, await store.addInput(id, who, task(input.task), name, buffer, mediaType(name))];
    },
    removeInput: async ({ who }, id, fileId) => { await store.removeInput(id, who, fileId); return [200, { deleted: true }]; },
    chat: async ({ who, url }, id) => {
      await store.project(store.pool, id, who);
      return [200, { messages: await store.chats(id, task(url.searchParams.get('task'))) }];
    },
    // The user discusses a node with its agent; the transcript joins the node's brief.
    say: async ({ who, req }, id) => {
      const input = only(await body(req), ['task', 'message']);
      const taskId = task(input.task);
      if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 4000) throw new HttpError(400, 'invalid_message');
      const { project, run } = await store.transaction(async c => {
        const found = await store.editableNode(c, id, who, taskId);
        return { project: found.project, run: found.run ?? await store.newRun(c, found.project, who) };
      });
      if (Number(run.spent_cny) >= Number(project.budget_cny)) throw new HttpError(409, 'budget_exhausted');
      const plan = project.plan, node = plan.tasks.find(t => t.id === taskId);
      const role = plan.roles.find(r => r.id === node.role);
      const files = await store.files(run.id);
      const owned = owner => files.filter(f => f.task_id === owner && !f.path.startsWith('inputs/')).map(f => f.path);
      const history = await store.chats(id, taskId);
      const model = node.model ?? catalog.defaultModel;
      const answer = await complete({ model, messages: [
        { role: 'system', content: `你是团队中的「${role.name}」。${role.description}\n\n${role.instructions}${CHAT_RULES}` +
          nodeBrief(plan, node, run.task_states, owned, { inputs: files.filter(f => f.path.startsWith(`inputs/${taskId}/`)).map(f => f.path) }) },
        ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: input.message.trim() },
      ] });
      await store.addChat(id, taskId, 'user', input.message.trim());
      await store.addChat(id, taskId, 'assistant', answer.text.slice(0, 8000) || '（没有回答）');
      const price = catalog.priceOf(await catalog.list(), model);
      await store.spend(run.id, answer.usage.input, answer.usage.output, (answer.usage.input * price.input + answer.usage.output * price.output) / 1e6);
      return [200, { messages: await store.chats(id, taskId) }];
    },
    // Run or pause the whole team, or one node (`task`).
    control: async ({ who, req }, id) => {
      const input = only(await body(req), ['action', 'task']);
      if (!['run', 'pause'].includes(input.action)) throw new HttpError(400, 'invalid_action');
      if (input.task !== undefined && (typeof input.task !== 'string' || !TASK_ID.test(input.task))) throw new HttpError(400, 'invalid_task');
      return [200, publicRun(await store.control(id, who, input.action, input.task, checkRunnable), true)];
    },
    getRun: async ({ who }, id) => [200, publicRun(await store.run(store.pool, id, who), true)],
    // `task` narrows the stream to one node's work record.
    events: async ({ who, url }, id) => {
      await store.run(store.pool, id, who);
      const after = url.searchParams.get('after') || '0';
      if (!/^\d{1,15}$/.test(after)) throw new HttpError(400, 'invalid_cursor');
      const task = url.searchParams.get('task');
      if (task !== null && !TASK_ID.test(task)) throw new HttpError(400, 'invalid_task');
      const { rows } = await store.pool.query(`SELECT seq,type,task_id,data,created_at FROM team_events
        WHERE run_id=$1 AND seq>$2 AND ($3::text IS NULL OR task_id=$3) ORDER BY seq LIMIT 200`, [id, after, task]);
      return [200, { events: rows, next_cursor: String(rows.at(-1)?.seq ?? after) }];
    },
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
          const r = await store.pool.query("SELECT version FROM schema_migrations WHERE version='004_node_chats.sql'");
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
