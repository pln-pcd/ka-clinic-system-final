import { mkdirSync, writeFileSync } from 'node:fs';
import https from 'node:https';
const url = process.argv.find(arg => arg.startsWith('https://')) || 'https://ka-clinic-system-final.vercel.app';
const results = [];
function add(id, description, expected, actual, pass) { results.push({ id, area: 7, description, steps: `Read-only request to ${url}`, expected, actual, status: pass ? 'PASS' : 'FAIL' }); }
try {
  const plain = await fetch(url.replace(/^https:/, 'http:'), { redirect: 'manual' });
  add('HTTPS-001', 'HTTP redirects to HTTPS', '301/302/307/308 with HTTPS location', `${plain.status} ${plain.headers.get('location')}`, [301, 302, 307, 308].includes(plain.status) && (plain.headers.get('location') || '').startsWith('https://'));
  const response = await fetch(url);
  add('HTTPS-002', 'HTTPS available', '200', String(response.status), response.status === 200);
  for (const name of ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy']) {
    const value = response.headers.get(name);
    add(`HEADER-${name}`, name, 'Present', value || 'Missing', !!value);
  }
  await new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      const cert = response.socket.getPeerCertificate();
      add('TLS-001', 'Trusted and unexpired TLS certificate', 'Trusted certificate, validity in future', `${cert.issuer?.O || 'issuer unavailable'}; expires ${cert.valid_to}`, response.socket.authorized && Date.parse(cert.valid_to) > Date.now());
      response.resume(); resolve();
    });
    request.on('error', reject);
  });
} catch (e) { add('HTTPS-NETWORK', 'HTTPS checks execute', 'Reachable', e.message, false); }
mkdirSync('docs/security-results', { recursive: true });
writeFileSync(`docs/security-results/${process.argv.includes('--before') ? 'headers-before' : 'headers-after'}.json`, JSON.stringify({ date: new Date().toISOString(), url, results }, null, 2));
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`HTTPS/headers: ${results.length - failed}/${results.length} PASS; ${failed} FAIL`);
if (failed) console.log(results.filter(r => r.status === 'FAIL').map(r => `${r.id}: ${r.actual}`).join('\n'));
process.exitCode = failed ? 1 : 0;
