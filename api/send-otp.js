import { db } from './_lib/firebaseAdmin.js';
import { normalizeMRN } from './_lib/mrn.js';
import { maskEmail } from './_lib/mask.js';
import { buildOtpEmailHtml, buildOtpEmailText } from './_lib/emailTemplate.js';
import { generateOtp, isInCooldown, getCooldownRemainingSeconds, sendOtpEmailOrRollback } from './_lib/otp.js';

const COOLDOWN_MS = 30 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;

async function findAuthorizedPatient(mrn) {
  const docSnap = await db.collection('authorizedPatients').doc(mrn).get();
  if (docSnap.exists) return docSnap.data();

  const querySnap = await db.collection('authorizedPatients').where('mrn', '==', mrn).limit(1).get();
  if (!querySnap.empty) return querySnap.docs[0].data();

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
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
