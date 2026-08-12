// Verifies the caller's Firebase ID token and loads their admins/{uid}
// doc. Used by every endpoint that must trust "who is calling" (derived
// server-side from a verified token) rather than a client-supplied
// uid/email in the request body.
import { auth, db } from './firebaseAdmin.js';

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
