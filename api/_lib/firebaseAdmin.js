// Shared Firebase Admin SDK init for all /api serverless functions.
// Admin SDK calls bypass Firestore Security Rules entirely (privileged
// service-account access), so /otpVerifications never needs client-facing
// rules — only these server functions ever touch that collection.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.');
  }
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

function getAdminApp() {
  const existing = getApps();
  if (existing.length) return existing[0];
  return initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const db = getFirestore(getAdminApp());
export const auth = getAuth(getAdminApp());
