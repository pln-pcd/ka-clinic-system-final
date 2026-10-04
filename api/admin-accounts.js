// Admin roster endpoints, served by one serverless function (Vercel's Hobby
// plan caps a deployment at 12). Every old URL still works: vercel.json
// rewrites each one here with ?route=<old name>.
//
//   /api/admin-invites   -> adminInvites  (manager-only: invite, revoke, ...)
//   /api/accept-invite   -> acceptInvite  (unauthenticated: invite token)
//
// The two keep separate trust boundaries: adminInvites checks for an active
// manager before any of its actions, and acceptInvite checks the single-use
// invite token. The router only picks the handler; it grants nothing.
import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { auth, db } from './_lib/firebaseAdmin.js';
import { requireActiveManager } from './_lib/auth.js';
import { isValidEmail, sendMail } from './_lib/mail/mailer.js';
import { buildInviteEmailHtml, buildInviteEmailText } from './_lib/mail/templates.js';
import { dispatch } from './_lib/router.js';
import { passwordPolicyError } from './_lib/passwordPolicy.js';

// ══════════════════════════════════════════════════════════════════════════
// Roster management (manager only): /api/admin-invites
// ══════════════════════════════════════════════════════════════════════════
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
// routing mistake becomes a privilege-escalation bug. (accept-invite now
// shares this serverless function through api/admin-accounts.js, but as its
// own handler with its own token check; the manager check below still runs
// before every action here.)


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

// Manager permanently deletes a revoked account: its admins/{uid} doc, its
// Firebase Auth user (if one exists) and any invite links still pointing at
// it. Only revoked accounts qualify, and never the caller's own.
async function deleteRevoked(req, res, caller) {
  const targetUid = (req.body?.uid || '').trim();
  if (!targetUid) {
    res.status(400).json({ success: false, error: 'Missing admin uid.' });
    return;
  }
  if (targetUid === caller.uid) {
    res.status(400).json({ success: false, error: "You can't delete your own account." });
    return;
  }

  const targetRef = db.collection('admins').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    res.status(404).json({ success: false, error: 'Admin not found.' });
    return;
  }
  const target = targetSnap.data();
  if (target.status !== 'revoked') {
    res.status(400).json({ success: false, error: 'Only revoked accounts can be deleted. Revoke it first.' });
    return;
  }

  // Invalidate invite links by email and by the reserved uid (a "Pending
  // Setup" entry may have no email on its doc).
  const email = (target.email || '').trim().toLowerCase();
  const inviteRefs = new Map();
  const byUid = await db.collection('invites').where('adminUid', '==', targetUid).get();
  byUid.forEach(d => inviteRefs.set(d.id, d.ref));
  if (email) {
    const byEmail = await db.collection('invites').where('email', '==', email).get();
    byEmail.forEach(d => inviteRefs.set(d.id, d.ref));
  }
  if (inviteRefs.size) {
    const batch = db.batch();
    inviteRefs.forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  await targetRef.delete();
  try {
    await auth.deleteUser(targetUid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') console.warn('Could not delete auth user for revoked admin:', err);
  }

  res.status(200).json({ success: true, message: `${target.name || target.email || 'The account'} has been deleted.` });
}

const INVITE_ACTIONS = { invite, revoke, cancel, getLink, 'get-link': getLink, delete: deleteRevoked };

async function adminInvites(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.body?.action || '').trim();
  const run = Object.prototype.hasOwnProperty.call(INVITE_ACTIONS, action) ? INVITE_ACTIONS[action] : null;
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

// ══════════════════════════════════════════════════════════════════════════
// Accept an invitation (invite token): /api/accept-invite
// ══════════════════════════════════════════════════════════════════════════
// Batch 2 — invitee completes signup: validate the token server-side
// (again — the frontend already did a client-side read to pre-fill the
// form, but that read is not trustworthy on its own), finalize their
// admins/{uid} doc, and mark the invite used.

async function acceptInvite(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const token = (req.body?.token || '').trim();
    const name = (req.body?.name || '').trim();
    const password = req.body?.password || '';

    if (!token) {
      res.status(400).json({ success: false, error: 'Missing invite token.' });
      return;
    }
    if (!name || name.length > 100) {
      res.status(400).json({ success: false, error: 'Please enter your full name.' });
      return;
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      res.status(400).json({ success: false, error: policyError });
      return;
    }

    const inviteRef = db.collection('invites').doc(token);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      res.status(400).json({ success: false, error: 'This invite link is invalid.' });
      return;
    }

    const invite = inviteSnap.data();
    if (invite.used) {
      res.status(400).json({ success: false, error: 'This invite link has already been used.' });
      return;
    }
    if (Date.now() >= invite.expiresAt) {
      res.status(400).json({ success: false, error: 'This invite link has expired. Ask your manager to send a new one.' });
      return;
    }

    const adminRef = db.collection('admins').doc(invite.adminUid);
    const adminSnap = await adminRef.get();
    if (!adminSnap.exists) {
      res.status(400).json({ success: false, error: 'This invite is no longer valid.' });
      return;
    }
    const admin = adminSnap.data();
    if (admin.status !== 'invited') {
      res.status(400).json({ success: false, error: 'This invite has already been completed or is no longer valid.' });
      return;
    }

    // The Auth user's uid was reserved (no password) when the invite was
    // sent, so this is where their real credential — name + password —
    // actually gets set for the first time.
    await auth.updateUser(invite.adminUid, { displayName: name, password });

    await adminRef.update({ name, status: 'active' });
    await inviteRef.update({ used: true });

    res.status(200).json({ success: true, message: 'Your account is active. You can now log in.' });
  } catch (err) {
    console.error('accept-invite error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong completing your signup. Please try again.' });
  }
}

const ROUTES = {
  'admin-invites': adminInvites,
  'accept-invite': acceptInvite,
};

export default async function handler(req, res) {
  return dispatch(ROUTES, req, res);
}
