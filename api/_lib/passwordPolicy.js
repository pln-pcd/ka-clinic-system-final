// Password rules for NEW passwords, enforced by every endpoint that sets one
// (admin invite acceptance, admin reset, patient sign-up). Mirrors
// ka-clinic-admin/src/lib/passwordPolicy.js and
// patient-app/utils/passwordPolicy.ts. Existing passwords are never checked:
// sign-in keeps working, the rules apply only when a password is set.
const RULES = [
  { test: p => p.length >= 8, text: 'at least 8 characters' },
  { test: p => /[A-Z]/.test(p), text: 'one uppercase letter' },
  { test: p => /[a-z]/.test(p), text: 'one lowercase letter' },
  { test: p => /\d/.test(p), text: 'one number' },
  { test: p => /[^A-Za-z0-9\s]/.test(p), text: 'one symbol' },
];
const MAX_LENGTH = 4096; // Firebase Auth's own limit

// '' when the password passes, otherwise one sentence naming what is missing.
export function passwordPolicyError(password) {
  const p = String(password || '');
  if (p.length > MAX_LENGTH) return 'Password is too long.';
  const missing = RULES.filter(r => !r.test(p)).map(r => r.text);
  return missing.length ? `Password needs ${missing.join(', ')}.` : '';
}

// True when `password` is already this account's password. Uses the Auth
// REST sign-in (the Admin SDK cannot read password hashes). Needs the web API
// key (FIREBASE_WEB_API_KEY or VITE_FIREBASE_API_KEY); without one, or on any
// network error, it returns false so a reset is never blocked by this check.
export async function isCurrentPassword(email, password) {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || (emulator ? 'emulator' : '');
  if (!email || !password || !key) return false;
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  try {
    const res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
