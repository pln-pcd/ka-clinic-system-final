import { lookup } from 'node:dns/promises';
import nodemailer from 'nodemailer';

// Two Gmail accounts: the clinic's own address (sign-in codes, invites,
// report emails) and a reminders account (dose reminders). Each falls back
// to the other.
const ROLES = {
  auth: {
    name: 'auth',
    getUser: () => (process.env.GMAIL_AUTH_USER || process.env.GMAIL_USER || 'contact.knaclinic@gmail.com').trim(),
    getPass: () => (process.env.GMAIL_AUTH_PASSWORD || process.env.GMAIL_APP_PASSWORD || '').trim().replace(/\s+/g, ''),
    displayName: 'K&A Animal Bite Center',
    fallbackRoles: ['reminders'],
  },
  reminders: {
    name: 'reminders',
    getUser: () => (process.env.GMAIL_REMINDER_USER || 'delacruzpc15@gmail.com').trim(),
    getPass: () => (process.env.GMAIL_REMINDER_PASSWORD || '').trim().replace(/\s+/g, ''),
    displayName: 'K&A Animal Bite Center',
    fallbackRoles: ['auth'],
  },
  // Welcome mail sent when the clinic registers a new patient. Its own Gmail
  // account so onboarding volume never counts against the sign-in code or
  // reminder accounts' daily sending limits.
  welcome: {
    name: 'welcome',
    getUser: () => (process.env.GMAIL_WELCOME_USER || '').trim(),
    getPass: () => (process.env.GMAIL_WELCOME_PASSWORD || '').trim().replace(/\s+/g, ''),
    displayName: 'K&A Animal Bite Center',
    fallbackRoles: ['auth', 'reminders'],
  },
};

// Transports are cached per role for the life of the function instance. A
// fresh createTransport() per send meant a full TLS + SMTP AUTH handshake with
// Gmail on every OTP (1–3 s); a warm instance now reuses the pooled connection.
const transportCache = new Map();

// Gmail's SMTP host, looked up with the operating system's resolver.
//
// nodemailer resolves the host with Node's built-in DNS client, which queries
// the configured DNS servers directly. On some networks (a local DNS proxy on
// 127.0.0.1, a VPN, or a hotspot) those queries time out with
// "queryA ETIMEOUT smtp.gmail.com" even though the computer itself resolves
// the name instantly, and nodemailer gives up instead of falling back. Looking
// the address up the way the rest of the system does (dns.lookup) and handing
// nodemailer the IP avoids that; `servername` keeps TLS checking the
// certificate against smtp.gmail.com.
const GMAIL_HOST = 'smtp.gmail.com';

async function resolveGmailAddress() {
  try {
    const { address } = await lookup(GMAIL_HOST, { family: 4 });
    return address;
  } catch {
    return GMAIL_HOST; // let nodemailer try its own resolver as before
  }
}

async function getTransporterForRole(roleKey) {
  const roleConfig = ROLES[roleKey] || ROLES.auth;
  const user = roleConfig.getUser();
  const pass = roleConfig.getPass();
  if (!user || !pass) return null;
  const cacheKey = `${roleConfig.name}:${user}`;
  let transporter = transportCache.get(cacheKey);
  if (!transporter) {
    // Same settings as nodemailer's built-in "gmail" service (port 465, TLS),
    // with the host already resolved.
    transporter = nodemailer.createTransport({
      host: await resolveGmailAddress(),
      port: 465,
      secure: true,
      tls: { servername: GMAIL_HOST },
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

// A role whose Gmail login was rejected (wrong or revoked app password) is
// skipped for 15 minutes. Without this every report send first spent ~1 s on a
// TLS handshake and a failed AUTH with that account before falling back.
const AUTH_FAILURE_SKIP_MS = 15 * 60 * 1000;
const authFailedAt = new Map();
function isAuthFailure(err) {
  return err?.code === 'EAUTH' || err?.responseCode === 535 || err?.responseCode === 534;
}
function roleRecentlyRejected(roleKey) {
  const at = authFailedAt.get(roleKey);
  return Boolean(at && Date.now() - at < AUTH_FAILURE_SKIP_MS);
}

// Opens (and authenticates) the pooled connection for a role ahead of a send,
// following the same fallback chain as sendMail. Used when an admin opens the
// "Email report" box, so the click on Send does not pay for the handshake.
export async function warmMailer(role = 'auth') {
  if (process.env.FIRESTORE_EMULATOR_HOST) return { warmed: false, role: null };
  const initialRole = ROLES[role] ? role : 'auth';
  for (const r of [initialRole, ...(ROLES[initialRole]?.fallbackRoles || [])]) {
    if (roleRecentlyRejected(r)) continue;
    const config = await getTransporterForRole(r);
    if (!config) continue;
    try {
      await config.transporter.verify();
      return { warmed: true, role: r };
    } catch (err) {
      if (isAuthFailure(err)) authFailedAt.set(r, Date.now());
      forgetTransporter(r);
    }
  }
  return { warmed: false, role: null };
}

function forgetTransporter(roleKey) {
  const roleConfig = ROLES[roleKey] || ROLES.auth;
  const cacheKey = `${roleConfig.name}:${roleConfig.getUser()}`;
  transportCache.get(cacheKey)?.close();
  transportCache.delete(cacheKey);
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

// Reserved test domains (RFC 2606 / RFC 6761) can never receive mail. Sample
// patients use them, so sending would only produce bounces in the clinic's
// Gmail inbox and use up its daily sending limit.
const RESERVED_TEST_DOMAIN = /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|net|org)|[a-z0-9-]+\.(?:test|invalid|example|localhost))$/i;
export function isReservedTestAddress(address) {
  return RESERVED_TEST_DOMAIN.test(String(address || '').trim());
}

export async function sendMail({ to, subject, html, text, attachments, headers, role = 'auth' }) {
  // Never send to a reserved test domain. Callers get skipped: true (not an
  // error) and record the notification as not emailed.
  const recipients = (Array.isArray(to) ? to : String(to || '').split(',')).map(s => s.trim()).filter(Boolean);
  if (recipients.length && recipients.every(isReservedTestAddress)) {
    console.log(`[mailer] skipped test address. to=${recipients.join(',')} message suppressed`);
    return { error: null, skipped: 'test-address', messageId: null, sender: null, role };
  }

  // Under the Firebase Emulator nothing is emailed: demo accounts use
  // made-up addresses. The message is logged instead, and sign-in codes can
  // also be read from the emulator UI (patientLoginOtps / otpVerifications).
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`[mailer:emulator] not sent. to=${to} message suppressed`);
    return { error: null, messageId: 'emulator-log', sender: 'emulator', role };
  }

  const initialRole = ROLES[role] ? role : 'auth';
  const roleChain = [initialRole, ...(ROLES[initialRole]?.fallbackRoles || [])];

  let lastError = null;
  for (const r of roleChain) {
    if (roleRecentlyRejected(r) && r !== roleChain[roleChain.length - 1]) continue;
    const config = await getTransporterForRole(r);
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
      authFailedAt.delete(r);
      return { error: null, messageId: info?.messageId, sender: config.user, role: r };
    } catch (err) {
      console.warn(`[mailer] Send via ${r} (${config.user}) failed, attempting fallback:`, err.message);
      // Drop the pooled transport so the next send looks the address up again
      // and opens a fresh connection (e.g. after a network change).
      forgetTransporter(r);
      if (isAuthFailure(err)) authFailedAt.set(r, Date.now());
      lastError = err;
    }
  }

  return { error: lastError || new Error('All SMTP transports failed.') };
}

// The one email-address check every handler uses. Callers trim first.
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
