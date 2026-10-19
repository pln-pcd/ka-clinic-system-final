import crypto from 'node:crypto';
import { db, auth } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuthenticatedAdmin, findAdminByEmail, lockStatus, fingerprintDeviceId,
  getCookie, DEVICE_COOKIE_NAME, buildDeviceCookie, clearDeviceCookie, isSecureRequest,
  maskEmail, parseDeviceName, sendOtpEmailOrRollback } from './auth.js';
import { issueOtp, consumeOtp, matchesSecret, secretHash, grantSecuritySession,
  securitySessionRef, revokeSecuritySession, revokeAllSecuritySessions,
  reserveLogin, verifyPassword, GENERIC_LOGIN_ERROR, GENERIC_RECOVERY, ADMIN_IDLE_MS, hasSecuritySession } from './security.js';
import { sendMail, isValidEmail } from './mail/mailer.js';
import { buildAdminOtpEmailHtml, buildAdminOtpEmailText, buildPasswordResetEmailHtml, buildPasswordResetEmailText } from './mail/templates.js';
import { passwordPolicyError, isCurrentPassword } from './passwordPolicy.js';
import { dispatch } from './router.js';

const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const deny = (res, result) => res.status(result.status || 400).json({ success: false, error: result.error, ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}) });
const emailFrom = req => typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
function trustedEntry(req, caller) {
  const token = getCookie(req, DEVICE_COOKIE_NAME);
  const fp = token ? fingerprintDeviceId(token) : null;
  const entry = fp ? caller.data.trustedDevices?.[fp] : null;
  return entry && entry.revoked !== true && entry.expiresAt > Date.now()
    && matchesSecret(token, entry.tokenHash, 'admin-device') ? { fp, entry } : null;
}
async function adminLogin(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  const email = emailFrom(req), action = req.body?.action;
  if (!isValidEmail(email) || email.length > 254) return deny(res, { error: GENERIC_LOGIN_ERROR });
  // Legacy precheck exposes no account state. Every new password attempt is
  // performed by this server, not counted at the client's discretion.
  if (action === 'precheck') return res.status(200).json({ success: true, locked: false });
  if (action !== 'login' || typeof req.body?.password !== 'string' || req.body.password.length > 4096) return deny(res, { error: GENERIC_LOGIN_ERROR });
  const bucket = await reserveLogin(email, 'admin');
  if (!bucket.allowed) return deny(res, { status: 429, error: GENERIC_LOGIN_ERROR });
  const admin = await findAdminByEmail(email);
  if (!admin || admin.data.status !== 'active' || lockStatus(admin.data).locked) return deny(res, { status: 401, error: GENERIC_LOGIN_ERROR });
  const credential = await verifyPassword(email, req.body.password);
  if (!credential || credential.localId !== admin.uid) {
    await db.runTransaction(async tx => {
      const data = (await tx.get(admin.ref)).data();
      const expired = data.lockedUntil && data.lockedUntil <= Date.now();
      const attempts = (expired ? 0 : data.failedLoginAttempts || 0) + 1;
      tx.update(admin.ref, { failedLoginAttempts: attempts, lockedUntil: attempts >= 5 ? Date.now() + 15 * 60 * 1000 : null });
    });
    return deny(res, { status: 401, error: GENERIC_LOGIN_ERROR });
  }
  await bucket.ref.delete();
  res.status(200).json({ success: true, customToken: await auth.createCustomToken(admin.uid) });
}
async function sendAdminOtp(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  const caller = await requireAuthenticatedAdmin(req, { allowPendingSecondFactor: true });
  if (caller.error) return deny(res, caller);
  const trusted = trustedEntry(req, caller);
  if (trusted) {
    await grantSecuritySession(caller.decoded, 'admin');
    await caller.ref.update({ failedLoginAttempts: 0, lockedUntil: null, [`trustedDevices.${trusted.fp}.lastActiveAt`]: Date.now() });
    return res.status(200).json({ success: true, trusted: true });
  }
  const ref = db.collection('otps').doc(caller.uid);
  const result = await issueOtp(ref, { authTime: caller.decoded.auth_time });
  if (result.error) return deny(res, result);
  const { error } = await sendOtpEmailOrRollback({ otpRef: ref, to: caller.data.email,
    subject: 'Your K&A Clinic admin sign-in code', html: buildAdminOtpEmailHtml({ otp: result.code }), text: buildAdminOtpEmailText({ otp: result.code }) });
  if (error) return deny(res, { status: 502, error: 'Unable to send verification email.' });
  res.status(200).json({ success: true, trusted: false, maskedEmail: maskEmail(caller.data.email) });
}
async function verifyAdminOtp(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  const caller = await requireAuthenticatedAdmin(req, { allowPendingSecondFactor: true });
  if (caller.error) return deny(res, caller);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) return deny(res, { error: 'Please enter the six-digit code.' });
  const ref = db.collection('otps').doc(caller.uid);
  if ((await ref.get()).data()?.authTime !== caller.decoded.auth_time) return deny(res, { error: 'Invalid or expired verification code.' });
  const result = await consumeOtp(ref, code);
  if (result.error) return deny(res, result);
  await caller.ref.update({ failedLoginAttempts: 0, lockedUntil: null });
  if (req.body?.rememberDevice === true) {
    const token = crypto.randomBytes(32).toString('hex'), fp = fingerprintDeviceId(token), now = Date.now();
    const devices = Object.fromEntries(Object.entries(caller.data.trustedDevices || {}).filter(([, e]) => e?.tokenHash && e.expiresAt > now && !e.revoked));
    devices[fp] = { tokenHash: secretHash(token, 'admin-device'), deviceName: parseDeviceName(req.headers['user-agent']), createdAt: now, lastActiveAt: now, expiresAt: now + DEVICE_TTL_MS };
    await caller.ref.update({ trustedDevices: devices });
    res.setHeader('Set-Cookie', buildDeviceCookie(token, DEVICE_TTL_MS, isSecureRequest(req)));
  } else res.setHeader('Set-Cookie', clearDeviceCookie(isSecureRequest(req)));
  await grantSecuritySession(caller.decoded, 'admin');
  res.status(200).json({ success: true, role: caller.data.role, name: caller.data.name || '' });
}
async function adminForgotPassword(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  const email = emailFrom(req);
  if (!isValidEmail(email)) return res.status(200).json(GENERIC_RECOVERY);
  const bucket = await reserveLogin(email, 'admin-recovery');
  if (!bucket.allowed) return res.status(200).json(GENERIC_RECOVERY);
  const admin = await findAdminByEmail(email);
  if (!admin || admin.data.status !== 'active') return res.status(200).json(GENERIC_RECOVERY);
  const ref = db.collection('passwordResets').doc(admin.uid);
  const token = crypto.randomBytes(32).toString('hex');
  const reserved = await db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (record?.createdAt + 30000 > Date.now()) return false;
    tx.set(ref, { tokenHash: secretHash(token, ref.path), createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });
    return true;
  });
  if (reserved) {
    // Never build recovery links from untrusted Origin/Host headers.
    const origin = process.env.APP_URL || 'https://ka-clinic-system-final.vercel.app';
    const resetUrl = `${origin.replace(/\/$/, '')}/?mode=resetPassword&oobCode=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    await sendMail({ to: email, subject: 'Reset your K&A Clinic password',
      html: buildPasswordResetEmailHtml({ resetUrl, email, name: admin.data.name }), text: buildPasswordResetEmailText({ resetUrl, email, name: admin.data.name }) });
  }
  res.status(200).json(GENERIC_RECOVERY);
}
async function adminResetPassword(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  if (req.body?.action === 'unlock') return deny(res, { status: 403, error: 'A valid reset link is required.' });
  const email = emailFrom(req), password = req.body?.newPassword;
  if (!isValidEmail(email) || typeof password !== 'string') return deny(res, { error: 'Invalid reset details.' });
  const policy = passwordPolicyError(password);
  if (policy) return deny(res, { error: policy });
  const admin = await findAdminByEmail(email);
  if (!admin || admin.data.status !== 'active') return deny(res, { error: 'Invalid or expired reset link.' });
  const ref = db.collection('passwordResets').doc(admin.uid);
  const claimed = await db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record || record.used || record.expiresAt <= Date.now() || !matchesSecret(req.body?.oobCode, record.tokenHash, ref.path)) return false;
    tx.update(ref, { used: true, tokenHash: null });
    return true;
  });
  if (!claimed) return deny(res, { error: 'Invalid or expired reset link.' });
  if (await isCurrentPassword(email, password)) return deny(res, { error: 'Choose a different password and request a new reset link.' });
  await auth.updateUser(admin.uid, { password });
  await admin.ref.update({ failedLoginAttempts: 0, lockedUntil: null, trustedDevices: {} });
  await db.collection('loginAttempts').doc(secretHash(email, 'admin')).delete();
  await revokeAllSecuritySessions(admin.uid);
  res.status(200).json({ success: true });
}
async function devices(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  const action = req.body?.action;
  const caller = await requireAuthenticatedAdmin(req, { allowPendingSecondFactor: action === 'check-session' || action === 'logout' });
  if (caller.error) return deny(res, caller);
  const trusted = trustedEntry(req, caller);
  if (action === 'check-session') {
    const active = await hasSecuritySession(caller.decoded, 'admin');
    if (trusted) {
      await grantSecuritySession(caller.decoded, 'admin');
      await caller.ref.update({ [`trustedDevices.${trusted.fp}.lastActiveAt`]: Date.now() });
      return res.status(200).json({ success: true, authorized: true, role: caller.data.role, name: caller.data.name || '' });
    }
    return res.status(200).json({ success: true, authorized: active, role: caller.data.role, name: caller.data.name || '' });
  }
  if (action === 'heartbeat') {
    await securitySessionRef(caller.decoded).update({ expiresAt: Date.now() + ADMIN_IDLE_MS, lastActiveAt: Date.now() });
    return res.status(200).json({ success: true });
  }
  if (action === 'logout' || action === 'logout-all') {
    if (action === 'logout-all') { await caller.ref.update({ trustedDevices: {} }); await revokeAllSecuritySessions(caller.uid); }
    else {
      if (trusted) await caller.ref.update({ [`trustedDevices.${trusted.fp}`]: FieldValue.delete() });
      await revokeSecuritySession(caller.decoded);
    }
    res.setHeader('Set-Cookie', clearDeviceCookie(isSecureRequest(req)));
    return res.status(200).json({ success: true });
  }
  if (action === 'list-trusted') {
    const token = getCookie(req, DEVICE_COOKIE_NAME), current = token ? fingerprintDeviceId(token) : '';
    const devices = Object.entries(caller.data.trustedDevices || {}).filter(([, e]) => e?.tokenHash && e.expiresAt > Date.now() && !e.revoked)
      .map(([fingerprint, e]) => ({ fingerprint, deviceName: e.deviceName || 'Unknown device', createdAt: e.createdAt, lastActiveAt: e.lastActiveAt, expiresAt: e.expiresAt, isCurrentDevice: fingerprint === current }));
    return res.status(200).json({ success: true, devices });
  }
  if (action === 'logout-device') {
    const fp = req.body?.fingerprint;
    if (typeof fp !== 'string' || !/^[a-f0-9]{1,64}$/.test(fp)) return deny(res, { error: 'Invalid device.' });
    await caller.ref.update({ [`trustedDevices.${fp}`]: FieldValue.delete() });
    if (trusted?.fp === fp) { await revokeSecuritySession(caller.decoded); res.setHeader('Set-Cookie', clearDeviceCookie(isSecureRequest(req))); }
    return res.status(200).json({ success: true });
  }
  return deny(res, { error: 'Unknown action.' });
}
const byOp = handlers => (req, res) => handlers[req.query?.op]?.(req, res) || deny(res, { error: 'Unknown operation.' });
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try { return await dispatch({ 'admin-login': adminLogin, 'send-admin-otp': sendAdminOtp, 'verify-admin-otp': verifyAdminOtp,
    'admin-forgot-password': adminForgotPassword, 'admin-reset-password': adminResetPassword,
    'admin-otp': byOp({ send: sendAdminOtp, verify: verifyAdminOtp }), 'admin-password': byOp({ forgot: adminForgotPassword, reset: adminResetPassword }), devices }, req, res); }
  catch (error) { console.error('admin-auth failure:', error.code || 'server-error'); return res.status(500).json({ success: false, error: 'Unable to complete request. Please try again.' }); }
}
