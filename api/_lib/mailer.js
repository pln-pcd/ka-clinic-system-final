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
    const sender = process.env.GMAIL_USER;
    await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
      // Plaintext alternative — see htmlToText above.
      text: text || htmlToText(html),
      // A real reply address matters to spam filters (and to recipients):
      // mail that can't be replied to reads as bulk.
      replyTo: FROM,
      // Envelope sender matched to the From address keeps SPF/DMARC aligned.
      envelope: sender ? { from: sender, to } : undefined,
      // Everything here is one-to-one mail a person triggered for one named
      // recipient, and it needs to land in the Primary tab — so the headers
      // that mark a message as *bulk* are deliberately absent. List-Unsubscribe
      // and Auto-Submitted are what a mailing list sets; on a personal invite
      // they tell Gmail to file this under Promotions/Updates, which is the
      // opposite of what this mail is for. X-Auto-Response-Suppress only stops
      // out-of-office replies bouncing back, and the per-message ref id keeps
      // Gmail from collapsing repeat sends into one thread.
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'X-Entity-Ref-ID': `kna-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...(headers || {}),
      },
      ...(attachments ? { attachments } : {}),
    });
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}
