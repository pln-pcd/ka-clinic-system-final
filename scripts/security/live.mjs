import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const url = 'https://ka-clinic-system-final.vercel.app';
const results = [], insecure = [], violations = [], pageErrors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.on('request', request => { if (request.url().startsWith('http:')) insecure.push(request.url()); });
page.on('console', message => { if (/violates.*Content Security Policy|Refused.*Content Security Policy/i.test(message.text())) violations.push(message.text()); });
page.on('pageerror', error => pageErrors.push(error.message));
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^login$/i }).waitFor();
  results.push({ id: 'LIVE-LOGIN', area: 7, description: 'Live login page renders', steps: 'Read-only Chrome navigation; no login or record mutations', expected: 'Login visible; no browser runtime errors', actual: `${pageErrors.length} runtime errors`, status: pageErrors.length ? 'FAIL' : 'PASS' });
  results.push({ id: 'LIVE-MIXED-CONTENT', area: 7, description: 'No mixed-content requests on live login page', steps: 'Capture browser network requests without signing in', expected: 'Zero HTTP subresource requests', actual: `${insecure.length} HTTP requests`, status: insecure.length ? 'FAIL' : 'PASS' });
  results.push({ id: 'LIVE-CSP', area: 7, description: 'CSP permits required login resources', steps: 'Inspect browser console for CSP blocking', expected: 'Zero CSP violations', actual: `${violations.length} CSP violations`, status: violations.length ? 'FAIL' : 'PASS' });
  // Exercise deployed function initialization, not only the static login page.
  // Precheck returns before Firestore reads/writes. Protected calls omit tokens
  // and must return before accessing account data, sending mail or reserving OTPs.
  for (const [id, path, body, expectedStatus] of [
    ['LIVE-ADMIN-PRECHECK', '/api/admin-login', { action: 'precheck', email: 'probe@example.test' }, 200],
    ['LIVE-ADMIN-GUARD', '/api/devices', { action: 'check-session' }, 401],
    ['LIVE-PATIENT-GUARD', '/api/send-otp', { action: 'login-check' }, 401],
    ['LIVE-ACCOUNTS-GUARD', '/api/admin-invites', { action: 'invite' }, 401],
  ]) {
    const response = await page.request.post(`${url}${path}`, { data: body });
    let payload;
    try { payload = await response.json(); } catch {}
    const passed = response.status() === expectedStatus && typeof payload?.success === 'boolean'
      && payload.success === (expectedStatus === 200);
    results.push({ id, area: 7, description: 'Deployed authentication function initializes and returns expected JSON',
      steps: `POST ${path}; fictional precheck or missing token; no production account/data mutation`,
      expected: `${expectedStatus} JSON with success=${expectedStatus === 200}`,
      actual: `${response.status()}, ${payload ? 'JSON' : 'non-JSON'}, success=${payload?.success}`,
      status: passed ? 'PASS' : 'FAIL' });
  }
} finally { await browser.close(); }
writeFileSync('docs/security-results/live-after.json', JSON.stringify({ date: new Date().toISOString(), url, insecure, violations, pageErrors, results }, null, 2));
console.log(`Live browser: ${results.filter(r => r.status === 'PASS').length}/${results.length} PASS`);
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
