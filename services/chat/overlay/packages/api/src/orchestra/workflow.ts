import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const ID = '[0-9a-f-]{36}';
const ROUTES: Record<string, RegExp | undefined> = {
  GET: new RegExp(`^/(?:projects(?:/${ID})?|runs/${ID}(?:/(?:events|files(?:/${ID})?))?)$`),
  POST: new RegExp(`^/projects(?:/${ID}/(?:design|control))?$`),
  PUT: new RegExp(`^/projects/${ID}/(?:plan|budget)$`),
  DELETE: new RegExp(`^/projects/${ID}$`),
};

/** Forward only verified chat identity and the workflow protocol, never client credentials. */
export function createOrchestraWorkflowRouter(): Router {
  const router = Router();
  router.use(async (req: Request, res: Response) => {
    const user = req.user as { id?: string; tenantId?: string } | undefined;
    if (!user?.id) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }
    const secret = process.env.DELEGATION_SECRET;
    const base = process.env.WORKFLOW_API_URL;
    if (!secret || secret.length < 32 || !base) {
      res.status(503).json({ error: 'workflow_not_configured' });
      return;
    }
    const allowed = ROUTES[req.method];
    if (!allowed?.test(req.path)) {
      res.status(404).json({ error: 'route_not_found' });
      return;
    }
    const token = jwt.sign({ tenant: user.tenantId ?? 'default',
      scopes: [req.method === 'GET' ? 'runs:read' : 'runs:write'] }, secret,
      { algorithm: 'HS256', subject: user.id, issuer: 'orchestrai-chat',
        audience: 'orchestrai-workflow', expiresIn: '60s', jwtid: randomUUID() });
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const key = req.get('Idempotency-Key');
    if (key && key.length <= 128) { headers['Idempotency-Key'] = key; }
    // Only the event cursor and the node filter are forwarded, both strictly shaped.
    const query = new URLSearchParams();
    if (typeof req.query.after === 'string' && /^\d{1,15}$/.test(req.query.after)) query.set('after', req.query.after);
    if (typeof req.query.task === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(req.query.task)) query.set('task', req.query.task);
    const cursor = query.toString() ? `?${query}` : '';
    try {
      const upstream = await fetch(`${base}${req.path}${cursor}`, { method: req.method, headers,
        ...(req.method === 'POST' || req.method === 'PUT' ? { body: JSON.stringify(req.body ?? {}) } : {}),
        signal: AbortSignal.timeout(15000) });
      res.status(upstream.status).type('application/json').send(await upstream.text());
    } catch {
      res.status(502).json({ error: 'workflow_unavailable' });
    }
  });
  return router;
}
