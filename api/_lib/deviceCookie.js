// Batch 4 — "remember this device" cookie. HttpOnly so client-side JS
// (including any XSS) can never read the raw deviceId; the browser just
// attaches it automatically on same-origin requests to /api/*, and the
// server is the only thing that ever compares it against trustedDevices.
import crypto from 'node:crypto';

export const DEVICE_COOKIE_NAME = 'ka_device_id';

export function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function buildDeviceCookie(deviceId, maxAgeMs) {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  return `${DEVICE_COOKIE_NAME}=${encodeURIComponent(deviceId)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`;
}

// Batch 7 — clears the cookie (used when a device is logged out remotely,
// or by its own owner, so this browser stops presenting a now-revoked id).
export function clearDeviceCookie() {
  return `${DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// One-way fingerprint of the secret deviceId. This — never the raw
// deviceId — is what the device-management UI sees and sends back to
// identify "which entry to delete," so trustedDevices' map keys and any
// client-visible device identifier stay safely non-reversible to the
// actual cookie/bearer value.
export function fingerprintDeviceId(deviceId) {
  return crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 16);
}

// Best-effort, dependency-free UA parse — good enough for a device-list
// label ("Chrome on Windows"), not meant to be a precise UA sniffer.
export function parseDeviceName(userAgent) {
  const ua = userAgent || '';

  let browser = 'Unknown browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}
