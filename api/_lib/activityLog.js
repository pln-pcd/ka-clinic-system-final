// Server-side Activity Log entries for staff actions handled by /api
// (invites, revokes, account deletion). Same shape as the admin app's
// ka-clinic-admin/src/lib/activityLog.js; the Admin SDK bypasses rules, so
// these are written only after the manager check has passed.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';

export async function logStaffActivity(caller, { action, docId = '', summary, changes = [] }) {
  try {
    await db.collection('activityLog').add({
      actorUid: caller.uid,
      actorName: String(caller.data?.name || caller.data?.email || 'Admin').slice(0, 120),
      actorRole: caller.data?.role || '',
      action,
      collection: 'admins',
      docId: String(docId),
      mrn: '',
      summary: String(summary).slice(0, 300),
      changes,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('activity log write failed:', action, err?.code || err);
  }
}
