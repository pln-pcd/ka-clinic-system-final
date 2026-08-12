// Batch 3/4 — called right after a successful signInWithEmailAndPassword.
// Caller identity comes from a verified Firebase ID token, never a
// client-supplied uid. If the request carries a valid trusted-device
// cookie, no email is sent at all — the client skips straight to OTP-free
// login (Batch 4).
import { db } from './_lib/firebaseAdmin.js';
import { requireAuthenticatedAdmin } from './_lib/adminAuth.js';
import { getCookie, DEVICE_COOKIE_NAME, fingerprintDeviceId } from './_lib/deviceCookie.js';
import { lockStatus } from './_lib/lockout.js';
import { maskEmail } from './_lib/mask.js';
import { buildAdminOtpEmailHtml } from './_lib/emailTemplate.js';
import { generateOtp, isInCooldown, sendOtpEmailOrRollback } from './_lib/otp.js';

const COOLDOWN_MS = 30 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const caller = await requireAuthenticatedAdmin(req);
    if (caller.error) {
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }
    if (caller.data.status !== 'active') {
      res.status(403).json({ success: false, error: 'This account is not active. Contact your clinic manager.' });
      return;
    }

    // Defense in depth: the client already ran /admin-login-precheck
    // before attempting the password, but the real boundary is here —
    // never trust the client to have honored that check.
    const { locked, minutesRemaining } = lockStatus(caller.data);
    if (locked) {
      res.status(423).json({ success: false, error: `Too many attempts. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.` });
      return;
    }

    // trustedDevices is a map keyed by fingerprintDeviceId(deviceId) (Batch 7)
    // — a stale pre-migration array here just fails the lookup safely (falls
    // through to "not trusted," never a crash or a false trust).
    const deviceId = getCookie(req, DEVICE_COOKIE_NAME);
    const trustedDevices = caller.data.trustedDevices || {};
    const fingerprint = deviceId ? fingerprintDeviceId(deviceId) : null;
    const entry = fingerprint ? trustedDevices[fingerprint] : null;
    const isTrusted = !!entry && entry.deviceId === deviceId && entry.expiresAt > Date.now();
    if (isTrusted) {
      // Best-effort — a device-management "last active" list is a UX nicety,
      // not the security boundary, so a failure here shouldn't block login.
      caller.ref.update({ [`trustedDevices.${fingerprint}.lastActiveAt`]: Date.now() }).catch(() => {});
      res.status(200).json({ success: true, trusted: true });
      return;
    }

    const otpRef = db.collection('otps').doc(caller.uid);
    const existing = await otpRef.get();
    if (isInCooldown(existing.exists ? existing.data() : null, COOLDOWN_MS)) {
      res.status(429).json({ success: false, error: 'Please wait before requesting another code.' });
      return;
    }

    const code = generateOtp();
    await otpRef.set({ code, expiresAt: Date.now() + OTP_TTL_MS, createdAt: Date.now() });

    const { error: sendError } = await sendOtpEmailOrRollback({
      otpRef,
      to: caller.data.email,
      subject: `${code} is your K&A Clinic admin sign-in code`,
      html: buildAdminOtpEmailHtml({ otp: code }),
    });

    if (sendError) {
      res.status(502).json({ success: false, error: 'Failed to send the verification email. Please try again.' });
      return;
    }

    res.status(200).json({ success: true, trusted: false, maskedEmail: maskEmail(caller.data.email) });
  } catch (err) {
    console.error('send-admin-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong sending the code. Please try again.' });
  }
}
