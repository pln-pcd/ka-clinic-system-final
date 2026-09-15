import { auth, db } from './_lib/firebaseAdmin.js';
import { normalizeMRN } from './_lib/mrn.js';
import { requireAuthenticatedPatient, trustDevice } from './_lib/patientAuth.js';

const MAX_ATTEMPTS = 5;

async function findAuthorizedPatient(mrn) {
  const docSnap = await db.collection('authorizedPatients').doc(mrn).get();
  if (docSnap.exists) return docSnap.data();

  const querySnap = await db.collection('authorizedPatients').where('mrn', '==', mrn).limit(1).get();
  if (!querySnap.empty) return querySnap.docs[0].data();

  return null;
}


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
const MIN_PASSWORD_LENGTH = 6;

async function handleCompleteSignup(req, res) {
    const mrn = normalizeMRN(req.body?.mrn);
    const password = String(req.body?.password || '');

    if (!mrn || !password) {
      res.status(400).json({ success: false, error: 'MRN and password are required.' });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` });
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

    // 2. The MRN must be a real, authorized clinic record with an email.
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
// this same install can skip the code (see _lib/patientAuth.js).
async function handleLoginVerify(req, res) {
  const caller = await requireAuthenticatedPatient(req);
  if (caller.error) {
    res.status(caller.status).json({ success: false, error: caller.error });
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

export default async function handler(req, res) {
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
