// Shared Firebase Admin SDK init for all /api serverless functions.
// Admin SDK calls bypass Firestore Security Rules entirely (privileged
// service-account access), so /otpVerifications never needs client-facing
// rules — only these server functions ever touch that collection.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.');
  }
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

// Local Firebase Emulator: when FIRESTORE_EMULATOR_HOST is set the Admin SDK
// talks to the emulator (it reads that variable, and FIREBASE_AUTH_EMULATOR_HOST,
// by itself). No service account is used, and the project id is the
// emulator-only demo project, so nothing here can reach the live project.
export const USING_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
export const EMULATOR_PROJECT_ID = process.env.FIREBASE_EMULATOR_PROJECT_ID || 'demo-ka-clinic';

function getAdminApp() {
  const existing = getApps();
  if (existing.length) return existing[0];
  if (USING_EMULATOR) return initializeApp({ projectId: EMULATOR_PROJECT_ID });
  return initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const db = getFirestore(getAdminApp());
export const auth = getAuth(getAdminApp());

// Default Cloud Storage bucket (used for database backups). Override with
// FIREBASE_STORAGE_BUCKET; otherwise the Firebase default for the project.
export function storageBucket() {
  const sa = loadServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID || sa.project_id;
  const name = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
  return getStorage(getAdminApp()).bucket(name);
}
