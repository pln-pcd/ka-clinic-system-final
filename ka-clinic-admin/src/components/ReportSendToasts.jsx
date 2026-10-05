// The toasts for report emails sent in the background (lib/reportMailer.js).
// Mounted once in the dashboard shell and portalled to <body> so they stay
// visible above open popups and after the export dialog closes.
import { createPortal } from 'react-dom';
import Toast from './Toast';
import { dismissReportSend, useReportSends } from '../lib/reportMailer';

export default function ReportSendToasts() {
  const sends = useReportSends();
  if (!sends.length) return null;
  return createPortal(
    <>
      {sends.map((s, i) => {
        const offset = (sends.length - 1 - i) * 84;
        if (s.status === 'sending') {
          return (
            <Toast key={s.id} type="loading" title="Sending report…" offset={offset}
              msg={`To ${s.to}. You can keep working.`} progress={s.progress} />
          );
        }
        if (s.status === 'sent') {
          return (
            <Toast key={s.id} type="success" title="Report sent" offset={offset}
              msg={`Emailed to ${s.to}.`} onClose={() => dismissReportSend(s.id)} />
          );
        }
        return (
          <Toast key={s.id} type="error" title="Report not sent" offset={offset}
            msg={s.error} onClose={() => dismissReportSend(s.id)} />
        );
      })}
    </>,
    document.body
  );
}
