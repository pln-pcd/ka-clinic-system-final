import nodemailer from 'nodemailer';

// Dedicated 3-Role SMTP configuration
const ROLES = {
  auth: {
    name: 'auth',
    getUser: () => (process.env.GMAIL_AUTH_USER || process.env.GMAIL_USER || 'contact.knaclinic@gmail.com').trim(),
    getPass: () => (process.env.GMAIL_AUTH_PASSWORD || process.env.GMAIL_APP_PASSWORD || '').trim().replace(/\s+/g, ''),
    displayName: 'K&A Animal Bite Center',
    fallbackRoles: ['appointments', 'reminders'],
  },
  appointments: {
    name: 'appointments',
    getUser: () => (process.env.GMAIL_APPT_USER || 'pcdelacruz04@gmail.com').trim(),
    getPass: () => (process.env.GMAIL_APPT_PASSWORD || '').trim().replace(/\s+/g, ''),
    displayName: 'K&A Animal Bite Center',
    fallbackRoles: ['reminders', 'auth'],
  },
  reminders: {
    name: 'reminders',
    getUser: () => (process.env.GMAIL_REMINDER_USER || 'delacruzpc15@gmail.com').trim(),
    getPass: () => (process.env.GMAIL_REMINDER_PASSWORD || '').trim().replace(/\s+/g, ''),
    displayName: 'K&A Animal Bite Center',
    fallbackRoles: ['appointments', 'auth'],
  },
};

// Transports are cached per role for the life of the function instance. A
// fresh createTransport() per send meant a full TLS + SMTP AUTH handshake with
// Gmail on every OTP (1–3 s); a warm instance now reuses the pooled connection.
const transportCache = new Map();

function getTransporterForRole(roleKey) {
  const roleConfig = ROLES[roleKey] || ROLES.auth;
  const user = roleConfig.getUser();
  const pass = roleConfig.getPass();
  if (!user || !pass) return null;
  const cacheKey = `${roleConfig.name}:${user}`;
  let transporter = transportCache.get(cacheKey);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 2,
      auth: { user, pass },
    });
    transportCache.set(cacheKey, transporter);
  }
  return {
    transporter,
    from: `"${roleConfig.displayName}" <${user}>`,
    user,
  };
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

export async function sendMail({ to, subject, html, text, attachments, headers, role = 'auth' }) {
  const initialRole = ROLES[role] ? role : 'auth';
  const roleChain = [initialRole, ...(ROLES[initialRole]?.fallbackRoles || [])];

  let lastError = null;
  for (const r of roleChain) {
    const config = getTransporterForRole(r);
    if (!config) continue;

    try {
      const info = await config.transporter.sendMail({
        from: config.from,
        to,
        subject,
        html,
        text: text || htmlToText(html),
        replyTo: config.from,
        headers: {
          'X-Entity-Ref-ID': `kna-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          ...(headers || {}),
        },
        ...(attachments ? { attachments } : {}),
      });
      return { error: null, messageId: info?.messageId, sender: config.user, role: r };
    } catch (err) {
      console.warn(`[mailer] Send via ${r} (${config.user}) failed, attempting fallback:`, err.message);
      lastError = err;
    }
  }

  return { error: lastError || new Error('All SMTP transports failed.') };
}

