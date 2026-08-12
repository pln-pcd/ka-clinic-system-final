// Batch 4 — login lockout, consolidated. Previously two serverless functions
// (admin-login-precheck, admin-login-failure); merged behind a single `action`
// field to stay under Vercel's 12-function Hobby cap. Both halves are one
// logical flow — precheck reads the lockout state before a password attempt,
// failure records the attempt that just failed — and both are deliberately
// unauthenticated: they run around signInWithEmailAndPassword, when the caller
// has no session yet. Behavior per action is unchanged from the originals.
import { findAdminByEmail, isValidEmail } from './_lib/admins.js';
import { lockStatus, LOCKOUT_DURATION_MS, MAX_LOGIN_ATTEMPTS } from './_lib/lockout.js';

// Called BEFORE the client attempts signInWithEmailAndPassword, so a
// locked-out account is rejected without even letting the password attempt
// happen (this is what makes lockout apply "even to a correct password" —
// the client never gets that far while locked).
function precheck(res, admin) {
  if (!admin) {
    // Unknown email: nothing to lock, let signInWithEmailAndPassword
    // fail on its own (avoids confirming/denying account existence here).
    res.status(200).json({ success: true, locked: false });
    return;
  }

  const { locked, minutesRemaining } = lockStatus(admin.data);
  res.status(200).json({ success: true, locked, minutesRemaining });
}

// Called by the client after Firebase rejects a password attempt with
// auth/wrong-password or auth/invalid-credential. The client can't do this
// write itself (it isn't authenticated — the sign-in just failed, and even if
// it were, the admins/{uid} rule only allows managers to write).
async function recordFailure(res, admin) {
  if (!admin) {
    res.status(200).json({ success: true, locked: false });
    return;
  }

  // Already locked from a prior run — report it, don't restart the clock.
  const existing = lockStatus(admin.data);
  if (existing.locked) {
    res.status(200).json({ success: true, locked: true, minutesRemaining: existing.minutesRemaining });
    return;
  }

  const attempts = (admin.data.failedLoginAttempts || 0) + 1;
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    await admin.ref.update({ failedLoginAttempts: attempts, lockedUntil: Date.now() + LOCKOUT_DURATION_MS });
    res.status(200).json({ success: true, locked: true, minutesRemaining: Math.ceil(LOCKOUT_DURATION_MS / 60000) });
    return;
  }

  await admin.ref.update({ failedLoginAttempts: attempts });
  res.status(200).json({ success: true, locked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS - attempts });
}

const ACTIONS = { precheck: true, failure: true };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.body?.action || '').trim();
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
    res.status(400).json({ success: false, error: 'Unknown or missing action.' });
    return;
  }

  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
      return;
    }

    const admin = await findAdminByEmail(email);
    if (action === 'precheck') {
      precheck(res, admin);
    } else {
      await recordFailure(res, admin);
    }
  } catch (err) {
    console.error(`admin-login (${action}) error:`, err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
