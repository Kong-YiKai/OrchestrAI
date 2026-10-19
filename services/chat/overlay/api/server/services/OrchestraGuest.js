const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { randomBytes } = require('node:crypto');
const { SystemRoles } = require('librechat-data-provider');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { purgeOrchestraServices } = require('@librechat/api');
const { createUser } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const { setAuthTokens } = require('~/server/services/AuthService');
const { deleteUserController } = require('~/server/controllers/UserController');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');

/**
 * Guest mode ("skip login"): a throwaway account with the same abilities as a member. Nothing
 * a guest does is kept — the account and everything it owns (chat, files, agent teams,
 * research) is deleted when the guest signs out, or 24 hours after it was created.
 */
const PROVIDER = 'guest';
const LIFETIME_MS = 24 * 60 * 60 * 1000;
const PER_IP_PER_HOUR = 3;
const MAX_GUESTS = 100;
const SWEEP_MS = 10 * 60 * 1000;

const recent = new Map();
const purging = new Set();

function allow(ip) {
  const now = Date.now();
  for (const [key, times] of recent) {
    const kept = times.filter((t) => now - t < 3600000);
    if (kept.length) recent.set(key, kept);
    else recent.delete(key);
  }
  const times = recent.get(ip) ?? [];
  if (times.length >= PER_IP_PER_HOUR) return false;
  recent.set(ip, [...times, now]);
  return true;
}

async function createGuest(req, res) {
  if (process.env.ORCHESTRA_GUESTS === 'false') {
    return res.status(404).json({ message: 'guest_disabled' });
  }
  try {
    const User = mongoose.models.User;
    if ((await User.countDocuments({ provider: PROVIDER })) >= MAX_GUESTS) {
      return res.status(429).json({ message: 'guest_capacity' });
    }
    if (!allow(req.ip ?? 'unknown')) {
      return res.status(429).json({ message: 'guest_rate_limited' });
    }
    const id = randomBytes(8).toString('hex');
    const appConfig = await getAppConfig({ baseOnly: true });
    const user = await createUser(
      {
        provider: PROVIDER,
        email: `guest-${id}@guest.orchestrai.invalid`,
        username: `guest-${id}`,
        name: '游客',
        avatar: null,
        role: SystemRoles.USER,
        emailVerified: true,
        // Nobody knows this password: a guest only ever holds the session issued here.
        password: bcrypt.hashSync(randomBytes(24).toString('hex'), 10),
      },
      appConfig?.balance,
      true,
      true,
    );
    const token = await setAuthTokens(user._id, res, null, req);
    logger.info(`[OrchestraGuest] guest ${user._id} created`);
    return res.status(200).json({
      token,
      user: { id: user._id.toString(), name: user.name, provider: PROVIDER },
    });
  } catch (error) {
    logger.error('[OrchestraGuest] create failed', error);
    return res.status(500).json({ message: 'guest_failed' });
  }
}

/** Deletes one guest everywhere. Returns false when something is still busy (retried later). */
async function purgeGuest(guest) {
  const id = String(guest._id ?? guest.id);
  if (purging.has(id)) return false;
  purging.add(id);
  try {
    return await deleteGuest(guest, id);
  } finally {
    purging.delete(id);
  }
}

async function deleteGuest(guest, id) {
  const user = { id, _id: new mongoose.Types.ObjectId(id), email: guest.email, role: guest.role,
    tenantId: guest.tenantId };
  if (!(await purgeOrchestraServices(user))) return false;
  const config = await getAppConfig({ role: user.role, userId: id });
  let status = 0;
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json: () => res,
    send: () => res,
  };
  await deleteUserController({ user, body: {}, config }, res);
  if (status === 200) logger.info(`[OrchestraGuest] guest ${id} deleted`);
  return status === 200;
}

/** After a guest signs out, delete it (the sweep retries anything that was still running). */
function purgeOnLogout(req, res, next) {
  optionalJwtAuth(req, res, (error) => {
    const guest = req.user;
    if (!error && guest?.provider === PROVIDER) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          purgeGuest(guest).catch((failure) => logger.error('[OrchestraGuest] purge failed', failure));
        }
      });
    }
    next();
  });
}

async function sweep() {
  const guests = await runAsSystem(() =>
    mongoose.models.User.find({ provider: PROVIDER }).select('_id email role tenantId createdAt').lean(),
  );
  for (const guest of guests) {
    const expired = Date.now() - new Date(guest.createdAt).getTime() > LIFETIME_MS;
    const signedOut =
      !expired && (await runAsSystem(() => mongoose.models.Session.countDocuments({ user: guest._id }))) === 0;
    if (expired || signedOut) {
      await purgeGuest(guest).catch((failure) => logger.error('[OrchestraGuest] sweep failed', failure));
    }
  }
}

function startGuestSweep() {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    sweep()
      .catch((failure) => logger.error('[OrchestraGuest] sweep failed', failure))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(tick, 30000).unref();
  setInterval(tick, SWEEP_MS).unref();
}

module.exports = { createGuest, purgeOnLogout, startGuestSweep };
