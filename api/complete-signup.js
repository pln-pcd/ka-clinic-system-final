// Finishes patient sign-up after the email OTP has been verified.
//
// The client used to call createUserWithEmailAndPassword() directly, which
// fails with auth/email-already-in-use whenever an earlier attempt left an
// Auth account behind without its authorizedPatients doc ever being marked
// registered — the patient was then permanently stuck, told their own email
// belonged to "another patient record". The Admin SDK can see the whole
// picture, so the decision is made here instead: an account for this email is
// adopted (password reset to the one just chosen) when it belongs to this MRN
// or to nobody, and refused only when another patient record genuinely owns it.
import { auth, db } from './_lib/firebaseAdmin.js';
import { normalizeMRN } from './_lib/mrn.js';

// The OTP doc is marked verified by verify-otp.js; this window is how long
// that proof stays good for while the patient types a password.
const VERIFICATION_GRACE_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
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
  } catch (err) {
    console.error('complete-signup error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong finishing your registration. Please try again.' });
  }
}
