// KAI chat checks in the patient app (guest session, local emulators only).
// Run from the repository root with demo Firebase emulators (auth 9099,
// firestore 8080, project demo-ka-clinic) and Expo web on port 8084 started
// with EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true. The chatbot API is stubbed
// offline, so replies come from the on-device rules.
//
// For each test prompt: the right reply type, and the "Talk to clinic
// staff?" pop-up never opens by itself. Also: the disclaimer is pinned below
// the header (not cut off, not under the input), the staff button is there,
// and a guest tapping it is asked to sign in instead of getting an error.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const DISCLAIMER = 'This chatbot does not provide medical advice. For urgent or medical concerns, contact the clinic or a licensed healthcare professional.';
const CASES = [
  ['what is my name', "can't look up your personal details"],
  ['what is my MRN', "can't look up your personal details"],
  ['vaccine', 'Could you tell me a little more'],
  ['rabies', 'Could you tell me a little more'],
  ['Rabies', 'Could you tell me a little more'],
  ['what is rabies?', "can't answer medical questions"],
  ['do I need a booster?', "can't answer medical questions"],
  ['clinic hours?', 'Office Hours'],
  ['how do I book?', 'Booking an Appointment'],
  ['where is the clinic?', 'K&A Animal Bite Center'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/chatbot', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
await mkdir('.tmp/ui-checks', { recursive: true });
try {
  await page.goto('http://localhost:8084/auth/login?view=mobile');
  await page.getByText('Continue as a Guest', { exact: true }).click();
  await page.getByText('No Dose Record', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByText('Chat', { exact: true }).last().click();
  await page.getByText("Hi! I'm KAI", { exact: true }).waitFor();

  const input = page.getByPlaceholder('Type a message...');
  const popup = page.getByText('Talk to clinic staff?', { exact: true });
  for (const [prompt, expected] of CASES) {
    const before = (await page.locator('body').innerText()).split(expected).length - 1;
    await input.fill(prompt);
    await input.press('Enter');
    await page.waitForFunction(([t, n]) => document.body.innerText.split(t).length - 1 > n, [expected, before]);
    await page.waitForTimeout(400);
    assert.equal(await popup.count(), 0, `"${prompt}" opened the staff pop-up`);
    console.log(`PASS "${prompt}" → ${expected}`);
  }
  const body = await page.locator('body').innerText();
  assert(!/I can't help with medical questions/.test(body), 'old refusal wording still shown');
  assert(body.includes(DISCLAIMER), 'disclaimer missing');

  // Disclaimer pinned under the header, above the conversation and input.
  const disc = await page.getByText(DISCLAIMER, { exact: true }).first().boundingBox();
  const inputBox = await input.boundingBox();
  const title = await page.getByText('· AI Assistant', { exact: false }).first().boundingBox();
  assert(disc.y > title.y + title.height && disc.y + disc.height < inputBox.y, JSON.stringify({ disc, title, inputBox }));
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(300);
  const discAfter = await page.getByText(DISCLAIMER, { exact: true }).first().boundingBox();
  assert.equal(Math.round(discAfter.y), Math.round(disc.y), 'disclaimer moved while scrolling');
  console.log('PASS disclaimer pinned below the header, above the input, fully visible');

  await page.screenshot({ path: '.tmp/ui-checks/kai-chat.png' });
  await page.getByRole('button', { name: 'Talk to clinic staff' }).click();
  await page.getByText('Patient account needed', { exact: true }).waitFor();
  assert.equal(await popup.count(), 0);
  console.log('PASS staff button: guest asked to sign in, no failing request');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
