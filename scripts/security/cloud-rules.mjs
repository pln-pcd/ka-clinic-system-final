// Read-only verification of published rules. Never access clinical documents.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const project = process.argv[2] || 'ka-clinic-security-test';
if (!['ka-clinic-security-test', 'ka-clinic-system'].includes(project)) throw new Error('Unexpected project');
const cliRoot = process.env.FIREBASE_CLI_ROOT || join(process.env.APPDATA, 'npm/node_modules/firebase-tools');
const require = createRequire(join(cliRoot, 'package.json'));
const { configstore } = require('./lib/configstore.js');
const { getAccessToken, getProjectDefaultAccount } = require('./lib/auth.js');
const account = getProjectDefaultAccount(process.cwd());
const tokens = await getAccessToken(account.tokens.refresh_token, []);
async function get(path) {
  const response = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!response.ok) throw new Error(`Rules API HTTP ${response.status}: ${(await response.json()).error?.message}`);
  return response.json();
}
const release = await get(`projects/${project}/releases/cloud.firestore`);
const ruleset = await get(release.rulesetName);
const source = readFileSync('ka-clinic-admin/firestore.rules', 'utf8');
const deployed = ruleset.source.files.find(file => file.name.endsWith('firestore.rules')).content;
const sha = value => createHash('sha256').update(value).digest('hex');
const equal = source === deployed;
mkdirSync('docs/security-results', { recursive: true });
writeFileSync(`docs/security-results/cloud-rules-${project}.json`, JSON.stringify({ date: new Date().toISOString(), project, release: release.name, ruleset: release.rulesetName, repositorySha256: sha(source), deployedSha256: sha(deployed), byteEqual: equal, results: [{ id: `CLOUD-RULES-${project}`, area: 6, description: 'Deployed rules equal repository source', steps: 'Read Firebase Rules release and referenced ruleset; compare content and SHA-256', expected: 'Byte-for-byte equality', actual: equal ? 'Byte-for-byte equal' : 'Mismatch', status: equal ? 'PASS' : 'FAIL' }] }, null, 2));
console.log(`${project}: rules ${equal ? 'MATCH' : 'MISMATCH'}; SHA-256 ${sha(source)}`);
process.exitCode = equal ? 0 : 1;
