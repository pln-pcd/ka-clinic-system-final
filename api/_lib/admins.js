// Shared admins/{uid} lookups used by the invite + login-lockout endpoints.
import { db } from './firebaseAdmin.js';

// admins/{uid} is keyed by Firebase Auth uid, not email, so every endpoint
// that only has an email (pre-authentication: lockout precheck/failure)
// needs this query.
export async function findAdminByEmail(email) {
  const snap = await db.collection('admins').where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { uid: docSnap.id, ref: docSnap.ref, data: docSnap.data() };
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
