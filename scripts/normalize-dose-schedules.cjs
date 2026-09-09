// Brings every non-PEP record onto the shared schedule definitions
// (ka-clinic-admin/src/lib/doseSchedules.js) without rewriting history.
//
// Two defects in the seeded data this repairs:
//
//   1. PrEP records carry the legacy 3-dose series (Day 0/7/21) while
//      registration now writes the WHO 2-dose series (Day 0/7).
//   2. Tetanus and Hepatitis B records have a dose labelled "6 Months" dated
//      about 34 days after Day 0 — the seed script's arithmetic was wrong, so
//      the stored date contradicts its own label by five months.
//
// The governing rule: a PENDING dose is a schedule and may be corrected; an
// ADMINISTERED dose is a record of something that happened and is left exactly
// as it is. So a wrongly-dated dose that was already given keeps its date, and
// a third PrEP dose that was already given is kept rather than deleted — those
// patients really did receive it under the older protocol.
//
// Usage:
//   node scripts/normalize-dose-schedules.cjs           # dry run
//   node scripts/normalize-dose-schedules.cjs --apply

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');

// Mirrors src/lib/doseSchedules.js. Kept as plain data here because this
// script runs under Node against the live database, not through Vite.
const SCHEDULES = {
  PrEP: [
    { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', label: 'Dose 2 (Day 7)', day: 7 },
  ],
  Tetanus: [
    { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', label: 'Dose 2 (1 Month)', month: 1 },
    { key: 'd3', label: 'Dose 3 (6 Months)', month: 6 },
  ],
  Hepatitis: [
    { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', label: 'Dose 2 (1 Month)', month: 1 },
    { key: 'd3', label: 'Dose 3 (6 Months)', month: 6 },
  ],
  Pneumonia: [
    { key: 'd1', label: 'Pneumococcal Dose', day: 0 },
  ],
};

function addDays(dStr, days) {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addMonths(dStr, months) {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const isDone = (dose) => {
  const st = String(dose?.status || dose?.s || '').toLowerCase();
  return st === 'done' || st === 'completed' || dose?.done === true;
};

const scheduledDate = (day0, spec) =>
  typeof spec.month === 'number' ? addMonths(day0, spec.month) : addDays(day0, spec.day || 0);

(async () => {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) { console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.'); process.exit(1); }
  const app = initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  const db = getFirestore(app);

  const snap = await db.collection('vaccinations').get();
  console.log(APPLY ? 'APPLYING changes.\n' : 'DRY RUN — nothing will be written.\n');

  const writes = [];
  const summary = { datesCorrected: 0, extraPending: 0, extraKept: 0, untouched: 0 };

  for (const docSnap of snap.docs) {
    const p = docSnap.data();
    const service = String(p.service || '').trim();
    const spec = SCHEDULES[service];
    if (!spec) continue;                        // PEP handled by its own migration

    const existing = Array.isArray(p.doses) ? p.doses : [];
    if (existing.length === 0) continue;
    const day0 = String(p.date || existing[0]?.date || '').slice(0, 10);
    if (!day0) continue;

    const notes = [];
    const rebuilt = [];

    spec.forEach((s, i) => {
      const old = existing[i];
      const want = scheduledDate(day0, s);
      const administered = isDone(old);

      // An administered dose keeps the date it was recorded against.
      const date = administered ? (old?.date || want) : want;
      if (!administered && old?.date && old.date !== want) {
        notes.push(`${s.label}: ${old.date} → ${want}`);
        summary.datesCorrected++;
      }

      rebuilt.push({
        key: s.key,
        n: s.label,
        date,
        status: administered ? 'done' : 'pending',
        s: administered ? 'done' : 'pending',
        note: old?.note || '',
      });
    });

    // Anything beyond the current schedule: kept only if it actually happened.
    existing.slice(spec.length).forEach((extra, idx) => {
      if (isDone(extra)) {
        rebuilt.push({
          key: extra.key || `legacy${idx + 1}`,
          n: `${extra.n || extra.label || 'Additional dose'} (legacy schedule)`,
          date: extra.date || '',
          status: 'done',
          s: 'done',
          note: extra.note || '',
        });
        notes.push(`kept administered legacy dose "${extra.n || extra.label}"`);
        summary.extraKept++;
      } else {
        notes.push(`dropped pending legacy dose "${extra.n || extra.label}"`);
        summary.extraPending++;
      }
    });

    const changed =
      rebuilt.length !== existing.length ||
      rebuilt.some((d, i) => d.date !== existing[i]?.date || d.n !== (existing[i]?.n || existing[i]?.label));

    if (!changed) { summary.untouched++; continue; }

    const doneCount = rebuilt.filter(d => d.status === 'done').length;
    console.log(`  ${docSnap.id.padEnd(9)} ${service.padEnd(10)} ${existing.length}→${rebuilt.length} doses  ${notes.join('; ')}`);
    writes.push({
      ref: docSnap.ref,
      data: {
        doses: rebuilt,
        dose: `${doneCount}/${rebuilt.length}`,
        status: doneCount === rebuilt.length ? 'completed' : 'ongoing',
      },
    });
  }

  if (APPLY && writes.length) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(w => batch.update(w.ref, w.data));
      await batch.commit();
    }
  }

  console.log(`\n${writes.length} record(s) ${APPLY ? 'updated' : 'would be updated'}; ${summary.untouched} already correct.`);
  console.log(`  pending dose dates corrected: ${summary.datesCorrected}`);
  console.log(`  pending legacy doses dropped: ${summary.extraPending}`);
  console.log(`  administered legacy doses kept: ${summary.extraKept}`);
  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
  process.exit(0);
})().catch(err => { console.error('Normalization failed:', err); process.exit(1); });
