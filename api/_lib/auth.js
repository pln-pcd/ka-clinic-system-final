// Authentication helpers shared by the serverless functions: who is calling
// (admin or patient, from a verified Firebase ID token), the admin login
// lockout policy, patient trusted devices, one-time sign-in codes, and the
// admin "remember this device" cookie.
import { auth, db } from './firebaseAdmin.js';
import crypto from 'node:crypto';
import { sendMail } from './mail/mailer.js';

// ══════════════════════════════════════════════════════════════════════════
// Admin callers and login lockout
// ══════════════════════════════════════════════════════════════════════════
// Verifies the caller's Firebase ID token and loads their admins/{uid}
// doc. Used by every endpoint that must trust "who is calling" (derived
// server-side from a verified token) rather than a client-supplied
// uid/email in the request body.

export async function requireAuthenticatedAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return { error: 'Not authenticated.', status: 401 };

  let decoded;
  try {
    // checkRevoked: true — without this, a token issued before a Batch 6
    // revoke keeps working until it naturally expires (up to 1hr). This
    // makes /revoke-admin's auth.revokeRefreshTokens() actually bite on
    // the very next API call, not just the next full sign-in.
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    return { error: 'Your session has expired. Please sign in again.', status: 401 };
  }

  const ref = db.collection('admins').doc(decoded.uid);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Not authorized.', status: 403 };

  return { uid: decoded.uid, ref, data: snap.data() };
}

// Batch 6 — shared by /invite-admin and /revoke-admin: both are
// manager-only actions on other admins' accounts.
export async function requireActiveManager(req) {
  const caller = await requireAuthenticatedAdmin(req);
  if (caller.error) return caller;
  if (caller.data.role !== 'manager' || caller.data.status !== 'active') {
    return { error: 'Only an active manager can do this.', status: 403 };
  }
  return caller;
}

// admins/{uid} is keyed by Firebase Auth uid, not email, so every endpoint
// that only has an email (pre-authentication: lockout precheck/failure)
// needs this query.
export async function findAdminByEmail(email) {
  const snap = await db.collection('admins').where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { uid: docSnap.id, ref: docSnap.ref, data: docSnap.data() };
}

// Batch 4 — brute-force lockout policy shared by the admin login and OTP handlers.
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function lockStatus(adminData) {
  const lockedUntil = adminData?.lockedUntil || null;
  const locked = !!lockedUntil && Date.now() < lockedUntil;
  const minutesRemaining = locked ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0;
  return { locked, minutesRemaining };
}

// ══════════════════════════════════════════════════════════════════════════
// Patient callers, trusted devices and MRN lookup
// ══════════════════════════════════════════════════════════════════════════
// Patient-app login second factor.
//
// Every patient sign-in must pass an emailed OTP unless THIS device holds a
// valid trust token that the server minted after a previous OTP pass with
// "Keep me signed in" ticked. Trust lives server-side under
// patientTrustedDevices/{uid}.devices[fingerprint(deviceId)] as a SHA-256 of
// the token; the client only ever holds the raw token. Every lookup here
// fails closed: no doc, no entry, hash mismatch, expired, revoked, or a
// missing patientSessions doc all mean "not trusted" — never the reverse.

export const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashTrustToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Verifies the caller's Firebase ID token and resolves their patient record.
// Anonymous (guest) sessions are refused: they have no email to send to and
// nothing to protect.
export async function requireAuthenticatedPatient(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return { error: 'Not authenticated.', status: 401 };

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    return { error: 'Your session has expired. Please sign in again.', status: 401 };
  }
  if (decoded.firebase?.sign_in_provider === 'anonymous') {
    return { error: 'Guest sessions cannot be verified.', status: 403 };
  }

  let snap = await db.collection('authorizedPatients').where('uid', '==', decoded.uid).limit(1).get();
  if (snap.empty && decoded.email) {
    snap = await db.collection('authorizedPatients').where('email', '==', decoded.email.toLowerCase()).limit(1).get();
  }
  if (snap.empty) return { error: 'No patient record is linked to this account.', status: 403 };

  const data = snap.docs[0].data();
  const email = (data.email || decoded.email || '').toLowerCase().trim();
  if (!email) return { error: 'No email on file for this patient record. Please contact the clinic.', status: 422 };

  return { uid: decoded.uid, email, name: data.name || '', mrn: data.mrn || snap.docs[0].id };
}

// Archived records lock the patient app. The nightly sweep archives a record
// a year after its dose series completed; while it stays archived the
// patient cannot sign in or finish signup. Restoring the record from the
// dashboard's Archive page clears isArchived, which unlocks sign-in again
// with no other change: this reads the live record on every attempt.
export const ARCHIVED_RECORD_ERROR = 'This patient record has been archived, so app sign-in is turned off. Please contact K&A Clinic to reactivate your record.';

export async function isPatientRecordArchived(mrn) {
  if (!mrn) return false;
  const snap = await db.collection('vaccinations').doc(mrn).get();
  return snap.exists && snap.data()?.isArchived === true;
}

// True only when every condition holds; any gap is "not trusted".
export async function isDeviceTrusted({ uid, deviceId, trustToken }) {
  if (!uid || !deviceId || !trustToken) return false;
  if (typeof deviceId !== 'string' || typeof trustToken !== 'string') return false;

  const fingerprint = fingerprintDeviceId(deviceId);
  const trustSnap = await db.collection('patientTrustedDevices').doc(uid).get();
  if (!trustSnap.exists) return false;
  const entry = trustSnap.data()?.devices?.[fingerprint];
  if (!entry || entry.revoked === true) return false;
  if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= Date.now()) return false;
  if (entry.deviceId !== deviceId) return false;

  const expected = hashTrustToken(trustToken);
  const stored = String(entry.tokenHash || '');
  if (stored.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(expected))) return false;

  // Revoking a device from the "Logged-in devices" screen deletes or flags
  // its patientSessions doc; that must also kill the OTP bypass.
  const sessionSnap = await db.collection('patientSessions').doc(`${uid}_${deviceId}`).get();
  if (!sessionSnap.exists || sessionSnap.data()?.revoked === true) return false;

  return true;
}

export async function touchTrustedDevice({ uid, deviceId }) {
  const fingerprint = fingerprintDeviceId(deviceId);
  await db.collection('patientTrustedDevices').doc(uid)
    .set({ devices: { [fingerprint]: { lastActiveAt: Date.now() } } }, { merge: true })
    .catch(() => {});
}

// Mints a fresh token for this device, replacing any earlier one. Returns the
// raw token for the client to keep; only its hash is stored.
export async function trustDevice({ uid, deviceId, deviceLabel }) {
  const token = crypto.randomBytes(32).toString('hex');
  const fingerprint = fingerprintDeviceId(deviceId);
  const now = Date.now();
  await db.collection('patientTrustedDevices').doc(uid).set({
    devices: {
      [fingerprint]: {
        deviceId,
        tokenHash: hashTrustToken(token),
        label: String(deviceLabel || '').slice(0, 80),
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + TRUST_TTL_MS,
        revoked: false,
      },
    },
  }, { merge: true });
  return { token, expiresAt: now + TRUST_TTL_MS };
}

export async function untrustDevice({ uid, deviceId }) {
  if (!uid || !deviceId) return;
  const fingerprint = fingerprintDeviceId(deviceId);
  await db.collection('patientTrustedDevices').doc(uid)
    .set({ devices: { [fingerprint]: { revoked: true, revokedAt: Date.now() } } }, { merge: true })
    .catch(() => {});
}

// The canonical, stored MRN format across this whole system is "<year>-<seq>"
// with NO "MRN-" prefix (e.g. "2026-001") — that's what ka-clinic-admin/src/
// features/patients/PatientsPage.jsx getAndIncrementNextMRN() actually writes as the Firestore doc
// ID, and what patient-app/config/backend.ts normalizeMRN() and
// firestore.rules' isValidPatientBooking() both already assume. This mirrors
// that same normalization so a patient typing "MRN-2026-001", "mrn-2026-1",
// or "2026-001" all resolve to the same real document.
export function normalizeMRN(raw) {
  if (!raw) return '';
  const clean = String(raw).trim().toUpperCase().replace(/^MRN-?/, '');
  if (!clean) return '';
  const m = clean.match(/^(\d{4})-(\d+)$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(3, '0')}`;
  }
  return clean;
}

// authorizedPatients is keyed by MRN; older docs may only carry it as a field.
export async function findAuthorizedPatient(mrn) {
  const docSnap = await db.collection('authorizedPatients').doc(mrn).get();
  if (docSnap.exists) return docSnap.data();

  const querySnap = await db.collection('authorizedPatients').where('mrn', '==', mrn).limit(1).get();
  if (!querySnap.empty) return querySnap.docs[0].data();

  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// One-time sign-in codes
// ══════════════════════════════════════════════════════════════════════════
// Shared by sendOtp in api/patient-auth.js (patient, MRN-keyed) and sendAdminOtp in api/admin-auth.js (admin,
// uid-keyed) — the two flows use different auth models and different
// Firestore collections, so only the generation/cooldown/send-or-rollback
// mechanics are factored out here, not the handlers themselves.

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function isInCooldown(record, cooldownMs) {
  return !!(record?.createdAt && Date.now() - record.createdAt < cooldownMs);
}

export function getCooldownRemainingSeconds(record, cooldownMs) {
  if (!record?.createdAt) return 0;
  const elapsed = Date.now() - record.createdAt;
  if (elapsed >= cooldownMs) return 0;
  return Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
}

// Sends the OTP email; on failure, deletes the just-written OTP doc (so a
// failed send doesn't block a retry behind the cooldown for a code that was
// never delivered) and returns { error } for the caller to turn into a 502.
// On success returns { error: null }.
export async function sendOtpEmailOrRollback({ otpRef, to, subject, html, text }) {
  const { error } = await sendMail({ to, subject, html, text });
  if (error) {
    console.error('Gmail send error:', error);
    await otpRef.delete();
  }
  return { error };
}

// Never return a full email in an API response — only enough to let the
// patient confirm it's their own address.
export function maskEmail(email) {
  if (!email || !email.includes('@')) return 'the email on file';
  const [name, domain] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'•'.repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
}

// ══════════════════════════════════════════════════════════════════════════
// Admin trusted-device cookie
// ══════════════════════════════════════════════════════════════════════════
// Batch 4 — "remember this device" cookie. HttpOnly so client-side JS
// (including any XSS) can never read the raw deviceId; the browser just
// attaches it automatically on same-origin requests to /api/*, and the
// server is the only thing that ever compares it against trustedDevices.

export const DEVICE_COOKIE_NAME = 'ka_device_id';

export function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Browsers drop a `Secure` cookie sent over plain http (a phone or laptop
// opening the dev server by its LAN address), which made every
// "Remember me" sign-in there create a new device that was never
// recognised. Production is always https, so it always gets Secure.
export function isSecureRequest(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto) return proto === 'https';
  return Boolean(req?.socket?.encrypted) || Boolean(process.env.VERCEL);
}

export function buildDeviceCookie(deviceId, maxAgeMs, secure = true) {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  return `${DEVICE_COOKIE_NAME}=${encodeURIComponent(deviceId)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`;
}

// Batch 7 — clears the cookie (used when a device is logged out remotely,
// or by its own owner, so this browser stops presenting a now-revoked id).
export function clearDeviceCookie(secure = true) {
  return `${DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`;
}

// The browser's own stable id (kept in its localStorage and sent at sign-in)
// identifies "the same browser signing in again", so its trust entry is
// refreshed instead of a new one being added. Only this hash is stored, and
// it is never a credential: skipping the code still needs the HttpOnly
// cookie, whose value stays a server-generated secret.
export function hashClientDeviceKey(key) {
  const k = String(key || '').trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(k)) return null;
  return crypto.createHash('sha256').update(`kna-device:${k}`).digest('hex').slice(0, 24);
}

// Works out which trustedDevices entries to drop: expired, revoked or
// malformed ones, and duplicates of the same browser (same client key, or,
// for entries saved before client keys existed, the same device name).
// Within a group the most recently active entry is kept, and `keep` (the
// device making this request) is never dropped.
export function staleTrustedDevices(trustedDevices, { now = Date.now(), keep = null } = {}) {
  const entries = Object.entries(trustedDevices || {});
  const drop = new Set();
  const live = [];
  for (const [fp, e] of entries) {
    if (!e || typeof e !== 'object' || !e.deviceId || !(e.expiresAt > now) || e.revoked === true) {
      if (fp !== keep) drop.add(fp);
    } else {
      live.push([fp, e]);
    }
  }
  const groups = new Map();
  for (const [fp, e] of live) {
    const g = e.clientKeyHash ? `key:${e.clientKeyHash}` : `name:${e.deviceName || ''}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([fp, e]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const winner = list.find(([fp]) => fp === keep)
      || list.slice().sort((a, b) => (b[1].lastActiveAt || b[1].createdAt || 0) - (a[1].lastActiveAt || a[1].createdAt || 0))[0];
    for (const [fp] of list) if (fp !== winner[0]) drop.add(fp);
  }
  return [...drop];
}

// One-way fingerprint of the secret deviceId. This — never the raw
// deviceId — is what the device-management UI sees and sends back to
// identify "which entry to delete," so trustedDevices' map keys and any
// client-visible device identifier stay safely non-reversible to the
// actual cookie/bearer value.
export function fingerprintDeviceId(deviceId) {
  return crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 16);
}

// Best-effort, dependency-free UA parse — good enough for a device-list
// label ("Chrome on Windows"), not meant to be a precise UA sniffer.
export function parseDeviceName(userAgent) {
  const ua = userAgent || '';

  let browser = 'Unknown browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

