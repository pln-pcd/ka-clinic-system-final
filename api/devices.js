// Batch 7 — trusted-device management, consolidated. Previously four separate
// serverless functions (check-session, list-trusted-devices, logout-device,
// logout-all-devices); merged behind a single `action` field because Vercel's
// Hobby plan caps a deployment at 12 serverless functions and api/ had grown
// to 15. Behavior per action is unchanged from the original handlers — only
// the routing differs, so the security model (POST-only, every action behind
// requireAuthenticatedAdmin) is identical.
import { FieldValue } from 'firebase-admin/firestore';
import { auth } from './_lib/firebaseAdmin.js';
import { requireAuthenticatedAdmin } from './_lib/adminAuth.js';
import { getCookie, DEVICE_COOKIE_NAME, fingerprintDeviceId, clearDeviceCookie } from './_lib/deviceCookie.js';

// Silent, side-effect-free check used by the web app's boot sequence.
// Firebase's own auth persistence (browserLocalPersistence) has no built-in
// expiry, so a "Remember me" session would otherwise stay signed in forever;
// this ties the 30-day "stay logged in" cap requested for trusted devices to
// that persisted session by re-checking the trusted-device cookie on every
// fresh app load, not just at password sign-in time. No email is sent and no
// OTP record is touched here.
function checkSession(req, res, caller) {
  if (caller.data.status !== 'active') {
    res.status(200).json({ success: true, authorized: false });
    return;
  }

  const deviceId = getCookie(req, DEVICE_COOKIE_NAME);
  const trustedDevices = caller.data.trustedDevices || {};
  const fingerprint = deviceId ? fingerprintDeviceId(deviceId) : null;
  const entry = fingerprint ? trustedDevices[fingerprint] : null;
  const trustedDevice = !!entry && entry.deviceId === deviceId && entry.expiresAt > Date.now();

  res.status(200).json({
    success: true,
    authorized: trustedDevice,
    role: caller.data.role,
    name: caller.data.name || '',
  });
}

// Powers Settings → Device Management. Never returns the raw deviceId (that
// stays server-only, compared only against the HttpOnly cookie) — only the
// one-way fingerprint, which is safe for the client to hold and pass back to
// the logout-device action.
function listTrusted(req, res, caller) {
  const currentDeviceId = getCookie(req, DEVICE_COOKIE_NAME);
  const currentFingerprint = currentDeviceId ? fingerprintDeviceId(currentDeviceId) : null;
  const trustedDevices = caller.data.trustedDevices || {};
  const now = Date.now();

  const devices = Object.entries(trustedDevices)
    .filter(([, entry]) => entry && entry.expiresAt > now)
    .map(([fingerprint, entry]) => ({
      fingerprint,
      deviceName: entry.deviceName || 'Unknown device',
      createdAt: entry.createdAt || null,
      lastActiveAt: entry.lastActiveAt || entry.createdAt || null,
      expiresAt: entry.expiresAt,
      isCurrentDevice: fingerprint === currentFingerprint,
    }))
    .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));

  res.status(200).json({ success: true, devices });
}

// Settings → Device Management "Log out" on a single device. Honest about
// what this can and can't do: it removes that device's OTP-skip trust
// immediately (its next sign-in attempt will require a fresh password + OTP),
// and if it's already mid-session there, that session keeps working until its
// current Firebase ID token naturally expires (Firebase has no per-device
// session kill — see the logout-all action for the one thing that can force
// an already-open session out everywhere, right now).
async function logoutDevice(req, res, caller) {
  const fingerprint = (req.body?.fingerprint || '').trim();
  if (!fingerprint) {
    res.status(400).json({ success: false, error: 'Missing device fingerprint.' });
    return;
  }

  const trustedDevices = caller.data.trustedDevices || {};
  if (!trustedDevices[fingerprint]) {
    res.status(404).json({ success: false, error: 'Device not found.' });
    return;
  }

  await caller.ref.update({ [`trustedDevices.${fingerprint}`]: FieldValue.delete() });

  // Logging out your own current device — drop its cookie too, so it
  // doesn't keep presenting a trust entry that no longer exists.
  const currentDeviceId = getCookie(req, DEVICE_COOKIE_NAME);
  const currentFingerprint = currentDeviceId ? fingerprintDeviceId(currentDeviceId) : null;
  if (currentFingerprint === fingerprint) {
    res.setHeader('Set-Cookie', clearDeviceCookie());
  }

  res.status(200).json({ success: true });
}

// Settings → Device Management "Log out of all devices," and also called
// after a self-service password change (see settings.jsx). Unlike the
// logout-device action, this one is a real, near-immediate global kick:
// revokeRefreshTokens + requireAuthenticatedAdmin's checkRevoked:true
// (adminAuth.js) means every other open session gets rejected on its very
// next API call, not just its next full sign-in.
async function logoutAll(req, res, caller) {
  await caller.ref.update({ trustedDevices: {} });
  await auth.revokeRefreshTokens(caller.uid);
  res.setHeader('Set-Cookie', clearDeviceCookie());

  res.status(200).json({ success: true });
}

const ACTIONS = {
  'check-session': checkSession,
  'list-trusted': listTrusted,
  'logout-device': logoutDevice,
  'logout-all': logoutAll,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.body?.action || '').trim();
  const run = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!run) {
    res.status(400).json({ success: false, error: 'Unknown or missing action.' });
    return;
  }

  try {
    // Auth is enforced here, once, for every action — no action can be
    // reached without an authenticated, non-revoked admin.
    const caller = await requireAuthenticatedAdmin(req);
    if (caller.error) {
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }

    await run(req, res, caller);
  } catch (err) {
    console.error(`devices (${action}) error:`, err);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
}
