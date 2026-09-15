// Patient follow-up notifications — push to the app, email to Gmail, and the
// patient's "I received this" acknowledgement, consolidated behind a single
// serverless function.
//
// Why one function with an `action` field rather than three files: Vercel's
// Hobby plan caps a deployment at 12 serverless functions and api/ was already
// at 11. Same routing pattern as api/devices.js.
//
// Actions and their auth models differ deliberately:
//   register-token  — called by the Patient App with its Firebase ID token.
//   set-avatar      — same; patient saves their profile photo to their record
//                     so the admin portal shows it too.
//   update-profile  — same; patient edits the self-service fields of their
//                     record (contact, address, emergency contact, ...).
//   backup          — admin-only when pressed from Settings ("Run Backup Now");
//                     also runs from the daily cron (CRON_SECRET) and then obeys
//                     settings/config.system.backupFrequency.
//   send-followup   — admin-only (requireAuthenticatedAdmin). Manual "Send
//                     Follow-up" button, and the automatic due-dose sweep.
//   ack             — deliberately UNAUTHENTICATED. It is reached by tapping a
//                     link in an email client, where no session exists. The
//                     unguessable notification id is the only credential, it
//                     can only ever flip one boolean to true on one document,
//                     and it returns no patient data. Same trade-off as a
//                     one-click unsubscribe link.
import { gzipSync } from 'node:zlib';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db, storageBucket } from './_lib/firebaseAdmin.js';
import { requireAuthenticatedAdmin } from './_lib/adminAuth.js';
import { sendMail } from './_lib/mailer.js';
import { buildFollowUpEmailHtml } from './_lib/emailTemplate.js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Expo tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx].
function isExpoPushToken(token) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

function siteOrigin(req) {
  const configured = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}

// ── Patient App registers the device it wants reminders on ──────────────────
// Authenticated with the patient's own Firebase ID token; the token is stored
// against their vaccination record so a later send knows where to deliver.
async function registerToken(req, res) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const pushToken = (req.body?.pushToken || '').trim();
  const mrn = (req.body?.mrn || '').trim();

  if (!idToken) {
    res.status(401).json({ success: false, error: 'Missing authentication token.' });
    return;
  }
  if (!isExpoPushToken(pushToken)) {
    res.status(400).json({ success: false, error: 'Invalid push token.' });
    return;
  }

  let uid;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    return;
  }

  // The vaccination doc id IS the MRN, so a supplied MRN is the direct hit;
  // otherwise fall back to whichever record already claims this uid.
  let ref = null;
  if (mrn) {
    const byMrn = db.collection('vaccinations').doc(mrn);
    if ((await byMrn.get()).exists) ref = byMrn;
  }
  if (!ref) {
    const snap = await db.collection('vaccinations').where('authUid', '==', uid).limit(1).get();
    if (!snap.empty) ref = snap.docs[0].ref;
  }
  if (!ref) {
    res.status(404).json({ success: false, error: 'No patient record found for this account.' });
    return;
  }

  await ref.set({
    authUid: uid,
    pushTokens: FieldValue.arrayUnion(pushToken),
    pushTokenUpdatedAt: Date.now(),
  }, { merge: true });

  res.status(200).json({ success: true });
}

// ── Patient App edits its own contact / emergency details ───────────────────
// Only the fields a patient can reasonably own. Identity (name, age, sex,
// email, MRN) and anything clinical stay staff-only — the app shows those
// read-only. Same ownership check as set-avatar.
const PATIENT_EDITABLE_FIELDS = [
  'contact', 'address', 'religion', 'education', 'occupation',
  'height', 'weight', 'bloodPressure',
  'emergencyName', 'emergencyRel', 'emergencyPhone', 'emergencyAltPhone',
];

async function resolveOwnedPatientRef(req, res) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const mrn = (req.body?.mrn || '').trim();
  if (!idToken) { res.status(401).json({ success: false, error: 'Missing authentication token.' }); return null; }
  if (!mrn) { res.status(400).json({ success: false, error: 'Missing MRN.' }); return null; }
  let decoded;
  try { decoded = await auth.verifyIdToken(idToken, true); }
  catch { res.status(401).json({ success: false, error: 'Invalid or expired session.' }); return null; }
  const ref = db.collection('vaccinations').doc(mrn);
  const snap = await ref.get();
  if (!snap.exists) { res.status(404).json({ success: false, error: 'No patient record found.' }); return null; }
  const data = snap.data() || {};
  const emailMatch = decoded.email && data.email && decoded.email.toLowerCase() === String(data.email).toLowerCase();
  const uidMatch = data.authUid && data.authUid === decoded.uid;
  if (!emailMatch && !uidMatch) { res.status(403).json({ success: false, error: 'This record does not belong to your account.' }); return null; }
  return { ref, data, decoded };
}

async function updateProfile(req, res) {
  const owned = await resolveOwnedPatientRef(req, res);
  if (!owned) return;
  const fields = req.body?.fields && typeof req.body.fields === 'object' ? req.body.fields : {};
  const patch = {};
  for (const k of PATIENT_EDITABLE_FIELDS) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === null || v === undefined) continue;
    patch[k] = String(v).trim().slice(0, 200);
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ success: false, error: 'Nothing to update.' });
    return;
  }
  patch.profileUpdatedAt = Date.now();
  patch.profileUpdatedBy = 'patient';
  await owned.ref.set(patch, { merge: true });
  res.status(200).json({ success: true, updated: Object.keys(patch) });
}

// ── Patient App saves its profile photo onto the clinic record ──────────────
// Patients cannot write to vaccinations/{mrn} directly (firestore.rules), so
// the photo goes through here with the patient's own Firebase ID token. Stored
// as a data URL on its own doc, patientAvatars/{mrn} — NOT on the vaccinations
// doc, because every admin page subscribes to the whole vaccinations
// collection and a 600 KB photo per patient would ride along on every
// snapshot. Readers fetch the avatar doc only when a profile is opened. The
// project has no Cloud Storage (Spark plan), hence Firestore.
const MAX_AVATAR_DATA_URL_BYTES = 600 * 1024;

async function setAvatar(req, res) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const mrn = (req.body?.mrn || '').trim();
  const dataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl.trim() : '';

  if (!idToken) {
    res.status(401).json({ success: false, error: 'Missing authentication token.' });
    return;
  }
  if (!mrn) {
    res.status(400).json({ success: false, error: 'Missing MRN.' });
    return;
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    res.status(400).json({ success: false, error: 'Invalid image payload.' });
    return;
  }
  if (dataUrl.length > MAX_AVATAR_DATA_URL_BYTES) {
    res.status(413).json({ success: false, error: 'Photo is too large. Please choose a smaller image.' });
    return;
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    return;
  }

  const ref = db.collection('vaccinations').doc(mrn);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ success: false, error: 'No patient record found.' });
    return;
  }
  // Same ownership test as firestore.rules ownsVaccinationDoc(): the signed-in
  // email must be the one on the record. authUid is a secondary match for
  // accounts registered before the email was stored.
  const data = snap.data() || {};
  const emailMatch = decoded.email && data.email && decoded.email.toLowerCase() === String(data.email).toLowerCase();
  const uidMatch = data.authUid && data.authUid === decoded.uid;
  if (!emailMatch && !uidMatch) {
    res.status(403).json({ success: false, error: 'This record does not belong to your account.' });
    return;
  }

  await db.collection('patientAvatars').doc(mrn).set({
    dataUrl,
    email: String(data.email || '').toLowerCase(),
    updatedAt: Date.now(),
  });
  // Migrate away from the earlier inline field so the record shrinks again.
  if (data.avatarUrl) {
    await ref.update({ avatarUrl: FieldValue.delete(), avatarUpdatedAt: FieldValue.delete() }).catch(() => {});
  }
  res.status(200).json({ success: true });
}

// Fire-and-report Expo push. A failed push never fails the whole send — the
// email and the in-app notification doc are independent delivery channels.
async function sendExpoPush(tokens, { title, body, data }) {
  const valid = (tokens || []).filter(isExpoPushToken);
  if (valid.length === 0) return { sent: 0, error: null };

  try {
    const messages = valid.map(to => ({
      to,
      sound: 'default',
      title,
      body,
      data: data || {},
      channelId: 'appointments',
    }));
    const resp = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) return { sent: 0, error: `Expo responded ${resp.status}` };
    return { sent: valid.length, error: null };
  } catch (err) {
    return { sent: 0, error: err?.message || 'Push request failed.' };
  }
}

// ── Admin sends a follow-up: app push + Gmail, one notification record ──────
async function sendFollowUp(req, res, caller) {
  const patientId = (req.body?.patientId || '').trim();
  const message = (req.body?.message || '').trim();
  const title = (req.body?.title || 'Follow-up reminder').trim();
  const doseLabel = (req.body?.doseLabel || '').trim();
  const dueDate = (req.body?.dueDate || '').trim();
  // 'manual' when an admin pressed the button, 'auto' from the scheduled sweep.
  const source = req.body?.source === 'auto' ? 'auto' : 'manual';

  if (!patientId) {
    res.status(400).json({ success: false, error: 'Missing patient id.' });
    return;
  }

  const patientRef = db.collection('vaccinations').doc(patientId);
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) {
    res.status(404).json({ success: false, error: 'Patient record not found.' });
    return;
  }
  const patient = patientSnap.data() || {};
  const patientName = patient.name || [patient.fname, patient.lname].filter(Boolean).join(' ') || '';
  const email = (patient.email || '').trim();

  // The notification doc is created first so its id can be embedded in the
  // email's acknowledgement link and in the push payload.
  const notifRef = db.collection('patientNotifications').doc();
  await notifRef.set({
    patientId,
    patientName,
    title,
    message,
    doseLabel: doseLabel || null,
    dueDate: dueDate || null,
    source,
    sentBy: caller.uid,
    sentByName: caller.data?.name || '',
    createdAt: Date.now(),
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedVia: null,
    read: false,
  });

  const ackUrl = `${siteOrigin(req)}/api/notifications?action=ack&id=${notifRef.id}`;

  const push = await sendExpoPush(patient.pushTokens || [], {
    title,
    body: message || 'You have a new reminder from K&A Clinic.',
    data: { notificationId: notifRef.id, type: 'follow-up' },
  });

  let emailed = false;
  let emailError = null;
  if (email && isValidEmail(email)) {
    const { error } = await sendMail({
      to: email,
      subject: `K&A Clinic — ${title}`,
      html: buildFollowUpEmailHtml({
        patientName,
        message,
        ackUrl: ackUrl.startsWith('http') ? ackUrl : '',
        doseLabel,
        dueDate,
      }),
      role: 'reminders',
    });
    if (error) {
      console.error('send-followup mail error:', error);
      emailError = 'Email delivery failed.';
    } else {
      emailed = true;
    }
  }

  await notifRef.update({
    pushSent: push.sent,
    pushError: push.error,
    emailed,
    emailError,
  });

  res.status(200).json({
    success: true,
    notificationId: notifRef.id,
    pushSent: push.sent,
    pushError: push.error,
    emailed,
    emailError,
    hasEmail: !!email,
  });
}

// ── Patient confirms receipt ────────────────────────────────────────────────
// Reached two ways: the app's "I received this" button (POST), and the email
// button (GET, no session — see the auth note at the top of this file).
async function acknowledge(req, res) {
  const id = (req.query?.id || req.body?.id || '').trim();
  const via = req.method === 'GET' ? 'email' : 'app';

  if (!id) {
    res.status(400).json({ success: false, error: 'Missing notification id.' });
    return;
  }

  const ref = db.collection('patientNotifications').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    if (via === 'email') { res.status(404).send(ackPage(false)); return; }
    res.status(404).json({ success: false, error: 'Notification not found.' });
    return;
  }

  // First acknowledgement wins — a second click must not overwrite the
  // original timestamp or channel.
  if (!snap.data()?.acknowledged) {
    await ref.update({
      acknowledged: true,
      acknowledgedAt: Date.now(),
      acknowledgedVia: via,
      read: true,
    });
  }

  if (via === 'email') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(ackPage(true));
    return;
  }
  res.status(200).json({ success: true });
}

// Standalone confirmation page shown after tapping the email button. Inline
// styles only — this renders in whatever browser the mail client opens.
function ackPage(ok) {
  const title = ok ? 'Thank you — confirmation received' : 'Notification not found';
  const msg = ok
    ? 'Your clinic has been notified that you received this reminder. No further action is needed.'
    : 'This confirmation link is no longer valid. If you have questions, please contact the clinic directly.';
  const color = ok ? '#059669' : '#B91C1C';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;background:#FFFFFF;border-radius:14px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr><td style="background-color:#0A1D47;background:linear-gradient(135deg,#0A1D47 0%,#0E2A6D 100%);padding:22px 32px;border-bottom:3px solid #1D4ED8;">
          <div style="font-size:17px;font-weight:bold;color:#FFFFFF;">K&amp;A Clinic</div>
          <div style="font-size:11px;color:#93C5FD;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;font-weight:600;">Anti-Rabies &amp; Animal Bite Center</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:${color};">${title}</h1>
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${msg}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}


// ── Daily dose-reminder sweep (Vercel cron) ─────────────────────────────────
// Replaces a reminder that lived as a useEffect inside the Vaccination Tracker
// page: it fired only while a staff member had that page open, and only on or
// after the due date, so a dose falling due on a quiet day was never announced
// and there was no day-before reminder at all.
//
// Two triggers per dose, recorded separately on the patient record so neither
// can fire twice:
//   <doseKey>:pre — the day before the dose is due
//   <doseKey>:due — the day itself
//
// Overdue doses are deliberately not chased here; that stays a clinical
// judgement made through the tracker's Send Follow-up button.

const CLINIC_TZ = 'Asia/Manila';

// The clinic's civil date, not the server's UTC date — a sweep running at
// 16:00 UTC is already tomorrow in Manila, which is the exact off-by-one this
// guards against.
function clinicDateString(offsetDays = 0) {
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: CLINIC_TZ }));
  local.setDate(local.getDate() + offsetDays);
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, '0'),
    String(local.getDate()).padStart(2, '0'),
  ].join('-');
}

function longDate(dStr) {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dStr;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', {
    timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

const doseIsDone = (dose) => {
  const st = String(dose?.status || dose?.s || '').toLowerCase();
  return st === 'done' || st === 'completed' || dose?.done === true;
};

async function doseSweep(req, res) {
  const today = clinicDateString(0);
  const tomorrow = clinicDateString(1);

  const snap = await db.collection('vaccinations').get();
  const jobs = [];

  for (const docSnap of snap.docs) {
    const patient = docSnap.data();
    if (patient.isArchived) continue;

    const doses = Array.isArray(patient.doses) ? patient.doses : [];
    const notified = Array.isArray(patient.notifiedDoses) ? patient.notifiedDoses : [];

    for (const dose of doses) {
      if (doseIsDone(dose)) continue;
      const date = String(dose?.date || '').slice(0, 10);
      if (!date) continue;

      const when = date === tomorrow ? 'pre' : date === today ? 'due' : null;
      if (!when) continue;

      const marker = `${dose.key || dose.n || dose.label || 'dose'}:${when}`;
      if (notified.includes(marker)) continue;

      jobs.push({ ref: docSnap.ref, patient, dose, when, marker, date });
    }
  }

  let sent = 0;
  const failed = [];

  for (const { ref, patient, dose, when, marker, date } of jobs) {
    const doseLabel = dose.n || dose.label || dose.dose || 'Your next dose';
    const dueDate = longDate(date);
    const name = patient.name || '';
    const service = patient.service || 'vaccination';
    const title = when === 'pre' ? 'Dose due tomorrow' : 'Dose due today';
    const message = when === 'pre'
      ? `Reminder${name ? ` for ${name}` : ''}: ${doseLabel} of your ${service} schedule is due tomorrow, ${dueDate}. Please visit K&A Clinic to stay on schedule.`
      : `Reminder${name ? ` for ${name}` : ''}: ${doseLabel} of your ${service} schedule is due today, ${dueDate}. Please visit K&A Clinic today.`;

    try {
      const notifRef = db.collection('patientNotifications').doc();
      await notifRef.set({
        patientId: ref.id,
        patientName: name,
        title,
        message,
        doseLabel,
        dueDate,
        source: when === 'pre' ? 'auto-day-before' : 'auto-day-of',
        createdAt: Date.now(),
        acknowledged: false,
        acknowledgedAt: null,
        acknowledgedVia: null,
        read: false,
      });

      await sendExpoPush(patient.pushTokens || [], {
        title,
        body: message,
        data: { notificationId: notifRef.id, type: 'dose-reminder' },
      });

      const email = (patient.email || '').trim();
      if (email && isValidEmail(email)) {
        await sendMail({
          to: email,
          subject: `K&A Clinic — ${title}`,
          html: buildFollowUpEmailHtml({ patientName: name, message, doseLabel, dueDate }),
          role: 'reminders',
        });
      }

      // Marked only after a successful send, so a mid-sweep failure retries on
      // the next run rather than skipping that patient permanently.
      await ref.update({ notifiedDoses: FieldValue.arrayUnion(marker) });
      sent++;
    } catch (err) {
      console.error(`[dose-sweep] ${ref.id} ${marker} failed:`, err);
      failed.push(marker);
    }
  }

  console.log(`[dose-sweep] ${sent} sent, ${failed.length} failed (today=${today}, tomorrow=${tomorrow})`);
  res.status(200).json({ success: true, sent, failed: failed.length, today, tomorrow });
}

// ── Database backup: gzip JSON snapshot of every clinical collection ─────────
// Delivery: emailed as an attachment to the clinic's backup recipients. The
// Firebase project is on the no-billing Spark plan, which has no Cloud
// Storage bucket, so email is the one durable off-site copy available for
// free. If FIREBASE_STORAGE_BUCKET is set (project upgraded later) the same
// snapshot is also written to that bucket and BACKUP_KEEP runs are retained.
//
// Recipients: settings/config.system.backupRecipients (comma list) if set,
// else settings/config.clinic.email, else every active admin's email. A
// manual run also copies the admin who pressed the button.
//
// Outcome (ok/failed, when, size, recipients, error) is written to
// settings/config.system.lastBackup so the Settings page can show it. Vercel
// Hobby crons fire at most once a day, hence daily / weekly / off — no hourly.
// patientAvatars is deliberately left out: photos are bulky, non-clinical,
// and would push the email attachment past Gmail's limit quickly.
const BACKUP_COLLECTIONS = [
  'vaccinations', 'appointments', 'appointmentSlots', 'inventory',
  'stockMovements', 'incidents', 'patientNotifications', 'chatThreads',
  'authorizedPatients', 'admins', 'settings',
];
const BACKUP_KEEP = 30;
// Gmail rejects messages over 25 MB; leave headroom for MIME overhead.
const BACKUP_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

async function readSettingsDoc() {
  const snap = await db.collection('settings').doc('config').get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function recordBackupResult(result) {
  await db.collection('settings').doc('config').set(
    { system: { lastBackup: result }, updatedAt: Date.now() },
    { merge: true },
  );
}

async function resolveBackupRecipients(settings, extraEmail) {
  const out = new Set();
  const configured = String(settings.system?.backupRecipients || '')
    .split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(isValidEmail);
  configured.forEach(e => out.add(e));
  if (out.size === 0 && isValidEmail(settings.clinic?.email || '')) {
    out.add(String(settings.clinic.email).trim().toLowerCase());
  }
  if (out.size === 0) {
    const admins = await db.collection('admins').get();
    admins.docs.forEach(d => {
      const a = d.data() || {};
      if (a.status !== 'revoked' && a.status !== 'inactive' && isValidEmail(a.email || '')) out.add(String(a.email).trim().toLowerCase());
    });
  }
  if (extraEmail && isValidEmail(extraEmail)) out.add(String(extraEmail).trim().toLowerCase());
  return [...out];
}

function backupEmailHtml({ stamp, docCount, collections, sizeKb, trigger }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B">
      <h2 style="margin:0 0 8px;color:#0A1D47">K&amp;A Clinic — Database Backup</h2>
      <p style="margin:0 0 14px;color:#475569">${trigger === 'manual' ? 'Manual' : 'Scheduled'} backup completed. The attached file is a gzip-compressed JSON export of the clinic database.</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#64748B">Snapshot</td><td>${stamp}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748B">Records</td><td>${docCount}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748B">Collections</td><td>${collections}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748B">Size</td><td>${sizeKb} KB (compressed)</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8">Keep this file private — it contains patient records. To restore, contact your system administrator.</p>
    </div>`;
}

async function performBackup(trigger, extraEmail) {
  const startedAt = Date.now();
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
  const filename = `kna-backup-${stamp}.json.gz`;

  try {
    const settings = await readSettingsDoc();

    const dump = { exportedAt: new Date(startedAt).toISOString(), trigger, collections: {} };
    let docCount = 0;
    for (const name of BACKUP_COLLECTIONS) {
      const snap = await db.collection(name).get();
      dump.collections[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docCount += snap.size;
    }
    const gz = gzipSync(Buffer.from(JSON.stringify(dump), 'utf8'), { level: 9 });
    if (gz.length > BACKUP_MAX_ATTACHMENT_BYTES) {
      throw new Error(`Backup is ${(gz.length / 1048576).toFixed(1)} MB compressed — too large to email. Set FIREBASE_STORAGE_BUCKET to back up to Cloud Storage instead.`);
    }

    const recipients = await resolveBackupRecipients(settings, extraEmail);
    if (recipients.length === 0) {
      throw new Error('No backup recipient configured. Set the clinic email in Settings → Clinic Profile.');
    }

    const sizeKb = Math.round(gz.length / 1024);
    const mail = await sendMail({
      to: recipients.join(', '),
      subject: `[K&A Clinic] Database backup ${stamp.slice(0, 10)} (${trigger})`,
      html: backupEmailHtml({ stamp, docCount, collections: BACKUP_COLLECTIONS.length, sizeKb, trigger }),
      attachments: [{ filename, content: gz, contentType: 'application/gzip' }],
      role: 'auth',
    });
    if (mail.error) throw new Error(`Email delivery failed: ${mail.error}`);

    // Optional Cloud Storage copy — only when the project has a bucket.
    let storagePath = null;
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      try {
        const bucket = storageBucket();
        storagePath = `backups/${filename}`;
        await bucket.file(storagePath).save(gz, { contentType: 'application/gzip', resumable: false });
        const [files] = await bucket.getFiles({ prefix: 'backups/' });
        const sorted = files.map(f => f.name).sort();
        const stale = sorted.slice(0, Math.max(0, sorted.length - BACKUP_KEEP));
        await Promise.all(stale.map(n => bucket.file(n).delete().catch(() => {})));
      } catch (err) {
        console.warn('backup: storage copy failed (email copy succeeded):', err?.message);
        storagePath = null;
      }
    }

    const result = {
      status: 'ok', trigger, at: Date.now(), filename, sizeBytes: gz.length,
      docCount, collections: BACKUP_COLLECTIONS.length, recipients,
      storagePath, durationMs: Date.now() - startedAt, error: null,
    };
    await recordBackupResult(result);
    return result;
  } catch (err) {
    const result = {
      status: 'failed', trigger, at: Date.now(), filename,
      error: err?.message || 'Backup failed.', durationMs: Date.now() - startedAt,
    };
    console.error('backup error:', err);
    await recordBackupResult(result).catch(() => {});
    return result;
  }
}

// Manager pressed "Run Backup Now" — they get a copy too. Manager-only: the
// attachment is the entire patient database.
async function backupNow(req, res, caller) {
  if (caller?.data?.role !== 'manager' || caller?.data?.status !== 'active') {
    res.status(403).json({ success: false, error: 'Only an active manager can run a backup.' });
    return;
  }
  const result = await performBackup('manual', caller?.data?.email || '');
  res.status(result.status === 'ok' ? 200 : 500).json({ success: result.status === 'ok', result });
}

// Daily cron. Honour the configured frequency: weekly runs on Sundays (clinic
// time), off skips entirely. A manual run is never gated.
async function backupCron(req, res) {
  const settings = await readSettingsDoc();
  // 'hourly' existed in an earlier UI; Vercel Hobby crons are daily at most.
  const rawFreq = settings.system?.backupFrequency || 'daily';
  const freq = rawFreq === 'hourly' ? 'daily' : rawFreq;
  if (freq === 'off') {
    res.status(200).json({ success: true, skipped: 'backups set to Manual Only' });
    return;
  }
  if (freq === 'weekly') {
    const day = new Date(new Date().toLocaleString('en-US', { timeZone: CLINIC_TZ })).getDay();
    if (day !== 0) {
      res.status(200).json({ success: true, skipped: 'weekly backup runs on Sunday' });
      return;
    }
  }
  const result = await performBackup('scheduled');
  res.status(result.status === 'ok' ? 200 : 500).json({ success: result.status === 'ok', result });
}

const ADMIN_ACTIONS = { 'send-followup': sendFollowUp, backup: backupNow };
const OPEN_ACTIONS = { 'register-token': registerToken, 'set-avatar': setAvatar, 'update-profile': updateProfile, ack: acknowledge };
// Runs unattended on a schedule, so it authenticates with CRON_SECRET rather
// than an admin's ID token.
const CRON_ACTIONS = { 'dose-sweep': doseSweep, 'backup-cron': backupCron };

export default async function handler(req, res) {
  const action = (req.query?.action || req.body?.action || '').trim();

  // The email acknowledgement link and the cron sweep are GETs; everything
  // else is POST.
  const getAllowed = action === 'ack' || action === 'dose-sweep' || action === 'backup-cron';
  if (req.method !== 'POST' && !(req.method === 'GET' && getAllowed)) {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    if (Object.prototype.hasOwnProperty.call(CRON_ACTIONS, action)) {
      const secret = process.env.CRON_SECRET;
      if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
        res.status(401).json({ success: false, error: 'Unauthorized.' });
        return;
      }
      await CRON_ACTIONS[action](req, res);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(OPEN_ACTIONS, action)) {
      await OPEN_ACTIONS[action](req, res);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(ADMIN_ACTIONS, action)) {
      const caller = await requireAuthenticatedAdmin(req);
      if (caller.error) {
        res.status(caller.status).json({ success: false, error: caller.error });
        return;
      }
      await ADMIN_ACTIONS[action](req, res, caller);
      return;
    }

    res.status(400).json({ success: false, error: 'Unknown or missing action.' });
  } catch (err) {
    console.error(`notifications (${action}) error:`, err);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
}
