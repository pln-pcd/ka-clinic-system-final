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
  const op = req.query?.op || req.body?.op || '';
  const target = HANDLERS[op];
  if (!target) {
    res.status(404).json({ success: false, error: 'Unknown OTP operation.' });
    return;
  }
  return target(req, res);
}
