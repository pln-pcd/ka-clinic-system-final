// Shared by send-otp.js (patient, MRN-keyed) and send-admin-otp.js (admin,
// uid-keyed) — the two flows use different auth models and different
// Firestore collections, so only the generation/cooldown/send-or-rollback
// mechanics are factored out here, not the handlers themselves.
import { sendMail } from './mailer.js';

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function isInCooldown(record, cooldownMs) {
  return !!(record?.createdAt && Date.now() - record.createdAt < cooldownMs);
}

export function getCooldownRemainingSeconds(record, cooldownMs) {
  if (!record?.createdAt) return 0;
  const elapsed = Date.now() - record.createdAt;
  if (elapsed >= cooldownMs) return 0;
  return Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
}

// Sends the OTP email; on failure, deletes the just-written OTP doc (so a
// failed send doesn't block a retry behind the cooldown for a code that was
// never delivered) and returns { error } for the caller to turn into a 502.
// On success returns { error: null }.
export async function sendOtpEmailOrRollback({ otpRef, to, subject, html, text }) {
  const { error } = await sendMail({ to, subject, html, text });
  if (error) {
    console.error('Gmail send error:', error);
    await otpRef.delete();
  }
  return { error };
}
