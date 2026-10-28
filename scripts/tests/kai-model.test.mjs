import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatbotHandler } from '../../api/chatbot.js';
import { smartReply } from '../../api/_lib/kaiModel.js';
import { getKaiDecision } from '../../patient-app/services/kaiPolicy.js';

const call = async (handler, prompt) => {
  let body; const res = { status() { return this; }, json(b) { body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method: 'POST', body: { prompt, history: [] }, headers: {} }, res);
  return body;
};

test('medical, private and off-topic messages never reach the model', async () => {
  const seen = [];
  const handler = createChatbotHandler({ smart: async p => { seen.push(p); return 'MODEL'; }, load: async () => null });
  for (const p of ['Is it safe after a dog bite?', 'nakagat ako ng aso, ano gagawin ko?', 'my name is Maria Santos', 'Maria Santos',
    '0917 123 4567', 'who is lebron?', 'what is my next dose?', 'magkano ang PEP?', 'anong mga serbisyo nyo?']) {
    const r = await call(handler, p);
    assert.notEqual(r.text, 'MODEL', p);
  }
  assert.deepEqual(seen, []);
});

test('app and clinic questions use the model answer, in any language', async () => {
  const handler = createChatbotHandler({ smart: async () => 'MODEL', load: async () => null });
  for (const p of ['What is the name of the app?', 'How do I use this app?', 'paano mag-reset ng password?', 'how do I change my profile photo po?']) {
    const r = await call(handler, p);
    assert.equal(r.text, 'MODEL', p);
    assert.equal(r.source, 'model');
  }
});

test('the fixed reply answers when the model has nothing', async () => {
  const handler = createChatbotHandler({ smart: async () => null, load: async () => null });
  const r = await call(handler, 'How do I use this app?');
  assert.equal(r.text, getKaiDecision('How do I use this app?').text);
});

test('model answers with clinical content or contact details are discarded', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  const fake = text => async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
  const d = getKaiDecision('How do I use this app?');
  assert.equal(await smartReply('q', [], d, { fetchImpl: fake('Get your Day 7 dose and wash the wound.') }), null);
  assert.equal(await smartReply('q', [], d, { fetchImpl: fake('Email us at clinic@example.com') }), null);
  assert.equal(await smartReply('q', [], d, { fetchImpl: fake('Open **Account** to change your photo.') }), 'Open **Account** to change your photo.');
  delete process.env.GEMINI_API_KEY;
});
