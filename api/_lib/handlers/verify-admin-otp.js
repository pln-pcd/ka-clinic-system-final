// Batch 3/4/7 — verifies the OTP that followed a successful password
// sign-in. On success: resets the failed-attempt counter (Batch 3 + 4),
// and — if the client asked to remember this device — mints an HttpOnly
// cookie and records it on admins/{uid}.trustedDevices (a map keyed by a
// fingerprint of the deviceId, Batch 7 — a map rather than an array so a
// single device can later be looked up/updated/deleted atomically from
// the device-management UI) so future logins from this browser can skip
// the OTP step entirely (Batch 4).
import crypto from 'node:crypto';
import { db } from '../firebaseAdmin.js';
import { requireAuthenticatedAdmin } from '../adminAuth.js';
import { buildDeviceCookie, fingerprintDeviceId, parseDeviceName } from '../deviceCookie.js';

const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

    const code = (req.body?.code || '').trim();
    const rememberDevice = !!req.body?.rememberDevice;
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ success: false, error: 'Please enter the 6-digit code.' });
      return;
    }

    const otpRef = db.collection('otps').doc(caller.uid);
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

    if (code !== record.code) {
      // Batch 3: "show error, allow retry until expiry" — no separate
      // attempt counter for OTP itself, only for the password step.
      res.status(400).json({ success: false, error: 'Incorrect code. Please try again.' });
      return;
    }

    await otpRef.delete();

    const updates = { failedLoginAttempts: 0, lockedUntil: null };

    if (rememberDevice) {
      const deviceId = crypto.randomUUID();
      const fingerprint = fingerprintDeviceId(deviceId);
      const now = Date.now();
      updates[`trustedDevices.${fingerprint}`] = {
        deviceId,
        deviceName: parseDeviceName(req.headers['user-agent']),
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + DEVICE_TTL_MS,
      };
      await caller.ref.update(updates);
      res.setHeader('Set-Cookie', buildDeviceCookie(deviceId, DEVICE_TTL_MS));
    } else {
      await caller.ref.update(updates);
    }

    res.status(200).json({ success: true, role: caller.data.role, name: caller.data.name || '' });
  } catch (err) {
    console.error('verify-admin-otp error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong verifying the code. Please try again.' });
  }
}
