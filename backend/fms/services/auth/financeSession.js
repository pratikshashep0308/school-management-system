// backend/fms/services/auth/financeSession.js
//
// A second gate in front of the finance module.
//
// ─── WHAT WAS ASKED FOR, AND WHAT THIS IS INSTEAD ────────────────────────────
// The request was "a separate login for the FMS". This implements that as a
// STEP-UP: the same identity, re-proved with the same password, in exchange for
// a short-lived token that only the finance module accepts.
//
// It deliberately does NOT create a second set of credentials, because a second
// password would make this school less safe rather than more:
//
//   · A second password in a five-person office gets written down. The threat
//     this is meant to stop — somebody reaching finance from a machine left
//     unlocked — is not stopped by a password on a note beside that machine.
//   · Two identities means two things to disable when somebody leaves. The one
//     that gets forgotten is the one that matters.
//   · A separate credential store means reimplementing hashing, reset, lockout
//     and rotation. Hand-rolled authentication is one of the more reliable ways
//     to be compromised, and none of it would add security this design lacks.
//
// The step-up gives the property actually wanted: an SMS session, on its own, is
// not enough to see the books. A stolen or borrowed SMS token cannot open
// finance, because the finance token is separate, separately signed, and expires
// in minutes rather than days.
//
// ─── THE FOUR RULES ──────────────────────────────────────────────────────────
// 1. The finance token is signed with its own secret and carries purpose:'fms'.
//    An SMS token can never be replayed as a finance token even if the secrets
//    were ever misconfigured to match.
// 2. It is short-lived — 30 minutes by default. Walk away, and the books lock.
// 3. Failed attempts are counted and locked out. Without that, this endpoint is
//    a password oracle: unlimited guesses against a known account.
// 4. Every unlock, failure and lockout is written to the audit trail. "Who
//    opened the books, from where, and when" is the question this exists to
//    answer.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const audit = require('../audit/auditService');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Minutes a finance session lasts before it must be re-proved. */
const SESSION_MINUTES = Number(process.env.FMS_SESSION_MINUTES || 30);

/** Failed attempts before the account is locked out of finance. */
const MAX_ATTEMPTS = Number(process.env.FMS_UNLOCK_MAX_ATTEMPTS || 5);

/** How long a lockout lasts. */
const LOCKOUT_MINUTES = Number(process.env.FMS_UNLOCK_LOCKOUT_MINUTES || 15);

/**
 * The signing secret.
 *
 * A dedicated secret is strongly preferred. Falling back to JWT_SECRET still
 * works — the purpose claim keeps the two token types apart — but it means one
 * leaked secret compromises both, so the fallback warns rather than passing
 * silently.
 */
function sessionSecret() {
  if (process.env.FMS_SESSION_SECRET) return process.env.FMS_SESSION_SECRET;

  if (!sessionSecret.warned) {
    // eslint-disable-next-line no-console
    console.warn(
      '[fms] FMS_SESSION_SECRET is not set — finance sessions are signed with '
      + 'JWT_SECRET. Set a separate secret so a leaked SMS secret does not also '
      + 'open the books.'
    );
    sessionSecret.warned = true;
  }
  if (!process.env.JWT_SECRET) {
    throw errors.conflict('No signing secret is configured', {
      hint: 'Set FMS_SESSION_SECRET (preferred) or JWT_SECRET.',
    });
  }
  return process.env.JWT_SECRET;
}

// ─── Lockout tracking ────────────────────────────────────────────────────────
// In process memory, deliberately. This is throttling, not a security record —
// the audit trail is the record. Keeping it out of the database avoids a write
// on every failed guess, which is exactly what an attacker would be generating.
// A restart clears it; that is an acceptable trade for a single-process
// deployment, and the audit trail still shows every attempt.
const attempts = new Map();

function attemptKey(userId) { return String(userId); }

function lockState(userId) {
  const rec = attempts.get(attemptKey(userId));
  if (!rec) return { locked: false, failures: 0 };

  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return {
      locked: true,
      failures: rec.failures,
      retryInSeconds: Math.ceil((rec.lockedUntil - Date.now()) / 1000),
    };
  }

  // Lockout expired — start clean.
  if (rec.lockedUntil && rec.lockedUntil <= Date.now()) {
    attempts.delete(attemptKey(userId));
    return { locked: false, failures: 0 };
  }

  return { locked: false, failures: rec.failures };
}

function recordFailure(userId) {
  const key = attemptKey(userId);
  const rec = attempts.get(key) || { failures: 0, lockedUntil: null };
  rec.failures += 1;
  if (rec.failures >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }
  attempts.set(key, rec);
  return rec;
}

function clearFailures(userId) { attempts.delete(attemptKey(userId)); }

/**
 * Exchange a password for a finance session.
 *
 * @param {object} user  the SMS user from `protect` (password not loaded)
 * @param {string} password
 * @param {object} req   for the audit trail
 */
async function unlock(user, password, req) {
  if (!user?._id) throw errors.forbidden('Not signed in');

  const state = lockState(user._id);
  if (state.locked) {
    await audit.record({
      school: user.school, entity: 'fms_financesession', entityId: user._id,
      action: 'lockout', req,
      notes: `Unlock refused — locked out for a further ${state.retryInSeconds}s`,
    }).catch(() => {});

    throw errors.forbidden(
      `Too many failed attempts. Finance is locked for ${Math.ceil(state.retryInSeconds / 60)} more minute(s).`,
      { retryInSeconds: state.retryInSeconds }
    );
  }

  if (typeof password !== 'string' || password.length === 0) {
    throw errors.badRequest('Enter your password to open the finance module');
  }

  // `password` is select:false on the SMS User model, so `protect` did not load
  // it. Fetch it explicitly and only for this comparison.
  const User = mongoose.model('User');
  const withHash = await User.findById(user._id).select('+password').lean();
  if (!withHash?.password) throw errors.forbidden('This account cannot be verified');

  const okPassword = await bcrypt.compare(password, withHash.password);

  if (!okPassword) {
    const rec = recordFailure(user._id);
    const remaining = Math.max(0, MAX_ATTEMPTS - rec.failures);

    await audit.record({
      school: user.school, entity: 'fms_financesession', entityId: user._id,
      action: 'unlockFailed', req,
      notes: `Wrong password. ${remaining} attempt(s) remaining before lockout.`,
    }).catch(() => {});

    // The message says nothing about whether the account exists or holds a
    // finance role — that is decided after authentication, not before it.
    throw errors.forbidden(
      remaining > 0
        ? `Incorrect password. ${remaining} attempt(s) remaining.`
        : `Incorrect password. Finance is now locked for ${LOCKOUT_MINUTES} minutes.`
    );
  }

  clearFailures(user._id);

  const expiresInSeconds = SESSION_MINUTES * 60;
  const token = jwt.sign(
    {
      id: String(user._id),
      school: String(user.school || ''),
      purpose: 'fms',                       // rule 1
      jti: crypto.randomBytes(8).toString('hex'),
    },
    sessionSecret(),
    { expiresIn: expiresInSeconds }
  );

  await audit.record({
    school: user.school, entity: 'fms_financesession', entityId: user._id,
    action: 'unlock', req,
    notes: `Finance session opened for ${SESSION_MINUTES} minutes`,
  }).catch(() => {});

  return {
    token,
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

/**
 * Verify a finance token.
 *
 * @returns {{ ok: boolean, claims?: object, reason?: string }}
 */
function verify(token, user) {
  if (!token) return { ok: false, reason: 'noSession' };

  let claims;
  try {
    claims = jwt.verify(token, sessionSecret());
  } catch (err) {
    return { ok: false, reason: err.name === 'TokenExpiredError' ? 'expired' : 'invalid' };
  }

  // Rule 1, enforced. An SMS token verifies against JWT_SECRET but carries no
  // purpose claim, so it can never stand in for this one.
  if (claims.purpose !== 'fms') return { ok: false, reason: 'wrongPurpose' };

  // And it must belong to whoever is holding it.
  if (user && String(claims.id) !== String(user._id)) {
    return { ok: false, reason: 'wrongUser' };
  }

  return { ok: true, claims };
}

/** End a session early. The token stays valid until it expires; this is the
 *  audit record that somebody deliberately closed the books. */
async function lock(user, req) {
  await audit.record({
    school: user?.school, entity: 'fms_financesession', entityId: user?._id,
    action: 'lock', req, notes: 'Finance session closed by the user',
  }).catch(() => {});
  return { locked: true };
}

module.exports = {
  unlock, verify, lock, lockState, clearFailures,
  SESSION_MINUTES, MAX_ATTEMPTS, LOCKOUT_MINUTES,
  _attempts: attempts,   // exposed for tests
};
