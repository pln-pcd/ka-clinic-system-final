// Emails a patient/clinic report — either as HTML body (bulk reports) or
// with a real PDF attachment (single-patient records, generated client-side
// via jsPDF and passed here as base64), sent through the same Gmail SMTP
// transport as OTP/invite emails. Auth-gated so only a signed-in admin can
// trigger a send.
import { requireAuthenticatedAdmin } from './_lib/adminAuth.js';
import { sendMail } from './_lib/mailer.js';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const caller = await requireAuthenticatedAdmin(req);
    if (caller.error) {
      res.status(caller.status).json({ success: false, error: caller.error });
      return;
    }

    const to = (req.body?.to || '').trim();
    const subject = (req.body?.subject || 'K&A Clinic Report').trim();
    const html = req.body?.html || '';
    const attachmentBase64 = req.body?.attachmentBase64 || '';
    const attachmentFilename = (req.body?.attachmentFilename || 'report.pdf').trim();

    if (!to || !isValidEmail(to)) {
      res.status(400).json({ success: false, error: 'Enter a valid recipient email address.' });
      return;
    }
    if (!html && !attachmentBase64) {
      res.status(400).json({ success: false, error: 'Missing report content.' });
      return;
    }

    const attachments = attachmentBase64
      ? [{ filename: attachmentFilename, content: attachmentBase64, encoding: 'base64' }]
      : undefined;

    const { error: sendError } = await sendMail({
      to,
      subject,
      html: html || '<p>Please find your K&amp;A Clinic report attached.</p>',
      attachments,
    });
    if (sendError) {
      console.error('send-patient-report mail error:', sendError);
      res.status(502).json({ success: false, error: 'Failed to send the email. Please try again.' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('send-patient-report error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong sending the report.' });
  }
}
