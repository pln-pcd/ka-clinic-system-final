import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from '../../patient-app/node_modules/typescript/lib/typescript.js';
import { getKaiDecision, kaiCopy } from '../../patient-app/services/kaiPolicy.js';

// Execute the real mobile service without loading Expo's native backend.
// Only configuration is substituted; policy and fetch handling are unchanged.
const source = fs.readFileSync(new URL('../../patient-app/services/chatbot.ts', import.meta.url), 'utf8')
  .replace("import { API_BASE_URL } from '../config/backend';", "const API_BASE_URL = 'https://clinic.invalid';")
  .replace("from './kaiPolicy'", `from '${new URL('../../patient-app/services/kaiPolicy.js', import.meta.url).href}'`);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { askClinicAssistant } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('mobile uses the same fixed replies without disclosing personal/clinical messages to a server', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('should not send this message');
  try {
    for (const prompt of ['hello', 'ako si maria santos', 'nakagat ako ng aso', 'magkano ang PrEP?', 'when is my next dose?', 'paano magpa-reschedule?']) {
      const actual = await askClinicAssistant(prompt);
      const expected = getKaiDecision(prompt);
      assert.equal(actual.text, expected.text);
      assert.equal(actual.disclaimer, expected.disclaimer);
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('mobile discards older server replies that do not implement the new policy contract', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, json: async () => ({ success: true, text: 'Legacy English answer with unverified slots', category: 'in_scope' }) });
  try {
    assert.equal((await askClinicAssistant('may slot pa ba bukas?')).text, kaiCopy.tl.unavailable);
  } finally { globalThis.fetch = oldFetch; }
});

test('mobile sends only safe scheduling context, and keeps the server language', async () => {
  const oldFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, req) => {
    sent = JSON.parse(req.body);
    return { status: 200, json: async () => ({ success: true, intent: 'availability', language: 'tl', category: 'in_scope', needsEscalation: false, text: 'Wala na pong natitirang appointment slot para sa petsang ito.' }) };
  };
  try {
    const actual = await askClinicAssistant('may slot pa ba bukas?', [
      { role: 'user', text: 'ako si Maria Santos' }, { role: 'bot', text: 'old answer' },
      { role: 'user', text: 'may slot sa sabado?' },
    ]);
    assert.equal(sent.history.length, 1);
    assert.equal(sent.history[0].text, 'may slot sa sabado?');
    assert.equal(actual.language, 'tl');
    assert.match(actual.text, /Wala na po/);
  } finally { globalThis.fetch = oldFetch; }
});

test('mobile network failure never invents availability', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const actual = await askClinicAssistant('available slots tomorrow');
    assert.equal(actual.text, kaiCopy.en.unavailable);
    assert.equal(actual.needsEscalation, false);
  } finally { globalThis.fetch = oldFetch; }
});
