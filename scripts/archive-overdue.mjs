// Lists every patient record that is past its archive date (completion, or
// latest restore, + 365 days, Asia/Manila) but not archived yet, and archives
// them with the nightly patient-archive-sweep itself (isArchived, archivedAt
// = due date 00:30 Manila, archivedBy "auto-365", linked pins hidden).
//
//   node scripts/archive-overdue.mjs --emulator            list (local emulator)
//   node scripts/archive-overdue.mjs --emulator --apply    archive them
//   node --env-file=.env scripts/archive-overdue.mjs [--apply]   live project
const EMULATOR = process.argv.includes('--emulator');
const APPLY = process.argv.includes('--apply');
if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.FIREBASE_EMULATOR_PROJECT_ID ||= 'demo-ka-clinic';
}
const { runPatientArchiveSweep } = await import('../api/notifications.js');

const target = EMULATOR ? `emulator (${process.env.FIREBASE_EMULATOR_PROJECT_ID})` : `live project ${process.env.FIREBASE_PROJECT_ID}`;
const result = await runPatientArchiveSweep(undefined, { dryRun: !APPLY });
console.log(`${APPLY ? 'Archived' : 'Would archive'} on ${target}, today ${result.today}: ${result.archived} record(s)`);
if (result.archivedRecords.length) {
  console.table(result.archivedRecords.map(r => ({ MRN: r.id, Name: r.name, Completed: r.completedAt, Restored: r.restoredAt || '', 'Archive date': r.archiveDue })));
}
console.log(`completedAt backfilled: ${result.backfilled}, incident pins hidden: ${result.pinsHidden}`);
if (!APPLY && result.archived) console.log('Dry run. Re-run with --apply to archive them.');
process.exit(0);
