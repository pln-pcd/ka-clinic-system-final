// Shared transactional email shell for every message the clinic sends.
//
// Constraints these templates are written against:
//   * Table-based layout with inline styles only — Gmail/Outlook strip <style>
//     blocks and ignore most modern CSS.
//   * No images or web fonts. An image-heavy mail with little text is a spam
//     signal, and remote images are blocked by default anyway, so a logo would
//     render as a broken box for most recipients. The wordmark is live text.
//   * Every send also carries a plaintext part — see _lib/mailer.js.
const BRAND_RED = '#C8151A';
const INK = '#1C1C1E';
const BODY_TEXT = '#3D3535';
const MUTED = '#7A6E6E';
const FOOTER_TEXT = '#A89E9E';
const PAGE_BG = '#F4F5F7';
const CARD_BORDER = '#E2E8F0';
const FOOTER_BG = '#FAF9F9';

const CLINIC_NAME = 'K&amp;A Anti-Rabies Clinic';
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
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background-color:#FFFFFF;border-radius:14px;border:1px solid ${CARD_BORDER};overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_RED};padding:22px 32px;">
                <span style="color:#FFFFFF;font-size:17px;font-weight:bold;letter-spacing:0.2px;">${CLINIC_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background-color:${FOOTER_BG};border-top:1px solid #E8E2E2;">
                <p style="margin:0;font-size:11px;color:${FOOTER_TEXT};line-height:1.6;">
                  ${CLINIC_FOOTER}<br>
                  This is an automated message sent because of activity on your account. Please do not reply.
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
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" style="padding:20px 16px;background-color:#FFF5F5;border:1px solid #FFD6D7;border-radius:10px;">
                      <div style="font-size:12px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">Verification Code</div>
                      <div style="font-size:34px;font-weight:bold;letter-spacing:9px;color:${BRAND_RED};font-family:'Courier New',Courier,monospace;line-height:1.1;">${otp}</div>
                      <div style="font-size:12px;color:${MUTED};margin-top:12px;">Expires in 5 minutes</div>
                    </td>
                  </tr>
                </table>`;
}

function heading(text) {
  return `                <h1 style="margin:0 0 12px;font-size:21px;font-weight:bold;color:${INK};line-height:1.3;">${text}</h1>`;
}

function paragraph(text, marginBottom = 24) {
  return `                <p style="margin:0 0 ${marginBottom}px;font-size:14px;color:${BODY_TEXT};line-height:1.6;">${text}</p>`;
}

// Security/footnote line, visually separated from the main copy.
function footnote(text) {
  return `                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EFEBEB;margin-top:4px;">
                  <tr>
                    <td style="padding-top:18px;">
                      <p style="margin:0;font-size:12.5px;color:${MUTED};line-height:1.6;">${text}</p>
                    </td>
                  </tr>
                </table>`;
}

function button(href, label) {
  return `                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" bgcolor="${BRAND_RED}" style="border-radius:8px;">
                      <a href="${href}" style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${label}</a>
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
      paragraph(`${invitedBy} to join the K&amp;A Clinic Admin Dashboard as staff. Use the button below to set up your account.`),
      button(inviteUrl, 'Accept Invite'),
      paragraph(`If the button does not work, copy and paste this link into your browser:<br><span style="color:${MUTED};font-size:12.5px;word-break:break-all;">${inviteUrl}</span>`, 4),
      footnote('This invite expires in 48 hours. If you were not expecting it, you can safely ignore this email.'),
    ].join('\n'),
  });
}
