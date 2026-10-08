import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Deliberately fixed demo project and loopback emulators. Never load .env.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_EMULATOR_PROJECT_ID = 'demo-ka-security';
process.env.CRON_SECRET = 'simulated-security-cron-secret';
const { auth, db } = await import('../../api/_lib/firebaseAdmin.js');
const security = await import('../../api/_lib/security.js');
const helpers = await import('../../api/_lib/auth.js');
const base = process.argv.includes('--before') ? '.tmp/security/baseline/api' : 'api';
const load = async file => (await import(pathToFileURL(resolve(base, file)).href)).default;
const admin = await load('admin-auth.js'), patient = await load('patient-auth.js');
const accounts = await load('admin-accounts.js'), notifications = await load('notifications.js');
const actors = {
  manager: { uid: 'api-manager', role: 'manager' }, staff: { uid: 'api-staff', role: 'staff' },
  a: { uid: 'api-a', mrn: '2026-101' }, b: { uid: 'api-b', mrn: '2026-102' },
  archived: { uid: 'api-archived', mrn: '2026-103' }, revoked: { uid: 'api-revoked', role: 'manager' },
};
const password = 'SimulatedPass2026!';
async function rest(op, body) {
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${op}?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
for (const [name, actor] of Object.entries(actors)) {
  await auth.deleteUser(actor.uid).catch(() => {});
  actor.email = `${actor.uid}@example.test`;
  await auth.createUser({ uid: actor.uid, email: actor.email, password, displayName: `Simulated ${name}` });
  if (actor.role) await db.collection('admins').doc(actor.uid).set({ email: actor.email, role: actor.role, status: name === 'revoked' ? 'revoked' : 'active', failedLoginAttempts: 0, lockedUntil: null });
  else {
    await db.collection('authorizedPatients').doc(actor.mrn).set({ mrn: actor.mrn, uid: actor.uid, email: actor.email, authorized: true, registered: true, name: `Simulated ${name}` });
    await db.collection('vaccinations').doc(actor.mrn).set({ authUid: actor.uid, email: actor.email, name: `Simulated ${name}`, isArchived: name === 'archived' });
  }
  const reply = await rest('signInWithCustomToken', { token: await auth.createCustomToken(actor.uid), returnSecureToken: true });
  assert.equal(reply.status, 200);
  actor.token = reply.data.idToken;
  actor.decoded = await auth.verifyIdToken(actor.token);
  await security.grantSecuritySession(actor.decoded, actor.role ? 'admin' : 'patient', { mrn: actor.mrn || '' });
  await db.collection('loginAttempts').doc(security.secretHash(actor.mrn || actor.email, actor.role ? 'admin' : 'patient')).delete();
}
const results = [];
async function test(area, description, expected, fn) {
  const id = `API-${String(results.length + 1).padStart(3, '0')}`;
  try { await fn(); results.push({ id, area, description, steps: 'Direct handler request with real Firebase emulator token; simulated documents only.', expected, actual: expected, status: 'PASS' }); }
  catch (e) { results.push({ id, area, description, steps: 'Direct handler request with emulator token.', expected, actual: String(e.message).slice(0, 500), status: 'FAIL' }); console.log(`FAIL ${id}: ${description}`); }
}
async function call(handler, route, body = {}, actor, query = {}, method = 'POST', extraHeaders = {}) {
  let status = 200, payload, headers = {};
  const req = { method, url: `/api/${route}`, query: { route, ...query }, body,
    headers: { ...(actor ? { authorization: `Bearer ${actor.token || actor}` } : {}), ...extraHeaders } };
  const res = { status(code) { status = code; return this; }, setHeader(k, v) { headers[k.toLowerCase()] = v; }, json(data) { payload = data; return this; }, send(data) { payload = data; return this; }, end() {} };
  await handler(req, res);
  return { status, payload, headers };
}
const rejected = r => assert.ok([400, 401, 403, 423, 429].includes(r.status), `Expected rejection; received ${r.status}`);
const forbidden = r => assert.ok([401, 403].includes(r.status), `Expected auth/role denial; received ${r.status}`);

for (const name of ['staff', 'a', 'b', 'archived', 'revoked']) for (const action of ['invite', 'revoke', 'delete']) {
  await test(1, `${name} cannot ${action} admins`, '403 or 401', async () => forbidden(await call(accounts, 'admin-invites', { action, uid: 'nonexistent-simulated-target', email: 'invite@example.test' }, actors[name])));
}
for (const token of [null, 'tampered-token', actors.a, actors.revoked]) {
  await test(9, 'Unauthorized report export/email', '401 or 403', async () => rejected(await call(notifications, 'send-patient-report', { to: 'test@example.test', html: '<p>Simulated</p>' }, token)));
}
await test(1, 'Active staff allowed report email', '200', async () => assert.equal((await call(notifications, 'send-patient-report', { to: 'test@example.test', report: { reportName: 'Simulated report' } }, actors.staff)).status, 200));
await test(1, 'Patient cannot request admin OTP', '403', async () => rejected(await call(admin, 'send-admin-otp', {}, actors.a)));
await test(5, 'Admin cannot enter patient trust/login flow', '403', async () => rejected(await call(patient, 'send-otp', { action: 'login-check' }, actors.manager)));
await test(5, 'Archived patient cannot complete login', '403', async () => rejected(await call(patient, 'send-otp', { action: 'login-send' }, actors.archived)));
await test(5, 'Patient A cannot claim B through push-token registration', '403; B owner unchanged', async () => {
  const result = await call(notifications, 'notifications', { action: 'register-token', mrn: actors.b.mrn, pushToken: 'ExponentPushToken[simulated]' }, actors.a);
  rejected(result);
  assert.equal((await db.collection('vaccinations').doc(actors.b.mrn).get()).data().authUid, actors.b.uid);
});
// Restore the simulated target even when the before-test intentionally exposed a takeover.
await db.collection('vaccinations').doc(actors.b.mrn).update({ authUid: actors.b.uid });
await test(5, 'Patient A cannot edit B profile', '403', async () => rejected(await call(notifications, 'notifications', { action: 'update-profile', mrn: actors.b.mrn, fields: { contactNumber: '000000' } }, actors.a)));
await test(5, 'Patient A cannot remove B avatar', '403', async () => rejected(await call(notifications, 'notifications', { action: 'remove-avatar', mrn: actors.b.mrn }, actors.a)));
await test(6, 'Patient cannot update clinical profile fields', 'No write to clinical field', async () => {
  await call(notifications, 'notifications', { action: 'update-profile', mrn: actors.a.mrn, fields: { exposureCategory: 'III' } }, actors.a);
  assert.equal((await db.collection('vaccinations').doc(actors.a.mrn).get()).data().exposureCategory, undefined);
});
for (const action of ['dose-sweep', 'backup-cron', 'patient-archive-sweep']) for (const token of [null, 'wrong-secret']) {
  await test(8, `Cron ${action} rejects missing/wrong CRON_SECRET`, '401', async () => assert.equal((await call(notifications, 'notifications', {}, token, { action }, 'GET')).status, 401));
}
await test(8, 'Unset CRON_SECRET fails closed', '401', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await call(notifications, 'notifications', {}, null, { action: 'dose-sweep' }, 'GET')).status, 401);
  process.env.CRON_SECRET = 'simulated-security-cron-secret';
});
await test(2, 'Unauthenticated unlock cannot clear lockout', '403; lock remains', async () => {
  await db.collection('admins').doc(actors.manager.uid).update({ lockedUntil: Date.now() + 900000 });
  const result = await call(admin, 'admin-reset-password', { email: actors.manager.email, action: 'unlock' });
  rejected(result);
  assert.ok((await db.collection('admins').doc(actors.manager.uid).get()).data().lockedUntil > Date.now());
});
await db.collection('admins').doc(actors.manager.uid).update({ lockedUntil: null });
await test(2, 'Five admin wrong passwords cause server lockout', 'Five 401 responses; lock set for 15 minutes', async () => {
  for (let n = 0; n < 5; n++) assert.equal((await call(admin, 'admin-login', { action: 'login', email: actors.manager.email, password: 'WrongPass!' })).status, 401);
  const record = (await db.collection('admins').doc(actors.manager.uid).get()).data();
  assert.equal(record.failedLoginAttempts, 5);
  assert.ok(record.lockedUntil - Date.now() > 14 * 60000 && record.lockedUntil - Date.now() <= 15 * 60000);
});
await test(2, 'Correct admin password rejected during server lock', '401 or 429', async () => rejected(await call(admin, 'admin-login', { action: 'login', email: actors.manager.email, password })));
await test(2, 'Expired lock permits correct admin password', '200 custom token', async () => {
  await db.collection('admins').doc(actors.manager.uid).update({ lockedUntil: Date.now() - 60000 });
  await db.collection('loginAttempts').doc(security.secretHash(actors.manager.email, 'admin')).set({ attempts: 5, until: Date.now() - 60000 });
  const result = await call(admin, 'admin-login', { action: 'login', email: actors.manager.email, password });
  assert.equal(result.status, 200); assert.equal(typeof result.payload.customToken, 'string');
});
await db.collection('admins').doc(actors.manager.uid).update({ lockedUntil: null, failedLoginAttempts: 0 });
await test(2, 'Unknown/known bad admin credentials have same message/status', 'Identical status and error', async () => {
  const known = await call(admin, 'admin-login', { action: 'login', email: actors.staff.email, password: 'wrong' });
  const unknown = await call(admin, 'admin-login', { action: 'login', email: 'unknown@example.test', password: 'wrong' });
  assert.equal(known.status, 401); assert.equal(known.status, unknown.status); assert.equal(known.payload.error, unknown.payload.error);
});
await test(2, 'Patient password failures rate limited server-side', 'Five 401 then 429, including correct password', async () => {
  for (let n = 0; n < 5; n++) assert.equal((await call(patient, 'send-otp', { action: 'login', mrn: actors.a.mrn, password: 'wrong' })).status, 401);
  assert.equal((await call(patient, 'send-otp', { action: 'login', mrn: actors.a.mrn, password })).status, 429);
});
await test(2, 'Recovery does not enumerate admin emails', 'Identical generic response', async () => {
  const existing = await call(admin, 'admin-forgot-password', { email: actors.staff.email });
  const unknown = await call(admin, 'admin-forgot-password', { email: 'nobody@example.test' });
  assert.deepEqual(existing.payload, unknown.payload); assert.equal(existing.status, unknown.status);
});
await test(2, 'Signup does not enumerate MRNs', 'Identical generic response', async () => {
  assert.deepEqual((await call(patient, 'send-otp', { mrn: actors.a.mrn })).payload, (await call(patient, 'send-otp', { mrn: '2099-999' })).payload);
});

for (const kind of ['admin', 'patient']) {
  const handler = kind === 'admin' ? admin : patient;
  const actor = kind === 'admin' ? actors.staff : actors.b;
  const collection = kind === 'admin' ? 'otps' : 'patientLoginOtps';
  const sendRoute = kind === 'admin' ? 'send-admin-otp' : 'send-otp';
  const verifyRoute = kind === 'admin' ? 'verify-admin-otp' : 'verify-otp';
  const sendBody = kind === 'admin' ? {} : { action: 'login-send' };
  const verifyBody = code => kind === 'admin' ? { code } : { action: 'login-verify', code, deviceId: 'simulated-device', rememberDevice: false };
  const ref = db.collection(collection).doc(actor.uid);
  await ref.delete();
  await test(3, `${kind} OTP stored hashed; no API/log plaintext`, 'SHA-256 codeHash, no code or otp field/API code', async () => {
    const logs = [], originals = Object.fromEntries(['log', 'warn', 'error'].map(name => [name, console[name]]));
    let result;
    try {
      for (const name of Object.keys(originals)) console[name] = (...args) => logs.push(args.map(String).join(' '));
      result = await call(handler, sendRoute, sendBody, actor);
    } finally { Object.assign(console, originals); }
    const record = (await ref.get()).data();
    assert.equal(result.status, 200); assert.match(record.codeHash || '', /^[a-f0-9]{64}$/); assert.equal(record.code, undefined); assert.equal(record.otp, undefined);
    assert.equal(record.expiresAt - record.createdAt, 300000);
    assert.ok(!logs.some(line => /\b\d{6}\b/.test(line)), 'OTP plaintext must not occur in send logs');
    assert.equal(result.payload.code, undefined); assert.equal(result.payload.otp, undefined);
  });
  await test(3, `${kind} OTP resend cooldown`, '429 within 30 seconds', async () => assert.equal((await call(handler, sendRoute, sendBody, actor)).status, 429));
  await ref.set({ codeHash: security.secretHash('123456', ref.path), authTime: actor.decoded.auth_time, createdAt: Date.now(), expiresAt: Date.now() - 60000, attempts: 0 });
  await test(3, `${kind} expired OTP rejected`, '400', async () => assert.equal((await call(handler, verifyRoute, verifyBody('123456'), actor)).status, 400));
  await ref.set({ codeHash: security.secretHash('123456', ref.path), authTime: actor.decoded.auth_time, createdAt: Date.now(), expiresAt: Date.now() + 300000, attempts: 0 });
  await test(3, `${kind} OTP max five wrong attempts`, 'Sixth attempt 429', async () => {
    for (let i = 0; i < 5; i++) await call(handler, verifyRoute, verifyBody('999999'), actor);
    assert.equal((await call(handler, verifyRoute, verifyBody('123456'), actor)).status, 429);
  });
  await ref.set({ codeHash: security.secretHash('123456', ref.path), authTime: actor.decoded.auth_time, createdAt: Date.now(), expiresAt: Date.now() + 300000, attempts: 0 });
  await test(3, `${kind} OTP single use under concurrent replay`, 'Exactly one 200', async () => {
    const requests = await Promise.all([call(handler, verifyRoute, verifyBody('123456'), actor), call(handler, verifyRoute, verifyBody('123456'), actor)]);
    assert.equal(requests.filter(r => r.status === 200).length, 1);
    rejected(await call(handler, verifyRoute, verifyBody('123456'), actor));
  });
}
await test(3, 'Signup completion rejects shared verified flag without caller proof', '403; no account created', async () => {
  await db.collection('authorizedPatients').doc('2026-199').set({ mrn: '2026-199', email: 'api-signup@example.test', name: 'Simulated signup', authorized: true, registered: false });
  await db.collection('vaccinations').doc('2026-199').set({ email: 'api-signup@example.test', isArchived: false });
  await db.collection('otpVerifications').doc('2026-199').set({ verified: true, verifiedAt: Date.now(), expiresAt: Date.now() + 300000, proofHash: security.secretHash('proof-secret', 'otpVerifications/2026-199') });
  rejected(await call(patient, 'verify-otp', { action: 'complete-signup', mrn: '2026-199', password }));
  assert.equal((await db.collection('authorizedPatients').doc('2026-199').get()).data().registered, false);
});
await test(3, 'Patient trust token hash, expiry, revocation, cross-account binding', 'Only owning account/device accepts unexpired token', async () => {
  await db.collection('patientSessions').doc(`${actors.a.uid}_simulated-device`).set({ uid: actors.a.uid, deviceId: 'simulated-device', revoked: false });
  const minted = await helpers.trustDevice({ uid: actors.a.uid, deviceId: 'simulated-device', deviceLabel: 'Simulated phone' });
  const fp = helpers.fingerprintDeviceId('simulated-device'), ref = db.collection('patientTrustedDevices').doc(actors.a.uid);
  const entry = (await ref.get()).data().devices[fp];
  assert.equal(entry.tokenHash, helpers.hashTrustToken(minted.token)); assert.equal(entry.expiresAt - entry.createdAt, 30 * 86400000);
  const args = { uid: actors.a.uid, deviceId: 'simulated-device', trustToken: minted.token };
  assert.equal(await helpers.isDeviceTrusted(args), true);
  assert.equal(await helpers.isDeviceTrusted({ ...args, uid: actors.b.uid }), false);
  await ref.update({ [`devices.${fp}.expiresAt`]: Date.now() - 60000 }); assert.equal(await helpers.isDeviceTrusted(args), false);
  await ref.update({ [`devices.${fp}.expiresAt`]: Date.now() + 60000 });
  await helpers.untrustDevice(args); assert.equal(await helpers.isDeviceTrusted(args), false);
});
await test(4, 'Password-only SDK token cannot use protected admin API', '401 without second factor/gateway', async () => {
  const result = await rest('signInWithPassword', { email: actors.manager.email, password, returnSecureToken: true });
  rejected(await call(notifications, 'send-patient-report', { to: 'test@example.test', html: 'Simulated' }, result.data.idToken));
});
await test(4, 'Admin idle session expiration enforced by API', '401 after expiry', async () => {
  await security.securitySessionRef(actors.manager.decoded).update({ expiresAt: Date.now() - 60000 });
  rejected(await call(notifications, 'send-patient-report', { to: 'test@example.test', html: 'Simulated' }, actors.manager));
  await security.grantSecuritySession(actors.manager.decoded, 'admin');
});
await test(4, 'Sign-out invalidates server session and clears cookie', '200; cookie Max-Age=0; next API rejected', async () => {
  const result = await call(admin, 'devices', { action: 'logout' }, actors.manager);
  assert.equal(result.status, 200); assert.match(result.headers['set-cookie'] || '', /Max-Age=0/);
  rejected(await call(notifications, 'send-patient-report', { to: 'test@example.test', html: 'Simulated' }, actors.manager));
});
await security.grantSecuritySession(actors.manager.decoded, 'admin');
await test(4, 'Sign out all revokes refresh tokens and all server sessions', '200; session docs removed; old token rejected', async () => {
  // Auth emulator uses second precision. Move cutoff later than issuance without altering live accounts.
  await new Promise(r => setTimeout(r, 1100));
  assert.equal((await call(admin, 'devices', { action: 'logout-all' }, actors.manager)).status, 200);
  assert.equal((await security.securitySessionRef(actors.manager.decoded).get()).exists, false);
  rejected(await call(notifications, 'send-patient-report', { to: 'test@example.test', html: 'Simulated' }, actors.manager));
});
await test(1, 'Revoked/disabled admin cannot sign in', 'Auth emulator rejects password', async () => {
  await auth.updateUser(actors.revoked.uid, { disabled: true });
  assert.notEqual((await rest('signInWithPassword', { email: actors.revoked.email, password, returnSecureToken: true })).status, 200);
});
await test(9, 'Missing manager token rejected before mutation', '401', async () => assert.equal((await call(accounts, 'admin-invites', { action: 'revoke', uid: actors.staff.uid })).status, 401));

if (!process.argv.includes('--before')) {
  await test(3, 'Remote patient-device revocation removes trust and server sessions', 'Device marked revoked; trust rejected; server session deleted', async () => {
    const deviceId = 'remote-simulated-device';
    await db.collection('patientSessions').doc(`${actors.a.uid}_${deviceId}`).set({ uid: actors.a.uid, deviceId, revoked: false });
    const trusted = await helpers.trustDevice({ uid: actors.a.uid, deviceId, deviceLabel: 'Simulated remote' });
    const remoteSession = db.collection('securitySessions').doc('simulated-remote-session');
    await remoteSession.set({ uid: actors.a.uid, deviceId, scope: 'patient', expiresAt: Date.now() + 60000 });
    assert.equal((await call(patient, 'send-otp', { action: 'revoke-device', deviceId }, actors.a)).status, 200);
    assert.equal((await remoteSession.get()).exists, false);
    assert.equal((await db.collection('patientSessions').doc(`${actors.a.uid}_${deviceId}`).get()).data().revoked, true);
    assert.equal(await helpers.isDeviceTrusted({ uid: actors.a.uid, deviceId, trustToken: trusted.token }), false);
  });
  await test(3, 'Legitimate signup proof creates an account once and still requires login OTP', 'Account linked; proof replay rejected; no protected session yet', async () => {
    const mrn = '2026-199', ref = db.collection('otpVerifications').doc(mrn);
    await ref.set({ codeHash: security.secretHash('123456', ref.path), createdAt: Date.now(), expiresAt: Date.now() + 300000, attempts: 0 });
    const verification = await call(patient, 'verify-otp', { mrn, enteredCode: '123456' });
    assert.equal(verification.status, 200);
    const signup = await call(patient, 'verify-otp', { action: 'complete-signup', mrn, password, verificationToken: verification.payload.verificationToken });
    assert.equal(signup.status, 200);
    const signed = await rest('signInWithCustomToken', { token: signup.payload.customToken, returnSecureToken: true });
    const decoded = await auth.verifyIdToken(signed.data.idToken);
    assert.equal((await db.collection('vaccinations').doc(mrn).get()).data().authUid, decoded.uid);
    assert.equal(await security.hasSecuritySession(decoded, 'patient'), false);
    rejected(await call(patient, 'verify-otp', { action: 'complete-signup', mrn, password, verificationToken: verification.payload.verificationToken }));
  });
  await test(3, 'Admin trusted-device cookie stores only a 30-day hash', 'Secure HttpOnly cookie; SHA-256 hash; trusted shortcut accepts current account', async () => {
    const ref = db.collection('otps').doc(actors.staff.uid);
    await ref.set({ codeHash: security.secretHash('123456', ref.path), authTime: actors.staff.decoded.auth_time, createdAt: Date.now(), expiresAt: Date.now() + 300000, attempts: 0 });
    const verified = await call(admin, 'verify-admin-otp', { code: '123456', rememberDevice: true }, actors.staff, {}, 'POST', { 'x-forwarded-proto': 'https' });
    assert.equal(verified.status, 200);
    const cookie = verified.headers['set-cookie'];
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/);
    const raw = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
    const devices = (await db.collection('admins').doc(actors.staff.uid).get()).data().trustedDevices;
    const entry = devices[helpers.fingerprintDeviceId(raw)];
    assert.equal(entry.tokenHash, security.secretHash(raw, 'admin-device'));
    assert.equal(entry.expiresAt - entry.createdAt, 30 * 86400000);
    const shortcut = await call(admin, 'send-admin-otp', {}, actors.staff, {}, 'POST', { cookie: cookie.split(';')[0] });
    assert.equal(shortcut.payload.trusted, true);
  });
}
if (!process.argv.includes('--before')) {
  await test(2, 'Legacy mixed-case admin email permits correct login through verified Auth UID', '200 custom token; correct account UID', async () => {
    const actor = actors.staff, ref = db.collection('admins').doc(actor.uid);
    await ref.update({ email: ` ${actor.email.toUpperCase()} `, failedLoginAttempts: 0, lockedUntil: null });
    await db.collection('loginAttempts').doc(security.secretHash(actor.email, 'admin')).delete();
    try {
      const result = await call(admin, 'admin-login', { action: 'login', email: actor.email, password });
      assert.equal(result.status, 200);
      const signed = await rest('signInWithCustomToken', { token: result.payload.customToken, returnSecureToken: true });
      assert.equal(signed.status, 200);
      assert.equal((await auth.verifyIdToken(signed.data.idToken)).uid, actor.uid);
    } finally { await ref.update({ email: actor.email }); }
  });
  await test(1, 'Auth UID fallback refuses an admin record for a different email', 'No admin identity resolved', async () => {
    const actor = actors.staff, ref = db.collection('admins').doc(actor.uid);
    await ref.update({ email: 'different@example.test' });
    try { assert.equal(await helpers.findAdminByEmail(actor.email), null); }
    finally { await ref.update({ email: actor.email }); }
  });
}
mkdirSync('docs/security-results', { recursive: true });
const file = process.argv.includes('--before') ? 'api-before.json' : 'api-after.json';
writeFileSync(`docs/security-results/${file}`, JSON.stringify({ date: new Date().toISOString(), baseline: process.argv.includes('--before') ? 'Git HEAD 392b9a2; pre-existing worktree changes excluded' : 'working tree', results }, null, 2));
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`API: ${results.length - failed}/${results.length} PASS; ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
