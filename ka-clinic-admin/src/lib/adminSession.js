// The signed-in admin: their live role (useAuth) and the helpers that call the
// /api functions, with or without their Firebase ID token.
import { onAuthStateChanged } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db, listen } from './firebase.js';

// ══════════════════════════════════════════════════════════════════════════
// Who is signed in and their role
// ══════════════════════════════════════════════════════════════════════════
// Batch 5 — role comes from Firestore (admins/{uid}), live, never
// hardcoded. This is the one place the rest of the admin app should ask
// "who is this and what can they do" — the sidebar's Manage Admins item,
// its render guard, and the forced-signout-on-revoke effect all read
// from here instead of re-deriving role themselves.

export function useAuth() {
  const [user, setUser] = useState(auth.currentUser);
  const [role, setRole] = useState(null);
  const [status, setStatus] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, fbUser => {
      setUser(fbUser);
      if (!fbUser) {
        setRole(null);
        setStatus(null);
        setRoleLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setRoleLoading(true);
    const unsubDoc = listen(doc(db, 'admins', user.uid), snap => {
      if (snap.exists()) {
        setRole(snap.data().role || null);
        setStatus(snap.data().status || null);
      } else {
        setRole(null);
        setStatus(null);
      }
      setRoleLoading(false);
    }, () => {
      setRole(null);
      setStatus(null);
      setRoleLoading(false);
    });
    return () => unsubDoc();
  }, [user]);

  return { user, role, status, roleLoading };
}

// ══════════════════════════════════════════════════════════════════════════
// Calling the /api functions
// ══════════════════════════════════════════════════════════════════════════
// Shared fetch helpers for the admin app's /api calls, so no page
// re-implements the same "POST JSON, read JSON" boilerplate.

// POSTs `body` as JSON with any extra headers and returns the parsed reply.
export async function postJson(url, body, extraHeaders) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const ADMIN_LAST_ACTIVITY_KEY = 'kna_admin_last_activity';

export function recordAdminActivity(timestamp = Date.now()) {
  try {
    localStorage.setItem(ADMIN_LAST_ACTIVITY_KEY, String(timestamp));
  } catch {}
}

export function getAdminLastActivity() {
  try {
    const val = localStorage.getItem(ADMIN_LAST_ACTIVITY_KEY);
    return val ? Number(val) : Date.now();
  } catch {
    return Date.now();
  }
}

// Same, with the signed-in admin's Firebase ID token attached.
export async function authedPostJson(url, body) {
  const idToken = await auth.currentUser?.getIdToken();
  return postJson(url, body ?? {}, idToken ? { Authorization: `Bearer ${idToken}` } : {});
}

// This browser's own stable id, created once and kept in localStorage. Sent
// with the sign-in code so the server refreshes this browser's remembered-
// device entry instead of adding a duplicate. It is not a credential.
const CLIENT_DEVICE_KEY = 'kna.adminDeviceKey.v1';
export function getClientDeviceKey() {
  try {
    let key = localStorage.getItem(CLIENT_DEVICE_KEY);
    if (!key) {
      key = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(CLIENT_DEVICE_KEY, key);
    }
    return key;
  } catch {
    return '';
  }
}
