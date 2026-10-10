// Run from the repository root. Requires local demo Firebase emulators and
// Expo web on port 8084 with EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true.
// Uses simulated/anonymous local sessions and a standalone timeline fixture.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// Keep chatbot procedure checks local; the app uses its on-device fallback.
await page.route('https://ka-clinic-system-final.vercel.app/api/chatbot', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
await mkdir('.tmp/ui-checks', { recursive: true });
try {
  await page.goto('http://localhost:8084/onboarding1?view=mobile');
  for (let i = 1; i <= 3; i++) {
    await page.getByText('Next', { exact: true }).filter({ visible: true }).last().click();
    await page.waitForURL(`**/onboarding${i + 1}*`);
    await page.waitForTimeout(300);
  }
  await page.getByText('Get Started', { exact: true }).click();
  await page.waitForURL('**/auth/login*');
  console.log('PASS: all four onboarding pages reach sign-in');
  await page.getByText('Continue as a Guest', { exact: true }).click();
  await page.getByText('No Dose Record', { exact: true }).waitFor();
  const card = page.getByRole('button', { name: 'Vaccination card, front side. Tap to show the back.' });
  const front = await card.boundingBox();
  await card.click();
  const backCard = page.getByRole('button', { name: 'Vaccination card, back side. Tap to show the front.' });
  await page.waitForTimeout(600);
  const back = await backCard.boundingBox();
  assert(Math.abs(front.height - back.height) < 1, `Card heights ${front.height} / ${back.height}`);
  console.log('PASS: equal card faces', front.height, back.height);
  await backCard.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.tmp/ui-checks/home.png' });
  await page.getByText('Chat', { exact: true }).last().click();
  await page.getByText("Hi! I'm KAI", { exact: true }).waitFor();
  await page.getByText('How do I book an appointment?', { exact: true }).click();
  await page.getByText('Booking an Appointment:', { exact: false }).waitFor();
  const chat = await page.locator('body').innerText();
  assert(!chat.includes('Test environment'));
  assert(!chat.includes('Appts'));
  assert(chat.includes('For urgent or medical concerns'));
  await page.screenshot({ path: '.tmp/ui-checks/chat.png' });
  console.log('PASS: short disclaimer, clinic logo, full Appointments reply');
  await page.getByText('Account', { exact: true }).last().click();
  await page.getByText('Personal Information', { exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Back to Account' }).click();
  await page.getByText('Personal Information', { exact: true }).waitFor();
  assert(page.url().includes('/profile'));
  await page.getByText('Privacy Policy', { exact: true }).click();
  await page.getByRole('button', { name: 'Back to Account' }).click();
  assert(page.url().includes('/profile'));
  console.log('PASS: Account sections return to Account after visiting Chat');
  await page.getByText('Appointments', { exact: true }).last().click();
  await page.getByText('Book Appointment', { exact: true }).first().waitFor();
  assert(!(await page.locator('body').innerText()).includes('You do not have permission'));
  const hint = page.getByText('Appointments are on Saturdays & Sundays. Weekdays (Mon–Fri) are for walk-ins, no booking needed. Tap a highlighted date to see time slots.', { exact: true });
  const bounds = await hint.boundingBox();
  assert(bounds.x >= 20 && bounds.x + bounds.width <= 373, JSON.stringify(bounds));
  await page.screenshot({ path: '.tmp/ui-checks/appointments.png' });
  console.log('PASS: guest appointments, notice wraps inside padded border');
  assert.deepEqual(errors, []);
  for (const width of [320, 360, 393]) {
    const page = await browser.newPage({ viewport: { width, height: 840 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/ui-fixture', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0"><div id="root"></div>
      <script src="/scripts/ui-fixtures.bundle?platform=web&dev=true&hot=false"></script></body></html>` }));
    await page.goto('http://localhost:8084/ui-fixture');
    await page.getByText('Speeda (PVRV Rabies Vaccine)', { exact: true }).waitFor({ timeout: 45000 });
    for (const text of ['Session 1 (Day 0)', 'Session 4 (Day 28)', 'Speeda (PVRV Rabies Vaccine)', 'Verorab (PVRV Rabies Vaccine)', 'Sep 16, 2026', 'Oct 14, 2026']) {
      const locator = page.getByText(text, { exact: true });
      const fits = await locator.evaluate(element => {
        const style = getComputedStyle(element);
        return style.textOverflow !== 'ellipsis' && element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1;
      });
      assert(fits, `${width}px: ${text} clipped`);
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `.tmp/ui-checks/timeline-${width}.png`, fullPage: true });
    console.log(`PASS: full timeline fields at ${width}px`);
    await page.close();
  }

} catch (error) {
  console.log('BODY:', (await page.locator('body').innerText()).slice(0,2200));
  await page.screenshot({ path: '.tmp/ui-checks/failure.png' });
  throw error;
} finally {
  await browser.close();
}
