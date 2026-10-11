export function config(env = process.env) {
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'DELEGATION_SECRET']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  if (Buffer.byteLength(env.DELEGATION_SECRET) < 32) throw new Error('DELEGATION_SECRET needs at least 32 bytes');
  const redis = new URL(env.REDIS_URL);
  if (redis.protocol !== 'redis:' && redis.protocol !== 'rediss:') throw new Error('Invalid REDIS_URL scheme');
  const port = Number(env.PORT || 8090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    databaseUrl: env.DATABASE_URL,
    delegationSecret: env.DELEGATION_SECRET,
    port,
    redis: {
      host: redis.hostname, port: Number(redis.port || 6379),
      username: redis.username ? decodeURIComponent(redis.username) : undefined,
      password: redis.password ? decodeURIComponent(redis.password) : undefined,
      db: Number(redis.pathname.slice(1) || 0),
      ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
      connectTimeout: 5000,
    },
  };
}

export function log(event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'workflow', event, ...fields }));
}
