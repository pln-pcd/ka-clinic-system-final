import { performance } from 'node:perf_hooks';
import { db, auth } from '../api/_lib/firebaseAdmin.js';
import adminAuthHandler from '../api/admin-auth.js';
import adminAccountsHandler from '../api/admin-accounts.js';
import notificationsHandler from '../api/notifications.js';
import { grantSecuritySession } from '../api/_lib/security.js';

async function mockCall(handler, route, body = {}, headers = {}, query = {}, method = 'POST') {
  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};
  const req = {
    method,
    url: `/api/${route}`,
    query: { route, ...query },
    body,
    headers: { ...headers },
  };
  const res = {
    status(code) { statusCode = code; return this; },
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
    json(data) { responseData = data; return this; },
    send(data) { responseData = data; return this; },
    end() {},
  };
  const start = performance.now();
  await handler(req, res);
  const duration = performance.now() - start;
  return { duration, statusCode, responseData, resHeaders };
}

async function runBenchmark() {
  console.log('--- Starting Timing Benchmarks (Baseline) ---');
  
  // 1. Setup admin test actor
  const adminEmail = 'benchmark-admin@example.com';
  let adminUid;
  try {
    const existing = await auth.getUserByEmail(adminEmail);
    adminUid = existing.uid;
  } catch {
    const created = await auth.createUser({ email: adminEmail, displayName: 'Benchmark Admin' });
    adminUid = created.uid;
  }
  await db.collection('admins').doc(adminUid).set({
    email: adminEmail,
    name: 'Benchmark Admin',
    role: 'manager',
    status: 'active',
  }, { merge: true });

  const customToken = await auth.createCustomToken(adminUid);
  // Verify/create ID token via REST or mock token
  // For serverless requireAuthenticatedAdmin: verifyIdToken expects real id token
  // Let's get an ID token using custom token
  const key = process.env.VITE_FIREBASE_API_KEY || "AIzaSyCcjj9YoRJ-DSICbZp9v9JflPcha1kdseo";
  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const authData = await authRes.json();
  const idToken = authData.idToken;
  const decoded = await auth.verifyIdToken(idToken);
  await grantSecuritySession(decoded, 'admin');

  // Benchmark 1: OTP Request
  console.log('Testing OTP Request...');
  const otpSendRes = await mockCall(
    adminAuthHandler,
    'send-admin-otp',
    {},
    { authorization: `Bearer ${idToken}` }
  );
  console.log(`OTP Request: ${otpSendRes.duration.toFixed(2)} ms (Status: ${otpSendRes.statusCode}, Success: ${otpSendRes.responseData?.success})`);

  // Benchmark 2: OTP Verification
  console.log('Testing OTP Verification...');
  // Grab the code stored in otps collection
  const otpDoc = await db.collection('otps').doc(adminUid).get();
  // We need the code or we can test an OTP code flow:
  // Since code is hashed with ref.path, let's issue a known code or test consume
  // Or test verify-admin-otp directly
  const otpVerifyRes = await mockCall(
    adminAuthHandler,
    'verify-admin-otp',
    { code: '000000' }, // invalid code test for pure endpoint round-trip
    { authorization: `Bearer ${idToken}` }
  );
  console.log(`OTP Verify Round-trip: ${otpVerifyRes.duration.toFixed(2)} ms (Status: ${otpVerifyRes.statusCode})`);

  // Benchmark 3: Invite Email
  console.log('Testing Invite Email...');
  const inviteEmail = `test-invite-${Date.now()}@example.com`;
  const inviteRes = await mockCall(
    adminAccountsHandler,
    'admin-invites',
    { action: 'invite', email: inviteEmail },
    { authorization: `Bearer ${idToken}` }
  );
  console.log(`Invite Email: ${inviteRes.duration.toFixed(2)} ms (Status: ${inviteRes.statusCode}, Success: ${inviteRes.responseData?.success})`);

  // Benchmark 4: Report Email
  console.log('Testing Report Email...');
  const reportRes = await mockCall(
    notificationsHandler,
    'send-patient-report',
    {
      to: 'benchmark-report@example.com',
      subject: 'Benchmark Clinical Report',
      html: '<p>Test report content</p>',
      report: {
        recipientName: 'Benchmark Patient',
        reportName: 'Immunization Summary',
        period: '2026',
        generatedOn: '2026-10-18',
        summary: ['Test summary bullet point'],
      },
    },
    { authorization: `Bearer ${idToken}` }
  );
  console.log(`Report Email: ${reportRes.duration.toFixed(2)} ms (Status: ${reportRes.statusCode}, Success: ${reportRes.responseData?.success})`);

  // Benchmark 5: Follow Up Send
  console.log('Testing Follow Up Send...');
  // Create a sample patient
  const samplePatientId = `BENCH-${Date.now()}`;
  await db.collection('vaccinations').doc(samplePatientId).set({
    name: 'Benchmark Patient',
    email: 'benchmark-followup@example.com',
    service: 'PEP',
  });
  const followUpRes = await mockCall(
    notificationsHandler,
    'notifications',
    {
      action: 'send-followup',
      patientId: samplePatientId,
      patientName: 'Benchmark Patient',
      email: 'benchmark-followup@example.com',
      title: 'Upcoming Dose Reminder',
      message: 'Your next dose is scheduled.',
      doseLabel: 'Session 2 (Day 3)',
      dueDate: '2026-10-21',
      source: 'benchmark',
    },
    { authorization: `Bearer ${idToken}` },
    { action: 'send-followup' }
  );
  console.log(`Follow Up Send: ${followUpRes.duration.toFixed(2)} ms (Status: ${followUpRes.statusCode}, Success: ${followUpRes.responseData?.success})`);

  // Cleanup benchmark data
  await db.collection('vaccinations').doc(samplePatientId).delete().catch(() => {});
  await db.collection('admins').doc(adminUid).delete().catch(() => {});
  await auth.deleteUser(adminUid).catch(() => {});

  console.log('--- Benchmark Completed ---');
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
