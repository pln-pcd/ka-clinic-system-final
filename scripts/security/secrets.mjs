// Never prints secret values. Gitleaks output is redacted before persistence.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const results = [];
const add = (id, description, expected, actual, pass) => results.push({ id, area: 8, description, steps: 'Gitleaks redacted scan and exact-value search of built client files', expected, actual, status: pass ? 'PASS' : 'FAIL' });
const scanner = process.env.GITLEAKS_PATH || resolve('.tmp/security/gitleaks/gitleaks.exe');
const sourceRoot = `.tmp/security/source-scan-${Date.now()}`;
mkdirSync(sourceRoot, { recursive: true });
const files = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of new Set(files)) if (existsSync(file) && !file.includes('.impeccable/') && !file.startsWith('.agents/')) {
  const dest = join(sourceRoot, file);
  mkdirSync(resolve(dest, '..'), { recursive: true });
  cpSync(file, dest);
}
for (const [mode, target, output] of [['git', '.', '.tmp/security/gitleaks-history.json'], ['dir', sourceRoot, '.tmp/security/gitleaks-source.json']]) {
  const child = spawnSync(scanner, [mode, target, '--redact=100', '--report-format', 'json', '--report-path', output, '--no-banner'], { encoding: 'utf8' });
  if (![0, 1].includes(child.status)) throw new Error(`Gitleaks ${mode} could not run`);
}
const classify = finding => /(?:google-services\.json|firebase\.js|firebase\.ts|firebaseConfig\.js|firebaseConfig\.ts|\.env\.example|patient-app\/config\/backend\.ts)$/.test(finding.File.replaceAll('\\', '/')) && finding.RuleID === 'gcp-api-key' ? 'Public Firebase configuration'
  : finding.File.replaceAll('\\', '/').endsWith('config/appPrefs.ts') ? 'Preference-name false positive' : 'Secret requires review';
const findings = {};
for (const kind of ['history', 'source']) findings[kind] = JSON.parse(readFileSync(`.tmp/security/gitleaks-${kind}.json`, 'utf8')).map(f => ({ file: f.File.replaceAll('\\', '/').replace(/^\.tmp\/security\/source-scan-\d+\//, ''), line: f.StartLine, commit: f.Commit || null, rule: f.RuleID, classification: classify(f) }));
for (const kind of ['history', 'source']) {
  const secretCount = findings[kind].filter(f => f.classification === 'Secret requires review').length;
  add(`SECRET-${kind.toUpperCase()}`, `No server secrets in ${kind === 'history' ? 'Git history' : 'current tracked and pending source'}`, 'Zero server-secret findings', `${secretCount} findings requiring review; values redacted`, secretCount === 0);
}
const values = [];
for (const path of ['.env', '.tmp/security/production.env', 'ka-clinic-admin/.env', 'ka-clinic-admin/.env.local', 'patient-app/.env']) if (existsSync(path)) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]*(?:GEMINI_API_KEY|(?:SMTP|GMAIL)[A-Z0-9_]*(?:PASSWORD|PASS)|SERVICE_ACCOUNT_BASE64|CRON_SECRET))\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 8) {
      values.push({ name: match[1], value });
      if (/(?:SMTP|GMAIL)/.test(match[1])) values.push({ name: `${match[1]}_NORMALIZED`, value: value.replace(/\s+/g, '') });
      if (match[1].includes('SERVICE_ACCOUNT')) try {
        const account = JSON.parse(Buffer.from(value, 'base64').toString());
        if (account.private_key) values.push({ name: 'SERVICE_ACCOUNT_PRIVATE_KEY', value: account.private_key }, { name: 'SERVICE_ACCOUNT_PRIVATE_KEY_BODY', value: account.private_key.split('\n').slice(1, -2).join('') });
      } catch {}
    }
  }
}
function walk(path) { return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]); }
const bundlePaths = ['ka-clinic-admin/dist'];
const nativeBundle = process.argv[2] || 'patient-app/android/app/build/generated/assets/react/release/index.android.bundle';
if (existsSync(nativeBundle)) bundlePaths.push(nativeBundle);
for (const path of bundlePaths) {
  const bundleFiles = path.endsWith('.bundle') ? [path] : walk(path);
  const hits = [];
  for (const file of bundleFiles) {
    const content = readFileSync(file);
    for (const { name, value } of values) if (content.includes(Buffer.from(value)) || content.includes(Buffer.from(JSON.stringify(value).slice(1, -1)))) hits.push({ name, file });
    if (content.includes(Buffer.from('-----BEGIN PRIVATE KEY-----'))) hits.push({ name: 'PRIVATE_KEY_MARKER', file });
  }
  add(`SECRET-BUNDLE-${path.endsWith('.bundle') ? 'PATIENT' : 'ADMIN'}`, 'Server-only values absent from client bundle', 'Zero matches', `${bundleFiles.length} files; ${values.length} locally configured secret representations; ${hits.length} matches`, hits.length === 0);
}
if (bundlePaths.length < 2) add('SECRET-BUNDLE-PATIENT', 'Patient production bundle exists for scan', 'Bundle built', 'Missing bundle', false);
mkdirSync('docs/security-results', { recursive: true });
writeFileSync('docs/security-results/secrets-after.json', JSON.stringify({ date: new Date().toISOString(), findings, results }, null, 2));
console.log(`Secrets: ${results.filter(r => r.status === 'PASS').length}/${results.length} PASS; findings redacted in evidence`);
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
