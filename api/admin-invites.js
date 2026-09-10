// Batch 2/6 — admin roster management, consolidated. Previously two
// serverless functions (invite-admin, revoke-admin); merged behind a single
// `action` field to stay under Vercel's 12-function Hobby cap. Both actions
// share one trust boundary — an active manager acting on somebody else's
// account — so requireActiveManager is enforced once, here, before any action
// runs. Behavior per action is unchanged from the originals.
//
// Deliberately NOT merged in: send-admin-otp/verify-admin-otp (an admin
// authenticating themselves, gated by requireAuthenticatedAdmin) and
// accept-invite (unauthenticated, gated by a single-use invite token). Those
// are different trust boundaries; folding them in here would put
// self-authentication and authorizing-others behind one dispatch, where a
// routing mistake becomes a privilege-escalation bug.
import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { auth, db } from './_lib/firebaseAdmin.js';
import { requireActiveManager } from './_lib/adminAuth.js';
import { isValidEmail } from './_lib/admins.js';
import { buildInviteEmailHtml, buildInviteEmailText } from './_lib/emailTemplate.js';
import { sendMail } from './_lib/mailer.js';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

// Manager invites a staff member by email.
async function invite(req, res, caller) {
  const manager = { uid: caller.uid, name: caller.data.name || '' };

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    return;
  }

  // Reserve the Firebase Auth uid now (no password yet — the invitee
  // sets their own password in accept-invite) so admins/{uid} can be
  // created immediately, matching the schema's uid-keyed shape rather
  // than waiting for accept-invite to create the user from scratch.
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    userRecord = await auth.createUser({ email });
  }

  const adminRef = db.collection('admins').doc(userRecord.uid);
  const existing = await adminRef.get();
  if (existing.exists && existing.data().status === 'active') {
    res.status(409).json({ success: false, error: 'This person is already an active admin.' });
    return;
  }

  // Re-inviting a previously revoked person must undo the Batch 6
  // revoke (Auth account disabled) — otherwise they'd accept the
  // invite, set a new password, and still be locked out.
  if (userRecord.disabled) {
    await auth.updateUser(userRecord.uid, { disabled: false });
  }

  if (existing.exists) {
    // Re-invite: keep createdAt/name, reset the invite state, and stamp when
    // this invite was actually sent. Without invitedAt a resend changed nothing
    // the dashboard could show — the list kept displaying the original invite
    // date, so the button looked like it had done nothing at all.
    await adminRef.update({ status: 'invited', invitedBy: manager.uid, invitedAt: Timestamp.now() });
  } else {
    await adminRef.set({
      name: '',
      email,
      role: 'staff',
      invitedBy: manager.uid,
      status: 'invited',
      createdAt: Timestamp.now(),
      invitedAt: Timestamp.now(),
      trustedDevices: {},
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  // Any invite link already out there for this address is retired first.
  // Minting a second token while the first stayed live meant a resend left
  // several working links, including the one in whatever mail prompted the
  // resend in the first place.
  const outstanding = await db.collection('invites')
    .where('email', '==', email)
    .where('used', '==', false)
    .get();
  await Promise.all(outstanding.docs.map(d => d.ref.delete()));

  const token = crypto.randomBytes(24).toString('base64url');
  await db.collection('invites').doc(token).set({
    email,
    adminUid: userRecord.uid,
    expiresAt: Date.now() + INVITE_TTL_MS,
    used: false,
  });

  // Derive app URL from request origin (matches caller's current environment) or configured public URL
  const requestOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
  const configuredUrl = (process.env.APP_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
  let appUrl = requestOrigin
    || (configuredUrl && !configuredUrl.includes('localhost') ? configuredUrl : '')
    || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'https://ka-clinic-admin-final.vercel.app');
  const inviteUrl = `${appUrl.replace(/\/+$/, '')}/accept-invite?token=${token}`;

  const { error: sendError } = await sendMail({
    to: email,
    subject: manager.name
      ? `${manager.name} invited you to the K&A Clinic Admin Dashboard`
      : 'Your invite to the K&A Clinic Admin Dashboard',
    html: buildInviteEmailHtml({ inviteUrl, inviterName: manager.name }),
    text: buildInviteEmailText({ inviteUrl, inviterName: manager.name }),
  });

  if (sendError) {
    console.error('Gmail send error:', sendError);
    const errText = sendError.message || String(sendError);
    const isLimitError = errText.includes('550') || errText.includes('limit') || errText.includes('EENVELOPE');
    if (isLimitError) {
      res.status(200).json({
        success: true,
        warning: 'Invite created, but Gmail daily sending limit was reached. You can copy and send the invite link directly.',
        email,
        inviteUrl,
        sentAt: Date.now(),
      });
      return;
    }
    res.status(502).json({ success: false, error: 'Failed to send the invite email. Please try again.', inviteUrl });
    return;
  }

  res.status(200).json({ success: true, message: `Invite sent to ${email}.`, email, inviteUrl, sentAt: Date.now() });
}

// Manager retrieves active invite link for a pending admin.
async function getLink(req, res, caller) {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ success: false, error: 'Missing email.' });
    return;
  }
  const snap = await db.collection('invites')
    .where('email', '==', email)
    .where('used', '==', false)
    .limit(1)
    .get();

  if (snap.empty) {
    res.status(404).json({ success: false, error: 'No active invite found for this email.' });
    return;
  }

  const token = snap.docs[0].id;
  const requestOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
  const configuredUrl = (process.env.APP_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
  let appUrl = requestOrigin
    || (configuredUrl && !configuredUrl.includes('localhost') ? configuredUrl : '')
    || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'https://ka-clinic-admin-final.vercel.app');
  const inviteUrl = `${appUrl.replace(/\/+$/, '')}/accept-invite?token=${token}`;
  res.status(200).json({ success: true, inviteUrl });
}

// Manager revokes a staff (or another manager's) account. Sets
// admins/{uid}.status = "revoked", disables the Firebase Auth account (Admin
// SDK), and revokes their refresh tokens so it takes effect on their very
// next API call, not just their next full sign-in.
async function revoke(req, res, caller) {
  const targetUid = (req.body?.uid || '').trim();
  if (!targetUid) {
    res.status(400).json({ success: false, error: 'Missing admin uid.' });
    return;
  }
  if (targetUid === caller.uid) {
    res.status(400).json({ success: false, error: "You can't revoke your own account." });
    return;
  }

  const targetRef = db.collection('admins').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    res.status(404).json({ success: false, error: 'Admin not found.' });
    return;
  }
  const target = targetSnap.data();

  if (target.status === 'revoked') {
    res.status(200).json({ success: true, message: 'Already revoked.' });
    return;
  }

  // Never leave the clinic with zero active managers.
  if (target.role === 'manager') {
    const managersSnap = await db.collection('admins')
      .where('role', '==', 'manager')
      .where('status', '==', 'active')
      .get();
    if (managersSnap.size <= 1) {
      res.status(400).json({ success: false, error: 'Cannot revoke the last active manager.' });
      return;
    }
  }

  await targetRef.update({ status: 'revoked' });
  await auth.updateUser(targetUid, { disabled: true });
  await auth.revokeRefreshTokens(targetUid);

  res.status(200).json({ success: true, message: `${target.name || target.email} has been revoked.` });
}

// Manager cancels an invite for a pending staff member.
async function cancel(req, res, caller) {
  const targetUid = (req.body?.uid || '').trim();
  if (!targetUid) {
    res.status(400).json({ success: false, error: 'Missing admin uid.' });
    return;
  }

  const targetRef = db.collection('admins').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    res.status(404).json({ success: false, error: 'Admin not found.' });
    return;
  }
  const target = targetSnap.data();

  // Invalidate any pending invite tokens in 'invites' collection
  const email = (target.email || '').trim().toLowerCase();
  if (email) {
    const invitesSnap = await db.collection('invites').where('email', '==', email).get();
    const batch = db.batch();
    invitesSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Delete the unaccepted admin doc
  await targetRef.delete();

  // Also remove from Firebase Auth if the account was just an unactivated invite
  try {
    await auth.deleteUser(targetUid);
  } catch (authErr) {
    console.warn('Could not delete auth user during cancel invite:', authErr);
  }

  res.status(200).json({ success: true, message: `Invitation for ${target.email || 'user'} has been cancelled.` });
}

const ACTIONS = { invite, revoke, cancel, getLink, 'get-link': getLink };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.body?.action || '').trim();
  const run = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!run) {
    res.status(400).json({ success: false, error: 'Unknown or missing action.' });
    return;
  }

  try {
    // Enforced once for every action — no action is reachable without an
    // authenticated, active manager.
    const caller = await requireActiveManager(req);
    if (caller.error) {
      try {
        import('node:fs').then(fs => fs.appendFileSync('api-debug.log', `[${new Date().toISOString()}] auth error: ${caller.status} ${caller.error}\n`));
      } catch {}
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }

    await run(req, res, caller);
  } catch (err) {
    console.error(`admin-invites (${action}) error:`, err);
    try {
      import('node:fs').then(fs => fs.appendFileSync('api-debug.log', `[${new Date().toISOString()}] ${action} catch error: ${err?.stack || err}\n`));
    } catch {}
    res.status(500).json({ success: false, error: err?.message || 'Something went wrong. Please try again.' });
  }
}
