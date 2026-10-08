import crypto from 'node:crypto';
import { db, auth } from './firebaseAdmin.js';
import publicFirebaseConfig from '../../patient-app/google-services.json' with { type: 'json' };

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_COOLDOWN_MS = 30 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const ADMIN_IDLE_MS = 30 * 60 * 1000;
const PATIENT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const GENERIC_LOGIN_ERROR = 'Invalid credentials or account unavailable. Please try again later.';
export const GENERIC_RECOVERY = { success: true, maskedEmail: 'the email on file', expiresInMinutes: 10 };

export function secretHash(value, context = '') {
  return crypto.createHash('sha256').update(`${context}:${String(value)}`).digest('hex');
}
export function matchesSecret(value, hash, context = '') {
  const computed = secretHash(value, context);
  return typeof hash === 'string' && hash.length === computed.length
    && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computed));
}

// Reserve sends and count guesses in transactions, including concurrent requests.
export async function issueOtp(ref, extra = {}) {
  const code = crypto.randomInt(100000, 1000000).toString();
  const now = Date.now();
  const outcome = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const previous = snap.data();
    const wait = previous?.createdAt + OTP_COOLDOWN_MS - now;
    if (wait > 0) return { status: 429, retryAfter: Math.ceil(wait / 1000), error: 'Please wait before requesting another code.' };
    tx.set(ref, { ...extra, codeHash: secretHash(code, ref.path), attempts: 0, createdAt: now, expiresAt: now + OTP_TTL_MS });
    return { code };
  });
  return outcome;
}
export async function consumeOtp(ref, code, { proof = false } = {}) {
  const rawProof = proof ? crypto.randomBytes(32).toString('hex') : null;
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), record = snap.data();
    if (!record || record.used || Date.now() >= record.expiresAt) return { status: 400, error: 'Invalid or expired verification code.' };
    if (record.attempts >= MAX_OTP_ATTEMPTS) return { status: 429, error: 'Too many incorrect attempts. Please request a new code.' };
    if (!matchesSecret(code, record.codeHash, ref.path)) {
      tx.update(ref, { attempts: (record.attempts || 0) + 1 });
      return { status: 400, error: 'Invalid or expired verification code.' };
    }
    if (proof) tx.update(ref, { used: true, verified: true, verifiedAt: Date.now(), proofHash: secretHash(rawProof, ref.path), codeHash: null });
    else tx.update(ref, { used: true, codeHash: null }); // retain cooldown after consumption
    return { success: true, proof: rawProof };
  });
}

export function securitySessionRef(decoded) {
  return db.collection('securitySessions').doc(`${decoded.uid}_${decoded.auth_time}`);
}
export async function grantSecuritySession(decoded, scope, extra = {}) {
  await securitySessionRef(decoded).set({ ...extra, uid: decoded.uid, authTime: decoded.auth_time, scope,
    expiresAt: Date.now() + (scope === 'admin' ? ADMIN_IDLE_MS : PATIENT_SESSION_MS), lastActiveAt: Date.now() });
}
export async function hasSecuritySession(decoded, scope) {
  const snap = await securitySessionRef(decoded).get();
  const data = snap.data();
  return !!data && data.scope === scope && data.authTime === decoded.auth_time && data.expiresAt > Date.now();
}
export async function revokeSecuritySession(decoded) {
  await securitySessionRef(decoded).delete();
}
export async function revokeAllSecuritySessions(uid) {
  const snap = await db.collection('securitySessions').where('uid', '==', uid).get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
  await auth.revokeRefreshTokens(uid);
}

// A uniform bucket exists even for unknown identities. Reserve before password
// verification: a client cannot skip failure reporting to evade five attempts.
export async function reserveLogin(identity, scope) {
  const ref = db.collection('loginAttempts').doc(secretHash(identity.toLowerCase(), scope));
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), previous = snap.data();
    const current = previous?.until > now ? previous : { attempts: 0, until: now + 15 * 60 * 1000 };
    if (current.attempts >= 5) return { allowed: false, ref };
    tx.set(ref, { attempts: current.attempts + 1, until: current.until });
    return { allowed: true, ref };
  });
}
export async function verifyPassword(email, password) {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || (emulator ? 'emulator' : publicFirebaseConfig.client[0].api_key[0].current_key);
  if (!key) throw new Error('FIREBASE_WEB_API_KEY must be configured for server-side sign-in.');
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const response = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!response.ok) return null;
  return response.json();
}
