import { db } from './_lib/firebaseAdmin.js';
import { normalizeMRN } from './_lib/mrn.js';

const MAX_ATTEMPTS = 5;

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

    await otpRef.update({ verified: true });

    const patient = await findAuthorizedPatient(mrn);

    res.status(200).json({ success: true, verified: true, patient });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong verifying the code. Please try again.' });
  }
}
