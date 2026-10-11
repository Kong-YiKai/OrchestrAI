import { jwtVerify } from 'jose';

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

export async function authenticate(header, secret, scope) {
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'authentication_required');
  let payload;
  try {
    ({ payload } = await jwtVerify(header.slice(7), new TextEncoder().encode(secret), {
      algorithms: ['HS256'], issuer: 'orchestrai-chat', audience: 'orchestrai-workflow',
      maxTokenAge: '5m', requiredClaims: ['sub', 'tenant', 'iat', 'exp', 'jti'], clockTolerance: 5,
    }));
  } catch { throw new HttpError(401, 'invalid_delegation'); }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 ||
      typeof payload.tenant !== 'string' || !payload.tenant || payload.tenant.length > 128 ||
      payload.exp - payload.iat > 300) throw new HttpError(401, 'invalid_delegation');
  if (!Array.isArray(payload.scopes) || !payload.scopes.includes(scope)) throw new HttpError(403, 'missing_scope');
  return { user: payload.sub, tenant: payload.tenant };
}
