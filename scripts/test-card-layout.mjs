// Vaccination card + Previous Services checks on the simulated fixture
// (patient-app/scripts/ui-fixtures.tsx, ?fixture=cards). No backend.
// Run from the repository root with Expo web on port 8084:
//   cd patient-app && npx expo start --web --port 8084
//   node scripts/test-card-layout.mjs
//
// For a PEP, a PrEP and a new-service (Tetanus) patient at 320–412 px:
//   - front and back faces (inline and pop-up) have identical size, and so do
//     the exported (ViewShot) areas;
//   - no text is clipped or spills out of its face;
//   - only the fields the service asks for are shown, compared against the
//     dashboard's own rules (ka-clinic-admin/src/lib/serviceFields.js);
//   - wound location / depth and internal remarks never appear;
//   - Previous Services renders 0, 1 and 2 entries, and nothing when empty.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serviceFieldRows } from '../ka-clinic-admin/src/lib/serviceFields.js';

const PATIENTS = {
  pep: { service: 'PEP', numberOfBites: '2', woundWashed: 'Yes', cat: 'III', animal: 'Dog', pastVaccines: 'None', allergies: 'Penicillin', history: 0 },
  prep: { service: 'PrEP', pastVaccines: 'Completed PEP (1–3 years ago)', allergies: '', history: 1 },
  tetanus: { service: 'Tetanus', pastVaccines: 'Others', pastVaccinesOther: 'Hepatitis B series (2019), Influenza (2025)', allergies: 'None', woundType: 'Puncture', lastTetanus: 'More than 10 years ago', history: 2 },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('.tmp/ui-checks', { recursive: true });
const results = [];
try {
  for (const width of [320, 360, 393, 412]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(url => url.pathname === '/ui-fixture', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0"><div id="root"></div>
      <script src="/scripts/ui-fixtures.bundle?platform=web&dev=true&hot=false"></script></body></html>` }));
    await page.goto('http://localhost:8084/ui-fixture?fixture=cards');
    await page.getByText('tetanus', { exact: true }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);

    for (const [key, spec] of Object.entries(PATIENTS)) {
      const pastHolders = Array.from({ length: spec.history }, (_, i) => [`past-front-${key}-${i}`, `past-back-${key}-${i}`]).flat();
      for (const holder of [`inline-front-${key}`, `inline-back-${key}`, `popup-${key}`, ...pastHolders]) {
        const variant = holder.startsWith('popup') ? 'popup' : 'inline';
        // The front sets the height: the card is exactly the front's content
        // plus padding (the back's notes box stretches to fill it).
        const fit = await page.getByTestId(holder).evaluate((el, v) => {
          const shot = el.querySelector(`[data-testid="shot-${v}-front"]`).parentElement;
          const content = shot.children[1].getBoundingClientRect();
          const r = shot.getBoundingClientRect();
          return v === 'popup' ? { content: content.width, shot: r.width } : { content: content.height, shot: r.height };
        }, variant);
        assert(Math.abs(fit.content - fit.shot) <= 2, `${width}px ${holder}: height not set by the front (${fit.content} vs ${fit.shot})`);
        // The DOSE column keeps "Session N (Day N)" on one line (360 px and up).
        if (width >= 360 && variant === 'inline' && holder.startsWith('inline-front')) {
          const lines = await page.getByTestId(holder).getByTestId(`card-${variant}-front`).evaluate(face => {
            return [...face.querySelectorAll('div[dir="auto"]')].filter(e => /^Session \d \(Day \d+\)$/.test(e.textContent))
              .map(e => {
                // One line when the text's own width fits the cell's content box
                // (row height is set by the tallest cell, so height says nothing).
                const c = e.cloneNode(true);
                Object.assign(c.style, { whiteSpace: 'nowrap', position: 'absolute', width: 'auto', padding: '0' });
                document.body.appendChild(c);
                const need = c.getBoundingClientRect().width; c.remove();
                const cs = getComputedStyle(e);
                const room = e.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth || '0');
                return need <= room + 0.5 ? 1 : 2;
              });
          });
          assert(lines.every(n => n <= 1), `${width}px ${holder}: dose label wraps (${lines})`);
        }
        const box = id => page.getByTestId(holder).getByTestId(id).evaluate(el => {
          const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
        });
        const [f, b, sf, sb] = await Promise.all([box(`card-${variant}-front`), box(`card-${variant}-back`), box(`shot-${variant}-front`), box(`shot-${variant}-back`)]);
        assert.deepEqual(f, b, `${width}px ${holder}: face sizes differ ${JSON.stringify(f)} vs ${JSON.stringify(b)}`);
        assert.deepEqual(sf, sb, `${width}px ${holder}: export sizes differ ${JSON.stringify(sf)} vs ${JSON.stringify(sb)}`);
        // Every text inside each face fits its box and stays inside the face.
        for (const side of ['front', 'back']) {
          const bad = await page.getByTestId(holder).getByTestId(`card-${variant}-${side}`).evaluate(face => {
            const fr = face.getBoundingClientRect();
            const out = [];
            face.querySelectorAll('div[dir="auto"], span').forEach(el => {
              if (!el.textContent.trim() || el.children.length || el.dataset.testid === 'notes-text') return;
              const cs = getComputedStyle(el);
              if (cs.textOverflow === 'ellipsis' || el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`clipped: ${el.textContent}`);
              const r = el.getBoundingClientRect();
              // Pop-up faces are rotated, so compare against the rotated box.
              if (r.bottom > fr.bottom + 1 || r.right > fr.right + 1 || r.top < fr.top - 1 || r.left < fr.left - 1) out.push(`outside face: ${el.textContent}`);
            });
            return out;
          });
          assert.deepEqual(bad, [], `${width}px ${holder} ${side}: ${bad.join('; ')}`);
        }
      }

      const card = await page.getByTestId(`inline-front-${key}`).innerText();
      const backTxt = await page.getByTestId(`inline-front-${key}`).getByTestId('card-inline-back').innerText();
      assert(/CLINICAL NOTES/i.test(backTxt), `${key}: no Clinical Notes box`);
      assert(!/DOSE SCHEDULE/i.test(backTxt), `${key}: Dose Schedule still on the back`);
      if (key === 'tetanus') assert(/No clinical notes/.test(backTxt), 'empty note placeholder missing');
      const back = await page.getByTestId(`inline-front-${key}`).getByTestId('card-inline-back').innerText();
      // Service-to-fields rule, from the dashboard's own definitions.
      const record = { ...spec };
      const expectedHistory = serviceFieldRows(record, 'history', { audience: 'patient', exclude: ['notes'] });
      const expectedExposure = serviceFieldRows(record, 'exposure', { audience: 'patient' });
      for (const row of [...expectedHistory, ...expectedExposure]) {
        assert(back.toUpperCase().includes(row.label.toUpperCase()), `${key}: dashboard field "${row.label}" missing on card`);
        if (row.value) assert(back.includes(row.value), `${key}: "${row.label}" value "${row.value}" differs from dashboard`);
      }
      if (spec.service !== 'PEP') {
        for (const forbidden of ['EXPOSURE CATEGORY', 'EXPOSURE DATE', 'BITING ANIMAL', 'HISTORY OF EXPOSURE', 'POST-EXPOSURE', '(PEP)', 'NUMBER OF BITES']) {
          assert(!card.toUpperCase().includes(forbidden), `${key}: shows "${forbidden}"`);
        }
      }
      assert(!/wound location|wound depth|SIMULATED-WOUND|SIMULATED-INTERNAL-REMARK/i.test(await page.locator('body').innerText()), `${key}: clinic-only field shown`);

      const history = await page.getByTestId(`history-${key}`).innerText();
      if (spec.history === 0) assert.equal(history.trim(), '', `${key}: history should render nothing`);
      else {
        assert(history.includes('Previous Treatments'));
        assert.equal(await page.getByTestId(`history-${key}`).getByRole('button').count(), spec.history, `${key}: history rows`);
        assert(!/wound/i.test(history), `${key}: wound data in history`);
        for (let i = 0; i < spec.history; i++) {
          const past = await page.getByTestId(`past-front-${key}-${i}`).innerText();
          assert(/PREVIOUS TREATMENT/i.test(past), `${key} past ${i}: no previous-treatment tag`);
          // A past PrEP card never shows exposure fields or a PEP schedule;
          // a past PEP card shows its own category, not the current one.
          const pastBack = await page.getByTestId(`past-front-${key}-${i}`).getByTestId('card-inline-back').innerText();
          if (/Pre-Exposure Prophylaxis \(PrEP\)/.test(past)) {
            for (const f of ['EXPOSURE CATEGORY', 'BITING ANIMAL', 'POST-EXPOSURE', 'HISTORY OF EXPOSURE']) assert(!(past + pastBack).toUpperCase().includes(f), `${key} past PrEP shows ${f}`);
          } else {
            assert(/CATEGORY III/i.test(past), `${key} past PEP: category missing`);
            assert(/CLINICAL NOTES/i.test(pastBack), `${key} past PEP: notes box missing`);
          }
        }
      }
      results.push(`${width}px ${key}`);
    }
    // Dose timeline table: every session label on one line.
    await page.goto('http://localhost:8084/ui-fixture');
    await page.getByText('Session 4 (Day 28)', { exact: true }).waitFor({ timeout: 60000 });
    const wraps = await page.evaluate(() => [...document.querySelectorAll('div[dir="auto"]')]
      .filter(e => /^Session \d \(Day \d+\)$/.test(e.textContent))
      .filter(e => {
        const c = e.cloneNode(true);
        Object.assign(c.style, { whiteSpace: 'nowrap', position: 'absolute', width: 'auto', padding: '0' });
        document.body.appendChild(c); const need = c.getBoundingClientRect().width; c.remove();
        const cs = getComputedStyle(e);
        return need > e.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5;
      }).map(e => e.textContent));
    assert.deepEqual(wraps, [], `${width}px timeline: ${wraps.join(', ')} wraps`);
    await page.screenshot({ path: `.tmp/ui-checks/timeline-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `.tmp/ui-checks/cards-${width}.png`, fullPage: true });
    console.log(`PASS ${width}px: equal faces/exports, nothing clipped, fields match dashboard rules, history 0/1/2`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`${results.length} card checks passed`);
