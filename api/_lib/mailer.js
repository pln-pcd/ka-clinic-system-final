// Gmail SMTP transport for admin-side email (OTP codes, invites).
// Mirrors the Resend SDK's `{ error }` return shape so callers don't
// need to change their try/catch handling — see send-admin-otp.js and
// invite-admin.js.
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const FROM = `K&A Anti-Rabies Clinic <${process.env.GMAIL_USER}>`;

// Crude HTML-to-text fallback for the multipart/alternative text part. A
// message with no plaintext alternative is one of the strongest spam signals
// there is, so every send gets one even when the caller doesn't supply it.
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|td)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map(line => line.trim()).join('\n')
    .trim();
}

export async function sendMail({ to, subject, html, text, attachments, headers }) {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
      // Plaintext alternative — see htmlToText above.
      text: text || htmlToText(html),
      // Transactional mail sent one-to-one in response to a user action.
      // Auto-Submitted and the unsubscribe pair tell filters this is
      // triggered mail rather than a bulk campaign.
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        ...(headers || {}),
      },
      ...(attachments ? { attachments } : {}),
    });
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}
