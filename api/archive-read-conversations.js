// Nightly auto-archive sweep (Section B4) — runs at 00:00 Asia/Manila via the
// `crons` entry in vercel.json.
//
// Archives every conversation that is closed, already read by an admin, and
// not yet archived. Runs server-side on the Admin SDK rather than in the
// dashboard so the archive reaches the same end state whether or not anyone
// opened the dashboard that day.
//
// The !unread condition is the load-bearing one: a conversation the patient
// ended but no admin ever opened must stay in Active/Unread indefinitely.
// Closing a thread from the patient's side must never make it disappear
// before a human has read it.
import { db } from './_lib/firebaseAdmin.js';

// Firestore caps a batch at 500 writes; stay under it so a large backlog
// does not fail the whole sweep.
const BATCH_LIMIT = 450;

// Vercel signs cron invocations with CRON_SECRET as a bearer token. Without
// this check the endpoint is a public "archive everything read" button.
function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  if (!isAuthorizedCron(req)) {
    // Deliberately vague: an unauthenticated caller learns nothing about
    // whether CRON_SECRET is configured or merely mismatched.
    res.status(401).json({ success: false, error: 'Not authorized.' });
    return;
  }

  try {
    // Closed and unread==false, filtered server-side. `archived` is checked in
    // code rather than in the query: threads created before the archive
    // lifecycle existed have no `archived` field at all, and a Firestore
    // equality filter on `archived == false` would skip those documents
    // entirely instead of matching them.
    const snap = await db.collection('chatThreads')
      .where('resolved', '==', true)
      .where('unread', '==', false)
      .get();

    const due = snap.docs.filter(d => d.data().archived !== true);
    if (due.length === 0) {
      console.log('[archive-read-conversations] nothing due.');
      res.status(200).json({ success: true, archived: 0 });
      return;
    }

    const archivedAt = Date.now();
    for (let i = 0; i < due.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      due.slice(i, i + BATCH_LIMIT).forEach(d => {
        batch.update(d.ref, { archived: true, archivedAt });
      });
      await batch.commit();
    }

    console.log(`[archive-read-conversations] archived ${due.length} conversation(s).`);
    res.status(200).json({ success: true, archived: due.length });
  } catch (err) {
    console.error('archive-read-conversations error:', err);
    res.status(500).json({ success: false, error: 'Auto-archive sweep failed.' });
  }
}
