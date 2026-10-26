import { db, auth } from './firebaseAdmin.js';
import { findAuthorizedPatient, normalizeMRN, isDeviceTrusted, isPatientRecordArchived, issueSignupPass,
  requireAuthenticatedPatient, touchTrustedDevice, untrustDevice, maskEmail,
  sendOtpEmailOrRollback, trustDevice } from './auth.js';
import { issueOtp, consumeOtp, matchesSecret, grantSecuritySession,
  reserveLogin, verifyPassword, GENERIC_LOGIN_ERROR, GENERIC_RECOVERY,
  revokeSecuritySession, revokeAllSecuritySessions } from './security.js';
import { buildOtpEmailHtml, buildOtpEmailText, buildPasswordResetEmailHtml, buildPasswordResetEmailText } from './mail/templates.js';
import { sendMail } from './mail/mailer.js';
import { dispatch } from './router.js';
import { passwordPolicyError } from './passwordPolicy.js';

const validMrn = mrn => /^\d{4}-\d{3,10}$/.test(mrn);
const deny = (res, result) => res.status(result.status || 400).json({ success: false, error: result.error, ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}) });
async function mailOtp(ref, email, title, extra, purpose = 'signin') {
  const result = await issueOtp(ref, extra);
  if (result.error) return result;
  const { error } = await sendOtpEmailOrRollback({ otpRef: ref, to: email, subject: title,
    html: buildOtpEmailHtml({ otp: result.code, purpose }), text: buildOtpEmailText({ otp: result.code, purpose }) });
  return error ? { status: 502, error: 'Unable to send verification email. Please try again.' } : { success: true };
}
async function login(req, res) {
  const mrn = normalizeMRN(req.body?.mrn), password = req.body?.password;
  if (!validMrn(mrn) || typeof password !== 'string' || password.length > 4096) return deny(res, { error: GENERIC_LOGIN_ERROR });
  const bucket = await reserveLogin(mrn, 'patient');
  if (!bucket.allowed) return deny(res, { status: 429, error: GENERIC_LOGIN_ERROR });
  const patient = await findAuthorizedPatient(mrn);
  if (!patient || patient.authorized === false || await isPatientRecordArchived(mrn)) return deny(res, { status: 401, error: GENERIC_LOGIN_ERROR });
  const credential = await verifyPassword(patient.email, password);
  if (!credential || (await db.collection('admins').doc(credential.localId).get()).exists) return deny(res, { status: 401, error: GENERIC_LOGIN_ERROR });
  // The MRN typed must be the one this account is linked to (one MRN per patient).
  if (patient.uid && patient.uid !== credential.localId) return deny(res, { status: 401, error: GENERIC_LOGIN_ERROR });
  await bucket.ref.delete();
  res.status(200).json({ success: true, customToken: await auth.createCustomToken(credential.localId) });
}
async function forgot(req, res) {
  const mrn = normalizeMRN(req.body?.mrn);
  if (!validMrn(mrn)) return res.status(200).json(GENERIC_RECOVERY);
  const bucket = await reserveLogin(mrn, 'patient-recovery');
  if (!bucket.allowed) return res.status(200).json(GENERIC_RECOVERY);
  const patient = await findAuthorizedPatient(mrn);
  if (patient?.email && patient.authorized !== false && !await isPatientRecordArchived(mrn)) {
    const user = await auth.getUserByEmail(patient.email).catch(() => null);
    if (user && !(await db.collection('admins').doc(user.uid).get()).exists) {
      const link = await auth.generatePasswordResetLink(patient.email);
      await sendMail({ to: patient.email, subject: 'Reset your K&A Clinic password',
        html: buildPasswordResetEmailHtml({ resetUrl: link, email: patient.email, name: patient.name }),
        text: buildPasswordResetEmailText({ resetUrl: link, email: patient.email, name: patient.name }) });
    }
  }
  res.status(200).json(GENERIC_RECOVERY);
}
async function sendOtp(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  const action = req.body?.action || '';
  if (action === 'login') return login(req, res);
  if (action === 'forgot-password') return forgot(req, res);
  if (['login-check', 'login-send', 'login-untrust', 'logout-all', 'revoke-device'].includes(action)) {
    const caller = await requireAuthenticatedPatient(req, { allowPendingSecondFactor: action !== 'revoke-device' });
    if (caller.error) return deny(res, caller);
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    if (deviceId.length > 99 || deviceId.includes('/')) return deny(res, { error: 'Invalid device.' });
    if (action === 'revoke-device') {
      if (!/^[A-Za-z0-9_-]{1,99}$/.test(deviceId)) return deny(res, { error: 'Invalid device.' });
      await untrustDevice({ uid: caller.uid, deviceId });
      await db.collection('patientSessions').doc(`${caller.uid}_${deviceId}`).set({ uid: caller.uid, deviceId, revoked: true }, { merge: true });
      const sessions = await db.collection('securitySessions').where('uid', '==', caller.uid).get();
      await Promise.all(sessions.docs.filter(doc => doc.data().deviceId === deviceId).map(doc => doc.ref.delete()));
      return res.status(200).json({ success: true });
    }
    if (action === 'logout-all') {
      await db.collection('patientTrustedDevices').doc(caller.uid).delete();
      await revokeAllSecuritySessions(caller.uid);
      return res.status(200).json({ success: true });
    }
    if (action === 'login-untrust') {
      await untrustDevice({ uid: caller.uid, deviceId });
      await revokeSecuritySession(caller.decoded);
      return res.status(200).json({ success: true });
    }
    if (action === 'login-check') {
      const entry = await isDeviceTrusted({ uid: caller.uid, deviceId, trustToken: req.body?.trustToken });
      if (!entry) return res.status(200).json({ success: true, trusted: false });
      await grantSecuritySession(caller.decoded, 'patient', { mrn: caller.mrn, deviceId });
      // A one-time sign-up pass is used up here: replaced by the normal
      // 30-day trust when "Keep me signed in" is ticked, otherwise revoked.
      let trustToken;
      if (entry.oneTime) {
        if (req.body?.rememberDevice === true) trustToken = (await trustDevice({ uid: caller.uid, deviceId, deviceLabel: req.body?.deviceLabel })).token;
        else { await untrustDevice({ uid: caller.uid, deviceId }); trustToken = null; }
      } else {
        await touchTrustedDevice({ uid: caller.uid, deviceId });
      }
      return res.status(200).json({ success: true, trusted: true, mrn: caller.mrn, ...(trustToken !== undefined ? { trustToken } : {}) });
    }
    const result = await mailOtp(db.collection('patientLoginOtps').doc(caller.uid), caller.email, 'Your K&A Clinic sign-in code', { uid: caller.uid, authTime: caller.decoded.auth_time });
    if (result.error) return deny(res, result);
    return res.status(200).json({ success: true, maskedEmail: maskEmail(caller.email) });
  }
  if (action) return deny(res, { error: 'Unknown action.' });
  const mrn = normalizeMRN(req.body?.mrn);
  if (!validMrn(mrn)) return res.status(200).json(GENERIC_RECOVERY);
  const patient = await findAuthorizedPatient(mrn);
  if (!patient || patient.registered || patient.authorized === false || !patient.email || await isPatientRecordArchived(mrn)) return res.status(200).json(GENERIC_RECOVERY);
  const existingAdmin = await db.collection('admins').where('email', '==', patient.email.toLowerCase()).limit(1).get();
  if (!existingAdmin.empty) return res.status(200).json(GENERIC_RECOVERY);
  await mailOtp(db.collection('otpVerifications').doc(mrn), patient.email, 'Your K&A Clinic sign-up code', { mrn, verified: false }, 'signup');
  return res.status(200).json(GENERIC_RECOVERY);
}
async function completeSignup(req, res) {
  const mrn = normalizeMRN(req.body?.mrn), password = req.body?.password;
  if (!validMrn(mrn) || typeof password !== 'string') return deny(res, { error: 'Invalid registration details.' });
  const policy = passwordPolicyError(password);
  if (policy) return deny(res, { error: policy });
  const ref = db.collection('otpVerifications').doc(mrn);
  const claimed = await db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record?.verified || record.claimed || Date.now() - record.verifiedAt >= 15 * 60 * 1000
      || !matchesSecret(req.body?.verificationToken, record.proofHash, ref.path)) return false;
    tx.update(ref, { claimed: true, proofHash: null });
    return true;
  });
  if (!claimed) return deny(res, { status: 403, error: 'Please verify your email code again.' });
  const patient = await findAuthorizedPatient(mrn);
  if (!patient || patient.registered || patient.authorized === false || await isPatientRecordArchived(mrn)) return deny(res, { status: 403, error: 'Registration unavailable.' });
  const duplicate = await db.collection('authorizedPatients').where('email', '==', patient.email).where('registered', '==', true).get();
  if (!duplicate.empty) return deny(res, { status: 409, error: 'Registration unavailable. Contact the clinic.' });
  let user = await auth.getUserByEmail(patient.email).catch(e => { if (e.code !== 'auth/user-not-found') throw e; return null; });
  if (user && (await db.collection('admins').doc(user.uid).get()).exists) return deny(res, { status: 403, error: 'Registration unavailable.' });
  if (user) await auth.updateUser(user.uid, { password, displayName: patient.name });
  else user = await auth.createUser({ email: patient.email, password, displayName: patient.name });
  await db.collection('authorizedPatients').doc(mrn).set({ registered: true, uid: user.uid }, { merge: true });
  await db.collection('vaccinations').doc(mrn).set({ authUid: user.uid }, { merge: true });
  const deviceId = typeof req.body?.deviceId === 'string' && /^[A-Za-z0-9_-]{1,99}$/.test(req.body.deviceId) ? req.body.deviceId : '';
  const signupPass = deviceId ? await issueSignupPass({ uid: user.uid, deviceId }) : null;
  // customToken stays for app versions before 1.0.8, which sign in here and
  // then ask for a second code; 1.0.8+ ignores it and sends the patient to
  // the sign-in screen with the one-time pass instead.
  res.status(200).json({ success: true, uid: user.uid, signupPass, customToken: await auth.createCustomToken(user.uid) });
}
async function verifyOtp(req, res) {
  if (req.method !== 'POST') return deny(res, { status: 405, error: 'Method not allowed.' });
  if (req.body?.action === 'complete-signup') return completeSignup(req, res);
  if (req.body?.action === 'login-verify') {
    const caller = await requireAuthenticatedPatient(req, { allowPendingSecondFactor: true });
    if (caller.error) return deny(res, caller);
    const code = String(req.body?.code || '');
    if (!/^\d{6}$/.test(code)) return deny(res, { error: 'Enter the six-digit code.' });
    const deviceId = req.body?.deviceId;
    if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,99}$/.test(deviceId)) return deny(res, { error: 'Invalid device.' });
    const ref = db.collection('patientLoginOtps').doc(caller.uid);
    if ((await ref.get()).data()?.authTime !== caller.decoded.auth_time) return deny(res, { error: 'Invalid or expired verification code.' });
    const result = await consumeOtp(ref, code);
    if (result.error) return deny(res, result);
    let trustToken = null;
    if (req.body?.rememberDevice === true) trustToken = (await trustDevice({ uid: caller.uid, deviceId, deviceLabel: req.body?.deviceLabel })).token;
    await grantSecuritySession(caller.decoded, 'patient', { mrn: caller.mrn, deviceId });
    return res.status(200).json({ success: true, trustToken, mrn: caller.mrn });
  }
  const mrn = normalizeMRN(req.body?.mrn), code = String(req.body?.enteredCode || '');
  if (!validMrn(mrn) || !/^\d{6}$/.test(code)) return deny(res, { error: 'Invalid verification details.' });
  const result = await consumeOtp(db.collection('otpVerifications').doc(mrn), code, { proof: true });
  if (result.error) return deny(res, result);
  const patient = await findAuthorizedPatient(mrn);
  res.status(200).json({ success: true, verified: true, verificationToken: result.proof,
    patient: { mrn, name: patient?.name || '', email: patient?.email || '', authorized: true, registered: false } });
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try { return await dispatch({ 'send-otp': sendOtp, 'verify-otp': verifyOtp }, req, res); }
  catch (error) {
    console.error('patient-auth failure:', error.code || 'server-error');
    return res.status(500).json({ success: false, error: 'Unable to complete request. Please try again.' });
  }
}
