// Export / print / email dialog for patient reports and single records.
import { formatTitleCase, formatDateLong, formatDateLong as fmtDate, formatDateShort, formatDateNumeric, getTodayDateString, serviceLabel } from "../../lib/formatters";
import Modal from '../../components/Modal';
import IconButton from '../../components/IconButton';
import Select from '../../components/Select';
import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import { buildDoses, getSchedule } from "../../lib/doseSchedules";
import { LIBON_SEAL_BASE64 } from "../../assets/libonSealBase64";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import { CLINIC_LOGO_BASE64 } from "../../assets/clinicLogoBase64";
import { clinicLogoBase64Cache, drawReportHeader, getClinicLogoBase64 } from "../../lib/pdfReport";
import { pdfToBytes, sendReportInBackground, warmReportMailer } from "../../lib/reportMailer";
import { Printer, Download, Mail, Loader2 } from "lucide-react";
import { X, derivePatientStatus } from "./shared";
import PreviewViewer from "../../components/PreviewViewer";

/* ─────────────────────────── EXPORT REPORT MODAL ─────────────────────────── */
export function ExportReportModal({ patients, onClose, onToast, initialPatient }) {
  const [logoDataUrl, setLogoDataUrl] = useState(clinicLogoBase64Cache || CLINIC_LOGO_BASE64);
  useEffect(() => {
    getClinicLogoBase64().then(b64 => {
      if (b64) setLogoDataUrl(b64);
    });
  }, []);

  const [mode, setMode] = useState(initialPatient ? 'single' : 'bulk'); // 'bulk' | 'single'
  const [period, setPeriod] = useState('monthly');
  const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const PERIODS = [
    { key: 'monthly', label: 'Monthly', desc: 'This calendar month',
      icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="13" x2="8" y2="13" /><line x1="12" y1="13" x2="12" y2="13" /><line x1="16" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="8" y2="17" /><line x1="12" y1="17" x2="12" y2="17" /></svg> },
    { key: 'daily', label: 'Daily', desc: 'Today\'s registrations',
      icon: <svg {...iconProps}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg> },
    { key: 'weekly', label: 'Weekly', desc: 'Last 7 days',
      icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="9" x2="21" y2="9" /></svg> },
    { key: 'yearly', label: 'Yearly', desc: 'This calendar year',
      icon: <svg {...iconProps}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" /></svg> },
  ];

  const fileIcon = <svg {...iconProps}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  const [exportFormat, setExportFormat] = useState('pdf'); // 'xls' | 'pdf'
  const FORMATS = [
    { key: 'xls', label: 'Excel (XLS)' },
    { key: 'pdf', label: 'PDF' },
  ];

  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'completed' | 'overdue' | 'ongoing'
  function statusFilterLabel() {
    if (statusFilter === 'completed') return 'Completed';
    if (statusFilter === 'overdue') return 'Overdue';
    if (statusFilter === 'ongoing') return 'Ongoing';
    return 'All Statuses';
  }

  const [serviceFilter, setServiceFilter] = useState('all'); // 'all' | 'pep' | 'prep' | 'tetanus' | 'pneumonia'
  function serviceFilterLabel() {
    if (serviceFilter === 'pep') return 'PEP (Post-Exposure)';
    if (serviceFilter === 'prep') return 'PrEP (Pre-Exposure)';
    if (serviceFilter === 'tetanus') return 'Anti-Tetanus';
    if (serviceFilter === 'pneumonia') return 'Pneumonia Vaccine';
    return 'All Services';
  }

  // Preview gate — nothing leaves the modal until the user has seen the
  // rendered report. 'form' = pick period/format, 'preview' = review it.
  const [step, setStep] = useState('form');

  // ── Single-patient search — filters the same already-loaded `patients`
  // list the main table searches (that list is capped at the 20 most
  // recent records app-wide; a patient outside that window won't show up
  // here either, same limitation as the table's own search box). ─────────
  const [patientQuery, setPatientQuery] = useState(initialPatient ? formatTitleCase(initialPatient.name) : '');
  const [selectedPatient, setSelectedPatient] = useState(initialPatient || null);

  useEffect(() => {
    if (initialPatient) {
      setSelectedPatient(initialPatient);
      setPatientQuery(formatTitleCase(initialPatient.name || ''));
      setMode('single');
    }
  }, [initialPatient]);
  const matchingPatients = (() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q || selectedPatient) return [];
    return patients.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q) ||
      p.mrn?.toLowerCase().includes(q)
    ).slice(0, 6);
  })();

  // ── Email delivery — shared by both bulk and single-patient modes ──────
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  // The toast renders under the modal's portal, so a send needs its own
  // confirmation inside the card.
  const [sentTo, setSentTo] = useState('');
  const [queuedTo, setQueuedTo] = useState('');

  // The send runs in the background (lib/reportMailer.js) with its own
  // progress toast, so the dialog is free again at once and can be closed.
  function sendReportEmail(to, subject, html, attachment) {
    const trimmed = to.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      onToast('Enter a valid recipient email address.', 'error');
      return;
    }
    if (!auth.currentUser) {
      onToast('You must be signed in as an administrator to send reports.', 'error');
      return;
    }
    setQueuedTo(trimmed);
    setSentTo('');
    setEmailTo('');
    sendReportInBackground({ to: trimmed, subject, html, pdf: attachment.pdf, filename: attachment.filename })
      .then(ok => {
        setQueuedTo(q => (q === trimmed ? '' : q));
        if (ok) setSentTo(trimmed);
      });
  }

  function getFilteredPatients() {
    const todayStr = getTodayDateString();
    const curParts = todayStr.split('-');
    const curYear = parseInt(curParts[0], 10);
    const curMonth = parseInt(curParts[1], 10);
    const now = new Date();

    return patients.filter(p => {
      const pDateStr = p.date ? String(p.date).split('T')[0] : (p.createdAt?.toDate ? getTodayDateString(p.createdAt.toDate()) : '');
      const raw = p.createdAt?.toDate ? p.createdAt.toDate() : (pDateStr ? new Date(`${pDateStr}T12:00:00`) : null);
      let matchesPeriod = true;
      if (period === 'daily') {
        matchesPeriod = pDateStr === todayStr;
      } else if (period === 'weekly') {
        const msAgo = raw ? now - raw : Infinity;
        matchesPeriod = msAgo >= 0 && msAgo <= 7 * 24 * 60 * 60 * 1000;
      } else if (period === 'monthly') {
        const pYear = pDateStr ? parseInt(pDateStr.slice(0, 4), 10) : (raw ? raw.getFullYear() : null);
        const pMonth = pDateStr ? parseInt(pDateStr.slice(5, 7), 10) : (raw ? raw.getMonth() + 1 : null);
        matchesPeriod = pYear === curYear && pMonth === curMonth;
      } else if (period === 'yearly') {
        const pYear = pDateStr ? parseInt(pDateStr.slice(0, 4), 10) : (raw ? raw.getFullYear() : null);
        matchesPeriod = pYear === curYear;
      } else if (period === 'all') {
        matchesPeriod = true;
      }
      if (!matchesPeriod) return false;

      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const patientStatus = liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';

      // Status and service narrow together. The status checks used to
      // `return` straight away, so picking a status silently ignored the
      // service filter.
      if (statusFilter !== 'all' && patientStatus !== statusFilter) return false;

      if (serviceFilter !== 'all') {
        const s = (p.service || '').trim().toLowerCase();
        if (serviceFilter === 'pep' && s !== 'pep') return false;
        if (serviceFilter === 'prep' && s !== 'prep') return false;
        if (serviceFilter === 'tetanus' && !s.includes('tetan')) return false;
        if (serviceFilter === 'pneumonia' && !s.includes('pneumo')) return false;
      }

      return true;
    });
  }

  // Closing summary for the registry report. One builder feeds the PDF, the
  // .xlsx and both previews, so every format prints the same totals.
  function reportStatusOf(p) {
    const liveSt = derivePatientStatus(p);
    const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
    return liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';
  }

  function buildReportSummary(rows) {
    const total = rows.length;
    const counts = { ongoing: 0, overdue: 0, completed: 0 };
    const bySvc = {};
    rows.forEach(p => {
      const st = reportStatusOf(p);
      counts[st]++;
      const svc = serviceLabel((p.service || 'Unspecified').trim() || 'Unspecified');
      bySvc[svc] = bySvc[svc] || { total: 0, completed: 0, active: 0 };
      bySvc[svc].total++;
      if (st === 'completed') bySvc[svc].completed++; else bySvc[svc].active++;
    });
    const pct = n => (total ? `${Math.round((n / total) * 1000) / 10}%` : '0%');
    const active = counts.ongoing + counts.overdue;
    return {
      total,
      totals: [
        ['Total patients', total],
        ['Active (in treatment)', active],
        ['   of which overdue', counts.overdue],
        ['Completed', counts.completed],
        ['Completion rate', pct(counts.completed)],
      ],
      services: Object.entries(bySvc)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([svc, c]) => [svc, c.total, c.completed, c.active, pct(c.total)]),
    };
  }
  const SUMMARY_SERVICE_HEAD = ['Service', 'Patients', 'Completed', 'Active', 'Share'];
  // The summary shares the last page when that page has room for it,
  // otherwise it gets a page of its own — same rule in the preview and PDF.
  const SUMMARY_FITS_AFTER_ROWS = 12;

  function periodLabel() {
    const now = new Date();
    if (period === 'all') return 'All Time (Full Registry)';
    if (period === 'daily') return now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (period === 'weekly') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      return `${from.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (period === 'monthly') return now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    if (period === 'yearly') return String(now.getFullYear());
    return 'All Records';
  }
  // Official Philippine Government / Institutional Rural Health Unit Letterhead
  function letterhead() {
    return `
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;border:none;font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
        <tr>
          <!-- Left: Clinic Logo directly beside Rural Unit text -->
          <td style="vertical-align:middle;padding-right:16px;width:90px;text-align:right;">
            <img src="${logoDataUrl || CLINIC_LOGO_BASE64 || '/assets/dashboard/logo-white-nobg.png'}" alt="K&A Clinic Logo" style="width:90px;height:90px;object-fit:contain;display:block;" />
          </td>
          <!-- Center: Clinic Letterhead Text -->
          <td style="vertical-align:middle;text-align:center;padding:0;">
            <div style="font-size:9.5px;color:#64748B;letter-spacing:0.8px;font-weight:700;text-transform:uppercase;">Municipality of Libon, Province of Albay</div>
            <div style="font-size:16px;font-weight:900;color:#0F172A;letter-spacing:0.5px;margin-top:2px;text-transform:uppercase;">K&amp;A Animal Bite Center</div>
          </td>
          <!-- Right: Matching Counter-balance Spacer so Center Text is 100% Optical Center -->
          <td style="vertical-align:middle;padding-left:16px;width:90px;">
            <div style="width:90px;height:1px;"></div>
          </td>
        </tr>
      </table>
    `;
  }

  // Realistic Microsoft Excel Live Table Preview HTML
  function buildExcelPreviewHtml(rows, periodLabelStr) {
    const serviceCount = {};
    const statusCount = { ongoing: 0, completed: 0, overdue: 0 };
    rows.forEach(p => {
      const svc = serviceLabel(p.service || 'PEP');
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const st = liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    const headers = ['#', 'Barangay / Address', 'Patient ID', 'Patient Name', 'Age / Sex', 'Contact No.', 'Service', 'Exposure', 'Status', 'Date Registered'];
    const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    const tableRows = rows.length === 0
      ? `<tr><td class="row-num">6</td><td colspan="10" style="text-align:center;padding:16px;color:#64748B;font-style:italic;">No ${statusFilter === 'all' ? '' : statusFilter + ' '}records found for this period.</td></tr>`
      : rows.map((p, idx) => {
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const stLabel = liveSt === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing';
      const rowNum = idx + 6;
      return `<tr>
        <td class="row-num">${rowNum}</td>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${p.barangay || p.address || 'Libon, Albay'}</td>
        <td style="font-weight:bold;color:#0F172A;">${p.id || p.mrn || '—'}</td>
        <td style="font-weight:bold;color:#0F172A;">${formatTitleCase(p.name || '—')}</td>
        <td style="text-align:center;">${p.age || '—'} / ${p.sex || '—'}</td>
        <td>${p.contact || '—'}</td>
        <td style="text-align:center;font-weight:bold;">${serviceLabel(p.service || 'PEP')}</td>
        <td style="text-align:center;">${p.cat ? `Cat ${p.cat}` : (p.animal || '—')}</td>
        <td style="text-align:center;font-weight:bold;color:${stLabel === 'Completed' ? '#15803D' : stLabel === 'Overdue' ? '#DC2626' : '#1D4ED8'};">${stLabel.toUpperCase()}</td>
        <td style="text-align:center;">${formatDateNumeric(p.date || p.createdAt)}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><title>Excel Preview</title>
      <style>
        *{box-sizing:border-box;}
        body{font-family:Calibri,'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#FFFFFF;font-size:11px;color:#1E293B;user-select:none;}
        .sheet-container{background:#FFFFFF;overflow-x:auto;padding:0;}
        table.excel-grid{border-collapse:collapse;width:100%;table-layout:fixed;}
        table.excel-grid th, table.excel-grid td{border:1px solid #CBD5E1;padding:6px 9px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        th.col-head{background:#EFF6FF;color:#1D4ED8;font-weight:700;text-align:center;font-size:10px;border:1px solid #CBD5E1;}
        td.row-num{background:#F8FAFC;color:#64748B;font-weight:700;text-align:center;font-size:10px;width:36px;border:1px solid #CBD5E1;}
        .sheet-tabs{background:#F1F5F9;border-top:1px solid #CBD5E1;padding:4px 12px;display:flex;align-items:center;gap:4px;font-size:11px;position:sticky;bottom:0;}
        .tab{background:#FFFFFF;border:1px solid #CBD5E1;border-bottom:none;padding:4px 12px;font-weight:700;color:#1D4ED8;border-top:2px solid #1D4ED8;border-radius:3px 3px 0 0;}
      </style></head><body>

      <div class="sheet-container">
        <table class="excel-grid">
          <thead>
            <tr>
              <th class="col-head" style="width:36px;"></th>
              ${colLetters.map(c => `<th class="col-head">${c}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="row-num">1</td>
              <td colspan="10" style="font-size:13px;font-weight:bold;color:#1D4ED8;background:#EFF6FF;">HEALTH MONITORING &amp; PATIENT REGISTRY REPORT</td>
            </tr>
            <tr>
              <td class="row-num">2</td>
              <td colspan="10" style="color:#475569;background:#F8FAFC;">Period Covered: <strong>${periodLabelStr}</strong> &nbsp;|&nbsp; Status: <strong>${statusFilterLabel()}</strong> &nbsp;|&nbsp; Barangay: All Barangays &nbsp;|&nbsp; Date Generated: ${new Date().toLocaleString('en-PH')}</td>
            </tr>
            <tr>
              <td class="row-num">3</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;">Total Patients: ${rows.length}</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;color:#1D4ED8;">Ongoing: ${statusCount.ongoing || 0}</td>
              <td colspan="3" style="background:#F1F5F9;font-weight:bold;color:#DC2626;">Overdue: ${statusCount.overdue || 0}</td>
              <td colspan="3" style="background:#F1F5F9;font-weight:bold;color:#15803D;">Completed: ${statusCount.completed || 0}</td>
            </tr>
            <tr>
              <td class="row-num">4</td>
              <td colspan="10" style="background:#FFFFFF;height:4px;"></td>
            </tr>
            <tr style="background:#1D4ED8;color:#FFFFFF;font-weight:bold;">
              <td class="row-num" style="background:#F1F5F9;color:#64748B;">5</td>
              ${headers.map(h => `<td style="background:#1D4ED8;color:#FFFFFF;font-weight:bold;text-align:${h === '#' || h === 'Age / Sex' || h === 'Service' || h === 'Exposure' || h === 'Status' || h === 'Date Registered' ? 'center' : 'left'};">${h}</td>`).join('')}
            </tr>
            ${tableRows}
            ${(() => {
              if (rows.length === 0) return '';
              const s = buildReportSummary(rows);
              let n = rows.length + 6;
              const line = cells => `<tr><td class="row-num">${n++}</td>${cells}</tr>`;
              return [
                line('<td colspan="10" style="height:4px;"></td>'),
                line('<td colspan="10" style="font-weight:bold;color:#1D4ED8;background:#EFF6FF;">REPORT SUMMARY</td>'),
                ...s.totals.map(([k, v]) => line(`<td colspan="3" style="background:#F8FAFC;">${k.trim()}</td><td style="font-weight:bold;text-align:right;">${v}</td><td colspan="6"></td>`)),
                line('<td colspan="10" style="height:4px;"></td>'),
                line(SUMMARY_SERVICE_HEAD.map((h, i) => `<td ${i === 0 ? 'colspan="3"' : ''} style="font-weight:bold;background:#F1F5F9;${i ? 'text-align:right;' : ''}">${h}</td>`).join('') + '<td colspan="3"></td>'),
                ...s.services.map(r => line(r.map((v, i) => `<td ${i === 0 ? 'colspan="3"' : ''} style="${i ? 'text-align:right;' : ''}">${v}</td>`).join('') + '<td colspan="3"></td>')),
              ].join('');
            })()}
          </tbody>
        </table>
      </div>

      <div class="sheet-tabs">
        <div class="tab">Sheet1</div>
        <span style="color:#64748B;margin-left:8px;">+</span>
        <span style="margin-left:auto;color:#64748B;font-size:10px;">Ready</span>
      </div>

      </body></html>`;
  }

  // Excel HTML Export — formatted structured spreadsheet table
  // Real .xlsx via SheetJS. The old export wrote an HTML table with an .xls
  // extension, which made Excel warn that the format and extension disagree
  // and coerced phone numbers into scientific notation. The on-screen preview
  // (buildExcelPreviewHtml) is unchanged — only the produced file is.
  function exportBulkXLS() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }

    const statusCount = { ongoing: 0, completed: 0, overdue: 0 };
    const statusFor = (p) => {
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      return liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';
    };
    // Service mix, counted from the same rows the table prints. This was
    // computed and then thrown away before, so the report carried no service
    // breakdown at all.
    const serviceCount = {};
    rows.forEach(p => {
      const st = statusFor(p);
      statusCount[st] = (statusCount[st] || 0) + 1;
      const svc = serviceLabel((p.service || 'Unspecified').trim() || 'Unspecified');
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
    });
    const servicePct = (n) => (rows.length ? `${Math.round((n / rows.length) * 1000) / 10}%` : '0%');
    const serviceRows = Object.entries(serviceCount)
      .sort((a, b) => b[1] - a[1])
      .map(([svc, n]) => [svc, n, servicePct(n)]);

    const headers = ['#', 'Barangay / Address', 'Patient ID', 'Patient Name', 'Age', 'Sex', 'Contact No.', 'Service Type', 'Exposure', 'Status', 'Date Registered'];

    // Title block, summary metrics, then the registry table.
    const aoa = [
      ['HEALTH MONITORING & PATIENT REGISTRY REPORT'],
      ['RURAL HEALTH UNIT • ANIMAL BITE TREATMENT CENTER • LIBON, ALBAY'],
      [`Period Covered: ${periodLabel()}`, `Service: ${serviceFilterLabel()}`, `Status: ${statusFilterLabel()}`, `Date Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      ['SUMMARY METRICS'],
      ['Total Patients', rows.length, 'Ongoing', statusCount.ongoing || 0, 'Overdue', statusCount.overdue || 0, 'Completed', statusCount.completed || 0],
      [],
      ['SERVICE BREAKDOWN'],
      ['Service', 'Patients', 'Share'],
      ...serviceRows,
      [],
      headers,
    ];

    const HEADER_ROW = aoa.length - 1; // zero-based index of the header row
    rows.forEach((p, idx) => {
      const st = statusFor(p);
      aoa.push([
        idx + 1,
        p.barangay || p.address || 'Libon, Albay',
        p.id || p.mrn || '—',
        formatTitleCase(p.name || '—'),
        p.age === 0 || p.age ? Number(p.age) : '—',
        (p.sex || '—').toUpperCase(),
        p.contact || '—',
        serviceLabel(p.service || 'PEP'),
        ((p.service || '').trim().toUpperCase() === 'PEP') ? (p.cat ? `Cat ${p.cat}` : (p.animal || '—')) : '—',
        st.charAt(0).toUpperCase() + st.slice(1),
        formatDateNumeric(p.date || p.createdAt),
      ]);
    });

    // Closing summary under the table (the metrics at the top stay as the
    // at-a-glance header). Kept out of the autofilter range below.
    const LAST_DATA_ROW = aoa.length - 1;
    const summary = buildReportSummary(rows);
    aoa.push([], ['REPORT SUMMARY']);
    const SUMMARY_TITLE_ROW = aoa.length - 1;
    summary.totals.forEach(([k, v]) => aoa.push([k.trim(), v]));
    aoa.push([], SUMMARY_SERVICE_HEAD, ...summary.services);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Phone numbers and IDs are identifiers, not quantities — forcing them to
    // text is what stops "+639272401450" becoming 6.39272E+11.
    const TEXT_COLUMNS = [2, 6, 10]; // Patient ID, Contact No., Date Registered
    for (let r = HEADER_ROW + 1; r <= LAST_DATA_ROW; r++) {
      TEXT_COLUMNS.forEach(c => {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref];
        if (cell) { cell.t = 's'; cell.z = '@'; cell.v = String(cell.v); }
      });
    }

    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 13 }, { wch: 26 }, { wch: 6 }, { wch: 8 },
      { wch: 17 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 15 },
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } },
      { s: { r: SUMMARY_TITLE_ROW, c: 0 }, e: { r: SUMMARY_TITLE_ROW, c: headers.length - 1 } },
    ];
    // Header row stays visible while scrolling, and the table gets a filter.
    ws['!freeze'] = { xSplit: 0, ySplit: HEADER_ROW + 1 };
    ws['!autofilter'] = {
      ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: LAST_DATA_ROW, c: headers.length - 1 })}`,
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patient Registry');

    const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
    XLSX.writeFile(wb, `clinic-report-${period}${statusSlug}-${getTodayDateString()}.xlsx`);
    onToast(`Excel report exported (${rows.length} patient${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  const PAGE_1_ROWS = 24;
  const CONT_PAGE_ROWS = 24;

  function chunkPatientsIntoPages(rows) {
    if (!rows || rows.length === 0) return [[]];
    const pages = [];
    pages.push(rows.slice(0, PAGE_1_ROWS));
    let idx = PAGE_1_ROWS;
    while (idx < rows.length) {
      pages.push(rows.slice(idx, idx + CONT_PAGE_ROWS));
      idx += CONT_PAGE_ROWS;
    }
    return pages;
  }

  // Exact Landscape Multi-Page HTML Report with physical cut lines and page breaks (Matching Downloaded PDF Design Exactly)
  function buildBulkReportHtml(rows, logoSrc = CLINIC_LOGO_BASE64) {
    const pages = chunkPatientsIntoPages(rows);
    const summaryOwnPage = rows.length > 0 && pages[pages.length - 1].length > SUMMARY_FITS_AFTER_ROWS;
    const totalPages = pages.length + (summaryOwnPage ? 1 : 0);
    const summary = rows.length ? buildReportSummary(rows) : null;
    const summaryHtml = summary ? `
      <div class="summary">
        <div class="summary-title">Report Summary</div>
        <div class="summary-grid">
          <table class="summary-table">
            <tbody>${summary.totals.map(([k, v]) => `<tr><td>${k.trim()}</td><td class="num">${v}</td></tr>`).join('')}</tbody>
          </table>
          <table class="summary-table">
            <thead><tr>${SUMMARY_SERVICE_HEAD.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
            <tbody>${summary.services.map(r => `<tr>${r.map((v, i) => `<td class="${i ? 'num' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>` : '';
    const dateGeneratedStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentLogo = logoSrc || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;

    const renderedPagesHtml = pages.map((pageRows, pIdx) => {
      const pageNum = pIdx + 1;
      const startNum = pIdx === 0 ? 0 : PAGE_1_ROWS + (pIdx - 1) * CONT_PAGE_ROWS;

      const tableRows = pageRows.length === 0
        ? `<tr><td colspan="10" style="text-align:center;padding:24px;color:#64748B;font-style:italic;">No ${statusFilter === 'all' ? '' : statusFilter + ' '}records found for this period.</td></tr>`
        : pageRows.map((p, i) => {
            const liveSt = derivePatientStatus(p);
            const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
            const stLabel = liveSt === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing';
            const stColor = liveSt === 'completed' ? '#15803D' : isOverdue ? '#DC2626' : '#1D4ED8';
            const dateStr = formatDateNumeric(p.date || p.createdAt);

            return `
            <tr>
              <td class="col-center">${startNum + i + 1}</td>
              <td class="col-left">${p.barangay || p.address || 'Libon, Albay'}</td>
              <td class="col-left">${p.id || p.mrn || '—'}</td>
              <td class="col-left">${formatTitleCase(p.name || '—')}</td>
              <td class="col-center">${p.age || '—'} / ${p.sex || '—'}</td>
              <td class="col-left">${p.contact || '—'}</td>
              <td class="col-center">${serviceLabel(p.service || 'PEP')}</td>
              <td class="col-center">${((p.service || '').trim().toUpperCase() === 'PEP') ? (p.cat ? `Cat ${p.cat}` : (p.animal || '—')) : '—'}</td>
              <td class="col-center" style="font-weight:700;color:${stColor};">${stLabel}</td>
              <td class="col-center">${dateStr}</td>
            </tr>`;
          }).join('');

      const pageHeader = `
        <!-- Minimal Institutional Text Header with Logo on Left (Matches Downloaded PDF Exactly) -->
        <div class="report-header">
          <div class="header-left">
            <img src="${currentLogo}" alt="K&A Clinic Logo" class="header-logo" />
            <div>
              <div class="header-muni">Municipality of Libon, Province of Albay</div>
              <div class="header-brand">K&amp;A ANIMAL BITE CENTER &mdash; HEALTH MONITORING REPORT</div>
              <div class="header-sub">Barangay Summary &mdash; ${periodLabel()}${pIdx > 0 ? ' &bull; Continuation' : ''}</div>
            </div>
          </div>
          <div class="header-right">
            <span>Service: ${serviceFilterLabel()}</span> &nbsp;|&nbsp; <span>Status: ${statusFilterLabel()}</span> &nbsp;|&nbsp; <span>Date: ${dateGeneratedStr}</span>
          </div>
        </div>
        <div class="header-line"></div>
      `;

      const cutSeparator = pIdx > 0
        ? `
          <div class="page-cut-separator">
            <span class="cut-scissors">✂</span>
            <span class="cut-label">Page ${pageNum} of ${totalPages} &mdash; Separate Sheet</span>
          </div>
        `
        : '';

      return `
        ${cutSeparator}
        <div class="report-page" id="page-${pageNum}">
          <div>
            ${pageHeader}
            <table class="report-table">
              <thead>
                <tr>
                  <th style="width:4%;text-align:center;">#</th>
                  <th style="width:15%;text-align:left;">Barangay / Address</th>
                  <th style="width:10%;text-align:left;">Patient ID</th>
                  <th style="width:18%;text-align:left;">Patient Name</th>
                  <th style="width:8%;text-align:center;">Age / Sex</th>
                  <th style="width:13%;text-align:left;">Contact No.</th>
                  <th style="width:7%;text-align:center;">Service</th>
                  <th style="width:7%;text-align:center;">Exposure</th>
                  <th style="width:8%;text-align:center;">Status</th>
                  <th style="width:10%;text-align:center;">Date Registered</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            ${pIdx === pages.length - 1 && !summaryOwnPage ? summaryHtml : ''}
          </div>

          <div class="footer">
            <span>K&amp;A Animal Bite Treatment Center &bull; Rural Health Unit &bull; Confidential Clinical Report</span>
            <span>Page ${pageNum} of ${totalPages}</span>
          </div>
        </div>
      `;
    }).join('') + (summaryOwnPage ? `
        <div class="page-cut-separator">
          <span class="cut-scissors">✂</span>
          <span class="cut-label">Page ${totalPages} of ${totalPages} &mdash; Separate Sheet</span>
        </div>
        <div class="report-page" id="page-${totalPages}">
          <div>
            <div class="report-header">
              <div class="header-left">
                <img src="${currentLogo}" alt="K&A Clinic Logo" class="header-logo" />
                <div>
                  <div class="header-muni">Municipality of Libon, Province of Albay</div>
                  <div class="header-brand">K&amp;A ANIMAL BITE CENTER &mdash; HEALTH MONITORING REPORT</div>
                  <div class="header-sub">Barangay Summary &mdash; ${periodLabel()} &bull; Summary</div>
                </div>
              </div>
            </div>
            <div class="header-line"></div>
            ${summaryHtml}
          </div>
          <div class="footer">
            <span>K&amp;A Animal Bite Treatment Center &bull; Rural Health Unit &bull; Confidential Clinical Report</span>
            <span>Page ${totalPages} of ${totalPages}</span>
          </div>
        </div>` : '');

    return `<!DOCTYPE html><html><head><title>Health Monitoring Report — ${periodLabel()}</title>
    <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;}
      html, body{margin:0;padding:0;font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;background:#EDF0FA;}
      .pages-wrapper{display:flex;flex-direction:column;align-items:center;padding:0 0 4px;}
      .page-cut-separator{width:1060px;display:flex;align-items:center;justify-content:center;gap:12px;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin:18px 0;user-select:none;}
      .page-cut-separator::before, .page-cut-separator::after{content:'';flex:1;border-bottom:2px dashed #CBD5E1;}
      .cut-scissors{font-size:13px;color:#3B50DF;}
      .cut-label{background:#FFFFFF;padding:4px 12px;border-radius:999px;border:1px solid #CBD5E1;box-shadow:0 1px 3px rgba(0,0,0,0.05);}
      .report-page{width:1060px;height:750px;min-height:750px;max-height:750px;background:#FFFFFF;border-radius:6px;border:1px solid #D8DEF0;box-shadow:0 4px 18px rgba(15,23,42,0.10);padding:16px 26px 14px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;margin:0 auto;box-sizing:border-box;}
      
      .report-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;}
      .header-left{display:flex;align-items:center;gap:12px;}
      .header-logo{width:38px;height:38px;object-fit:contain;display:block;flex-shrink:0;}
      .header-muni{font-size:8.5px;color:#64748B;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;}
      .header-brand{font-size:13px;font-weight:900;color:#0F172A;letter-spacing:0.3px;margin:1px 0;text-transform:uppercase;}
      .header-sub{font-size:9.5px;color:#475569;font-weight:600;font-style:italic;}
      .header-right{font-size:8.5px;color:#475569;font-weight:600;text-align:right;white-space:nowrap;}
      .header-line{border-bottom:1.5px solid #0A1D47;margin:4px 0 8px;}

      table.report-table{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;border:1px solid #CBD5E1;}
      table.report-table th, table.report-table td{border:1px solid #CBD5E1;vertical-align:middle;}
      table.report-table th{background:#EFF6FF;color:#000000;font-size:8.5px;font-weight:800;padding:6px 8px;white-space:nowrap;}
      table.report-table td{padding:5.8px 8px;color:#0F172A;font-size:9px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      
      .col-center{text-align:center;}
      .col-left{text-align:left;}

      .footer{font-size:8px;color:#94A3B8;margin-top:auto;padding-top:8px;display:flex;justify-content:space-between;}

      .summary{margin-top:14px;}
      .summary-title{font-size:10px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;border-bottom:1.5px solid #0A1D47;margin-bottom:8px;}
      .summary-grid{display:grid;grid-template-columns:1fr 1.6fr;gap:18px;align-items:start;}
      table.summary-table{width:100%;border-collapse:collapse;font-size:9px;border:1px solid #CBD5E1;}
      table.summary-table th, table.summary-table td{border:1px solid #CBD5E1;padding:4.5px 8px;text-align:left;}
      table.summary-table th{background:#EFF6FF;font-size:8.5px;font-weight:800;}
      table.summary-table .num{text-align:right;font-variant-numeric:tabular-nums;}
      @media print{
        @page{size:A4 landscape;margin:8mm 10mm;}
        html,body{background:#FFFFFF!important;padding:0!important;margin:0!important;}
        .pages-wrapper{display:block!important;padding:0!important;}
        .page-cut-separator{display:none!important;}
        .report-page{width:100%!important;min-height:100vh!important;height:100vh!important;margin:0!important;box-shadow:none!important;border:none!important;border-radius:0!important;padding:8mm 10mm!important;page-break-after:always!important;break-after:page!important;}
        .report-page:last-child{page-break-after:auto!important;break-after:auto!important;}
      }
    </style></head><body>
      <div class="pages-wrapper">
        ${renderedPagesHtml}
      </div>
    </body></html>`;
  }

  function exportPrint() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    const w = window.open('', '_blank');
    w.document.write(buildBulkReportHtml(rows, logoDataUrl || CLINIC_LOGO_BASE64));
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 250);
    onToast(`${period.charAt(0).toUpperCase() + period.slice(1)} report opened for printing`, 'success');
  }

  // Landscape A4 registry export. Deliberately mirrors buildBulkReportHtml:
  // the same chunkPatientsIntoPages() split, the same column proportions, the
  // same header/footer furniture — so the downloaded file matches the preview
  // page for page instead of reflowing to its own rhythm.
  function buildBulkPdf(rows, logoDataUrl = CLINIC_LOGO_BASE64) {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const dateGeneratedStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const logoToUse = logoDataUrl || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;

    const MARGIN = 14;
    const CONTENT_WIDTH = pageWidth - MARGIN * 2;
    // The percentage widths the preview table uses, resolved against the
    // printable width so both render the same column rhythm.
    const COL_PERCENT = [4, 15, 10, 18, 8, 13, 7, 7, 8, 10];
    const COL_ALIGN = ['center', 'left', 'left', 'left', 'center', 'left', 'center', 'center', 'center', 'center'];
    const columnStyles = COL_PERCENT.reduce((acc, pct, i) => {
      acc[i] = {
        halign: COL_ALIGN[i],
        cellWidth: (CONTENT_WIDTH * pct) / 100,
        ...(i === 8 ? { fontStyle: 'bold' } : {}),
      };
      return acc;
    }, {});

    function drawPdfHeader(isContinuation) {
      drawReportHeader(doc, {
        logo: logoToUse,
        margin: MARGIN,
        pageWidth,
        title: 'K&A ANIMAL BITE CENTER — HEALTH MONITORING REPORT',
        subtitle: `Barangay Summary — ${periodLabel()}${isContinuation ? ' • Continuation' : ''}`,
        filters: `Service: ${serviceFilterLabel()}  |  Status: ${statusFilterLabel()}  |  Date: ${dateGeneratedStr}`,
      });
    }

    const bodyForChunk = (pageRows, startNum) => pageRows.map((p, i) => {
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const stLabel = liveSt === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing';
      return [
        startNum + i + 1,
        p.barangay || p.address || 'Libon, Albay',
        p.id || p.mrn || '—',
        formatTitleCase(p.name || '—'),
        `${p.age || '—'} / ${p.sex || '—'}`,
        p.contact || '—',
        serviceLabel(p.service || 'PEP'),
        ((p.service || '').trim().toUpperCase() === 'PEP') ? (p.cat ? `Cat ${p.cat}` : (p.animal || '—')) : '—',
        stLabel,
        formatDateNumeric(p.date || p.createdAt),
      ];
    });

    // One autoTable call per preview page, so the row that starts page 2 here
    // is the row that starts page 2 there.
    const pages = chunkPatientsIntoPages(rows);
    pages.forEach((pageRows, pIdx) => {
      if (pIdx > 0) doc.addPage();
      drawPdfHeader(pIdx > 0);

      const startNum = pIdx === 0 ? 0 : PAGE_1_ROWS + (pIdx - 1) * CONT_PAGE_ROWS;
      autoTable(doc, {
        startY: 21.5,
        margin: { top: 21.5, bottom: 12, left: MARGIN, right: MARGIN },
        head: [['#', 'Barangay / Address', 'Patient ID', 'Patient Name', 'Age / Sex', 'Contact No.', 'Service', 'Exposure', 'Status', 'Date Registered']],
        body: pageRows.length
          ? bodyForChunk(pageRows, startNum)
          : [[{ content: `No ${statusFilter === 'all' ? '' : statusFilter + ' '}records found for this period.`, colSpan: 10, styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' } }]],
        theme: 'grid',
        headStyles: {
          fillColor: [239, 246, 255],
          textColor: [0, 0, 0],
          fontSize: 7.5,
          fontStyle: 'bold',
          cellPadding: 1.9,
          lineColor: [203, 213, 225],
          lineWidth: 0.1,
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.6,
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.1,
          overflow: 'ellipsize',
          valign: 'middle',
        },
        columnStyles,
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 8) {
            if (data.cell.raw === 'Completed') {
              data.cell.styles.textColor = [21, 128, 61];
            } else if (data.cell.raw === 'Overdue') {
              data.cell.styles.textColor = [220, 38, 38];
            } else {
              data.cell.styles.textColor = [29, 78, 216];
            }
          }
        },
      });
    });

    // Closing summary: on the last table page when it fits, else its own page.
    if (rows.length > 0) {
      const summary = buildReportSummary(rows);
      const ownPage = pages[pages.length - 1].length > SUMMARY_FITS_AFTER_ROWS;
      let y;
      if (ownPage) {
        doc.addPage();
        drawPdfHeader(true);
        y = 26;
      } else {
        y = doc.lastAutoTable.finalY + 8;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('REPORT SUMMARY', MARGIN, y);
      doc.setDrawColor(10, 29, 71);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y + 1.5, pageWidth - MARGIN, y + 1.5);

      const summaryStyles = {
        theme: 'grid',
        headStyles: { fillColor: [239, 246, 255], textColor: [0, 0, 0], fontSize: 7.5, fontStyle: 'bold', cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.1 },
        styles: { fontSize: 7.5, cellPadding: 1.6, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.1 },
      };
      const leftWidth = CONTENT_WIDTH * 0.36;
      autoTable(doc, {
        ...summaryStyles,
        startY: y + 4,
        margin: { left: MARGIN, bottom: 12 },
        tableWidth: leftWidth,
        body: summary.totals.map(([k, v]) => [k.trim(), v]),
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      });
      autoTable(doc, {
        ...summaryStyles,
        startY: y + 4,
        margin: { left: MARGIN + leftWidth + 8, bottom: 12 },
        tableWidth: CONTENT_WIDTH - leftWidth - 8,
        head: [SUMMARY_SERVICE_HEAD],
        body: summary.services,
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      });
    }

    // Stamping running footers on all pages: "Page X of Y"
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('K&A Animal Bite Treatment Center · Rural Health Unit · Confidential Clinical Report', MARGIN, pageHeight - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
    }

    return doc;
  }

  async function exportBulkPdf() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    const logoToUse = logoDataUrl || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;
    const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
    buildBulkPdf(rows, logoToUse).save(`health-monitoring-report-${period}${statusSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
    onToast(`Landscape PDF exported (${rows.length} patient${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  function runBulkExport() {
    if (exportFormat === 'xls') exportBulkXLS();
    else exportBulkPdf();
  }

  const docType = 'record';
  // A single patient record is usually well short of a full page, and a fixed
  // portrait sheet left a band of blank paper under the footer. The sheet is
  // measured from the rendered document instead, so it ends where the
  // content ends. Null until the iframe reports back.
  const [docSheetHeight, setDocSheetHeight] = useState(null);

  // Built from the patient's actual schedule (lib/doseSchedules.js), e.g.
  // PEP "Day 0, 3, 7, 28", PrEP "Day 0, 7", Anti-Tetanus "Day 0, 1 month,
  // 6 months", Pneumonia "single dose (adult)".
  function getProtocolLabel(p) {
    const schedule = getSchedule(p?.service);
    const doses = buildDoses(p);
    const doneCount = doses.filter(d => (d.s || d.status) === 'done' || d.done === true).length;
    let timing;
    if (schedule.doses.length === 1) {
      timing = p?.service === 'Pneumonia' ? 'single dose (adult)' : 'single dose';
    } else {
      timing = schedule.doses.map((d, i) => (
        typeof d.month === 'number'
          ? `${d.month} month${d.month === 1 ? '' : 's'}`
          : (i === 0 ? `Day ${d.day || 0}` : String(d.day || 0))
      )).join(', ');
    }
    const hasERIG = p?.service === 'PEP' && doses.some(d => (d.n || d.label || '').includes('ERIG'));
    const progress = doses.length ? ` · ${doneCount} of ${doses.length} dose${doses.length === 1 ? '' : 's'} given` : '';
    return `${hasERIG ? 'ERIG + ' : ''}${schedule.label}: ${timing}${progress}`;
  }

  const PATIENT_HIDDEN_NOTE = 'Wound assessment details are held in your clinical file at K&A Clinic.';

  // ── ONE MODEL, TWO RENDERERS ──────────────────────────────────────────
  // The on-screen preview and the downloaded PDF used to be written out
  // separately and had drifted: the preview carried sections the PDF never
  // printed. Both now render this single description of the record, so what
  // the preview shows is what the file contains.
  function buildMedicalRecordModel(p, audience = 'clinic') {
    const showWoundDetail = audience !== 'patient';
    const doses = buildDoses(p);
    const rawDate = p.date || (p.createdAt?.toDate ? p.createdAt.toDate() : p.createdAt);
    const registered = rawDate
      ? (formatDateLong(rawDate) || formatDateShort(rawDate) || String(rawDate).split('T')[0])
      : (p.date || '—');
    const st = derivePatientStatus(p);
    const isPEP = (p.service || '').trim().toUpperCase() === 'PEP';
    const caseNo = p.firestoreId ? p.firestoreId.slice(0, 8).toUpperCase() : (p.id || '—');

    const admin = [
      ['Date', registered, 'MRN', p.id || p.mrn || '—'],
      ['Account / Case No.', caseNo, 'Ward / Service', `${serviceLabel(p.service || 'PEP')} (Animal Bite Clinic)`],
      ['Primary Attending', 'Dr. Francis R. Reyes, MD', 'Status', st.toUpperCase()],
    ];

    const complaintRows = isPEP
      ? [
          ['Presenting Complaint', `Clinical evaluation and post-exposure prophylaxis following exposure to ${p.animal || 'animal'} on ${fmtDate(p.date) || registered}. Assessed as Category ${p.cat || '—'} bite exposure.`],
          ['Exposure Category', `Category ${p.cat || '—'}`],
          ...(showWoundDetail
            ? [['Wound Site / Depth', `${p.woundLocation || '—'} · ${p.woundDepth || '—'} · Bites: ${p.numberOfBites || '1'}`]]
            : [['Wound Assessment', PATIENT_HIDDEN_NOTE]]),
        ]
      : [
          ['Presenting Complaint', `Patient received clinical assessment and vaccination administration under the ${serviceLabel(p.service) || 'vaccination'} protocol.`],
        ];

    const sections = [
      {
        title: '1. PATIENT DEMOGRAPHICS',
        rows: [
          ['Name', formatTitleCase(p.name)],
          ['Age / Gender', `${p.age || '—'} yrs · ${(p.sex || '—').toUpperCase()}`],
          ['Date of Birth', p.dob ? (formatDateLong(p.dob) || p.dob) : '—'],
          ['Height / Weight', `${p.height ? `${p.height} cm` : '—'} · ${p.weight ? `${p.weight} kg` : '—'}`],
          ['Blood Pressure', p.bloodPressure || '—'],
          ['Contact / Address', `${p.contact || '—'} · ${p.address || '—'}`],
          ['Guarantor / Next of Kin', p.emergencyName
            ? `${p.emergencyName}${p.emergencyRel ? ` (${p.emergencyRel})` : ''}${p.emergencyPhone ? ` · ${p.emergencyPhone}` : ''}`
            : (p.guardian || p.emergencyContact || '—')],
        ],
      },
      {
        title: '2. ENCOUNTER SUMMARY',
        rows: [
          ['Encounter Type', 'Outpatient Clinical Consultation & Prophylaxis'],
          ['Protocol / Reason', isPEP ? `Animal Bite Exposure (${p.animal || 'Animal'} Bite)` : `${serviceLabel(p.service) || 'Vaccination'} Protocol`],
          ['Registration Date', registered],
          ['Treatment Protocol', getProtocolLabel(p)],
          ['Attending Facility', 'K&A Animal Bite Treatment Center · Municipality of Libon, Province of Albay'],
        ],
      },
      {
        title: '3. CHIEF COMPLAINT & CLINICAL DETAILS',
        rows: complaintRows,
      },
      {
        title: '4. MEDICAL HISTORY',
        rows: [
          ['Past Vaccines', p.pastVaccines || 'None reported'],
          ['Allergies', p.allergies || 'No known allergies'],
        ],
      },
    ];

    const doseRows = doses.map(d => {
      const rawStatus = String(d.status || d.s || 'pending').toLowerCase();
      const isDone = rawStatus === 'done' || rawStatus === 'completed' || d.done === true;
      const isMiss = rawStatus === 'miss' || rawStatus === 'missed' || rawStatus === 'overdue';
      return {
        label: d.label || d.n || d.dose || d.name || 'Dose',
        date: d.date ? (formatDateShort(d.date) || d.date) : '—',
        status: isMiss ? 'Overdue' : isDone ? 'Completed' : 'Scheduled',
        kind: isMiss ? 'miss' : isDone ? 'done' : 'pending',
      };
    });

    const assessment = [
      ['Assessment', st === 'completed'
        ? 'Successfully completed full prescribed post-exposure prophylaxis regimen with no adverse reactions.'
        : 'Ongoing vaccination treatment. Patient is adhering to protocol.'],
      ['Plan & Recommendations', 'Complete remaining scheduled vaccine doses on designated dates. Maintain proper wound care hygiene. Avoid applying irritants or traditional remedies to bite wound. Report any fever, malaise, or neurological symptoms immediately.'],
    ];

    return {
      registered,
      status: st,
      admin,
      sections,
      doseSectionTitle: '5. VACCINATION DOSING SCHEDULE',
      doseRows,
      assessmentTitle: '6. ASSESSMENTS & RECOMMENDATIONS',
      assessment,
      officer: {
        name: 'Dr. Francis R. Reyes, MD',
        license: 'PRC License # 0123456 · Animal Bite Treatment Specialist',
        issued: `Date Issued: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        badge: 'VERIFIED EHR CLINICAL RECORD',
      },
      footer: [
        `Generated by K&A Clinic EHR System · Confidential Patient Information · ${new Date().getFullYear()}`,
        'K&A Animal Bite Center · Municipality of Libon, Province of Albay',
      ],
    };
  }

  const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function medicalRecordBodyHtml(p, audience = 'clinic', logo = (logoDataUrl || CLINIC_LOGO_BASE64)) {
    if (!p) return '<div style="padding:40px;text-align:center;color:#64748B;">No patient record selected.</div>';
    const m = buildMedicalRecordModel(p, audience);

    const CELL = 'padding:4.5px 8px;border:1px solid #CBD5E1;font-size:9.5px;line-height:1.45;';
    const LABEL_CELL = `${CELL}background:#F8FAFC;color:#475569;font-weight:700;width:26%;vertical-align:top;`;
    const VALUE_CELL = `${CELL}color:#0F172A;vertical-align:top;`;
    const statusColor = m.status === 'completed' ? '#15803D' : m.status === 'overdue' ? '#DC2626' : '#1D4ED8';

    // Administrative box: two label/value pairs per row, the same 4-column
    // shape autoTable draws in the PDF.
    const adminRows = m.admin.map(([l1, v1, l2, v2]) => `
      <tr>
        <td style="${LABEL_CELL}width:22%;">${escapeHtml(l1)}</td>
        <td style="${VALUE_CELL}width:28%;">${escapeHtml(v1)}</td>
        <td style="${LABEL_CELL}width:22%;">${escapeHtml(l2)}</td>
        <td style="${VALUE_CELL}width:28%;${l2 === 'Status' ? `font-weight:700;color:${statusColor};` : ''}">${escapeHtml(v2)}</td>
      </tr>`).join('');

    const sectionHtml = (title, rows) => `
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed;">
        <thead>
          <tr><th colspan="2" style="${CELL}background:#0A1D47;color:#FFFFFF;text-align:left;font-weight:700;letter-spacing:.3px;">${escapeHtml(title)}</th></tr>
        </thead>
        <tbody>
          ${rows.map(([label, value]) => `
          <tr>
            <td style="${LABEL_CELL}">${escapeHtml(label)}</td>
            <td style="${VALUE_CELL}">${escapeHtml(value)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    const doseTable = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed;">
        <thead>
          <tr>
            <th style="${CELL}background:#1D4ED8;color:#FFFFFF;text-align:left;font-weight:700;width:40%;">Dose</th>
            <th style="${CELL}background:#1D4ED8;color:#FFFFFF;text-align:left;font-weight:700;width:35%;">Scheduled Date</th>
            <th style="${CELL}background:#1D4ED8;color:#FFFFFF;text-align:left;font-weight:700;width:25%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${m.doseRows.length
            ? m.doseRows.map((d, i) => `
          <tr style="background:${i % 2 ? '#FAFAFC' : '#FFFFFF'};">
            <td style="${VALUE_CELL}">${escapeHtml(d.label)}</td>
            <td style="${VALUE_CELL}">${escapeHtml(d.date)}</td>
            <td style="${VALUE_CELL}font-weight:700;">${escapeHtml(d.status)}</td>
          </tr>`).join('')
            : `<tr><td colspan="3" style="${VALUE_CELL}text-align:center;color:#64748B;">No dose schedule on file.</td></tr>`}
        </tbody>
      </table>`;

    return `
      <div style="font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;font-size:10px;line-height:1.5;padding:20px 24px;background:#FFFFFF;">

        <!-- Institutional letterhead -->
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 4px;border:none;">
          <tr>
            <td style="vertical-align:middle;padding-right:14px;width:62px;text-align:right;">
              <img src="${logo || '/assets/dashboard/logo-white-nobg.png'}" alt="K&A Clinic Logo" style="width:58px;height:58px;object-fit:contain;display:block;" />
            </td>
            <td style="vertical-align:middle;text-align:center;padding:0 6px;">
              <div style="font-size:15px;font-weight:900;color:#0F172A;letter-spacing:0.6px;text-transform:uppercase;">K&amp;A ANIMAL BITE CENTER</div>
              <div style="font-size:8.5px;color:#1D4ED8;font-weight:700;margin-top:2px;">Caring for Life &bull; Animal Bite Treatment &amp; Care</div>
              <div style="font-size:8px;color:#64748B;margin-top:2px;">Municipality of Libon, Province of Albay | Ph: (052) 742-0123 | ka.animalbitecenter@gmail.com</div>
            </td>
            <td style="vertical-align:middle;padding-left:14px;width:62px;text-align:left;">
              <img src="${LIBON_SEAL_BASE64}" alt="Municipality of Libon seal" style="width:58px;height:58px;object-fit:contain;display:block;" />
            </td>
          </tr>
        </table>

        <div style="border-top:1.6px solid #0A1D47;border-bottom:.6px solid #0A1D47;height:2px;margin:6px 0 10px;"></div>

        <div style="text-align:center;margin-bottom:10px;">
          <h1 style="margin:0;font-size:13px;font-weight:900;color:#0A1D47;letter-spacing:1px;text-transform:uppercase;">PATIENT MEDICAL REPORT</h1>
        </div>

        <!-- Administrative information -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed;">
          <thead>
            <tr><th colspan="4" style="${CELL}background:#F1F5F9;color:#0A1D47;text-align:center;font-weight:700;letter-spacing:.3px;">ADMINISTRATIVE INFORMATION</th></tr>
          </thead>
          <tbody>${adminRows}</tbody>
        </table>

        ${m.sections.map(s => sectionHtml(s.title, s.rows)).join('')}

        <div style="font-size:9.5px;font-weight:800;color:#0F172A;letter-spacing:.3px;margin:10px 0 4px;">${escapeHtml(m.doseSectionTitle)}</div>
        ${doseTable}

        ${sectionHtml(m.assessmentTitle, m.assessment)}

        <!-- Attending officer & verification -->
        <table style="width:100%;border-collapse:collapse;margin-top:10px;border-top:1px solid #CBD5E1;">
          <tr>
            <td style="padding-top:8px;font-size:9px;color:#334155;vertical-align:bottom;">
              <div><strong>Attending Medical Officer:</strong> ${escapeHtml(m.officer.name)}</div>
              <div style="font-size:8px;color:#64748B;">${escapeHtml(m.officer.license)}</div>
              <div style="font-size:8px;color:#64748B;">${escapeHtml(m.officer.issued)}</div>
            </td>
            <td style="padding-top:8px;text-align:right;vertical-align:bottom;">
              <span style="display:inline-block;padding:3px 8px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:4px;font-size:8px;font-weight:700;color:#1D4ED8;">${escapeHtml(m.officer.badge)}</span>
            </td>
          </tr>
        </table>

        <div style="margin-top:12px;font-size:7.5px;color:#94A3B8;text-align:center;line-height:1.5;">
          ${escapeHtml(m.footer[0])}<br>${escapeHtml(m.footer[1])}
        </div>
      </div>`;
  }

  function buildDocumentHtml(p, type = 'record', audience = 'clinic') {
    if (!p) return '<!DOCTYPE html><html><body><div style="padding:40px;text-align:center;color:#64748B;">No patient selected.</div></body></html>';
    return `<!DOCTYPE html><html><head><title>Patient Medical Report — ${formatTitleCase(p.name || '')}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      /* Browsers drop table fills when printing unless colour adjustment is
         forced, which is what turned the navy section bars pale grey on paper. */
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
      body{font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#FFFFFF;}
      @media print{
        @page{size:A4 portrait;margin:8mm 10mm;}
        html,body{margin:0!important;padding:0!important;background:#FFFFFF!important;}
        /* Keeps the record on one sheet and stops a section splitting across
           the page break. */
        body{zoom:0.88;}
        table{page-break-inside:avoid;break-inside:avoid;}
        tr,td,th{page-break-inside:avoid;break-inside:avoid;}
        thead{display:table-header-group;}
      }
    </style>
    </head><body><div>${medicalRecordBodyHtml(p, audience, logoDataUrl || CLINIC_LOGO_BASE64)}</div></body></html>`;
  }

  // `density` scales the table metrics so a long record can be squeezed onto
  // one sheet — buildDocumentPdf steps through the presets until the whole
  // report fits, matching the preview, which never paginates.
  function drawMedicalRecordPdf(doc, p, audience = 'clinic', logoDataUrl = clinicLogoBase64Cache || CLINIC_LOGO_BASE64, density = { fontSize: 8, cellPadding: 2.5, gap: 4 }) {
    if (!p) return;
    const m = buildMedicalRecordModel(p, audience);
    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', 14, 8, 14, 14);
      } catch (e) {
        console.warn('Could not add logo to single report PDF:', e);
      }
    }
    // Libon municipal seal, mirrored on the right at the same size and height.
    try {
      doc.addImage(LIBON_SEAL_BASE64, 'PNG', pageWidth - 14 - 14, 8, 14, 14);
    } catch (e) {
      console.warn('Could not add Libon seal to single report PDF:', e);
    }

    // Clean institutional header matching report format
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('K&A ANIMAL BITE CENTER', pageWidth / 2, 13, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(29, 78, 216);
    doc.text('Caring for Life · Animal Bite Treatment & Care', pageWidth / 2, 17, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Municipality of Libon, Province of Albay | Ph: (052) 742-0123 | ka.animalbitecenter@gmail.com', pageWidth / 2, 21, { align: 'center' });

    // Double divider line
    doc.setDrawColor(10, 29, 71);
    doc.setLineWidth(0.6);
    doc.line(14, 24, pageWidth - 14, 24);
    doc.setLineWidth(0.2);
    doc.line(14, 25.5, pageWidth - 14, 25.5);

    // Document Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 29, 71);
    doc.text('PATIENT MEDICAL REPORT', pageWidth / 2, 31, { align: 'center' });

    const baseStyles = { fontSize: density.fontSize, cellPadding: density.cellPadding, overflow: 'linebreak', valign: 'top' };
    const GAP = density.gap;
    const labelColumn = { 0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 45 } };

    // Administrative Information Box
    autoTable(doc, {
      startY: 34,
      head: [['ADMINISTRATIVE INFORMATION', '', '', '']],
      body: m.admin,
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [10, 29, 71], fontStyle: 'bold', fontSize: density.fontSize, halign: 'center' },
      styles: baseStyles,
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 35 },
        2: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 35 },
      },
    });

    // Sections 1–4, straight off the shared model so the PDF carries every
    // field the preview shows.
    m.sections.forEach(section => {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + GAP,
        head: [[section.title, '']],
        body: section.rows,
        theme: 'grid',
        headStyles: { fillColor: [10, 29, 71], textColor: 255, fontSize: density.fontSize, fontStyle: 'bold' },
        styles: baseStyles,
        columnStyles: labelColumn,
      });
    });

    // 5. Vaccination Dosing Schedule
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + GAP,
      head: [['Dose', 'Scheduled Date', 'Status']],
      body: m.doseRows.length
        ? m.doseRows.map(d => [d.label, d.date, d.status])
        : [['No dose schedule on file.', '', '']],
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontSize: density.fontSize, fontStyle: 'bold' },
      styles: baseStyles,
      alternateRowStyles: { fillColor: [250, 250, 252] },
    });

    // 6. Assessments & Recommendations
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + GAP,
      head: [[m.assessmentTitle, '']],
      body: m.assessment,
      theme: 'grid',
      headStyles: { fillColor: [10, 29, 71], textColor: 255, fontSize: density.fontSize, fontStyle: 'bold' },
      styles: baseStyles,
      columnStyles: labelColumn,
    });

    // Attending officer & verification. The block is pinned above the footer
    // rather than pushed to a second page — buildDocumentPdf re-renders at a
    // tighter density instead, so the report stays a single sheet.
    const pageHeight = doc.internal.pageSize.getHeight();
    const y = Math.min(doc.lastAutoTable.finalY + 8, pageHeight - 26);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(14, y, pageWidth - 14, y);

    const yText = y + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Attending Medical Officer:', 14, yText);
    const officerLabelWidth = doc.getTextWidth('Attending Medical Officer: ');
    doc.setFont('helvetica', 'normal');
    doc.text(m.officer.name, 14 + officerLabelWidth, yText);

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(m.officer.license, 14, yText + 4);
    doc.text(m.officer.issued, 14, yText + 8);

    // Verified badge, right-aligned against the officer block
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const badgeWidth = doc.getTextWidth(m.officer.badge) + 6;
    const badgeX = pageWidth - 14 - badgeWidth;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(badgeX, yText + 1, badgeWidth, 6, 1, 1, 'FD');
    doc.setTextColor(29, 78, 216);
    doc.text(m.officer.badge, badgeX + 3, yText + 5);

    // Footer on every page
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(m.footer[0], pageWidth / 2, pageHeight - 11, { align: 'center' });
      doc.text(m.footer[1], pageWidth / 2, pageHeight - 7.5, { align: 'center' });
    }
  }

  // Preview and print show the whole record in one continuous sheet, so the
  // download must not split mid-table. Each preset is drawn into a throwaway
  // document; the first that lands on a single page is the one returned, and
  // the tightest is used as-is if even that overflows.
  const PDF_DENSITIES = [
    { fontSize: 8, cellPadding: 2.5, gap: 4 },
    { fontSize: 7.5, cellPadding: 2, gap: 3.5 },
    { fontSize: 7, cellPadding: 1.6, gap: 3 },
    { fontSize: 6.5, cellPadding: 1.2, gap: 2.5 },
    { fontSize: 6, cellPadding: 1, gap: 2 },
  ];

  function buildDocumentPdf(p, type = 'record', audience = 'clinic', logoDataUrl = clinicLogoBase64Cache || CLINIC_LOGO_BASE64) {
    let doc;
    for (let i = 0; i < PDF_DENSITIES.length; i++) {
      doc = new jsPDF({ compress: true });
      drawMedicalRecordPdf(doc, p, audience, logoDataUrl, PDF_DENSITIES[i]);
      if (doc.internal.getNumberOfPages() === 1) return doc;
    }
    return doc;
  }

  function docTypeLabel() {
    return 'Patient Medical Report';
  }

  async function exportSinglePatientPdf(p) {
    if (!p) return;
    const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
    buildDocumentPdf(p, docType, 'clinic', logo).save(`medical-report-${p.id || p.mrn || p.firestoreId || 'patient'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    onToast(`Medical Report exported for ${formatTitleCase(p.name)}`, 'success');
  }

  function printSinglePatientReport(p) {
    if (!p) return;
    const w = window.open('', '_blank');
    if (!w) {
      onToast('Pop-up was blocked. Please allow pop-ups for this site.', 'error');
      return;
    }
    w.document.write(buildDocumentHtml(p, docType, 'clinic'));
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch (e) { console.error('Print error:', e); }
    }, 250);
    onToast(`Medical Report opened for printing — ${formatTitleCase(p.name)}`, 'success');
  }

  // The clinic report used to be mailed as its own rendered HTML page. With a
  // base64 logo on every page that body ran to megabytes and the send silently
  // failed, so the registry now travels as the same PDF the Export button
  // produces, with a short covering note as the body.
  async function emailBulkReportPdf(to) {
    try {
      const rows = getFilteredPatients();
      if (rows.length === 0) {
        onToast('No patients found for this period', 'error');
        return;
      }
      const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
      const pdf = pdfToBytes(buildBulkPdf(rows, logo));
      if (!pdf?.byteLength) {
        onToast('Could not generate the PDF report. Please try again.', 'error');
        return;
      }
      const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
      await sendReportEmail(
        to,
        `K&A Clinic — Health Monitoring Report (${periodLabel()})`,
        `<p>Attached is the K&amp;A Animal Bite Center health monitoring report for <strong>${periodLabel()}</strong>.</p>`
          + `<p>Service: ${serviceFilterLabel()} &bull; Status: ${statusFilterLabel()} &bull; ${rows.length} patient record${rows.length !== 1 ? 's' : ''}.</p>`
          + `<p>&mdash; K&amp;A Animal Bite Center</p>`,
        { pdf, filename: `health-monitoring-report-${period}${statusSlug}-${getTodayDateString()}.pdf` }
      );
    } catch (err) {
      console.error('emailBulkReportPdf error:', err);
      onToast('Failed to prepare PDF report for emailing.', 'error');
    }
  }

  async function emailSinglePatientPdf(p, to) {
    if (!p) return;
    try {
      const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
      const pdf = pdfToBytes(buildDocumentPdf(p, docType, 'patient', logo));
      if (!pdf?.byteLength) {
        onToast('Could not generate the PDF attachment. Please try again.', 'error');
        return;
      }
      await sendReportEmail(
        to,
        `K&A Clinic — Medical Report for ${formatTitleCase(p.name)}`,
        `<p>Dear ${formatTitleCase(p.name)},</p><p>Please find your official patient medical report from K&amp;A Animal Bite Center attached as a PDF.</p><p>&mdash; K&amp;A Animal Bite Center</p>`,
        { pdf, filename: `medical-report-${p.id || p.mrn || p.firestoreId || 'patient'}.pdf` }
      );
    } catch (err) {
      console.error('emailSinglePatientPdf error:', err);
      onToast('Failed to prepare patient document for emailing.', 'error');
    }
  }

  // The measured height belongs to one specific rendered document; re-measure
  // rather than briefly showing the previous record's sheet size.
  useEffect(() => { setDocSheetHeight(null); }, [selectedPatient, showEmailInput, mode, exportFormat, period, statusFilter, serviceFilter]);

  const preview = getFilteredPatients();

  // The clinic report is landscape orientation, so the preview sheet turns
  // landscape for bulk exports and stays portrait for a single patient record.
  const isLandscapeSheet = mode === 'bulk';

  // `allow-same-origin` (with scripts still blocked) is what makes the loaded
  // document readable for the height measurement below.
  const previewPane = (html, onMeasure) => (
    <iframe
      title="Report preview"
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={html}
      onLoad={onMeasure ? (e) => {
        const body = e.currentTarget.contentDocument?.body;
        if (body) onMeasure(Math.ceil(body.scrollHeight));
      } : undefined}
      style={{ display: 'block', width: '100%', height: '100%', border: 'none', background: '#FFFFFF' }}
    />
  );

  const selectStyle = {
    width: '100%', padding: '9px 12px', fontSize: '.8125rem', fontWeight: 600, color: '#0F172A',
    border: '1px solid #CBD5E1', borderRadius: 12, background: '#FFFFFF', outline: 'none', cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
  };
  const labelStyle = {
    display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155',
    textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6
  };
  const previewPages = mode === 'bulk' ? chunkPatientsIntoPages(preview).length : 1;
  // Width is the paper; height comes from whatever the rendered document
  // actually measured, so a short record has no trailing blank paper and a
  // multi-page report shows every page stacked.
  const sheetWidth = mode === 'bulk' ? 1100 : 820;
  // Full measured height for every document, so the paper never scrolls on
  // its own; the preview area scrolls instead.
  const sheetHeight = mode === 'bulk'
    ? (docSheetHeight || previewPages * 790)
    : (docSheetHeight || 1060);

  return (
    <Modal onClose={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200"
        style={{ width: '1360px', maxWidth: '98vw', height: '92vh', maxHeight: '960px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Card head */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ flexShrink: 0, background: '#F4F6FE', borderBottom: '1px solid #E0E5FA' }}
        >
          <div className="flex items-center gap-3">
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#3B50DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {mode === 'single' ? `Export Patient Record — ${formatTitleCase(selectedPatient?.name || 'Patient')}` : 'Export Clinic Report'}
              </h3>
              <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                {mode === 'single'
                  ? `Official patient medical report for ${formatTitleCase(selectedPatient?.name || 'Patient')}`
                  : 'Download, print, or email official clinic registry reports'}
              </p>
            </div>
          </div>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={onClose} />
        </div>

        {/* 2-column split body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT PANEL: settings */}
          <div style={{
            width: '340px', flexShrink: 0, background: '#F7F8FD',
            borderRight: '1px solid #E3E7F5', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto'
          }}>
            {mode === 'bulk' ? (
              <>
                {/* Report Period */}
                <div>
                  <label style={labelStyle}>Report Period</label>
                  <Select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
                    <option value="monthly">Monthly (This Calendar Month)</option>
                    <option value="daily">Daily (Today)</option>
                    <option value="weekly">Weekly (Last 7 Days)</option>
                    <option value="yearly">Yearly (This Calendar Year)</option>
                    <option value="all">All Time (Full Registry)</option>
                  </Select>
                </div>

                {/* Service / Vaccine */}
                <div>
                  <label style={labelStyle}>Service / Vaccine</label>
                  <Select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Services</option>
                    <option value="pep">PEP (Post-Exposure Prophylaxis)</option>
                    <option value="prep">PrEP (Pre-Exposure Prophylaxis)</option>
                    <option value="tetanus">Anti-Tetanus</option>
                    <option value="pneumonia">Pneumonia Vaccine</option>
                  </Select>
                </div>

                {/* Record Status */}
                <div>
                  <label style={labelStyle}>Record Status</label>
                  <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Statuses</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="overdue">Overdue</option>
                    <option value="completed">Completed</option>
                  </Select>
                </div>

                {/* Export Format */}
                <div>
                  <label style={labelStyle}>Export Format</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setExportFormat('pdf')}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        exportFormat === 'pdf' ? 'border-[#3B50DF] bg-[#EEF2FF] shadow-xs ring-1 ring-[#3B50DF]/30' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${exportFormat === 'pdf' ? 'bg-[#3B50DF] text-white' : 'bg-slate-100 text-slate-600'}`}>
                        PDF
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-900">PDF</div>
                        <div className="text-[10px] text-slate-600">Official printout</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('xls')}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        exportFormat === 'xls' ? 'border-[#3B50DF] bg-[#EEF2FF] shadow-xs ring-1 ring-[#3B50DF]/30' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${exportFormat === 'xls' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        XLS
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-900">Excel</div>
                        <div className="text-[10px] text-slate-600">Raw data</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Matching result banner */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs">
                  <span className="font-medium text-slate-600">Matching records:</span>
                  <span className="font-extrabold text-[#3B50DF] bg-[#EEF2FF] px-2.5 py-1 rounded-full border border-[#E0E7FF]">
                    {preview.length} patient{preview.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* Target patient */}
                <div>
                  <label style={labelStyle}>Target Patient Record</label>
                  {selectedPatient ? (
                    <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '.8125rem', fontWeight: 800, color: '#0F172A' }}>
                        {formatTitleCase(selectedPatient.name || '—')}
                      </div>
                      <div style={{ fontSize: '.71875rem', color: '#64748B', marginTop: 2 }}>
                        ID: <strong style={{ color: '#3B50DF' }}>{selectedPatient.id || selectedPatient.mrn || '—'}</strong>
                        {selectedPatient.age ? ` · ${selectedPatient.age} yrs` : ''} · {selectedPatient.sex || '—'}
                      </div>
                      <div style={{ fontSize: '.71875rem', color: '#64748B', marginTop: 4 }}>
                        {selectedPatient.service || 'PEP'} · {selectedPatient.barangay || selectedPatient.address || 'Libon, Albay'}
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.71875rem', color: '#64748B' }}>
                        <span>Exposure / Category:</span>
                        <strong style={{ color: '#0F172A' }}>
                          {((selectedPatient.service || '').trim().toUpperCase() === 'PEP')
                            ? (selectedPatient.cat ? `Category ${selectedPatient.cat}` : (selectedPatient.animal || '—'))
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={patientQuery}
                        onChange={e => setPatientQuery(e.target.value)}
                        placeholder="Search by name, ID, or MRN…"
                        style={{ ...selectStyle, cursor: 'text', fontWeight: 500 }}
                      />
                      {matchingPatients.length > 0 && (
                        <div className="mt-1.5 border border-slate-200 rounded-xl bg-white shadow-lg overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                          {matchingPatients.map(p => (
                            <button
                              key={p.id || p.firestoreId}
                              type="button"
                              onClick={() => { setSelectedPatient(p); setPatientQuery(formatTitleCase(p.name)); }}
                              className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                            >
                              <span className="font-bold text-slate-800">{formatTitleCase(p.name)}</span>
                              <span className="text-slate-400 text-[11px]">{p.id || p.mrn}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Document type — the medical record is the only issued form */}
                <div>
                  <label style={labelStyle}>Document Type</label>
                  <div style={{ ...selectStyle, cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{docTypeLabel()}</span>
                    <span style={{ fontSize: '.6875rem', color: '#64748B', fontWeight: 600 }}>PDF / Print</span>
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
              {mode === 'bulk' ? (
                <>
                  <button
                    type="button"
                    onClick={runBulkExport}
                    disabled={preview.length === 0}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid transparent',
                      background: '#3B50DF', color: '#FFFFFF', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: preview.length === 0 ? 0.5 : 1
                    }}
                  >
                    <Download size={14} />
                    Export {exportFormat === 'xls' ? 'Excel (XLS)' : 'PDF'} ({preview.length})
                  </button>
                  <button
                    type="button"
                    onClick={exportPrint}
                    disabled={preview.length === 0}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#0F172A', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: preview.length === 0 ? 0.5 : 1
                    }}
                  >
                    <Printer size={14} />
                    Print Report
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => exportSinglePatientPdf(selectedPatient)}
                    disabled={!selectedPatient}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid transparent',
                      background: '#3B50DF', color: '#FFFFFF', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: !selectedPatient ? 0.5 : 1
                    }}
                  >
                    <Download size={14} />
                    Export PDF Document
                  </button>
                  <button
                    type="button"
                    onClick={() => printSinglePatientReport(selectedPatient)}
                    disabled={!selectedPatient}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#0F172A', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: !selectedPatient ? 0.5 : 1
                    }}
                  >
                    <Printer size={14} />
                    Print Patient Record
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowEmailInput(v => !v);
                  setSentTo('');
                  warmReportMailer();
                  if (mode === 'single' && selectedPatient && !emailTo) {
                    setEmailTo(selectedPatient.email || '');
                  }
                }}
                disabled={mode === 'bulk' ? preview.length === 0 : !selectedPatient}
                style={{
                  width: '100%', height: 42, padding: '0 16px', borderRadius: 12,
                  border: showEmailInput ? '1px solid #3B50DF' : '1px solid #CBD5E1',
                  background: showEmailInput ? '#EEF2FF' : '#FFFFFF',
                  color: showEmailInput ? '#3B50DF' : '#0F172A',
                  fontSize: '.8125rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                  opacity: (mode === 'bulk' ? preview.length === 0 : !selectedPatient) ? 0.5 : 1
                }}
              >
                <Mail size={14} />
                Email Report
              </button>

              {showEmailInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, marginTop: 2 }}>
                  {queuedTo && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 8 }}>
                      <Loader2 size={13} style={{ color: '#3B50DF', marginTop: 1, flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                      <div style={{ fontSize: '.71875rem', color: '#3730A3', lineHeight: 1.45 }}>
                        <strong>Sending…</strong> to <strong>{queuedTo}</strong>. You can close this window; a message appears when it's done.
                      </div>
                    </div>
                  )}
                  {sentTo && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8 }}>
                      <span style={{ color: '#047857', fontWeight: 800, lineHeight: 1.2 }}>✓</span>
                      <div style={{ fontSize: '.71875rem', color: '#065F46', lineHeight: 1.45 }}>
                        <strong>Sent.</strong> The report was emailed to <strong>{sentTo}</strong>.
                      </div>
                    </div>
                  )}
                  <input
                    type="email"
                    placeholder="Enter recipient email…"
                    value={emailTo}
                    onChange={e => { setEmailTo(e.target.value); setSentTo(''); }}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '.8125rem', border: '1px solid #CBD5E1', borderRadius: 6, outline: 'none', background: '#fff' }}
                  />
                  <button
                    type="button"
                    disabled={!emailTo.trim()}
                    onClick={() =>
                      mode === 'bulk'
                        ? emailBulkReportPdf(emailTo)
                        : emailSinglePatientPdf(selectedPatient, emailTo)
                    }
                    style={{ width: '100%', height: 38, background: '#3B50DF', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', opacity: !emailTo.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    Send via Email
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: live paper document preview (shared viewer). The bulk
              report draws its own page chrome and page breaks, so only the
              single-patient document gets a white sheet drawn around it. */}
          <PreviewViewer
            pages={previewPages}
            sheetWidth={sheetWidth}
            sheetHeight={sheetHeight}
            sheetStyle={isLandscapeSheet
              ? { background: 'transparent' }
              : { background: '#FFFFFF', borderRadius: 6, border: '1px solid #D8DEF0', boxShadow: '0 6px 24px rgba(15,23,42,0.14)' }}
          >
            {mode === 'bulk' ? (
              previewPane(
                exportFormat === 'xls'
                  ? buildExcelPreviewHtml(preview, periodLabel())
                  : buildBulkReportHtml(preview, logoDataUrl),
                setDocSheetHeight
              )
            ) : selectedPatient ? (
              previewPane(
                buildDocumentHtml(selectedPatient, docType, showEmailInput ? 'patient' : 'clinic'),
                setDocSheetHeight
              )
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', color: '#64748B', fontSize: '.875rem' }}>
                Search and select a patient on the left panel to preview document.
              </div>
            )}
          </PreviewViewer>

        </div>
      </div>
    </Modal>
  );
}
