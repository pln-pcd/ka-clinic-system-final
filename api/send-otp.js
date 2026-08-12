import { db } from './_lib/firebaseAdmin.js';
import { normalizeMRN } from './_lib/mrn.js';
import { maskEmail } from './_lib/mask.js';
import { buildOtpEmailHtml } from './_lib/emailTemplate.js';
import { generateOtp, isInCooldown, sendOtpEmailOrRollback } from './_lib/otp.js';

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

    const email = (patient.email || '').trim();
    if (!email) {
      res.status(422).json({ success: false, error: 'No email on file for this patient record. Please contact the clinic to update your record.' });
      return;
    }

    const otpRef = db.collection('otpVerifications').doc(mrn);
    const existing = await otpRef.get();
    if (isInCooldown(existing.exists ? existing.data() : null, COOLDOWN_MS)) {
      res.status(429).json({ success: false, error: 'Please wait before requesting another code.' });
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
