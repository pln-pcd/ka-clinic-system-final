// Batch 2 — invitee completes signup: validate the token server-side
// (again — the frontend already did a client-side read to pre-fill the
// form, but that read is not trustworthy on its own), finalize their
// admins/{uid} doc, and mark the invite used.
import { auth, db } from './_lib/firebaseAdmin.js';

export default async function handler(req, res) {
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
    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
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
