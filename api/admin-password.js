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
  // Fall back to the legacy URL itself: the local dev server (devApiPlugin)
  // routes /api/admin-forgot-password here without adding vercel.json's ?op= query.
  const path = String(req.url || '');
  const op = req.query?.op || req.body?.op ||
    (path.includes('admin-forgot-password') ? 'forgot' : path.includes('admin-reset-password') ? 'reset' : '');
  const target = HANDLERS[op];
  if (!target) {
    res.status(404).json({ success: false, error: 'Unknown password operation.' });
    return;
  }
  return target(req, res);
}
