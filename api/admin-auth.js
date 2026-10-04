// Admin sign-in and session endpoints, served by one serverless function
// (Vercel's Hobby plan caps a deployment at 12). Every old URL still works:
// vercel.json rewrites each one here with ?route=<old name>.
//
//   /api/admin-login                      -> adminLogin
//   /api/send-admin-otp                   -> sendAdminOtp
//   /api/verify-admin-otp                 -> verifyAdminOtp
//   /api/admin-otp?op=send|verify         -> sendAdminOtp / verifyAdminOtp
//   /api/admin-forgot-password            -> adminForgotPassword
//   /api/admin-reset-password             -> adminResetPassword
//   /api/admin-password?op=forgot|reset   -> adminForgotPassword / adminResetPassword
//   /api/devices                          -> devices
//
// Each handler keeps its own method check and its own auth, so sharing a
// function changes nothing about who may call what. The handlers live below,
// one section each, followed by the route table.
import {
  findAdminByEmail,
  lockStatus,
  LOCKOUT_DURATION_MS,
  MAX_LOGIN_ATTEMPTS,
  requireAuthenticatedAdmin,
  getCookie,
  DEVICE_COOKIE_NAME,
  fingerprintDeviceId,
  maskEmail,
  generateOtp,
  isInCooldown,
  getCooldownRemainingSeconds,
  sendOtpEmailOrRollback,
  buildDeviceCookie,
  parseDeviceName,
  clearDeviceCookie,
  hashClientDeviceKey,
  isSecureRequest,
  staleTrustedDevices,
} from './_lib/auth.js';
import { isValidEmail, sendMail } from './_lib/mail/mailer.js';
import { db, auth } from './_lib/firebaseAdmin.js';
import {
  buildAdminOtpEmailHtml,
  buildAdminOtpEmailText,
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
} from './_lib/mail/templates.js';
import crypto from 'node:crypto';
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { dispatch } from './_lib/router.js';
import { isCurrentPassword, passwordPolicyError } from './_lib/passwordPolicy.js';

// ══════════════════════════════════════════════════════════════════════════
// Login lockout: /api/admin-login (precheck, failure)
// ══════════════════════════════════════════════════════════════════════════
// Batch 4 — login lockout, consolidated. Previously two serverless functions
// (admin-login-precheck, admin-login-failure); merged behind a single `action`
// field to stay under Vercel's 12-function Hobby cap. Both halves are one
// logical flow — precheck reads the lockout state before a password attempt,
// failure records the attempt that just failed — and both are deliberately
// unauthenticated: they run around signInWithEmailAndPassword, when the caller
// has no session yet. Behavior per action is unchanged from the originals.

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

const LOGIN_ACTIONS = { precheck: true, failure: true };

async function adminLogin(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.body?.action || '').trim();
  if (!Object.prototype.hasOwnProperty.call(LOGIN_ACTIONS, action)) {
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

// ══════════════════════════════════════════════════════════════════════════
// Sign-in code, send: /api/send-admin-otp
// ══════════════════════════════════════════════════════════════════════════
// Batch 3/4 — called right after a successful signInWithEmailAndPassword.
// Caller identity comes from a verified Firebase ID token, never a
// client-supplied uid. If the request carries a valid trusted-device
// cookie, no email is sent at all — the client skips straight to OTP-free
// login (Batch 4).

const ADMIN_OTP_COOLDOWN_MS = 30 * 1000;
const ADMIN_OTP_TTL_MS = 5 * 60 * 1000;

async function sendAdminOtp(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const caller = await requireAuthenticatedAdmin(req);
    if (caller.error) {
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }
    if (caller.data.status !== 'active') {
      res.status(403).json({ success: false, error: 'This account is not active. Contact your clinic manager.' });
      return;
    }

    // Defense in depth: the client already ran /admin-login-precheck
    // before attempting the password, but the real boundary is here —
    // never trust the client to have honored that check.
    const { locked, minutesRemaining } = lockStatus(caller.data);
    if (locked) {
      res.status(423).json({ success: false, error: `Too many attempts. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.` });
      return;
    }

    // trustedDevices is a map keyed by fingerprintDeviceId(deviceId) (Batch 7)
    // — a stale pre-migration array here just fails the lookup safely (falls
    // through to "not trusted," never a crash or a false trust).
    const deviceId = getCookie(req, DEVICE_COOKIE_NAME);
    const trustedDevices = caller.data.trustedDevices || {};
    const fingerprint = deviceId ? fingerprintDeviceId(deviceId) : null;
    const entry = fingerprint ? trustedDevices[fingerprint] : null;
    const isTrusted = !!entry && entry.deviceId === deviceId && entry.expiresAt > Date.now();
    if (isTrusted) {
      // Best-effort — a device-management "last active" list is a UX nicety,
      // not the security boundary, so a failure here shouldn't block login.
      caller.ref.update({ [`trustedDevices.${fingerprint}.lastActiveAt`]: Date.now() }).catch(() => {});
      res.status(200).json({ success: true, trusted: true });
      return;
    }

    const otpRef = db.collection('otps').doc(caller.uid);
    const existing = await otpRef.get();
    if (isInCooldown(existing.exists ? existing.data() : null, ADMIN_OTP_COOLDOWN_MS)) {
      const remainingSec = getCooldownRemainingSeconds(existing.exists ? existing.data() : null, ADMIN_OTP_COOLDOWN_MS) || 30;
      res.status(429).json({
        success: false,
        error: `Please wait before requesting another code. Try again in ${remainingSec} second${remainingSec === 1 ? '' : 's'}.`,
        retryAfter: remainingSec,
      });
      return;
    }

    const code = generateOtp();
    await otpRef.set({ code, expiresAt: Date.now() + ADMIN_OTP_TTL_MS, createdAt: Date.now() });

    const { error: sendError } = await sendOtpEmailOrRollback({
      otpRef,
      to: caller.data.email,
      subject: `${code} is your K&A Clinic admin sign-in code`,
      html: buildAdminOtpEmailHtml({ otp: code }),
      text: buildAdminOtpEmailText({ otp: code }),
    });

    if (sendError) {
      res.status(502).json({ success: false, error: 'Failed to send the verification email. Please try again.' });
      return;
    }

    res.status(200).json({ success: true, trusted: false, maskedEmail: maskEmail(caller.data.email) });
  } catch (err) {
    console.error('send-admin-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong sending the code. Please try again.' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Sign-in code, verify: /api/verify-admin-otp
// ══════════════════════════════════════════════════════════════════════════
// Batch 3/4/7 — verifies the OTP that followed a successful password
// sign-in. On success: resets the failed-attempt counter (Batch 3 + 4),
// and — if the client asked to remember this device — mints an HttpOnly
// cookie and records it on admins/{uid}.trustedDevices (a map keyed by a
// fingerprint of the deviceId, Batch 7 — a map rather than an array so a
// single device can later be looked up/updated/deleted atomically from
// the device-management UI) so future logins from this browser can skip
// the OTP step entirely (Batch 4).

const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function verifyAdminOtp(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const caller = await requireAuthenticatedAdmin(req);
    if (caller.error) {
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }
    if (caller.data.status !== 'active') {
      res.status(403).json({ success: false, error: 'This account is not active. Contact your clinic manager.' });
      return;
    }

    const code = (req.body?.code || '').trim();
    const rememberDevice = !!req.body?.rememberDevice;
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ success: false, error: 'Please enter the 6-digit code.' });
      return;
    }

    const otpRef = db.collection('otps').doc(caller.uid);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists) {
      res.status(400).json({ success: false, error: 'No verification code found. Please request a new one.' });
      return;
    }

    const record = otpSnap.data();
    if (Date.now() >= record.expiresAt) {
      await otpRef.delete();
      res.status(400).json({ success: false, error: 'This code has expired. Please request a new one.' });
      return;
    }

    if (code !== record.code) {
      // Batch 3: "show error, allow retry until expiry" — no separate
      // attempt counter for OTP itself, only for the password step.
      res.status(400).json({ success: false, error: 'Incorrect code. Please try again.' });
      return;
    }

    await otpRef.delete();

    const updates = { failedLoginAttempts: 0, lockedUntil: null };

    if (rememberDevice) {
      // The same browser signing in again refreshes its existing entry
      // (found by its cookie, or by its stable client key) instead of adding
      // another "Chrome on Windows" to the list.
      const now = Date.now();
      const devices = caller.data.trustedDevices || {};
      const clientKeyHash = hashClientDeviceKey(req.body?.clientDeviceKey);
      let fingerprint = null;
      const cookieId = getCookie(req, DEVICE_COOKIE_NAME);
      if (cookieId) {
        const fp = fingerprintDeviceId(cookieId);
        if (devices[fp]?.deviceId === cookieId) fingerprint = fp;
      }
      if (!fingerprint && clientKeyHash) {
        const match = Object.entries(devices).find(([, e]) => e && e.clientKeyHash === clientKeyHash && e.deviceId && e.revoked !== true);
        if (match) fingerprint = match[0];
      }
      let deviceId;
      if (fingerprint) {
        const prev = devices[fingerprint];
        deviceId = prev.deviceId;
        updates[`trustedDevices.${fingerprint}`] = {
          ...prev,
          ...(clientKeyHash ? { clientKeyHash } : {}),
          deviceName: parseDeviceName(req.headers['user-agent']),
          lastActiveAt: now,
          expiresAt: now + DEVICE_TTL_MS,
        };
      } else {
        deviceId = crypto.randomUUID();
        fingerprint = fingerprintDeviceId(deviceId);
        updates[`trustedDevices.${fingerprint}`] = {
          deviceId,
          ...(clientKeyHash ? { clientKeyHash } : {}),
          deviceName: parseDeviceName(req.headers['user-agent']),
          createdAt: now,
          lastActiveAt: now,
          expiresAt: now + DEVICE_TTL_MS,
        };
      }
      // Tidy the list while here: expired entries and older duplicates go.
      const merged = { ...devices, [fingerprint]: updates[`trustedDevices.${fingerprint}`] };
      for (const fp of staleTrustedDevices(merged, { now, keep: fingerprint })) {
        updates[`trustedDevices.${fp}`] = FieldValue.delete();
      }
      await caller.ref.update(updates);
      res.setHeader('Set-Cookie', buildDeviceCookie(deviceId, DEVICE_TTL_MS, isSecureRequest(req)));
    } else {
      await caller.ref.update(updates);
    }

    res.status(200).json({ success: true, role: caller.data.role, name: caller.data.name || '' });
  } catch (err) {
    console.error('verify-admin-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong verifying the code. Please try again.' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Forgot password: /api/admin-forgot-password
// ══════════════════════════════════════════════════════════════════════════
const RESET_COOLDOWN_MS = 30 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function adminForgotPassword(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    if (!rawEmail || !rawEmail.includes('@')) {
      res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
      return;
    }

    // Lookup user in Firebase Auth
    let user;
    try {
      user = await auth.getUserByEmail(rawEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Obfuscate slightly or give friendly notice
        res.status(404).json({ success: false, error: 'No clinic account registered with this email.' });
        return;
      }
      throw err;
    }

    // Verify admin doc exists and is active
    const adminSnap = await db.collection('admins').doc(user.uid).get();
    if (!adminSnap.exists) {
      res.status(403).json({ success: false, error: 'This account does not have clinic administrative access.' });
      return;
    }

    const adminData = adminSnap.data();
    if (adminData.status !== 'active') {
      res.status(403).json({ success: false, error: 'This account is inactive. Please contact the clinic manager.' });
      return;
    }

    // Cooldown check on passwordResets collection
    const resetRef = db.collection('passwordResets').doc(user.uid);
    const existing = await resetRef.get();
    if (isInCooldown(existing.exists ? existing.data() : null, RESET_COOLDOWN_MS)) {
      const remainingSec = getCooldownRemainingSeconds(existing.exists ? existing.data() : null, RESET_COOLDOWN_MS) || 30;
      res.status(429).json({
        success: false,
        error: `Please wait before requesting another reset code. Try again in ${remainingSec} second${remainingSec === 1 ? '' : 's'}.`,
        retryAfter: remainingSec,
      });
      return;
    }

    const code = generateOtp();

    // Generate reset token (Firebase Auth oobCode with reliable crypto fallback)
    const fallbackToken = randomBytes(32).toString('hex');
    let oobCode = null;
    try {
      const rawLink = await auth.generatePasswordResetLink(rawEmail);
      if (rawLink) {
        const parsed = new URL(rawLink);
        oobCode = parsed.searchParams.get('oobCode');
      }
    } catch (linkErr) {
      console.warn('generatePasswordResetLink notice (using secure fallback token):', linkErr.message);
    }

    const resetToken = oobCode || fallbackToken;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || (host && host.includes('localhost') ? 'http' : 'https');
    const origin = req.headers.origin 
      || (req.headers.referer ? new URL(req.headers.referer).origin : null) 
      || (host ? `${proto}://${host}` : 'https://ka-clinic-system-final.vercel.app');

    const resetUrl = `${origin}/?mode=resetPassword&oobCode=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(rawEmail)}`;

    await resetRef.set({
      code,
      oobCode: oobCode || null,
      token: fallbackToken,
      resetToken,
      email: rawEmail,
      uid: user.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + RESET_TTL_MS,
    });

    let buildHtml = buildPasswordResetEmailHtml;
    let buildText = buildPasswordResetEmailText;
    let sendMailFn = sendMail;
    try {
      const freshTemplate = await import(`./_lib/mail/templates.js?t=${Date.now()}`);
      if (freshTemplate?.buildPasswordResetEmailHtml) {
        buildHtml = freshTemplate.buildPasswordResetEmailHtml;
        buildText = freshTemplate.buildPasswordResetEmailText;
      }
      const freshMailer = await import(`./_lib/mail/mailer.js?t=${Date.now()}`);
      if (freshMailer?.sendMail) {
        sendMailFn = freshMailer.sendMail;
      }
    } catch {}

    const { error: sendError } = await sendMailFn({
      to: rawEmail,
      subject: 'Reset Your K&A Animal Bite Center Password',
      html: buildHtml({
        resetUrl,
        email: rawEmail,
        name: adminData.name,
      }),
      text: buildText({
        resetUrl,
        email: rawEmail,
        name: adminData.name,
      }),
      role: 'auth',
    });

    if (sendError) {
      await resetRef.delete();
      res.status(502).json({ success: false, error: 'Failed to send the reset code email. Please try again.' });
      return;
    }

    res.status(200).json({
      success: true,
      maskedEmail: maskEmail(rawEmail),
      expiresInMinutes: 10,
    });
  } catch (err) {
    console.error('admin-forgot-password error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong sending the reset code. Please try again.' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Reset password: /api/admin-reset-password
// ══════════════════════════════════════════════════════════════════════════
async function adminResetPassword(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    const action = req.body?.action || '';
    const code = (req.body?.code || '').trim();
    const oobCode = (req.body?.oobCode || '').trim();
    const newPassword = req.body?.newPassword || '';

    if (!rawEmail || !rawEmail.includes('@')) {
      res.status(400).json({ success: false, error: 'Please enter your email address.' });
      return;
    }

    let user;
    try {
      user = await auth.getUserByEmail(rawEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        res.status(404).json({ success: false, error: 'Account not found.' });
        return;
      }
      throw err;
    }

    // Direct unlock action after client-side confirmPasswordReset
    if (action === 'unlock') {
      await db.collection('admins').doc(user.uid).update({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: Date.now(),
      }).catch(() => {});
      await db.collection('passwordResets').doc(user.uid).delete().catch(() => {});
      res.status(200).json({ success: true, message: 'Account unlocked.' });
      return;
    }

    if (!code && !oobCode) {
      res.status(400).json({ success: false, error: 'Please provide a verification code or reset link.' });
      return;
    }
    if (code && !/^\d{6}$/.test(code)) {
      res.status(400).json({ success: false, error: 'Please enter the 6-digit verification code.' });
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      res.status(400).json({ success: false, error: policyError });
      return;
    }

    const resetRef = db.collection('passwordResets').doc(user.uid);
    const resetSnap = await resetRef.get();

    if (!resetSnap.exists) {
      res.status(400).json({ success: false, error: 'No active reset request found. Please request a new code.' });
      return;
    }

    const resetData = resetSnap.data();

    if (Date.now() >= resetData.expiresAt) {
      await resetRef.delete();
      res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
      return;
    }

    if (code && resetData.code !== code) {
      res.status(400).json({ success: false, error: 'Incorrect verification code. Please check your email.' });
      return;
    }

    if (oobCode) {
      const match = (resetData.oobCode && resetData.oobCode === oobCode) ||
                    (resetData.token && resetData.token === oobCode) ||
                    (resetData.resetToken && resetData.resetToken === oobCode);
      if (!match) {
        res.status(400).json({ success: false, error: 'Invalid or expired reset link. Please request a new link.' });
        return;
      }
    }

    // Only now, with the code or link proven, compare against the current
    // password (checking earlier would let anyone test password guesses).
    if (await isCurrentPassword(rawEmail, newPassword)) {
      res.status(400).json({ success: false, error: 'New password must be different from your current password.' });
      return;
    }

    // Update password in Firebase Authentication
    await auth.updateUser(user.uid, {
      password: newPassword,
    });

    // Clean up reset doc
    await resetRef.delete();

    // Unlock admin account and reset failed attempts
    await db.collection('admins').doc(user.uid).update({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: Date.now(),
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('admin-reset-password error:', err);
    res.status(500).json({ success: false, error: 'Failed to update password. Please try again.' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Trusted devices and sessions: /api/devices
// ══════════════════════════════════════════════════════════════════════════
// Batch 7 — trusted-device management, consolidated. Previously four separate
// serverless functions (check-session, list-trusted-devices, logout-device,
// logout-all-devices); merged behind a single `action` field because Vercel's
// Hobby plan caps a deployment at 12 serverless functions and api/ had grown
// to 15. Behavior per action is unchanged from the original handlers — only
// the routing differs, so the security model (POST-only, every action behind
// requireAuthenticatedAdmin) is identical.

// Silent, side-effect-free check used by the web app's boot sequence.
// Firebase's own auth persistence (browserLocalPersistence) has no built-in
// expiry, so a "Remember me" session would otherwise stay signed in forever;
// this ties the 30-day "stay logged in" cap requested for trusted devices to
// that persisted session by re-checking the trusted-device cookie on every
// fresh app load, not just at password sign-in time. No email is sent and no
// OTP record is touched here.
function checkSession(req, res, caller) {
  if (caller.data.status !== 'active') {
    res.status(200).json({ success: true, authorized: false });
    return;
  }

  const deviceId = getCookie(req, DEVICE_COOKIE_NAME);
  const trustedDevices = caller.data.trustedDevices || {};
  const fingerprint = deviceId ? fingerprintDeviceId(deviceId) : null;
  const entry = fingerprint ? trustedDevices[fingerprint] : null;
  const trustedDevice = !!entry && entry.deviceId === deviceId && entry.expiresAt > Date.now();

  res.status(200).json({
    success: true,
    authorized: trustedDevice,
    role: caller.data.role,
    name: caller.data.name || '',
  });
}

// Powers Settings → Device Management. Never returns the raw deviceId (that
// stays server-only, compared only against the HttpOnly cookie) — only the
// one-way fingerprint, which is safe for the client to hold and pass back to
// the logout-device action.
async function listTrusted(req, res, caller) {
  const currentDeviceId = getCookie(req, DEVICE_COOKIE_NAME);
  const currentFingerprint = currentDeviceId ? fingerprintDeviceId(currentDeviceId) : null;
  const trustedDevices = { ...(caller.data.trustedDevices || {}) };
  const now = Date.now();

  // One-time cleanup of lists built before duplicates were prevented: drop
  // expired, revoked and duplicate entries (keeping this device's own).
  const stale = staleTrustedDevices(trustedDevices, { now, keep: currentFingerprint });
  if (stale.length) {
    await caller.ref.update(Object.fromEntries(stale.map(fp => [`trustedDevices.${fp}`, FieldValue.delete()])));
    stale.forEach(fp => { delete trustedDevices[fp]; });
  }

  const devices = Object.entries(trustedDevices)
    .filter(([, entry]) => entry && entry.expiresAt > now && entry.revoked !== true)
    .map(([fingerprint, entry]) => ({
      fingerprint,
      deviceName: entry.deviceName || 'Unknown device',
      createdAt: entry.createdAt || null,
      lastActiveAt: entry.lastActiveAt || entry.createdAt || null,
      expiresAt: entry.expiresAt,
      isCurrentDevice: fingerprint === currentFingerprint,
    }))
    .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));

  res.status(200).json({ success: true, devices });
}

// Settings → Device Management "Log out" on a single device. Honest about
// what this can and can't do: it removes that device's OTP-skip trust
// immediately (its next sign-in attempt will require a fresh password + OTP),
// and if it's already mid-session there, that session keeps working until its
// current Firebase ID token naturally expires (Firebase has no per-device
// session kill — see the logout-all action for the one thing that can force
// an already-open session out everywhere, right now).
async function logoutDevice(req, res, caller) {
  const fingerprint = (req.body?.fingerprint || '').trim();
  if (!fingerprint) {
    res.status(400).json({ success: false, error: 'Missing device fingerprint.' });
    return;
  }

  const trustedDevices = caller.data.trustedDevices || {};
  if (!trustedDevices[fingerprint]) {
    res.status(404).json({ success: false, error: 'Device not found.' });
    return;
  }

  await caller.ref.update({ [`trustedDevices.${fingerprint}`]: FieldValue.delete() });

  // Logging out your own current device — drop its cookie too, so it
  // doesn't keep presenting a trust entry that no longer exists.
  const currentDeviceId = getCookie(req, DEVICE_COOKIE_NAME);
  const currentFingerprint = currentDeviceId ? fingerprintDeviceId(currentDeviceId) : null;
  if (currentFingerprint === fingerprint) {
    res.setHeader('Set-Cookie', clearDeviceCookie(isSecureRequest(req)));
  }

  res.status(200).json({ success: true });
}

// Settings → Device Management "Log out of all devices," and also called
// after a self-service password change (see SettingsPage.jsx). Unlike the
// logout-device action, this one is a real, near-immediate global kick:
// revokeRefreshTokens + requireAuthenticatedAdmin's checkRevoked:true
// (_lib/auth.js) means every other open session gets rejected on its very
// next API call, not just its next full sign-in.
async function logoutAll(req, res, caller) {
  await caller.ref.update({ trustedDevices: {} });
  await auth.revokeRefreshTokens(caller.uid);
  res.setHeader('Set-Cookie', clearDeviceCookie(isSecureRequest(req)));

  res.status(200).json({ success: true });
}

const DEVICE_ACTIONS = {
  'check-session': checkSession,
  'list-trusted': listTrusted,
  'logout-device': logoutDevice,
  'logout-all': logoutAll,
};

async function devices(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.body?.action || '').trim();
  const run = Object.prototype.hasOwnProperty.call(DEVICE_ACTIONS, action) ? DEVICE_ACTIONS[action] : null;
  if (!run) {
    res.status(400).json({ success: false, error: 'Unknown or missing action.' });
    return;
  }

  try {
    // Auth is enforced here, once, for every action — no action can be
    // reached without an authenticated, non-revoked admin.
    const caller = await requireAuthenticatedAdmin(req);
    if (caller.error) {
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }

    await run(req, res, caller);
  } catch (err) {
    console.error(`devices (${action}) error:`, err);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
}

// The earlier combined URLs (/api/admin-otp, /api/admin-password) pick the
// operation with ?op= (or an `op` body field).
function byOp(handlers, unknownError) {
  return (req, res) => {
    const target = handlers[req.query?.op || req.body?.op];
    if (!target) {
      res.status(404).json({ success: false, error: unknownError });
      return undefined;
    }
    return target(req, res);
  };
}

const ROUTES = {
  'admin-login': adminLogin,
  'send-admin-otp': sendAdminOtp,
  'verify-admin-otp': verifyAdminOtp,
  'admin-otp': byOp({ send: sendAdminOtp, verify: verifyAdminOtp }, 'Unknown OTP operation.'),
  'admin-forgot-password': adminForgotPassword,
  'admin-reset-password': adminResetPassword,
  'admin-password': byOp({ forgot: adminForgotPassword, reset: adminResetPassword }, 'Unknown password operation.'),
  devices,
};

export default async function handler(req, res) {
  return dispatch(ROUTES, req, res);
}
