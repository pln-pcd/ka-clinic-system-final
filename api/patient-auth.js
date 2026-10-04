// Patient app sign-up and sign-in endpoints, served by one serverless
// function (Vercel's Hobby plan caps a deployment at 12). The patient app
// still calls the old URLs; vercel.json rewrites each one here with
// ?route=<old name>.
//
//   /api/send-otp     -> sendOtp    (sign-up code, login-check, login-send, login-untrust)
//   /api/verify-otp   -> verifyOtp  (sign-up code check, complete-signup, login-verify)
import { db, auth } from './_lib/firebaseAdmin.js';
import {
  findAuthorizedPatient,
  normalizeMRN,
  ARCHIVED_RECORD_ERROR,
  isDeviceTrusted,
  isPatientRecordArchived,
  requireAuthenticatedPatient,
  touchTrustedDevice,
  untrustDevice,
  maskEmail,
  generateOtp,
  isInCooldown,
  getCooldownRemainingSeconds,
  sendOtpEmailOrRollback,
  trustDevice,
} from './_lib/auth.js';
import { buildOtpEmailHtml, buildOtpEmailText } from './_lib/mail/templates.js';
import { dispatch } from './_lib/router.js';
import { passwordPolicyError } from './_lib/passwordPolicy.js';

// ══════════════════════════════════════════════════════════════════════════
// Send codes and trusted-device checks: /api/send-otp
// ══════════════════════════════════════════════════════════════════════════
const COOLDOWN_MS = 30 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;

// ── Login second factor (shares this handler: Hobby plan caps functions at 12) ──
//
// 'login-check'  → is THIS device trusted? Never sends mail. Defaults to
//                  { trusted: false } on any doubt.
// 'login-send'   → email a sign-in code to the patient's address on file.
// 'login-untrust'→ forget this device (called on explicit sign-out).
// All three require the Firebase ID token of the just-signed-in patient.
async function handleLoginCheck(req, res) {
  const caller = await requireAuthenticatedPatient(req);
  if (caller.error) {
    res.status(caller.status).json({ success: false, error: caller.error });
    return;
  }
  if (await isPatientRecordArchived(caller.mrn)) {
    res.status(403).json({ success: false, code: 'record-archived', error: ARCHIVED_RECORD_ERROR });
    return;
  }
  const deviceId = String(req.body?.deviceId || '');
  const trustToken = String(req.body?.trustToken || '');
  let trusted = false;
  try {
    trusted = await isDeviceTrusted({ uid: caller.uid, deviceId, trustToken });
  } catch (err) {
    console.error('login-check trust lookup failed (treating as untrusted):', err);
    trusted = false;
  }
  if (trusted) await touchTrustedDevice({ uid: caller.uid, deviceId });
  res.status(200).json({ success: true, trusted });
}

async function handleLoginSend(req, res) {
  const caller = await requireAuthenticatedPatient(req);
  if (caller.error) {
    res.status(caller.status).json({ success: false, error: caller.error });
    return;
  }
  if (await isPatientRecordArchived(caller.mrn)) {
    res.status(403).json({ success: false, code: 'record-archived', error: ARCHIVED_RECORD_ERROR });
    return;
  }

  const otpRef = db.collection('patientLoginOtps').doc(caller.uid);
  const existing = await otpRef.get();
  if (isInCooldown(existing.exists ? existing.data() : null, COOLDOWN_MS)) {
    const remainingSec = getCooldownRemainingSeconds(existing.exists ? existing.data() : null, COOLDOWN_MS) || 30;
    res.status(429).json({
      success: false,
      error: `Please wait before requesting another code. Try again in ${remainingSec} second${remainingSec === 1 ? '' : 's'}.`,
      retryAfter: remainingSec,
    });
    return;
  }

  const otp = generateOtp();
  await otpRef.set({
    uid: caller.uid,
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    createdAt: Date.now(),
  });

  const { error: sendError } = await sendOtpEmailOrRollback({
    otpRef,
    to: caller.email,
    subject: `${otp} is your K&A Clinic sign-in code`,
    html: buildOtpEmailHtml({ otp }),
    text: buildOtpEmailText({ otp }),
  });
  if (sendError) {
    res.status(502).json({ success: false, error: 'Failed to send the verification email. Please try again.' });
    return;
  }

  res.status(200).json({ success: true, maskedEmail: maskEmail(caller.email) });
}

async function handleLoginUntrust(req, res) {
  const caller = await requireAuthenticatedPatient(req);
  if (caller.error) {
    res.status(caller.status).json({ success: false, error: caller.error });
    return;
  }
  await untrustDevice({ uid: caller.uid, deviceId: String(req.body?.deviceId || '') });
  res.status(200).json({ success: true });
}

async function sendOtp(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = req.body?.action || '';
  if (action === 'login-check' || action === 'login-send' || action === 'login-untrust') {
    try {
      if (action === 'login-check') return await handleLoginCheck(req, res);
      if (action === 'login-send') return await handleLoginSend(req, res);
      return await handleLoginUntrust(req, res);
    } catch (err) {
      console.error(`send-otp ${action} error:`, err);
      res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
      return;
    }
  }

  try {
    const mrn = normalizeMRN(req.body?.mrn);
    if (!mrn) {
      res.status(400).json({ success: false, error: 'Please provide a valid Medical Record Number (MRN).' });
      return;
    }

    const patient = await findAuthorizedPatient(mrn);
    if (!patient) {
      res.status(404).json({ success: false, error: 'Patient record not found. Please register at the clinic first.' });
      return;
    }

    if (patient.registered === true) {
      res.status(400).json({ success: false, error: 'This patient record already has a registered account. Please sign in instead.' });
      return;
    }

    if (await isPatientRecordArchived(mrn)) {
      res.status(403).json({ success: false, code: 'record-archived', error: ARCHIVED_RECORD_ERROR });
      return;
    }

    const email = (patient.email || '').toLowerCase().trim();
    if (!email) {
      res.status(422).json({ success: false, error: 'No email on file for this patient record. Please contact the clinic to update your record.' });
      return;
    }

    // Ensure email is not already in use by another registered patient account
    const dupQuery = await db.collection('authorizedPatients')
      .where('email', '==', email)
      .where('registered', '==', true)
      .get();
    if (!dupQuery.empty && dupQuery.docs.some(d => d.id !== mrn)) {
      res.status(409).json({
        success: false,
        error: 'This email address is already registered to another patient record. Each patient must have a unique email address.'
      });
      return;
    }

    const otpRef = db.collection('otpVerifications').doc(mrn);
    const existing = await otpRef.get();
    if (isInCooldown(existing.exists ? existing.data() : null, COOLDOWN_MS)) {
      const remainingSec = getCooldownRemainingSeconds(existing.exists ? existing.data() : null, COOLDOWN_MS) || 30;
      res.status(429).json({
        success: false,
        error: `Please wait before requesting another code. Try again in ${remainingSec} second${remainingSec === 1 ? '' : 's'}.`,
        retryAfter: remainingSec,
      });
      return;
    }

    const otp = generateOtp();
    await otpRef.set({
      mrn,
      otp,
      expiresAt: Date.now() + OTP_TTL_MS,
      verified: false,
      attempts: 0,
      createdAt: Date.now(),
    });

    // sendOtpEmailOrRollback() resolves with { error } and does NOT throw on
    // send failures, so an unchecked call here would report success even
    // when no email went out.
    const { error: sendError } = await sendOtpEmailOrRollback({
      otpRef,
      to: email,
      // Leading the subject with the code is the norm for transactional OTP
      // mail — the recipient can read it from the inbox list without opening.
      subject: `${otp} is your K&A Clinic verification code`,
      html: buildOtpEmailHtml({ otp }),
      text: buildOtpEmailText({ otp }),
    });

    if (sendError) {
      res.status(502).json({ success: false, error: 'Failed to send the verification email. Please try again.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Verification code sent to email',
      maskedEmail: maskEmail(email),
    });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong sending the verification code. Please try again.' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Verify codes and complete sign-up: /api/verify-otp
// ══════════════════════════════════════════════════════════════════════════
const MAX_ATTEMPTS = 5;


// ── Sign-up completion ────────────────────────────────────────────────
// Shares this function with code verification because Vercel's Hobby plan
// caps a deployment at 12 serverless functions; the two steps are the same
// conversation anyway (verify the code, then set the password).
//
// The client used to call createUserWithEmailAndPassword() itself, which
// fails with auth/email-already-in-use whenever an earlier attempt left an
// Auth account behind without its authorizedPatients doc ever being marked
// registered — the patient was then permanently stuck, told their own email
// belonged to "another patient record". The Admin SDK can see the whole
// picture, so the decision is made here: an account for this email is adopted
// (password reset to the one just chosen) when it belongs to this MRN or to
// nobody, and refused only when another patient record genuinely owns it.

// The OTP doc is marked verified below; this window is how long that proof
// stays good for while the patient types a password.
const VERIFICATION_GRACE_MS = 15 * 60 * 1000;

async function handleCompleteSignup(req, res) {
    const mrn = normalizeMRN(req.body?.mrn);
    const password = String(req.body?.password || '');

    if (!mrn || !password) {
      res.status(400).json({ success: false, error: 'MRN and password are required.' });
      return;
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      res.status(400).json({ success: false, error: policyError });
      return;
    }

    // 1. The OTP for this MRN must have been verified, and recently.
    const otpRef = db.collection('otpVerifications').doc(mrn);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists || otpSnap.data()?.verified !== true) {
      res.status(403).json({ success: false, error: 'Please verify your email code before setting a password.' });
      return;
    }
    const verifiedAt = otpSnap.data()?.verifiedAt || otpSnap.data()?.createdAt || 0;
    if (verifiedAt && Date.now() - verifiedAt > VERIFICATION_GRACE_MS) {
      res.status(403).json({ success: false, error: 'Your verification has expired. Please request a new code.' });
      return;
    }

    // 2. The MRN must be a real, authorized clinic record with an email,
    //    and not archived (archived records cannot open the patient app).
    if (await isPatientRecordArchived(mrn)) {
      res.status(403).json({ success: false, code: 'record-archived', error: ARCHIVED_RECORD_ERROR });
      return;
    }
    const patientRef = db.collection('authorizedPatients').doc(mrn);
    const patientSnap = await patientRef.get();
    if (!patientSnap.exists) {
      res.status(404).json({ success: false, error: 'MRN not found. Please verify your Medical Record Number.' });
      return;
    }
    const patient = patientSnap.data();
    if (patient.authorized === false) {
      res.status(403).json({ success: false, error: 'This record is not authorized for app access. Please contact the clinic.' });
      return;
    }
    const email = (patient.email || '').toLowerCase().trim();
    if (!email) {
      res.status(422).json({ success: false, error: 'No email on file for this patient record. Please contact the clinic.' });
      return;
    }

    // 3. No *other* patient record may already be registered on this email.
    const dupQuery = await db.collection('authorizedPatients')
      .where('email', '==', email)
      .where('registered', '==', true)
      .get();
    const conflicting = dupQuery.docs.filter(d => d.id !== mrn);
    if (conflicting.length > 0) {
      res.status(409).json({
        success: false,
        error: 'This email address is already registered to another patient record. Each patient must have a unique email address.',
      });
      return;
    }

    // 4. Adopt or create the Auth account. An existing account that no other
    //    record claims is this patient's own orphan from a failed attempt, and
    //    the OTP just proved they control the mailbox — so reset its password
    //    rather than turning them away.
    let userRecord = null;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }

    if (userRecord) {
      await auth.updateUser(userRecord.uid, { password, displayName: patient.name || userRecord.displayName || undefined });
    } else {
      userRecord = await auth.createUser({ email, password, displayName: patient.name || undefined });
    }

    // 5. Bind the account to the clinic record and burn the OTP.
    await patientRef.set({ registered: true, uid: userRecord.uid }, { merge: true });
    await otpRef.delete();

    res.status(200).json({ success: true, uid: userRecord.uid, email });
}

// ── Login second factor ───────────────────────────────────────────────
// Verifies the code emailed by /api/send-otp {action:'login-send'}. On
// success the one-time code is destroyed; if the patient asked to stay
// signed in on this device, a trust token is minted so the NEXT sign-in from
// this same install can skip the code (see _lib/auth.js).
async function handleLoginVerify(req, res) {
  const caller = await requireAuthenticatedPatient(req);
  if (caller.error) {
    res.status(caller.status).json({ success: false, error: caller.error });
    return;
  }
  if (await isPatientRecordArchived(caller.mrn)) {
    res.status(403).json({ success: false, code: 'record-archived', error: ARCHIVED_RECORD_ERROR });
    return;
  }

  const code = String(req.body?.code || '').trim();
  const rememberDevice = req.body?.rememberDevice === true;
  const deviceId = String(req.body?.deviceId || '');
  const deviceLabel = String(req.body?.deviceLabel || '');
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ success: false, error: 'Please enter the 6-digit code.' });
    return;
  }

  const otpRef = db.collection('patientLoginOtps').doc(caller.uid);
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
  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    await otpRef.delete();
    res.status(429).json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' });
    return;
  }
  if (code !== record.otp) {
    await otpRef.update({ attempts: (record.attempts || 0) + 1 });
    res.status(400).json({ success: false, error: 'Incorrect code. Please try again.' });
    return;
  }

  await otpRef.delete();

  let trustToken = null;
  if (rememberDevice && deviceId) {
    const minted = await trustDevice({ uid: caller.uid, deviceId, deviceLabel });
    trustToken = minted.token;
  }

  res.status(200).json({ success: true, trustToken });
}

async function verifyOtp(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  if (req.body?.action === 'login-verify') {
    try {
      return await handleLoginVerify(req, res);
    } catch (err) {
      console.error('login-verify error:', err);
      res.status(500).json({ success: false, error: 'Something went wrong verifying the code. Please try again.' });
      return;
    }
  }

  // Two actions on one route: the default verifies the emailed code, and
  // 'complete-signup' turns that verification into a real account.
  if (req.body?.action === 'complete-signup') {
    try {
      return await handleCompleteSignup(req, res);
    } catch (err) {
      console.error('complete-signup error:', err);
      res.status(500).json({ success: false, error: 'Something went wrong finishing your registration. Please try again.' });
      return;
    }
  }

  try {
    const mrn = normalizeMRN(req.body?.mrn);
    const enteredCode = String(req.body?.enteredCode || '').trim();

    if (!mrn || !enteredCode) {
      res.status(400).json({ success: false, error: 'MRN and verification code are required.' });
      return;
    }

    const otpRef = db.collection('otpVerifications').doc(mrn);
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      res.status(400).json({ success: false, error: 'No pending verification code found.' });
      return;
    }

    const record = otpSnap.data();

    if (record.verified === true) {
      res.status(400).json({ success: false, error: 'This code has already been used. Please request a new one.' });
      return;
    }

    if ((record.attempts || 0) >= MAX_ATTEMPTS) {
      res.status(400).json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' });
      return;
    }

    if (Date.now() >= record.expiresAt) {
      res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
      return;
    }

    if (enteredCode !== record.otp) {
      await otpRef.update({ attempts: (record.attempts || 0) + 1 });
      res.status(400).json({ success: false, error: 'Invalid verification code.' });
      return;
    }

    // verifiedAt bounds how long this proof stays usable — see complete-signup.js
    await otpRef.update({ verified: true, verifiedAt: Date.now() });

    const patient = await findAuthorizedPatient(mrn);
    const email = (patient?.email || '').toLowerCase().trim();
    if (email) {
      const dupQuery = await db.collection('authorizedPatients')
        .where('email', '==', email)
        .where('registered', '==', true)
        .get();
      if (!dupQuery.empty && dupQuery.docs.some(d => d.id !== mrn)) {
        res.status(409).json({
          success: false,
          error: 'This email address is already registered to another patient record. Each patient must have a unique email address.'
        });
        return;
      }
    }

    res.status(200).json({ success: true, verified: true, patient });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong verifying the code. Please try again.' });
  }
}

const ROUTES = {
  'send-otp': sendOtp,
  'verify-otp': verifyOtp,
};

export default async function handler(req, res) {
  return dispatch(ROUTES, req, res);
}
