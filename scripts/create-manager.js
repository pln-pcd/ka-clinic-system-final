// One-time setup script for Batch 1 of the admin access-control rollout:
// creates (or re-links) the Manager's Firebase Auth account and its
// matching admins/{uid} Firestore doc (role: "manager", status: "active").
//
// Usage:
//   node --env-file=.env scripts/create-manager.js --name "Jane Dela Cruz" --email jane@kaclinic.ph [--password "TempPass123!"]
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID in the
// environment (see .env.example). If --password is omitted, a random
// temporary password is generated and printed once — hand it to the
// manager securely and have them change it after first sign-in.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Copy .env.example to .env and fill it in first.');
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const { name, email, password } = parseArgs();
  if (!name || !email) {
    console.error('Usage: node --env-file=.env scripts/create-manager.js --name "Full Name" --email you@kaclinic.ph [--password "..."]');
    process.exit(1);
  }

  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const usingGeneratedPassword = !password;
  const effectivePassword = password || crypto.randomBytes(9).toString('base64url');

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Found existing Auth user for ${email} (uid: ${userRecord.uid}) — reusing it (password left unchanged).`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    userRecord = await auth.createUser({ email, password: effectivePassword, displayName: name });
    console.log(`Created Auth user for ${email} (uid: ${userRecord.uid}).`);
    if (usingGeneratedPassword) {
      console.log(`Temporary password: ${effectivePassword}`);
      console.log('Share this with the manager securely (not over plain chat/email) and have them change it after first sign-in.');
    }
  }

  await db.collection('admins').doc(userRecord.uid).set({
    name,
    email,
    role: 'manager',
    invitedBy: null,
    status: 'active',
    createdAt: Timestamp.now(),
    trustedDevices: {},
    failedLoginAttempts: 0,
    lockedUntil: null,
  }, { merge: true });

  console.log(`admins/${userRecord.uid} set — role: "manager", status: "active".`);
}

main().catch(err => {
  console.error('create-manager failed:', err);
  process.exit(1);
});
