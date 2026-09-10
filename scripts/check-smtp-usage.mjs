import nodemailer from 'nodemailer';
import { db } from '../api/_lib/firebaseAdmin.js';

async function main() {
  console.log('=== CHECKING GMAIL SMTP & DATABASE USAGE ===');
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();

  console.log(`Configured Sender: ${user}`);
  
  // 1. Check SMTP Connection
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    console.log('SMTP Status: ACTIVE & VERIFIED (Google accepted authentication)');
  } catch (err) {
    console.log('SMTP Status: FAILED/THROTTLED -', err.message);
  }

  // 2. Query Firestore for emails sent in the last 24 hours
  const now = Date.now();
  const past24h = now - 24 * 60 * 60 * 1000;
  const past7d = now - 7 * 24 * 60 * 60 * 1000;

  try {
    // Check patientNotifications
    const notifSnap = await db.collection('patientNotifications').get();
    let notifsLast24h = 0;
    let notifsLast7d = 0;
    let notifsTotal = notifSnap.size;

    notifSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || (d.timestamp ? d.timestamp.toMillis?.() : 0);
      if (t >= past24h) notifsLast24h++;
      if (t >= past7d) notifsLast7d++;
    });

    // Check otps (admin otps)
    const otpSnap = await db.collection('otps').get();
    let otpsLast24h = 0;
    let otpsTotal = otpSnap.size;
    otpSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || 0;
      if (t >= past24h) otpsLast24h++;
    });

    // Check otpVerifications (patient otps)
    const patientOtpSnap = await db.collection('otpVerifications').get();
    let patientOtpsLast24h = 0;
    let patientOtpsTotal = patientOtpSnap.size;
    patientOtpSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || (d.updatedAt || 0);
      if (t >= past24h) patientOtpsLast24h++;
    });

    // Check invites
    const invitesSnap = await db.collection('invites').get();
    let invitesLast24h = 0;
    let invitesTotal = invitesSnap.size;
    invitesSnap.forEach(doc => {
      const d = doc.data();
      const t = d.createdAt || 0;
      if (t >= past24h) invitesLast24h++;
    });

    console.log('\n--- Application Email Triggers Recorded in Database ---');
    console.log(`Patient Notifications (Last 24h): ${notifsLast24h} (Total in DB: ${notifsTotal})`);
    console.log(`Admin Sign-in OTPs (Last 24h): ${otpsLast24h} (Total in DB: ${otpsTotal})`);
    console.log(`Patient Portal OTPs (Last 24h): ${patientOtpsLast24h} (Total in DB: ${patientOtpsTotal})`);
    console.log(`Staff Invites (Last 24h): ${invitesLast24h} (Total in DB: ${invitesTotal})`);
    
    const estimatedTotal24h = notifsLast24h + otpsLast24h + patientOtpsLast24h + invitesLast24h;
    console.log(`\nEstimated App Emails sent in the past 24 hours: ${estimatedTotal24h}`);

  } catch (dbErr) {
    console.log('Database query error:', dbErr.message);
  }
}

main().catch(console.error);
