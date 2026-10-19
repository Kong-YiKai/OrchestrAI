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
