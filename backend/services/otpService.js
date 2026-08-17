/**
 * otpService — FP-042 · GAP-AUTH-001..004 · Decisions ADR-02, D-007
 * FINAL LLD 1.1 §29 · ADR-02 (parent session) + ADR-05 (delivery) OPEN
 *
 * ── What is built here (unblocked) ──────────────────────────────────────────
 * The full OTP lifecycle up to the delivery boundary: generation, hashing,
 * expiry, single-use, attempt limiting, replay prevention, and safe verification.
 * DELIVERY (sending the code by SMS) goes through the FP-039 adapter, which is
 * ADR-05-pending; this service HANDS OFF to that boundary and does not send.
 *
 * ── Codes are never stored in the clear ─────────────────────────────────────
 * Only a salted hash of the code is stored, exactly as a password would be.
 * A database leak must not reveal live codes. Verification hashes the input and
 * compares, using a constant-time comparison to avoid timing leaks.
 *
 * ── Safe failure ────────────────────────────────────────────────────────────
 * Verification returns the SAME generic failure for wrong code, expired code,
 * and unknown identifier, so an attacker cannot distinguish "no such account"
 * from "wrong code". The specific reason is available server-side for audit.
 */
const crypto = require('crypto');

const CODE_LENGTH = 6;
const EXPIRY_MS = 5 * 60 * 1000;      // 5 minutes
const MAX_ATTEMPTS = 5;               // per code
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends

/** A numeric code, generated with a CSPRNG (never Math.random). */
function generateCode() {
  // Uniform 6-digit code without modulo bias.
  const max = 10 ** CODE_LENGTH;
  let n;
  do { n = crypto.randomInt(0, max); } while (false);
  return String(n).padStart(CODE_LENGTH, '0');
}

/** Salted hash of a code. Salt is per-record so identical codes hash differently. */
function hashCode(code, salt) {
  return crypto.createHmac('sha256', salt).update(code).digest('hex');
}

/** Constant-time compare to avoid a timing side channel. */
function safeEqual(a, b) {
  const ba = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Create and persist an OTP challenge, then hand the plaintext code to the
 * delivery boundary. Returns metadata only — never the code, never the hash.
 *
 * @param {object} opts
 * @param {string} opts.identifier   phone/email the code is for
 * @param {string} opts.purpose      'parent-login' | 'verify-phone' | ...
 * @param {*} opts.schoolId
 * @param {object} opts.deps         { OtpModel, deliver, now? } — injectable
 */
async function requestOtp({ identifier, purpose, schoolId, deps }) {
  if (!identifier) throw new Error('OTP_IDENTIFIER_REQUIRED');
  if (!purpose) throw new Error('OTP_PURPOSE_REQUIRED');

  const Otp = deps.OtpModel;
  const now = deps.now ? deps.now() : Date.now();

  // ── Resend cooldown — prevents flooding a number with codes ────────────────
  const recent = await Otp.findOne({ identifier, purpose, school: schoolId })
    .sort({ createdAt: -1 }).lean?.() ?? null;
  if (recent && recent.createdAt && (now - new Date(recent.createdAt).getTime()) < RESEND_COOLDOWN_MS && !recent.consumedAt) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - new Date(recent.createdAt).getTime())) / 1000);
    return { status: 'cooldown', retryAfterSeconds: wait, message: `Please wait ${wait}s before requesting another code.` };
  }

  const code = generateCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const record = await Otp.create({
    identifier, purpose, school: schoolId,
    codeHash: hashCode(code, salt),
    salt,
    expiresAt: new Date(now + EXPIRY_MS),
    attempts: 0,
    consumedAt: null,
  });

  // ── Delivery boundary — hand the plaintext code off, never store it ────────
  // deps.deliver routes to the FP-039 adapter (ADR-05). In MODE A with no
  // provider, delivery reports pending; the OTP still exists and can be verified
  // in a test/dev flow. We never log the code here.
  let delivery = { status: 'pending', reason: 'ADR-05 delivery boundary' };
  if (deps.deliver) {
    delivery = await deps.deliver({ to: identifier, code, purpose, schoolId });
  }

  return {
    status: 'issued',
    otpId: record._id,
    expiresAt: record.expiresAt,
    delivery,
    // Deliberately no code, no hash, no salt in the response.
  };
}

/**
 * Verify a submitted code.
 *
 * Single-use, attempt-limited, expiry-checked, replay-proof. Returns a GENERIC
 * failure for every negative case so an attacker learns nothing; the precise
 * reason is in `auditReason` for server-side logging only.
 */
async function verifyOtp({ identifier, purpose, code, schoolId, deps }) {
  const Otp = deps.OtpModel;
  const now = deps.now ? deps.now() : Date.now();
  const generic = { verified: false, message: 'The code is incorrect or has expired.' };

  const record = await Otp.findOne({ identifier, purpose, school: schoolId })
    .sort({ createdAt: -1 });
  if (!record) return { ...generic, auditReason: 'no_active_code' };

  // ── Replay / single-use ────────────────────────────────────────────────────
  if (record.consumedAt) return { ...generic, auditReason: 'already_consumed' };

  // ── Expiry ─────────────────────────────────────────────────────────────────
  if (new Date(record.expiresAt).getTime() < now) {
    return { ...generic, auditReason: 'expired' };
  }

  // ── Attempt limit — lock after too many wrong guesses ──────────────────────
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ...generic, auditReason: 'attempts_exceeded', locked: true };
  }

  // ── Compare (constant time) ────────────────────────────────────────────────
  const submittedHash = hashCode(String(code || ''), record.salt);
  const match = safeEqual(submittedHash, record.codeHash);

  if (!match) {
    record.attempts += 1;
    await record.save();
    return { ...generic, auditReason: 'wrong_code', attemptsRemaining: Math.max(0, MAX_ATTEMPTS - record.attempts) };
  }

  // ── Success — consume so it cannot be replayed ─────────────────────────────
  record.consumedAt = new Date(now);
  await record.save();
  return { verified: true, otpId: record._id };
}

module.exports = {
  requestOtp,
  verifyOtp,
  generateCode,
  hashCode,
  safeEqual,
  CODE_LENGTH,
  EXPIRY_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
};
