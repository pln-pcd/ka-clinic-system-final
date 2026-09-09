// Shared transactional email shell for every message the clinic sends.
//
// Constraints these templates are written against:
//   * Table-based layout with inline styles only — Gmail/Outlook strip <style>
//     blocks and ignore most modern CSS.
//   * No images or web fonts. An image-heavy mail with little text is a spam
//     signal, and remote images are blocked by default anyway, so a logo would
//     render as a broken box for most recipients. The wordmark is live text.
//   * Every send also carries a plaintext part — see _lib/mailer.js.
// Palette matches the patient app's navy (see patient-app/app/auth/*.tsx
// NAVY_BLUE) so a code that arrives by mail looks like it came from the same
// product as the screen the patient is typing it into.
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

const CLINIC_NAME = 'K&amp;A Anti-Rabies Clinic';
const CLINIC_TAGLINE = 'ANTI-RABIES CARE SYSTEM';
const CLINIC_FOOTER = 'K&amp;A Anti-Rabies Vaccine Clinic — Libon, Albay';

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
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${preheader}</div>
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
                            <a href="${href}" style="display:inline-block;padding:15px 44px;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;letter-spacing:.2px;">${label}</a>
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

export function buildOtpEmailHtml({ otp }) {
  return shell({
    title: 'Your K&amp;A Clinic verification code',
    preheader: `${otp} is your K&amp;A Clinic verification code. It expires in 5 minutes.`,
    body: [
      heading('Verify your sign-in'),
      paragraph('Enter this code in the K&amp;A Clinic Patient App to finish signing in.'),
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

// Manager → staff invite email — includes the accept-invite link (valid 48 hours).
export function buildInviteEmailHtml({ inviteUrl, inviterName }) {
  const invitedBy = inviterName
    ? `${inviterName} has invited you`
    : 'You have been invited';
  return shell({
    title: 'You are invited to K&amp;A Clinic Admin',
    preheader: 'Set up your K&amp;A Clinic Admin Dashboard account. This invite expires in 48 hours.',
    body: [
      heading('You are invited to K&amp;A Clinic Admin'),
      paragraph(`${invitedBy} to join the K&amp;A Clinic Admin Dashboard as staff. Use the button below to set your password and finish setting up your account.`, 26),
      button(inviteUrl, 'Accept Invite'),
      fallbackLink(inviteUrl),
      footnote('This invite expires in 48 hours. If you were not expecting it, you can safely ignore this email.'),
    ].join('\n'),
  });
}

// Patient follow-up / reminder mail. Sent two ways: automatically when the
// clinic's schedule says a dose is due, and manually when an admin presses
// "Send Follow-up" on a patient record.
//
// `ackUrl` is a one-tap acknowledgement link — the patient confirms they got
// the notification without signing in, and the click is recorded against the
// notification doc (see api/notifications.js, action `ack`). It is omitted
// when no acknowledgement is wanted.
export function buildFollowUpEmailHtml({ patientName, message, ackUrl, doseLabel, dueDate }) {
  const greeting = patientName ? `Dear ${patientName},` : 'Dear Patient,';
  const scheduleLine = doseLabel && dueDate
    ? paragraph(`<strong>${doseLabel}</strong> is scheduled for <strong>${dueDate}</strong>.`)
    : '';
  return shell({
    title: 'K&amp;A Clinic follow-up reminder',
    preheader: message
      ? String(message).slice(0, 120)
      : 'A follow-up reminder from your K&A Anti-Rabies Clinic care team.',
    body: [
      heading('Follow-up reminder'),
      paragraph(greeting),
      paragraph(message || 'This is a reminder from K&amp;A Clinic about your anti-rabies treatment schedule. Please visit the clinic on your scheduled date to stay on track.'),
      scheduleLine,
      ackUrl ? button(ackUrl, 'I received this notification') : '',
      ackUrl
        ? footnote('Tapping the button above simply lets the clinic know this reminder reached you. You can also confirm from the K&amp;A Clinic Patient App.')
        : footnote('If you have already completed this visit, you can ignore this reminder.'),
    ].filter(Boolean).join('\n'),
  });
}
