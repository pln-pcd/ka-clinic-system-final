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
//   send-followup   — admin-only (requireAuthenticatedAdmin). Manual "Send
//                     Follow-up" button, and the automatic due-dose sweep.
//   ack             — deliberately UNAUTHENTICATED. It is reached by tapping a
//                     link in an email client, where no session exists. The
//                     unguessable notification id is the only credential, it
//                     can only ever flip one boolean to true on one document,
//                     and it returns no patient data. Same trade-off as a
//                     one-click unsubscribe link.
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db } from './_lib/firebaseAdmin.js';
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
        <tr><td style="background:#C8151A;padding:22px 32px;">
          <div style="font-size:17px;font-weight:bold;color:#FFFFFF;">K&amp;A Clinic</div>
          <div style="font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Anti-Rabies &amp; Animal Bite Center</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:${color};">${title}</h1>
          <p style="margin:0;font-size:14px;color:#3D3535;line-height:1.6;">${msg}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const ADMIN_ACTIONS = { 'send-followup': sendFollowUp };
const OPEN_ACTIONS = { 'register-token': registerToken, ack: acknowledge };

export default async function handler(req, res) {
  const action = (req.query?.action || req.body?.action || '').trim();

  // The email acknowledgement link is a GET; everything else is POST.
  if (req.method !== 'POST' && !(req.method === 'GET' && action === 'ack')) {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
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
