// Shared fetch helper for admin API calls that require the caller's
// Firebase ID token — factored out of adm-loginsign.jsx's local postJson
// so App.jsx's session bootstrap and Settings' device management don't
// each re-implement the same "attach bearer token, POST JSON" boilerplate.
import { auth } from './firebase';

export async function authedPostJson(url, body) {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}
