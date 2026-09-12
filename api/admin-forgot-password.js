import { auth, db } from './_lib/firebaseAdmin.js';
import { buildPasswordResetEmailHtml, buildPasswordResetEmailText } from './_lib/emailTemplate.js';
import { sendMail } from './_lib/mailer.js';
import { maskEmail } from './_lib/mask.js';
import { generateOtp, getCooldownRemainingSeconds, isInCooldown } from './_lib/otp.js';

const COOLDOWN_MS = 30 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutes

export default async function handler(req, res) {
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
    if (isInCooldown(existing.exists ? existing.data() : null, COOLDOWN_MS)) {
      const remainingSec = getCooldownRemainingSeconds(existing.exists ? existing.data() : null, COOLDOWN_MS) || 30;
      res.status(429).json({
        success: false,
        error: `Please wait before requesting another reset code. Try again in ${remainingSec} second${remainingSec === 1 ? '' : 's'}.`,
        retryAfter: remainingSec,
      });
      return;
    }

    const code = generateOtp();
    await resetRef.set({
      code,
      email: rawEmail,
      uid: user.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + RESET_TTL_MS,
    });

    const { error: sendError } = await sendMail({
      to: rawEmail,
      subject: `${code} is your K&A Clinic password reset code`,
      html: buildPasswordResetEmailHtml({ otp: code }),
      text: buildPasswordResetEmailText({ otp: code }),
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
