// Admin setup and diagnostics for a real Firebase project.
//
//   npm run create-manager -- --name "Full Name" --email you@kaclinic.ph [--password "..."]
//       -> node --env-file=.env scripts/admin-tools.mjs create-manager ...   create or re-link the Manager account
//   npm run check-smtp
//       -> node --env-file=.env scripts/admin-tools.mjs check-smtp           check Gmail SMTP and recent email usage
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/admin-tools.mjs create-manager — create or re-link the Manager's account
// (the original script, unchanged, runs inside createManagerCommand)
// ══════════════════════════════════════════════════════════════════════════
async function createManagerCommand() {
// One-time setup script for Batch 1 of the admin access-control rollout:
// creates (or re-links) the Manager's Firebase Auth account and its
// matching admins/{uid} Firestore doc (role: "manager", status: "active").
//
// Usage:
//   node --env-file=.env scripts/admin-tools.mjs create-manager --name "Jane Dela Cruz" --email jane@kaclinic.ph [--password "TempPass123!"]
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID in the
// environment (see .env.example). If --password is omitted, a random
// temporary password is generated and printed once — hand it to the
// manager securely and have them change it after first sign-in.

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
    console.error('Usage: node --env-file=.env scripts/admin-tools.mjs create-manager --name "Full Name" --email you@kaclinic.ph [--password "..."]');
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
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/admin-tools.mjs check-smtp — check Gmail SMTP and recent email usage
// (the original script, unchanged, runs inside checkSmtpCommand)
// ══════════════════════════════════════════════════════════════════════════
async function checkSmtpCommand() {
// Loaded here rather than at the top of the file: importing it initializes
// the server's Firebase app, which create-manager must not share.
const { db } = await import('../api/_lib/firebaseAdmin.js');
async function main() {
  console.log('=== CHECKING GMAIL SMTP & DATABASE USAGE ===');
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();

  console.log(`Configured Sender: ${user}`);
  
  // 1. Check SMTP Connection
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    console.log('SMTP Status: ACTIVE & VERIFIED (Google accepted authentication)');
  } catch (err) {
    console.log('SMTP Status: FAILED/THROTTLED -', err.message);
  }

  // 2. Query Firestore for emails sent in the last 24 hours
  const now = Date.now();
  const past24h = now - 24 * 60 * 60 * 1000;
  const past7d = now - 7 * 24 * 60 * 60 * 1000;

  try {
    // Check patientNotifications
    const notifSnap = await db.collection('patientNotifications').get();
    let notifsLast24h = 0;
    let notifsLast7d = 0;
    let notifsTotal = notifSnap.size;

    notifSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || (d.timestamp ? d.timestamp.toMillis?.() : 0);
      if (t >= past24h) notifsLast24h++;
      if (t >= past7d) notifsLast7d++;
    });

    // Check otps (admin otps)
    const otpSnap = await db.collection('otps').get();
    let otpsLast24h = 0;
    let otpsTotal = otpSnap.size;
    otpSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || 0;
      if (t >= past24h) otpsLast24h++;
    });

    // Check otpVerifications (patient otps)
    const patientOtpSnap = await db.collection('otpVerifications').get();
    let patientOtpsLast24h = 0;
    let patientOtpsTotal = patientOtpSnap.size;
    patientOtpSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || (d.updatedAt || 0);
      if (t >= past24h) patientOtpsLast24h++;
    });

    // Check invites
    const invitesSnap = await db.collection('invites').get();
    let invitesLast24h = 0;
    let invitesTotal = invitesSnap.size;
    invitesSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || 0;
      if (t >= past24h) invitesLast24h++;
    });

    console.log('\n--- Application Email Triggers Recorded in Database ---');
    console.log(`Patient Notifications (Last 24h): ${notifsLast24h} (Total in DB: ${notifsTotal})`);
    console.log(`Admin Sign-in OTPs (Last 24h): ${otpsLast24h} (Total in DB: ${otpsTotal})`);
    console.log(`Patient Portal OTPs (Last 24h): ${patientOtpsLast24h} (Total in DB: ${patientOtpsTotal})`);
    console.log(`Staff Invites (Last 24h): ${invitesLast24h} (Total in DB: ${invitesTotal})`);
    
    const estimatedTotal24h = notifsLast24h + otpsLast24h + patientOtpsLast24h + invitesLast24h;
    console.log(`\nEstimated App Emails sent in the past 24 hours: ${estimatedTotal24h}`);

  } catch (dbErr) {
    console.log('Database query error:', dbErr.message);
  }
}

main().catch(console.error);
}

// ══════════════════════════════════════════════════════════════════════════
// Command dispatch: the first argument picks the command; it is removed
// from process.argv so each command sees exactly the arguments it always did.
// ══════════════════════════════════════════════════════════════════════════
const COMMANDS = {
  'create-manager': createManagerCommand,
  'check-smtp': checkSmtpCommand,
};

async function runCommand() {
  const command = process.argv[2];
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    console.error('Usage: node --env-file=.env scripts/admin-tools.mjs <create-manager|check-smtp> [options]');
    process.exit(1);
  }
  process.argv.splice(2, 1);
  await COMMANDS[command]();
}

await runCommand();
