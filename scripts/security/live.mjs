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
} finally { await browser.close(); }
writeFileSync('docs/security-results/live-after.json', JSON.stringify({ date: new Date().toISOString(), url, insecure, violations, pageErrors, results }, null, 2));
console.log(`Live browser: ${results.filter(r => r.status === 'PASS').length}/${results.length} PASS`);
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
