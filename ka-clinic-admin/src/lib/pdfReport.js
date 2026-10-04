// Shared pieces of the PDF reports built by the Patients and Inventory export
// dialogs: the clinic logo, the report header, and the base64 conversion used
// when a report is emailed.
import { CLINIC_LOGO_BASE64 } from '../assets/clinicLogoBase64';

// Starts as the bundled logo, so the fetch below only runs if that constant is
// ever empty.
export let clinicLogoBase64Cache = CLINIC_LOGO_BASE64;

export async function getClinicLogoBase64() {
  if (clinicLogoBase64Cache) return clinicLogoBase64Cache;
  try {
    const res = await fetch('/assets/dashboard/logo-white-nobg.png');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        clinicLogoBase64Cache = reader.result;
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    clinicLogoBase64Cache = CLINIC_LOGO_BASE64;
    return CLINIC_LOGO_BASE64;
  }
}

// jsPDF 4.x has no 'base64' output type — it returns null, which is how the
// report used to arrive as an email with no attachment at all. The data URI
// carries the same bytes with a prefix to strip.
export function pdfToBase64(doc) {
  const uri = doc.output('datauristring');
  const comma = uri.indexOf(',');
  return comma === -1 ? '' : uri.slice(comma + 1);
}

// The header band at the top of every landscape report page: logo, LGU line,
// report title, subtitle (left) and the active filters (right), then a rule.
export function drawReportHeader(doc, { logo, margin, pageWidth, title, subtitle, filters }) {
  const hasLogo = Boolean(logo);
  const textX = hasLogo ? 27 : margin;

  if (hasLogo) {
    try {
      doc.addImage(logo, 'PNG', margin, 5.8, 10.5, 10.5);
    } catch (e) {
      console.warn('Could not add logo to PDF:', e);
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('MUNICIPALITY OF LIBON, PROVINCE OF ALBAY', textX, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(title, textX, 12.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, textX, 16.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(filters, pageWidth - margin, 16.8, { align: 'right' });

  doc.setDrawColor(10, 29, 71);
  doc.setLineWidth(0.5);
  doc.line(margin, 19.5, pageWidth - margin, 19.5);
}
