import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const ID = '[0-9a-f-]{36}';
const ROUTES: Record<string, RegExp | undefined> = {
  GET: new RegExp(`^/(?:models|projects(?:/${ID}(?:/chat)?)?|runs/${ID}(?:/(?:events|files(?:/${ID})?))?)$`),
  POST: new RegExp(`^/projects(?:/${ID}/(?:design|control|inputs|chat))?$`),
  PUT: new RegExp(`^/projects/${ID}/(?:plan|budget)$`),
  DELETE: new RegExp(`^/projects/${ID}(?:/inputs/${ID})?$`),
};

type Identity = { id?: string; tenantId?: string };

/** Question ids the chat client acts on once the user has answered them. */
export const CLARIFY_CONFIRM_ID = 'orchestra_confirm';

/**
 * Per-turn instructions that turn a build request into a step-by-step clarification with the
 * native ask_user_question card. The chat client creates the agent team from the confirmed
 * summary, so the model never claims to have built anything itself.
 */
export function orchestraClarifyContext(): string {
  return [
    '你是 OrchestrAI 的总助手，背后有一支可以组建的智能体团队。先判断用户本条消息是不是请你「做出」一个需要多个步骤才能完成的成果（软件、网站、App、小游戏、系列文章、方案、视频脚本、设计稿等）。',
    '不是的话（提问、闲聊、解释、翻译、短文改写、单个小问题），正常回答，不要调用 ask_user_question。',
    '是的话，不要直接给出完整代码或方案，而是调用 ask_user_question 一步一步问清需求：每次 1–4 个最关键的问题，每题 2–5 个简短选项（id 用英文小写），对话里已经能确定的不要再问，最多 3 轮。其中一轮必须包含 id 为 budget 的问题，问这支团队的预算，选项写成 "¥2"、"¥5"、"¥10"、"¥20" 这样的金额。',
    `需求清楚后，最后单独调用一次 ask_user_question，只问一个 id 为 ${CLARIFY_CONFIRM_ID} 的问题：header 写 12 字以内的项目名，question 写「确认按下面的需求组建智能体团队吗？」，description 写完整的需求摘要（目标、每个关键选择、要交付的东西，400 字以内，用用户的语言），options 为 [{"label":"确认，生成工作流","value":"confirm"},{"label":"还要调整","value":"revise"}]。`,
    '用户选 confirm 后，系统会按需求摘要自动组建团队并生成工作流画布；你只需简短说明团队正在组建，可以在右侧「项目」面板或画布里查看、修改并运行，不要自己写出成果。用户选 revise 或写了别的意见，就按意见继续澄清。',
  ].join('\n');
}

/**
 * One call to the workflow service as a verified chat user. The service only ever sees a
 * short-lived delegation for that user, never client credentials.
 */
export async function workflowRequest(
  user: Identity,
  method: string,
  path: string,
  options: { body?: unknown; key?: string; timeout?: number } = {},
): Promise<{ status: number; text: string }> {
  const secret = process.env.DELEGATION_SECRET;
  const base = process.env.WORKFLOW_API_URL;
  if (!user.id) return { status: 401, text: '{"error":"authentication_required"}' };
  if (!secret || secret.length < 32 || !base) return { status: 503, text: '{"error":"workflow_not_configured"}' };
  const token = jwt.sign({ tenant: user.tenantId ?? 'default',
    scopes: [method === 'GET' ? 'runs:read' : 'runs:write'] }, secret,
    { algorithm: 'HS256', subject: user.id, issuer: 'orchestrai-chat',
      audience: 'orchestrai-workflow', expiresIn: '60s', jwtid: randomUUID() });
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (options.key && options.key.length <= 128) headers['Idempotency-Key'] = options.key;
  try {
    const upstream = await fetch(`${base}${path}`, { method, headers,
      ...(method === 'POST' || method === 'PUT' ? { body: JSON.stringify(options.body ?? {}) } : {}),
      signal: AbortSignal.timeout(options.timeout ?? 15000) });
    return { status: upstream.status, text: await upstream.text() };
  } catch {
    return { status: 502, text: '{"error":"workflow_unavailable"}' };
  }
}

/** Forward only verified chat identity and the workflow protocol, never client credentials. */
export function createOrchestraWorkflowRouter(): Router {
  const router = Router();
  router.use(async (req: Request, res: Response) => {
    const user = req.user as Identity | undefined;
    if (!user?.id) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }
    const allowed = ROUTES[req.method];
    if (!allowed?.test(req.path)) {
      res.status(404).json({ error: 'route_not_found' });
      return;
    }
    // Only the event cursor and the node filter are forwarded, both strictly shaped.
    const query = new URLSearchParams();
    if (typeof req.query.after === 'string' && /^\d{1,15}$/.test(req.query.after)) query.set('after', req.query.after);
    if (typeof req.query.task === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(req.query.task)) query.set('task', req.query.task);
    const cursor = query.toString() ? `?${query}` : '';
    const upstream = await workflowRequest(user, req.method, `${req.path}${cursor}`, {
      body: req.body,
      key: req.get('Idempotency-Key'),
      // A node chat waits for one model reply; everything else is quick.
      timeout: req.method === 'POST' && req.path.endsWith('/chat') ? 100000 : 15000,
    });
    res.status(upstream.status).type('application/json').send(upstream.text);
  });
  return router;
}
