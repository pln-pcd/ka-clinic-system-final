// Vercel Hobby caps a deployment at 12 serverless functions, so the two
// admin OTP endpoints share one function. The old URLs still work —
// vercel.json rewrites /api/send-admin-otp and /api/verify-admin-otp here
// with the matching ?op= query.
import sendOtp from './_lib/handlers/send-admin-otp.js';
import verifyOtp from './_lib/handlers/verify-admin-otp.js';

const HANDLERS = {
  send: sendOtp,
  verify: verifyOtp,
};

export default async function handler(req, res) {
  // Fall back to the legacy URL itself: the local dev server (devApiPlugin)
  // routes /api/send-admin-otp here without adding vercel.json's ?op= query.
  const path = String(req.url || '');
  const op = req.query?.op || req.body?.op ||
    (path.includes('send-admin-otp') ? 'send' : path.includes('verify-admin-otp') ? 'verify' : '');
  const target = HANDLERS[op];
  if (!target) {
    res.status(404).json({ success: false, error: 'Unknown OTP operation.' });
    return;
  }
  return target(req, res);
}
