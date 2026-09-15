// Patient-app login second factor.
//
// Every patient sign-in must pass an emailed OTP unless THIS device holds a
// valid trust token that the server minted after a previous OTP pass with
// "Keep me signed in" ticked. Trust lives server-side under
// patientTrustedDevices/{uid}.devices[fingerprint(deviceId)] as a SHA-256 of
// the token; the client only ever holds the raw token. Every lookup here
// fails closed: no doc, no entry, hash mismatch, expired, revoked, or a
// missing patientSessions doc all mean "not trusted" — never the reverse.
import crypto from 'node:crypto';
import { auth, db } from './firebaseAdmin.js';
import { fingerprintDeviceId } from './deviceCookie.js';

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
