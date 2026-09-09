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
import { buildInviteEmailHtml } from './_lib/emailTemplate.js';
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
    // Re-invite: keep createdAt/name, just reset the invite state.
    await adminRef.update({ status: 'invited', invitedBy: manager.uid });
  } else {
    await adminRef.set({
      name: '',
      email,
      role: 'staff',
      invitedBy: manager.uid,
      status: 'invited',
      createdAt: Timestamp.now(),
      trustedDevices: {},
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  await db.collection('invites').doc(token).set({
    email,
    adminUid: userRecord.uid,
    expiresAt: Date.now() + INVITE_TTL_MS,
    used: false,
  });

  // A localhost invite link is both useless to the recipient and a strong
  // spam signal (the link's host doesn't resolve and matches nothing about
  // the sender), and APP_URL is easy to forget in a new deployment — so the
  // deployment's own host is used when no URL is configured, and localhost
  // survives only for local development.
  const configuredUrl = (process.env.APP_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
  const appUrl = configuredUrl
    || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://localhost:5173');
  const inviteUrl = `${appUrl}/accept-invite?token=${token}`;

  const { error: sendError } = await sendMail({
    to: email,
    // Naming the person who sent it reads as one-to-one correspondence rather
    // than an announcement, which is what keeps it out of Promotions.
    subject: manager.name
      ? `${manager.name} invited you to the K&A Clinic Admin Dashboard`
      : 'Your invite to the K&A Clinic Admin Dashboard',
    html: buildInviteEmailHtml({ inviteUrl, inviterName: manager.name }),
  });

  if (sendError) {
    console.error('Gmail send error:', sendError);
    res.status(502).json({ success: false, error: 'Failed to send the invite email. Please try again.' });
    return;
  }

  res.status(200).json({ success: true, message: `Invite sent to ${email}.` });
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

const ACTIONS = { invite, revoke, cancel };

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
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }

    await run(req, res, caller);
  } catch (err) {
    console.error(`admin-invites (${action}) error:`, err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
