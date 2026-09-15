import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './apiBase';
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  initializeAuth,
  onAuthStateChanged as _onAuthStateChanged,
  sendPasswordResetEmail as _sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword as _signInWithEmailAndPassword,
  signOut as _signOut,
  updateProfile as _updateProfile,
} from 'firebase/auth';
// @ts-ignore — getReactNativePersistence exists at runtime in firebase/auth but is
// missing from the published v10 type defs for React Native builds.
import { getReactNativePersistence } from 'firebase/auth';
import { Platform } from 'react-native';
import { getDeviceId, getTrustToken, setTrustToken } from './appPrefs';
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, setDoc, where } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyCcjj9YoRJ-DSICbZp9v9JflPcha1kdseo",
  authDomain: "ka-clinic-system.firebaseapp.com",
  projectId: "ka-clinic-system",
  storageBucket: "ka-clinic-system.firebasestorage.app",
  messagingSenderId: "1073780714968",
  appId: "1:1073780714968:web:84c73168989e685181d6ad"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Real, persisted Firebase Authentication ─────────────────────────
// Session persists across app restarts via AsyncStorage on native (RN has no
// browser localStorage) and the browser's own localStorage on web — the
// getReactNativePersistence adapter throws immediately if used there.
export const auth = initializeAuth(app, {
  persistence: Platform.OS === 'web' ? browserLocalPersistence : getReactNativePersistence(AsyncStorage),
});

export const onAuthStateChanged = _onAuthStateChanged;
export const signOut = _signOut;
export const updateProfile = _updateProfile;

// "Continue as Guest" now creates a real anonymous Firebase Auth session —
// request.auth is non-null so Firestore rules that require auth (chatThreads,
// appointments, etc.) still evaluate correctly. Guests simply have no
// authorizedPatients/vaccinations record, so patient-specific data stays empty.
export const signInAsGuest = () => signInAnonymously(auth);

// Base URL for the /api/send-otp and /api/verify-otp serverless functions
// (see /api at the repo root, deployed alongside ka-clinic-admin on Vercel).
// A mobile app has no "same origin" to fall back to the way the web admin
// dashboard does with a plain relative fetch, so this must be set explicitly
// once deployed — see patient-app/.env.example.
// Resolution (env var, then app.json manifest fallback) lives in ./apiBase.

// ── MRN-linked auth ────────────────────────────────────────────────
// The clinic's `authorizedPatients/{mrn}` doc (written by the Admin Dashboard
// when staff register a patient) carries the patient's real email — the
// actual Firebase Auth credential. MRN is only a friendly lookup key patients
// type in; the real sign-in underneath is standard email/password auth, so
// every subsequent Firestore request carries a real request.auth.
export type AuthorizedPatient = {
  mrn: string;
  name: string;
  email: string;
  contact?: string;
  authorized: boolean;
  registered: boolean;
  uid?: string | null;
};

// Admin Dashboard MRNs are generated as "<year>-<seq>" (e.g. "2026-001"),
// with no "MRN-" prefix — see ka-clinic-admin/src/patients.jsx getAndIncrementNextMRN().
export const normalizeMRN = (raw: string): string => {
  let clean = raw.trim().toUpperCase().replace(/^MRN-?/, '');
  if (!clean) return '';
  if (/^\d{4}-\d+$/.test(clean)) {
    const [year, seq] = clean.split('-');
    return `${year}-${seq.padStart(3, '0')}`;
  }
  if (/^\d{1,4}$/.test(clean)) {
    return `${new Date().getFullYear()}-${clean.padStart(3, '0')}`;
  }
  return clean;
};

export const lookupAuthorizedPatient = async (mrn: string): Promise<AuthorizedPatient | null> => {
  const snap = await getDoc(doc(db, 'authorizedPatients', normalizeMRN(mrn)));
  if (!snap.exists()) return null;
  return snap.data() as AuthorizedPatient;
};

// Resolves the signed-in Firebase user back to their clinic MRN, by uid first
// (fast, indexed-by-doc-id would be nicer, but authorizedPatients is keyed by
// MRN not uid) then falling back to email match for accounts created before
// `uid` was backfilled.
export const resolveMRNForUser = async (uid: string, email: string | null): Promise<AuthorizedPatient | null> => {
  const byUid = await getDocs(query(collection(db, 'authorizedPatients'), where('uid', '==', uid), limit(1)));
  if (!byUid.empty) return byUid.docs[0].data() as AuthorizedPatient;
  if (email) {
    const byEmail = await getDocs(query(collection(db, 'authorizedPatients'), where('email', '==', email), limit(1)));
    if (!byEmail.empty) return byEmail.docs[0].data() as AuthorizedPatient;
  }
  return null;
};

export const signInWithMRN = async (mrnInput: string, password: string) => {
  const mrn = normalizeMRN(mrnInput);
  const record = await lookupAuthorizedPatient(mrn);
  if (!record || !record.authorized) {
    throw new Error('MRN not found. Please verify your Medical Record Number.');
  }
  // Clinic staff created this record but the patient never finished signup, so
  // there is no Auth account to sign into — say that plainly instead of letting
  // Firebase return a generic invalid-credential error. `uid` is checked too:
  // if it is set, an Auth account demonstrably exists and a stale/missing
  // `registered` flag must not lock a working account out.
  if (!record.registered && !record.uid) {
    throw new Error('This Medical Record Number has not been registered in the app yet. Please tap "Sign up" to create your password first.');
  }
  return _signInWithEmailAndPassword(auth, record.email, password);
};

// ── Masking helper — never show a full email in the UI ────────
export const maskEmail = (email?: string | null): string => {
  if (!email || !email.includes('@')) return 'the email on file';
  const [name, domain] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'•'.repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
};

// Translates Firebase Auth error codes into patient-facing copy so failures
// are surfaced instead of silently falling through to a logged-out/blank state.
export const getAuthErrorMessage = (e: any): string => {
  const code = e?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid MRN or password. Please verify and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/email-already-in-use':
      return 'This email address is already registered to another patient record. Each patient must have a unique email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    default:
      return e?.message || 'Something went wrong. Please try again.';
  }
};

// Ensures no two patient accounts share the same registered email
export const checkPatientEmailAvailability = async (email: string, currentMrn?: string): Promise<void> => {
  const emailClean = (email || '').toLowerCase().trim();
  if (!emailClean) return;
  const snap = await getDocs(
    query(collection(db, 'authorizedPatients'), where('email', '==', emailClean), where('registered', '==', true))
  );
  if (!snap.empty && snap.docs.some(d => d.id !== currentMrn)) {
    throw new Error('This email address is already registered to another patient record. Each patient must have a unique email address.');
  }
};

// ── Email OTP sign-up (replaces the old Firebase Phone Auth flow) ─────
// Real backend-verified email OTP: /api/send-otp and /api/verify-otp
// (see /api at the repo root) own actual code generation, Gmail SMTP email
// delivery, and Firestore-backed attempt/expiry tracking via the Admin
// SDK. This client only ever calls those two endpoints — it never touches
// /otpVerifications directly, since that collection is deliberately
// unreachable by client Firestore rules; only the privileged server
// functions can read or write it.
export type SendOtpResult = {
  maskedEmail: string;
};

// A relative "/api/..." fetch has no meaning on a native mobile client (no
// "same origin" to resolve against — Metro/Expo will just serve back its own
// dev-server HTML, which is why an unconfigured API_BASE_URL surfaces as a
// confusing "JSON Parse error: Unexpected character: <" instead of a clear
// message). Fail fast with an actionable error instead.
async function postToApi<T>(path: string, body: unknown, idToken?: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('The clinic server address is not configured for this app build (no EXPO_PUBLIC_API_BASE_URL and no app.json extra.apiBaseUrl). Contact the clinic if this keeps happening.');
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('The clinic server returned an unexpected response. Please try again later.');
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}

export const sendEmailOTP = async (mrnInput: string): Promise<SendOtpResult> => {
  const mrn = normalizeMRN(mrnInput);
  const data = await postToApi<{ maskedEmail: string }>('/api/send-otp', { mrn });
  return { maskedEmail: data.maskedEmail };
};

export const verifyEmailOTP = async (mrnInput: string, enteredCode: string): Promise<AuthorizedPatient> => {
  const mrn = normalizeMRN(mrnInput);
  const data = await postToApi<{ patient: AuthorizedPatient }>('/api/verify-otp', { mrn, enteredCode });
  return { ...data.patient, mrn } as AuthorizedPatient;
};

// Creates the real Firebase Auth account (email/password) for a patient who
// just passed email OTP verification, then binds that uid to this MRN's
// authorizedPatients record — this uid is now this patient's permanent
// identity going forward.
export const completeEmailSignup = async (record: AuthorizedPatient, password: string) => {
  // The account is created (or adopted, when a previous attempt left an
  // orphaned Auth user behind) by /api/verify-otp's complete-signup action,
  // which has the Admin SDK and can tell "your own half-finished signup"
  // apart from "somebody else's account" — a distinction the client SDK
  // cannot make, and which used to lock patients out of their own email.
  await postToApi<{ uid: string }>('/api/verify-otp', { action: 'complete-signup', mrn: record.mrn, password });
  const credential = await _signInWithEmailAndPassword(auth, (record.email || '').toLowerCase().trim(), password);
  if (record.name && credential.user.displayName !== record.name) {
    await _updateProfile(credential.user, { displayName: record.name }).catch(() => {});
  }
  return credential.user;
};

// ── Login second factor (OTP unless this device is trusted) ───────────
// After the password succeeds the session is NOT usable until either
// checkLoginTrust() says this exact device holds a valid server-side trust
// token, or the patient passes verifyLoginOTP(). PatientAuthContext enforces
// this by hiding the Firebase user from the app until one of those happens.
const describeDevice = () =>
  Platform.OS === 'ios' ? `iPhone / iPad · iOS ${Platform.Version ?? ''}` :
  Platform.OS === 'android' ? `Android device · ${Platform.Version ?? ''}` :
  'Web browser';

const currentIdToken = async (): Promise<string> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in.');
  return u.getIdToken();
};

/** Server-side answer to "is THIS install trusted?". Never sends mail. Any
 *  failure (network, missing token, bad token) resolves to false. */
export const checkLoginTrust = async (): Promise<boolean> => {
  try {
    const trustToken = await getTrustToken();
    if (!trustToken) return false;
    const deviceId = await getDeviceId();
    const data = await postToApi<{ trusted: boolean }>('/api/send-otp', { action: 'login-check', deviceId, trustToken }, await currentIdToken());
    if (data.trusted !== true) {
      // Server rejected it (expired / revoked / reinstall mismatch): drop it so
      // we stop presenting a dead token.
      await setTrustToken(null);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const sendLoginOTP = async (): Promise<SendOtpResult> => {
  const data = await postToApi<{ maskedEmail: string }>('/api/send-otp', { action: 'login-send' }, await currentIdToken());
  return { maskedEmail: data.maskedEmail };
};

/** Verifies the emailed code. With rememberDevice the server mints a trust
 *  token for this install, which is stored in the keystore. */
export const verifyLoginOTP = async (code: string, rememberDevice: boolean): Promise<void> => {
  const deviceId = await getDeviceId();
  const data = await postToApi<{ trustToken: string | null }>('/api/verify-otp', {
    action: 'login-verify',
    code,
    rememberDevice,
    deviceId,
    deviceLabel: describeDevice(),
  }, await currentIdToken());
  await setTrustToken(rememberDevice && data.trustToken ? data.trustToken : null);
};

/** Explicit sign-out forgets this device on both sides. Best effort. */
export const forgetTrustedDevice = async (): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      await postToApi('/api/send-otp', { action: 'login-untrust', deviceId }, await currentIdToken());
    }
  } catch {}
  await setTrustToken(null);
};

// Thrown when the MRN is valid but no Firebase Auth account exists for it yet.
// Callers should route the patient to signup instead of showing a generic
// failure — there is no password to reset until they finish registering.
export class AccountNotRegisteredError extends Error {
  readonly email: string;
  constructor(email: string) {
    super('This Medical Record Number has not been registered in the app yet. Please sign up first to create your password.');
    this.name = 'AccountNotRegisteredError';
    this.email = email;
  }
}

// ── Forgot password — always via the email on file, never phone/OTP ───
export const requestPasswordReset = async (mrnInput: string): Promise<string> => {
  const mrn = normalizeMRN(mrnInput);
  const record = await lookupAuthorizedPatient(mrn);
  if (!record || !record.authorized) {
    throw new Error('MRN not found. Please verify your Medical Record Number.');
  }
  if (!record.email) {
    throw new Error('No recovery email on file for this record — please contact the clinic to reset your password.');
  }
  // Firebase deliberately resolves sendPasswordResetEmail successfully even for
  // addresses with no account, so attackers can't probe which emails are
  // registered. That means an unregistered patient would otherwise be told a
  // reset link was sent and then wait for mail that is never generated.
  // `registered` flips to true only in completeEmailSignup(), once the Auth
  // account actually exists, so it is the reliable pre-check. `uid` is checked
  // alongside it: if a uid is present the account exists regardless of a
  // stale flag, and a real reset email should still go out.
  if (!record.registered && !record.uid) {
    throw new AccountNotRegisteredError(record.email);
  }
  await _sendPasswordResetEmail(auth, record.email);
  return record.email;
};
