import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Vercel's loader does not provide native synchronous require(esm), even
// when local Node does. Reproduce that constraint without live credentials.
const worker = `
  import assert from 'node:assert/strict';
  import { createRequire } from 'node:module';
  import { generateKeyPairSync, sign, verify } from 'node:crypto';
  await import('firebase-admin/auth');
  await import('firebase-admin/app-check');
  const require = createRequire(import.meta.url);
  const jwks = require('jwks-rsa');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const client = jwks({ jwksUri: 'https://example.test/unused',
    getKeysInterceptor: async () => [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }] });
  const key = await client.getSigningKey('test-key');
  const data = Buffer.from('simulated signed payload');
  const signature = sign('RSA-SHA256', data, privateKey);
  assert.equal(verify('RSA-SHA256', data, key.getPublicKey(), signature), true);
  assert.equal(verify('RSA-SHA256', Buffer.from('tampered'), key.getPublicKey(), signature), false);
`;
const child = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', worker], { encoding: 'utf8', timeout: 30000 });
const result = {
  id: 'RUNTIME-CJS-JWKS', area: 8,
  description: 'Firebase Auth/App Check load and RSA JWKS verification without require(esm)',
  steps: 'Child Node process disables require(esm); generated test key only; no environment files, credentials or network requests.',
  expected: 'SDK imports succeed; valid RSA signature accepted; tampered payload rejected',
  actual: child.status === 0 ? 'Imports and signature checks passed' : (child.error?.message || child.stderr || `Exit ${child.status}`).slice(0, 1000),
  status: child.status === 0 ? 'PASS' : 'FAIL',
};
writeFileSync('docs/security-results/runtime-after.json', JSON.stringify({ date: new Date().toISOString(), results: [result] }, null, 2));
console.log(`Server runtime compatibility: ${result.status}`);
assert.equal(child.status, 0, result.actual);
