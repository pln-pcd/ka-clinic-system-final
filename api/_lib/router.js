// Picks the handler inside a merged serverless function.
//
// Vercel's Hobby plan caps a deployment at 12 serverless functions, so related
// endpoints share one function. vercel.json rewrites every old URL to its
// function with ?route=<old URL name> (for example /api/send-otp becomes
// /api/patient-auth?route=send-otp), and the local dev server applies the same
// rewrites. The path fallback covers a host that passes the original URL
// through without the added query.
export function routeName(req) {
  const fromQuery = req.query?.route;
  if (fromQuery) return String(fromQuery);
  const path = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

// Runs the handler registered for this request's route, or answers 404.
export function dispatch(routes, req, res) {
  const name = routeName(req);
  const target = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!target) {
    res.status(404).json({ success: false, error: 'Unknown API route.' });
    return undefined;
  }
  return target(req, res);
}
