// Shared transactional email shell for every message the clinic sends.
//
// Constraints these templates are written against:
//   * Table-based layout with inline styles only — Gmail/Outlook strip <style>
//     blocks and ignore most modern CSS.
//   * No remote images or web fonts: remote images are blocked by default in
//     many clients. The invite/report template carries the logo as an inline
//     CID attachment instead (./logo.js); the rest use a live-text wordmark.
//   * Every send also carries a plaintext part — see _lib/mail/mailer.js.
// Palette matches the patient app's navy (see patient-app/app/auth/*.tsx
// NAVY_BLUE) so a code that arrives by mail looks like it came from the same
// product as the screen the patient is typing it into.
import { LOGO_CID } from './logo.js';

const BRAND_NAVY = '#0A1D47';
const BRAND_NAVY_LIGHT = '#153A85';
const BRAND_BLUE = '#1D4ED8';
const ACCENT_SOFT = '#EEF3FC';
const ACCENT_BORDER = '#CFDDF5';
const INK = '#0F172A';
const BODY_TEXT = '#334155';
const MUTED = '#64748B';
const FOOTER_TEXT = '#8A99AE';
const PAGE_BG = '#EEF1F6';
const CARD_BORDER = '#DDE3ED';
const FOOTER_BG = '#F8FAFC';
const FOOTER_BORDER = '#E7EBF2';
const DIVIDER = '#E7EBF2';

const CLINIC_NAME = 'K&amp;A Animal Bite Center';
const CLINIC_TAGLINE = 'ANTI-RABIES CARE &amp; VACCINATION SYSTEM';
const CLINIC_FOOTER = 'K&amp;A Animal Bite Center — Libon, Albay';

// `preheader` is the grey snippet the inbox shows next to the subject. Without
// one, clients scrape the first visible text, which reads badly in the list.
function shell({ title, preheader, body }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;background-color:#FFFFFF;border-radius:16px;border:1px solid ${CARD_BORDER};overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_NAVY};background:linear-gradient(135deg,${BRAND_NAVY} 0%,${BRAND_NAVY_LIGHT} 100%);padding:26px 34px 24px;border-bottom:4px solid ${BRAND_BLUE};">
                <div style="color:#FFFFFF;font-size:18px;font-weight:bold;letter-spacing:0.2px;line-height:1.2;">${CLINIC_NAME}</div>
                <div style="color:#A8C0EA;font-size:10.5px;font-weight:bold;letter-spacing:2.2px;margin-top:7px;">${CLINIC_TAGLINE}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px;">
${body}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 34px;background-color:${FOOTER_BG};border-top:1px solid ${FOOTER_BORDER};">
                <p style="margin:0;font-size:11px;color:${FOOTER_TEXT};line-height:1.65;">
                  <span style="color:${MUTED};font-weight:bold;">${CLINIC_FOOTER}</span><br>
                  Sent automatically because of activity on your account. Reply to this email if you need help from the clinic.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Big letter-spaced code block, shared by both OTP mails.
function codeBlock(otp) {
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
                  <tr>
                    <td align="center" style="padding:26px 16px 22px;background-color:${ACCENT_SOFT};border:1px solid ${ACCENT_BORDER};border-radius:14px;">
                      <div style="font-size:10.5px;font-weight:bold;color:${BRAND_BLUE};text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;">Verification Code</div>
                      <div style="font-size:38px;font-weight:bold;letter-spacing:10px;color:${BRAND_NAVY};font-family:'Consolas','Courier New',Courier,monospace;line-height:1.1;padding-left:10px;">${otp}</div>
                      <div style="margin-top:16px;">
                        <span style="display:inline-block;padding:5px 14px;background-color:#FFFFFF;border:1px solid ${ACCENT_BORDER};border-radius:999px;font-size:11.5px;color:${MUTED};font-weight:bold;">Expires in 5 minutes</span>
                      </div>
                    </td>
                  </tr>
                </table>`;
}

function heading(text) {
  return `                <h1 style="margin:0 0 14px;font-size:22px;font-weight:bold;color:${INK};line-height:1.3;letter-spacing:-0.2px;">${text}</h1>`;
}

function paragraph(text, marginBottom = 24) {
  return `                <p style="margin:0 0 ${marginBottom}px;font-size:14px;color:${BODY_TEXT};line-height:1.6;">${text}</p>`;
}

// Security/footnote line, visually separated from the main copy.
function footnote(text) {
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${DIVIDER};margin-top:4px;">
                  <tr>
                    <td style="padding-top:20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="width:3px;background-color:${ACCENT_BORDER};border-radius:2px;">&nbsp;</td>
                          <td style="padding-left:14px;">
                            <p style="margin:0;font-size:12.5px;color:${MUTED};line-height:1.65;">${text}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>`;
}

function button(href, label) {
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px;">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" bgcolor="${BRAND_NAVY}" style="border-radius:10px;background-color:${BRAND_NAVY};background:linear-gradient(135deg,${BRAND_NAVY} 0%,${BRAND_NAVY_LIGHT} 100%);">
                            <a href="${href}" download="ka-clinic.apk" style="display:inline-block;padding:15px 44px;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;letter-spacing:.2px;">${label}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>`;
}

// The invite's fallback URL is long and token-bearing. Left as a bare link it
// overflowed the card and read as link-spam; boxed and wrapped, it stays
// inside the layout and looks like what it is.
function fallbackLink(href) {
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
                  <tr>
                    <td style="padding:14px 16px;background-color:${FOOTER_BG};border:1px solid ${DIVIDER};border-radius:10px;">
                      <div style="font-size:12px;color:${MUTED};margin-bottom:7px;">Button not working? Paste this link into your browser:</div>
                      <a href="${href}" style="font-size:12px;color:${BRAND_BLUE};text-decoration:none;word-break:break-all;line-height:1.5;">${href}</a>
                    </td>
                  </tr>
                </table>`;
}

// Patient app code. `purpose` is 'signup' (creating the app account from an
// MRN) or 'signin' (second step after the password); only the wording differs.
const OTP_WORDING = {
  signup: { heading: 'Verify your email', action: 'finish signing up' },
  signin: { heading: 'Verify your sign-in', action: 'finish signing in' },
};

export function buildOtpEmailHtml({ otp, purpose = 'signin' }) {
  const w = OTP_WORDING[purpose] || OTP_WORDING.signin;
  return shell({
    title: 'Your K&amp;A Clinic verification code',
    preheader: `${otp} is your K&amp;A Clinic verification code. It expires in 5 minutes.`,
    body: [
      heading(w.heading),
      paragraph(`Enter this code in the K&amp;A Clinic Patient App to ${w.action}.`),
      codeBlock(otp),
      footnote('If you did not request this code, you can safely ignore this email. Never share this code with anyone — clinic staff will never ask you for it.'),
    ].join('\n'),
  });
}

// Admin Dashboard sign-in code — second factor after the password.
export function buildAdminOtpEmailHtml({ otp }) {
  return shell({
    title: 'Your K&amp;A Clinic admin sign-in code',
    preheader: `${otp} is your K&amp;A Clinic Admin Dashboard sign-in code. It expires in 5 minutes.`,
    body: [
      heading('Admin sign-in code'),
      paragraph('Enter this code to finish signing in to the K&amp;A Clinic Admin Dashboard.'),
      codeBlock(otp),
      footnote('If you did not just enter your password on the Admin Dashboard, ignore this email and change your password. Never share this code with anyone.'),
    ].join('\n'),
  });
}

// Password Reset email with branded CTA button directly to the portal.
export function buildPasswordResetEmailHtml({ resetUrl, email, name }) {
  const greeting = name ? `Hello <strong>${name}</strong>,` : 'Hello,';
  const preheaderText = 'Reset your K&A Animal Bite Center password. Link is valid for 15 minutes.';

  const resetCard = `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFFFFF;border-bottom:1px solid #EDF2F7;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td>
                            <div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:3px;">Account Security</div>
                            <div style="font-size:15px;font-weight:bold;color:#0F172A;">Password Reset Request</div>
                          </td>
                          <td align="right">
                            <span style="display:inline-block;padding:4px 10px;background-color:#EFF6FF;color:#1D4ED8;font-size:10px;font-weight:bold;border-radius:999px;letter-spacing:0.5px;text-transform:uppercase;">Admin Portal</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;color:#334155;line-height:1.6;">
                        ${email ? `<tr>
                          <td style="padding-bottom:6px;width:120px;color:#64748B;font-size:12px;font-weight:600;">Account Email:</td>
                          <td style="padding-bottom:6px;font-weight:bold;color:#0F172A;font-size:13px;">${email}</td>
                        </tr>` : ''}
                        <tr>
                          <td style="padding-bottom:6px;width:120px;color:#64748B;font-size:12px;font-weight:600;">Valid Duration:</td>
                          <td style="padding-bottom:6px;color:#D97706;font-weight:600;font-size:12px;">15 Minutes</td>
                        </tr>
                        <tr>
                          <td style="width:120px;color:#64748B;font-size:12px;font-weight:600;">Action Type:</td>
                          <td style="color:#059669;font-weight:600;font-size:12px;">Secure One-Time Link</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>`;

  const bodyParts = [
    heading('Reset Your Password'),
    paragraph(greeting),
    paragraph('We received a request to reset your password for the <strong>K&amp;A Animal Bite Center</strong> administration system. Click the button below to create your new password:'),
    resetCard,
  ];

  const targetUrl = resetUrl || 'https://ka-clinic-system-final.vercel.app/?mode=resetPassword';
  bodyParts.push(button(targetUrl, 'Reset Password Now'));
  bodyParts.push(fallbackLink(targetUrl));

  bodyParts.push(
    footnote('If you did not request this password reset, please safely ignore this email. Your password will remain unchanged and your account is secure. Never share or forward this email to anyone.')
  );

  return shell({
    title: 'Reset Your K&amp;A Animal Bite Center Password',
    preheader: preheaderText,
    body: bodyParts.join('\n'),
  });
}

// ─────────────────────── CLEAN TEMPLATE (invites, reports) ───────────────────────
// A quieter layout than shell(): white page, the clinic logo at the top, dark
// text, one primary button, a hairline divider and a small grey footer. The
// logo is an inline CID attachment (see ./logo.js), so callers must add
// logoAttachment() to the message's attachments.
const CLINIC_ADDRESS = 'San Juan St., Libon, Albay';
const CLEAN_INK = '#111827';
const CLEAN_TEXT = '#374151';
const CLEAN_MUTED = '#6B7280';
const CLEAN_RULE = '#E5E7EB';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanShell({ title, preheader, body, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
            <tr>
              <td style="padding:0 4px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <img src="cid:${LOGO_CID}" width="44" height="44" alt="K&amp;A" style="display:block;width:44px;height:44px;border:0;outline:none;">
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="font-size:15px;font-weight:bold;color:${CLEAN_INK};line-height:1.25;">${CLINIC_NAME}</div>
                      <div style="font-size:12px;color:${CLEAN_MUTED};line-height:1.4;">Anti-Rabies Care &amp; Vaccination</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 4px 8px;border-top:1px solid ${CLEAN_RULE};font-size:15px;line-height:1.65;color:${CLEAN_TEXT};">
${body}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;border-top:1px solid ${CLEAN_RULE};">
                <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${CLEAN_MUTED};"><strong style="color:${CLEAN_TEXT};">${CLINIC_NAME}</strong> &middot; ${CLINIC_ADDRESS}</p>
                ${footerNote ? `<p style="margin:0;font-size:12px;line-height:1.6;color:${CLEAN_MUTED};">${footerNote}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function cleanParagraph(html, marginBottom = 16) {
  return `                <p style="margin:0 0 ${marginBottom}px;font-size:15px;line-height:1.65;color:${CLEAN_TEXT};">${html}</p>`;
}

// One solid dark button. bgcolor on the cell keeps it filled in Outlook; the
// padded <a> gives Gmail (web and mobile) a full-size tap target.
function cleanButton(href, label) {
  return `                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                  <tr>
                    <td align="center" bgcolor="${BRAND_NAVY}" style="border-radius:8px;background-color:${BRAND_NAVY};">
                      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${label}</a>
                    </td>
                  </tr>
                </table>`;
}

// Manager → nurse invitation (role value stays "staff").
export function buildInviteEmailHtml({ inviteUrl, inviterName }) {
  const who = inviterName ? `<strong style="color:${CLEAN_INK};">${escapeHtml(inviterName)}</strong> has invited you` : 'You have been invited';
  return cleanShell({
    title: 'Invitation to join K&amp;A Clinic as a nurse',
    preheader: 'You have been invited to join K&amp;A Clinic as a nurse / staff member. This link expires in 48 hours.',
    body: [
      `                <h1 style="margin:16px 0 16px;font-size:22px;line-height:1.3;font-weight:bold;color:${CLEAN_INK};">You're invited to join K&amp;A Clinic as a nurse</h1>`,
      cleanParagraph('Good day,'),
      cleanParagraph(`${who} to join <strong style="color:${CLEAN_INK};">K&amp;A Clinic</strong> as a nurse / staff member. Accept the invitation to set your password and sign in to the clinic dashboard.`),
      cleanButton(inviteUrl, 'Accept invitation'),
      cleanParagraph(`If the button doesn't work, copy this link into your browser:<br><a href="${inviteUrl}" target="_blank" style="color:${CLEAN_TEXT};word-break:break-all;font-size:13px;">${inviteUrl}</a>`, 24),
    ].join('\n'),
    footerNote: "This link expires in 48 hours. If you didn't expect this email, you can ignore it.",
  });
}

// Report email (clinic report, patient record, inventory report). The PDF is
// attached by the caller; this is the covering note.
//   recipientName  optional: "Good day, Maria," vs "Good day,"
//   reportName     e.g. "Clinic Report"
//   period         e.g. "September 2026" (optional)
//   generatedOn    e.g. "October 7, 2026"
//   summary        short lines, e.g. ["57 patients", "Filters: Category III"]
export function buildReportEmailHtml({ recipientName, reportName, period, generatedOn, summary = [] }) {
  const greeting = recipientName ? `Good day, ${escapeHtml(recipientName)},` : 'Good day,';
  const name = escapeHtml(reportName || 'report');
  const forPeriod = period ? ` for <strong style="color:${CLEAN_INK};">${escapeHtml(period)}</strong>` : '';
  const lines = (summary || []).filter(Boolean).map(escapeHtml);
  const summaryBlock = lines.length
    ? `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
                  <tr>
                    <td style="padding:12px 16px;border-left:3px solid ${CLEAN_RULE};background-color:#F9FAFB;font-size:14px;line-height:1.7;color:${CLEAN_TEXT};">
                      ${lines.join('<br>')}
                    </td>
                  </tr>
                </table>`
    : '';
  return cleanShell({
    title: `${name}${period ? ` – ${escapeHtml(period)}` : ''}`,
    preheader: `Attached: ${name}${period ? ` for ${escapeHtml(period)}` : ''} from the K&amp;A Animal Bite Center system.`,
    body: [
      '                <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>',
      cleanParagraph(greeting),
      cleanParagraph(`Please find attached the <strong style="color:${CLEAN_INK};">${name}</strong>${forPeriod}, generated from the K&amp;A Animal Bite Center system${generatedOn ? ` on ${escapeHtml(generatedOn)}` : ''}.`),
      summaryBlock,
      cleanParagraph(`Thank you,<br><strong style="color:${CLEAN_INK};">K&amp;A Animal Bite Center</strong>`, 24),
    ].filter(Boolean).join('\n'),
    footerNote: 'Sent from the K&amp;A Clinic admin dashboard. If you received this by mistake, please delete it and let the clinic know.',
  });
}

export function buildReportEmailText({ recipientName, reportName, period, generatedOn, summary = [] }) {
  const lines = [
    recipientName ? `Good day, ${recipientName},` : 'Good day,',
    '',
    `Please find attached the ${reportName || 'report'}${period ? ` for ${period}` : ''}, generated from the K&A Animal Bite Center system${generatedOn ? ` on ${generatedOn}` : ''}.`,
  ];
  const extra = (summary || []).filter(Boolean);
  if (extra.length) lines.push('', ...extra);
  lines.push('', 'Thank you,', `K&A Animal Bite Center · ${CLINIC_ADDRESS}`);
  return lines.join('\n');
}

// Patient follow-up / reminder mail. Sent two ways: automatically when the
// clinic's schedule says a dose is due, and manually when an admin presses
// "Send Follow-up" on a patient record.
//
// `ackUrl` is a one-tap acknowledgement link — the patient confirms they got
// the notification without signing in, and the click is recorded against the
// notification doc (see api/notifications.js, action `ack`). It is omitted
// when no acknowledgement is wanted.
export function buildFollowUpEmailHtml({ patientName, message, ackUrl, doseLabel, dueDate, vaccineType }) {
  const greeting = patientName ? `Dear ${patientName},` : 'Dear Patient,';
  const scheduleLine = doseLabel && dueDate
    ? paragraph(`<strong>${doseLabel}${vaccineType ? ` (${vaccineType})` : ''}</strong> is scheduled for <strong>${dueDate}</strong>.`)
    : (vaccineType && dueDate ? paragraph(`Upcoming <strong>${vaccineType}</strong> vaccination is scheduled for <strong>${dueDate}</strong>.`) : '');
  return shell({
    title: 'K&amp;A Clinic follow-up reminder',
    preheader: message
      ? String(message).slice(0, 120)
      : 'A follow-up reminder from your K&A Clinic care team.',
    body: [
      heading('Follow-up reminder'),
      paragraph(greeting),
      paragraph(message || `This is a reminder from K&amp;A Clinic about your ${vaccineType ? `${vaccineType} ` : ''}treatment schedule. Please visit the clinic on your scheduled date to stay on track.`),
      scheduleLine,
      ackUrl ? button(ackUrl, 'I received this notification') : '',
      ackUrl
        ? footnote('Tapping the button above simply lets the clinic know this reminder reached you. You can also confirm from the K&amp;A Clinic Patient App.')
        : footnote('If you have already completed this visit, you can ignore this reminder.'),
    ].filter(Boolean).join('\n'),
  });
}

// Numbered how-to step for the welcome email: badge left, title and detail right.
function step(number, title, detail) {
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
                  <tr>
                    <td valign="top" style="width:34px;">
                      <div style="width:26px;height:26px;line-height:26px;border-radius:999px;background-color:${BRAND_NAVY};color:#FFFFFF;font-size:13px;font-weight:bold;text-align:center;">${number}</div>
                    </td>
                    <td valign="top" style="padding-left:6px;">
                      <div style="font-size:14px;font-weight:bold;color:${INK};line-height:1.5;">${title}</div>
                      <div style="font-size:13px;color:${BODY_TEXT};line-height:1.6;margin-top:2px;">${detail}</div>
                    </td>
                  </tr>
                </table>`;
}

// MRN + email the patient will need, boxed so they are easy to find later.
function detailsCard(rows) {
  const cells = rows.map(([label, value]) => `                  <tr>
                    <td style="padding:10px 18px;font-size:11px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:1.2px;width:44%;">${label}</td>
                    <td style="padding:10px 18px;font-size:14px;font-weight:bold;color:${BRAND_NAVY};font-family:'Consolas','Courier New',Courier,monospace;">${value}</td>
                  </tr>`).join('\n');
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;background-color:${ACCENT_SOFT};border:1px solid ${ACCENT_BORDER};border-radius:14px;">
${cells}
                </table>`;
}

export const DEFAULT_PATIENT_APP_DOWNLOAD_URL = 'https://github.com/pln-pcd/ka-clinic-system-final/releases/download/v1.0.28/ka-clinic-1.0.28.apk';

// Sent once when the clinic registers a new patient on the admin dashboard
// (api/notifications.js, action `patient-welcome`). Tells the patient they
// are on file and walks them through installing the companion app, creating
// their password and signing in. `downloadUrl` defaults to the directly hosted APK.
export function buildPatientWelcomeEmailHtml({ patientName, mrn, email, downloadUrl }) {
  let activeDownloadUrl = (downloadUrl && /^https:\/\//i.test(downloadUrl))
    ? downloadUrl.trim()
    : DEFAULT_PATIENT_APP_DOWNLOAD_URL;
  // Always trigger direct auto-download; avoid navigating to GitHub release tag / web page
  if (!activeDownloadUrl.endsWith('.apk') || activeDownloadUrl.includes('/releases/tag') || !activeDownloadUrl.includes('/releases/download/')) {
    activeDownloadUrl = DEFAULT_PATIENT_APP_DOWNLOAD_URL;
  }
  const greeting = patientName ? `Dear ${escapeHtml(patientName)},` : 'Dear Patient,';
  const safeMrn = escapeHtml(mrn);
  const downloadDetail = activeDownloadUrl
    ? 'Tap the <strong>Download Android App (APK)</strong> button above on your Android phone to directly download and install the <strong>K&amp;A Clinic</strong> companion app. If your phone prompts, allow installing apps from this source.'
    : 'Ask the clinic front desk for the download link or QR code, then install the <strong>K&amp;A Clinic</strong> app on your Android phone.';
  return shell({
    title: 'You are registered at K&amp;A Animal Bite Center',
    preheader: `You are now registered at K&A Animal Bite Center. Your MRN is ${String(mrn || '')}. Get the companion app to follow your vaccination schedule.`,
    body: [
      heading('You are registered with the clinic'),
      paragraph(greeting),
      paragraph('Your patient record has been created at <strong>K&amp;A Animal Bite Center</strong>. You can follow your vaccination schedule, see your dose record, book appointments and message the clinic using our companion app, <strong>K&amp;A Clinic</strong>.'),
      detailsCard([
        ['Medical Record No. (MRN)', safeMrn],
        ['Email on file', escapeHtml(email)],
      ]),
      activeDownloadUrl ? button(activeDownloadUrl, 'Download Android App (APK)') : '',
      activeDownloadUrl ? fallbackLink(activeDownloadUrl) : '',
      `                <h2 style="margin:6px 0 16px;font-size:16px;font-weight:bold;color:${INK};">How to get started</h2>`,
      step(1, 'Download the app', downloadDetail),
      step(2, 'Sign up', `Open the app and tap <strong>Sign up</strong>. Enter your MRN <strong>${safeMrn}</strong> and tap <strong>Send OTP</strong>. A 6-digit code is sent to this email address. Enter it, then create your password.`),
      step(3, 'Sign in', `Enter your MRN <strong>${safeMrn}</strong> and your password, then tap <strong>Sign In</strong>. For your security, a code may be emailed to you to confirm it is really you.`),
      footnote('Keep your MRN private. Clinic staff will never ask for your password or your sign-in code. If you did not visit K&amp;A Animal Bite Center, reply to this email and let us know.'),
    ].filter(Boolean).join('\n'),
  });
}

/* ─────────────────────── PLAINTEXT ALTERNATIVES ───────────────────────
   Every message is multipart. mailer.js can scrape the HTML when nothing
   better is supplied, but a hand-written part reads like a real message
   and keeps the two halves saying the same thing — which is one of the
   few deliverability levers left when sending from a plain Gmail address. */

export function buildOtpEmailText({ otp, purpose = 'signin' }) {
  const w = OTP_WORDING[purpose] || OTP_WORDING.signin;
  return [
    w.heading,
    '',
    `Your K&A Clinic verification code is ${otp}.`,
    `Enter it in the K&A Clinic Patient App to ${w.action}. The code expires in 5 minutes.`,
    '',
    'If you did not request this code, you can ignore this email. Never share it with anyone.',
    '',
    'K&A Anti-Rabies Vaccine Clinic - Libon, Albay',
  ].join('\n');
}

export function buildAdminOtpEmailText({ otp }) {
  return [
    'Admin sign-in code',
    '',
    `Your K&A Clinic Admin Dashboard sign-in code is ${otp}.`,
    'It expires in 5 minutes.',
    '',
    'If you did not just enter your password on the Admin Dashboard, ignore this email and change your password.',
    '',
    'K&A Anti-Rabies Vaccine Clinic - Libon, Albay',
  ].join('\n');
}

export function buildPasswordResetEmailText({ resetUrl, email, name }) {
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const lines = [
    'Reset Your Password — K&A Animal Bite Center',
    '============================================',
    '',
    greeting,
    '',
    'We received a request to reset the password for your K&A Animal Bite Center administration account' + (email ? ` (${email}).` : '.'),
    '',
  ];

  if (resetUrl) {
    lines.push('Click or paste this link into your browser to choose your new password:');
    lines.push(resetUrl);
    lines.push('');
  }

  lines.push('This reset link is valid for 15 minutes.');
  lines.push('');
  lines.push('If you did not request this password reset, you can safely ignore this email. Your account remains secure.');
  lines.push('');
  lines.push('K&A Animal Bite Center — Libon, Albay');

  return lines.join('\n');
}

// Schedule-closure email (api/notifications.js saveClosure). Sent to every
// patient without the app. `when` is the closed period ("Sat, Oct 31" or
// "Sat, Oct 31, 3:00 PM - 4:00 PM"); `appointment` is the patient's own
// booking inside it ("Sat, Oct 31 at 3:00 PM - 4:00 PM") or empty when the
// email is only a notice. Patient and staff text is escaped.
export function buildScheduleClosureEmailHtml({ patientName, when, reason, appointment }) {
  const greeting = patientName ? `Hello ${escapeHtml(patientName)},` : 'Hello,';
  const reasonBox = `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
                  <tr>
                    <td style="padding:14px 16px;background-color:${FOOTER_BG};border:1px solid ${DIVIDER};border-radius:10px;">
                      <div style="font-size:11px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Reason</div>
                      <div style="font-size:14px;color:${INK};line-height:1.5;">${escapeHtml(reason)}</div>
                    </td>
                  </tr>
                </table>`;
  return shell({
    title: 'K&amp;A Clinic — Schedule closure',
    preheader: appointment
      ? `Your appointment on ${appointment} is affected by a clinic closure.`
      : `The clinic is closed for appointments on ${when}.`,
    body: [
      heading(appointment ? 'Your appointment is affected' : 'Clinic schedule closure'),
      paragraph(greeting),
      paragraph(`K&amp;A Animal Bite Center is closed for appointments on <strong>${escapeHtml(when)}</strong>.`, 16),
      reasonBox,
      appointment
        ? paragraph(`Your appointment on <strong>${escapeHtml(appointment)}</strong> is still on record. Please contact the clinic to move it to another date, or reschedule it in the K&amp;A Clinic app.`)
        : paragraph('Please choose another date if you plan to book a visit.'),
      footnote('Animal bite emergencies are still seen as walk-ins. For questions, reply to this email or contact the clinic.'),
    ].join('\n'),
  });
}

export function buildScheduleClosureEmailText({ patientName, when, reason, appointment }) {
  return [
    appointment ? 'Your appointment is affected — K&A Clinic' : 'Clinic schedule closure — K&A Clinic',
    '',
    patientName ? `Hello ${patientName},` : 'Hello,',
    '',
    `K&A Animal Bite Center is closed for appointments on ${when}.`,
    `Reason: ${reason}`,
    '',
    appointment
      ? `Your appointment on ${appointment} is still on record. Please contact the clinic to move it to another date, or reschedule it in the K&A Clinic app.`
      : 'Please choose another date if you plan to book a visit.',
    '',
    'Animal bite emergencies are still seen as walk-ins.',
    'K&A Animal Bite Center — Libon, Albay',
  ].join('\n');
}

export function buildInviteEmailText({ inviteUrl, inviterName }) {
  const invitedBy = inviterName ? `${inviterName} has invited you` : 'You have been invited';
  return [
    "You're invited to join K&A Clinic as a nurse",
    '',
    'Good day,',
    '',
    `${invitedBy} to join K&A Clinic as a nurse / staff member. Accept the invitation to set your password and sign in to the clinic dashboard:`,
    '',
    inviteUrl,
    '',
    'This link expires in 48 hours.',
    "If you didn't expect this email, you can ignore it.",
    '',
    `K&A Animal Bite Center · Libon, Albay`,
  ].join('\n');
}

export function buildPatientWelcomeEmailText({ patientName, mrn, email, downloadUrl }) {
  let activeDownloadUrl = (downloadUrl && /^https:\/\//i.test(downloadUrl))
    ? downloadUrl.trim()
    : DEFAULT_PATIENT_APP_DOWNLOAD_URL;
  // Always trigger direct auto-download; avoid navigating to GitHub release tag / web page
  if (/github\.com\/[^/]+\/[^/]+\/releases(\/tag|\/?$)/i.test(activeDownloadUrl)) {
    activeDownloadUrl = DEFAULT_PATIENT_APP_DOWNLOAD_URL;
  }
  return [
    'K&A Animal Bite Center — You are registered',
    '===========================================',
    '',
    patientName ? `Dear ${patientName},` : 'Dear Patient,',
    '',
    'Your patient record has been created at K&A Animal Bite Center. You can follow your',
    'vaccination schedule, see your dose record, book appointments and message the clinic',
    'using our companion app, K&A Clinic.',
    '',
    `Medical Record No. (MRN): ${mrn}`,
    `Email on file: ${email}`,
    '',
    'HOW TO GET STARTED',
    '',
    activeDownloadUrl
      ? `1. Download the app: open this link on your Android phone to directly download the APK:\n   ${activeDownloadUrl}`
      : '1. Download the app: ask the clinic front desk for the download link or QR code,\n   then install K&A Clinic on your Android phone.',
    `2. Sign up: open the app, tap "Sign up", enter your MRN ${mrn} and tap "Send OTP".`,
    '   A 6-digit code is sent to this email address. Enter it, then create your password.',
    `3. Sign in: enter your MRN ${mrn} and your password, then tap "Sign In".`,
    '   For your security, a code may be emailed to you to confirm it is really you.',
    '',
    'Keep your MRN private. Clinic staff will never ask for your password or sign-in code.',
    'If you did not visit K&A Animal Bite Center, reply to this email and let us know.',
    '',
    'K&A Animal Bite Center — Libon, Albay',
  ].join('\n');
}
