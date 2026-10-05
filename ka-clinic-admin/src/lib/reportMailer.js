// Emailing a PDF report from the export dialogs, in the background.
//
// Where the time used to go (measured Oct 2026): the PDF was built without
// compression and with the 500 px logo, so a one-page report was ~1.2 MB and
// travelled as a 1.6 MB base64 JSON string; the SMTP upload of that alone took
// ~10 s. Now the PDF is compressed with small logos (~60 KB), sent as raw
// bytes (application/octet-stream, no base64), and the serverless function and
// its SMTP connection are warmed up when the email box opens, before Send.
//
// Sends run outside the dialog: the dialog can close and the admin can keep
// working. <ReportSendToasts /> (mounted once in the dashboard shell) shows
// "Sending… 40%" and then the result.
import { useSyncExternalStore } from 'react';
import { auth } from './firebase';

let sends = [];
const listeners = new Set();
function emit() { listeners.forEach(l => l()); }
function update(id, patch) {
  sends = sends.map(s => (s.id === id ? { ...s, ...patch } : s));
  emit();
}
export function dismissReportSend(id) {
  sends = sends.filter(s => s.id !== id);
  emit();
}
export function useReportSends() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => sends,
  );
}

// Opens the function instance and its pooled SMTP connection ahead of the
// send. Fire-and-forget; at most once every 4 minutes.
let lastWarm = 0;
export async function warmReportMailer() {
  if (Date.now() - lastWarm < 4 * 60 * 1000 || !auth.currentUser) return;
  lastWarm = Date.now();
  try {
    const idToken = await auth.currentUser.getIdToken();
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'warm-mailer' }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* warming is best effort */ }
}

// jsPDF document -> raw bytes.
export function pdfToBytes(doc) {
  return doc.output('arraybuffer');
}

// Queues one report email. Returns a promise that resolves to true when the
// email was sent; failures are reported through the toast, never thrown.
export function sendReportInBackground({ to, subject, html, pdf, filename }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sends = [...sends, { id, to, status: 'sending', progress: 0 }];
  emit();

  return (async () => {
    try {
      if (!auth.currentUser) throw new Error('You must be signed in as an administrator to send reports.');
      // A cached token is refreshed by the SDK when it is close to expiry;
      // forcing a refresh here only added a round trip to every send.
      const idToken = await auth.currentUser.getIdToken();
      const meta = encodeURIComponent(JSON.stringify({ to, subject, html, filename }));
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/send-patient-report');
        xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-Report-Meta', meta);
        // Upload is the part that scales with the file; the last 10% is the
        // server handing the message to Gmail.
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) update(id, { progress: Math.round((e.loaded / e.total) * 90) });
        };
        xhr.upload.onload = () => update(id, { progress: 90 });
        xhr.onload = () => {
          let body = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
          if (xhr.status >= 200 && xhr.status < 300 && body?.success) resolve(body);
          else reject(new Error(body?.error || `Failed to send email (${xhr.status} ${xhr.statusText})`));
        };
        xhr.onerror = () => reject(new Error('Network error while sending the email.'));
        xhr.send(pdf);
      });
      update(id, { status: 'sent', progress: 100 });
      setTimeout(() => dismissReportSend(id), 5000);
      return true;
    } catch (err) {
      console.error('sendReportInBackground error:', err);
      update(id, { status: 'failed', error: err?.message || 'Could not send the email.' });
      return false;
    }
  })();
}
