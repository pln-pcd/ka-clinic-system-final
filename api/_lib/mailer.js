import nodemailer from 'nodemailer';

function getTransporter() {
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();
  if (!user || !pass) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is not set.');
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

function getFrom() {
  const user = (process.env.GMAIL_USER || '').trim();
  // Display name contains '&' which requires RFC 5322 double quotes
  return `"K&A Anti-Rabies Clinic" <${user}>`;
}

// Crude HTML-to-text fallback for the multipart/alternative text part.
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
    const transporter = getTransporter();
    const from = getFrom();
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      // Plaintext alternative prevents empty-text spam penalties
      text: text || htmlToText(html),
      replyTo: from,
      headers: {
        'X-Entity-Ref-ID': `kna-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...(headers || {}),
      },
      ...(attachments ? { attachments } : {}),
    });
    return { error: null, messageId: info?.messageId };
  } catch (err) {
    return { error: err };
  }
}

