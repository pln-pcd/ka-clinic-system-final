// Adds 2 open and 2 archived sample conversations for the patients from
// scripts/seed-extra-patients.mjs. Every document is tagged isSeedData: true
// (removable with scripts/sample-patients.js remove).
//
//   node --env-file=.env scripts/seed-sample-messages.mjs [--dry-run]
const DRY = process.argv.includes('--dry-run');
const { db } = await import('../api/_lib/firebaseAdmin.js');

const MARK = { isSeedData: true, sampleBatch: 'messages-2026-10' };
const now = Date.now();
const MIN = 60000, H = 3600000, D = 86400000;

const THREADS = [
  { mrn: '2026-005', status: 'new', unread: true, at: now - 40 * MIN,
    msgs: [['patient', 'Good morning, I missed my Day 7 dose. Can I still come this weekend?']] },
  { mrn: '2026-004', status: 'replied', unread: false, at: now - 5 * H,
    msgs: [['patient', 'Is the clinic open tomorrow for my next session?'], ['admin', 'Yes, we are open from 8 AM. Your appointment is at 10 AM.'], ['patient', 'Thank you, see you tomorrow!']] },
  { mrn: '2026-006', archivedDaysAgo: 5, at: now - 7 * D,
    msgs: [['patient', 'I finished all my doses, thank you!'], ['admin', 'Great work. Keep your vaccination card safe.']] },
  { mrn: '2026-002', archivedDaysAgo: 2, at: now - 3 * D,
    msgs: [['patient', 'Where can I see my vaccination record?'], ['admin', 'Open the app and go to your vaccination card on the Home screen.']] },
];

const batch = db.batch();
for (const [k, t] of THREADS.entries()) {
  const p = (await db.collection('vaccinations').doc(t.mrn).get()).data();
  if (!p) throw new Error(`patient ${t.mrn} not found, nothing written`);
  const id = `sample-thread-${String(k + 1).padStart(2, '0')}`;
  if ((await db.collection('chatThreads').doc(id).get()).exists) throw new Error(`${id} already exists, nothing written`);
  const archived = Boolean(t.archivedDaysAgo);
  const created = t.at - t.msgs.length * 5 * MIN;
  batch.set(db.collection('chatThreads').doc(id), {
    patientUid: `${t.mrn}-no-app`, patientName: p.name, patientMrn: t.mrn, patientEmail: p.email,
    status: t.status || 'replied', unread: Boolean(t.unread), resolved: archived,
    lastMessage: t.msgs[t.msgs.length - 1][1], lastMessageAt: t.at, createdAt: created,
    ...(archived ? { closedBy: 'staff', closedAt: t.at + H, archived: true, archivedAt: now - t.archivedDaysAgo * D } : {}),
    ...MARK,
  });
  t.msgs.forEach(([sender, text], m) => batch.set(db.collection('chatMessages').doc(`${id}-m${m + 1}`), {
    threadId: id, text, sender, senderName: sender === 'patient' ? p.name : 'K&A Clinic', createdAt: created + m * 5 * MIN, ...MARK,
  }));
  console.log(`${id}  ${p.name.padEnd(22)} ${archived ? 'archived' : t.status}  ${t.msgs.length} message(s)`);
}

if (DRY) console.log('dry run: nothing written');
else { await batch.commit(); console.log('written'); }
process.exit(0);
