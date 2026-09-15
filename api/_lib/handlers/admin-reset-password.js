import { auth, db } from '../firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    const action = req.body?.action || '';
    const code = (req.body?.code || '').trim();
    const oobCode = (req.body?.oobCode || '').trim();
    const newPassword = req.body?.newPassword || '';

    if (!rawEmail || !rawEmail.includes('@')) {
      res.status(400).json({ success: false, error: 'Please enter your email address.' });
      return;
    }

    let user;
    try {
      user = await auth.getUserByEmail(rawEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        res.status(404).json({ success: false, error: 'Account not found.' });
        return;
      }
      throw err;
    }

    // Direct unlock action after client-side confirmPasswordReset
    if (action === 'unlock') {
      await db.collection('admins').doc(user.uid).update({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: Date.now(),
      }).catch(() => {});
      await db.collection('passwordResets').doc(user.uid).delete().catch(() => {});
      res.status(200).json({ success: true, message: 'Account unlocked.' });
      return;
    }

    if (!code && !oobCode) {
      res.status(400).json({ success: false, error: 'Please provide a verification code or reset link.' });
      return;
    }
    if (code && !/^\d{6}$/.test(code)) {
      res.status(400).json({ success: false, error: 'Please enter the 6-digit verification code.' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters long.' });
      return;
    }

    const resetRef = db.collection('passwordResets').doc(user.uid);
    const resetSnap = await resetRef.get();

    if (!resetSnap.exists) {
      res.status(400).json({ success: false, error: 'No active reset request found. Please request a new code.' });
      return;
    }

    const resetData = resetSnap.data();

    if (Date.now() >= resetData.expiresAt) {
      await resetRef.delete();
      res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
      return;
    }

    if (code && resetData.code !== code) {
      res.status(400).json({ success: false, error: 'Incorrect verification code. Please check your email.' });
      return;
    }

    if (oobCode) {
      const match = (resetData.oobCode && resetData.oobCode === oobCode) ||
                    (resetData.token && resetData.token === oobCode) ||
                    (resetData.resetToken && resetData.resetToken === oobCode);
      if (!match) {
        res.status(400).json({ success: false, error: 'Invalid or expired reset link. Please request a new link.' });
        return;
      }
    }

    // Update password in Firebase Authentication
    await auth.updateUser(user.uid, {
      password: newPassword,
    });

    // Clean up reset doc
    await resetRef.delete();

    // Unlock admin account and reset failed attempts
    await db.collection('admins').doc(user.uid).update({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: Date.now(),
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('admin-reset-password error:', err);
    res.status(500).json({ success: false, error: 'Failed to update password. Please try again.' });
  }
}
