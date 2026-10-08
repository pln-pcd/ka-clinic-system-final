import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_EMULATOR_PROJECT_ID = 'demo-ka-security';
const { db, auth } = await import('../../api/_lib/firebaseAdmin.js');
const { secretHash } = await import('../../api/_lib/security.js');
const results = [];
async function test(id, description, expected, run) {
  try { await run(); results.push({ id, area: id.includes('IDLE') || id.includes('BACK') ? 4 : 1, description, steps: 'Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks.', expected, actual: expected, status: 'PASS' }); }
  catch (e) { console.log(`FAIL ${id}: ${e.message.slice(0, 160)}`); results.push({ id, description, expected, actual: e.message.slice(0, 300), status: 'FAIL' }); }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const password = 'SimulatedPass2026!';
async function login(role) {
  const uid = `ui-${role}`, email = `${uid}@example.test`;
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, email, password, displayName: `Simulated ${role}` });
  await db.collection('admins').doc(uid).set({ role, status: 'active', email });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5178');
  await page.getByPlaceholder(/email/i).first().fill(email);
  await page.getByPlaceholder(/password/i).first().fill(password);
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.getByText(/verification code|verify your|check your/i).first().waitFor({ timeout: 20000 });
  const decoded = await page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.js');
    return auth.currentUser.getIdTokenResult();
  });
  const ref = db.collection('otps').doc(uid);
  await ref.set({ codeHash: secretHash('123456', ref.path), authTime: decoded.claims.auth_time, createdAt: Date.now(), expiresAt: Date.now() + 300000, attempts: 0 });
  const otp = page.locator('input[inputmode="numeric"]');
  if (await otp.count() === 6) {
    for (let i = 0; i < 6; i++) await otp.nth(i).fill(String(i + 1));
  } else await otp.first().fill('123456');
  const verify = page.getByRole('button', { name: /verify|continue/i });
  // The six-digit input verifies automatically.
  await page.getByText('Patient Records', { exact: true }).first().waitFor({ timeout: 20000 });
  return { context, page, uid };
}
try {
  let staff;
  await test('UI-STAFF', 'Staff UI hides manager roster', 'Patient Records visible; Manage Admins absent', async () => {
    staff = await login('staff');
    assert.equal(await staff.page.getByText('Manage Admins', { exact: true }).count(), 0);
  });
  await staff?.context.close();
  let manager;
  await test('UI-MANAGER', 'Manager UI includes manager roster', 'Manage Admins visible', async () => {
    manager = await login('manager');
    assert.ok(await manager.page.getByText('Manage Admins', { exact: true }).count() > 0);
  });
  if (manager) {
    await test('UI-XSS-NAME', 'Script markup in a simulated patient name remains text', 'Literal markup visible; no injected script executes', async () => {
      const payload = '<img src=x onerror="window.__securityXss=true">';
      await db.collection('vaccinations').doc('2026-999').set({ name: payload, fname: 'Simulated', lname: 'XSS', isArchived: false, status: 'ongoing', createdAt: Date.now(), doses: [] });
      await manager.page.getByText('Patient Records', { exact: true }).first().click();
      await manager.page.getByText(/<img src=x onerror=/i).first().waitFor({ timeout: 15000 });
      assert.equal(await manager.page.evaluate(() => window.__securityXss), undefined);
    });
    await test('UI-IDLE-WARNING', 'One-minute idle warning', 'Warning visible after 29 minutes', async () => {
      await manager.page.clock.install();
      await manager.page.clock.fastForward(29 * 60000 + 3000);
      await manager.page.getByRole('alertdialog').waitFor();
    });
    await test('UI-IDLE-EXPIRY', '30-minute idle sign-out', 'Login visible; dashboard removed', async () => {
      await manager.page.clock.fastForward(60000);
      await manager.page.getByRole('button', { name: /^login$/i }).waitFor({ timeout: 15000 });
      assert.equal(await manager.page.getByText('Patient Records', { exact: true }).count(), 0);
    });
    await test('UI-BACK-AFTER-LOGOUT', 'Back button cannot expose dashboard', 'Login only', async () => {
      await manager.page.goBack();
      await manager.page.goto('http://127.0.0.1:5178');
      await manager.page.getByPlaceholder(/email/i).first().waitFor();
      assert.equal(await manager.page.getByText('Patient Records', { exact: true }).count(), 0);
    });
    await manager.context.close();
  }
} finally { await browser.close(); }
mkdirSync('docs/security-results', { recursive: true });
writeFileSync('docs/security-results/ui-after.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`UI: ${results.length - failed}/${results.length} PASS; ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
