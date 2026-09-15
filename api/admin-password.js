// Vercel Hobby caps a deployment at 12 serverless functions, so the two
// password-reset endpoints share one function. The old URLs still work —
// vercel.json rewrites /api/admin-forgot-password and
// /api/admin-reset-password here with the matching ?op= query.
import forgotPassword from './_lib/handlers/admin-forgot-password.js';
import resetPassword from './_lib/handlers/admin-reset-password.js';

const HANDLERS = {
  forgot: forgotPassword,
  reset: resetPassword,
};

export default async function handler(req, res) {
  const op = req.query?.op || req.body?.op || '';
  const target = HANDLERS[op];
  if (!target) {
    res.status(404).json({ success: false, error: 'Unknown password operation.' });
    return;
  }
  return target(req, res);
}
