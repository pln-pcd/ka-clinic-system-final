// kna-admin/src/inventory.jsx
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { AlertCircle, Check, Download, Edit3, FileText, Minus, Package, Plus, Search, X, XCircle, Printer, Mail, Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from '../lib/firebase';
import { today, getTodayDateString, formatDateNumeric, formatDateLong } from '../lib/dates';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Toast from '../components/Toast';
import { CLINIC_LOGO_BASE64 } from '../assets/clinicLogoBase64';

/* ─────────────────────────── CSS ─────────────────────────── */
const globalCSS = `
  :root {
    --primary-blue: #3B50DF;
    --blue-hover: #2F40B5;
    --bg-main: #F0F4FA;
    --bg-card: #FFFFFF;
    --text-main: #1C1C1E;
    --text-muted: #7A6E6E;
    --border: #E8E2E2;
    --radius-lg: 10px;
  }

  body { font-family: 'Roboto', system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text-main); }

  .btn-add {
    background: var(--primary-blue);
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.2s;
    border: none;
    cursor: pointer;
  }
  .btn-add:hover { background: var(--blue-hover); }

  .btn-export {
    background: white;
    color: #374151;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    border: 1px solid #E5E7EB;
    cursor: pointer;
  }
  .btn-export:hover { background: #F9FAFB; border-color: #D1D5DB; }

  .inventory-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .inventory-table th {
    background: #F4F1F1;
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    padding: 10px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .inventory-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 0.8125rem;
  }

  .filter-select {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-main);
    background: white;
    outline: none;
  }

  .badge-status {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .export-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    background: white;
    width: 100%;
    text-align: left;
  }
  .export-option:hover { border-color: #3B50DF; background: #F8FAFC; }
  .export-option-selected { border-color: #3B50DF !important; background: #EEF2FF !important; }
`;

/* ─────────────────────────── EXPORT INVENTORY REPORT MODAL ─────────────────────────── */
let clinicLogoBase64Cache = CLINIC_LOGO_BASE64;
async function getClinicLogoBase64() {
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

function pdfToBase64(doc) {
  const uri = doc.output('datauristring');
  const comma = uri.indexOf(',');
  return comma === -1 ? '' : uri.slice(comma + 1);
}

const fmtUnit = (u) => u ? u.charAt(0).toUpperCase() + u.slice(1) : '';

function deriveStockStatus(item) {
  const stock = parseInt(item.stock, 10) || 0;
  const min = parseInt(item.minStock, 10) || 10;
  if (stock <= 0) return 'out-of-stock';
  if (stock <= min) return 'low-stock';
  return 'in-stock';
}

function deriveStockLabel(item) {
  const st = deriveStockStatus(item);
  if (st === 'out-of-stock') return 'Out of Stock';
  if (st === 'low-stock') return 'Low Stock';
  return 'In Stock';
}

const liveStatus = (item) => deriveStockStatus(item);

const PAGE_1_ROWS = 22;
const CONT_PAGE_ROWS = 24;

function chunkInventoryIntoPages(rows) {
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

function ExportInventoryModal({ inventory, onClose, onToast }) {
  const [logoDataUrl, setLogoDataUrl] = useState(clinicLogoBase64Cache || CLINIC_LOGO_BASE64);
  useEffect(() => {
    getClinicLogoBase64().then(b64 => {
      if (b64) setLogoDataUrl(b64);
    });
  }, []);

  const [period, setPeriod] = useState('monthly');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf'); // 'pdf' | 'xls'
  const [zoomLevel, setZoomLevel] = useState(0.85);
  const [docSheetHeight, setDocSheetHeight] = useState(null);

  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');

  // Extract unique categories
  const categories = Array.from(new Set(inventory.map(i => (i.category || '').trim()).filter(Boolean)));

  function getItemTimestamp(item) {
    if (item.createdAt) {
      if (typeof item.createdAt === 'number') return item.createdAt;
      if (item.createdAt.toDate) return item.createdAt.toDate().getTime();
      if (item.createdAt.toMillis) return item.createdAt.toMillis();
      const d = new Date(item.createdAt);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    if (item.date) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    return null;
  }

  function getFilteredItems() {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const todayStr = getTodayDateString();

    return inventory.filter(item => {
      // Period filter
      if (period !== 'all') {
        const ts = getItemTimestamp(item);
        if (ts) {
          const itemDate = new Date(ts);
          const itemDateStr = getTodayDateString(itemDate);
          if (period === 'daily') {
            if (itemDateStr !== todayStr) return false;
          } else if (period === 'weekly') {
            const diffMs = now.getTime() - ts;
            if (diffMs < 0 || diffMs > 7 * 24 * 60 * 60 * 1000) return false;
          } else if (period === 'monthly') {
            if (itemDate.getFullYear() !== curYear || itemDate.getMonth() !== curMonth) return false;
          } else if (period === 'yearly') {
            if (itemDate.getFullYear() !== curYear) return false;
          }
        }
      }

      // Category filter
      if (categoryFilter !== 'all') {
        if ((item.category || '').trim().toLowerCase() !== categoryFilter.trim().toLowerCase()) return false;
      }

      // Status filter
      const st = deriveStockStatus(item);
      if (statusFilter !== 'all' && st !== statusFilter) return false;

      return true;
    });
  }

  function periodLabel() {
    const now = new Date();
    if (period === 'all') return 'All Time (Full Inventory)';
    if (period === 'daily') return now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (period === 'weekly') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      return `${from.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (period === 'monthly') return now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    if (period === 'yearly') return String(now.getFullYear());
    return 'All Records';
  }

  function categoryFilterLabel() {
    if (categoryFilter === 'all') return 'All Categories';
    return categoryFilter;
  }

  function statusFilterLabel() {
    if (statusFilter === 'in-stock') return 'In Stock';
    if (statusFilter === 'low-stock') return 'Low Stock';
    if (statusFilter === 'out-of-stock') return 'Out of Stock';
    return 'All Statuses';
  }

  async function sendReportEmail(to, subject, html, attachment) {
    const trimmed = to.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      onToast('Enter a valid recipient email address.', 'error');
      return;
    }
    if (!auth.currentUser) {
      onToast('You must be signed in as an administrator to send reports.', 'error');
      return;
    }
    setSending(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch('/api/send-patient-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          to: trimmed,
          subject,
          html,
          ...(attachment ? { attachmentBase64: attachment.base64, attachmentFilename: attachment.filename } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        onToast(`Report emailed to ${trimmed}`, 'success');
        setSentTo(trimmed);
        setEmailTo('');
      } else {
        onToast(data?.error || `Failed to send email (${res.status} ${res.statusText})`, 'error');
      }
    } catch (err) {
      console.error('sendReportEmail error:', err);
      onToast(err?.message || 'Network error while sending the email.', 'error');
    } finally {
      setSending(false);
    }
  }

  // Realistic Microsoft Excel Live Table Preview HTML
  function buildExcelPreviewHtml(rows, periodLabelStr) {
    const statusCount = { inStock: 0, lowStock: 0, outOfStock: 0 };
    rows.forEach(item => {
      const st = deriveStockStatus(item);
      if (st === 'in-stock') statusCount.inStock++;
      else if (st === 'low-stock') statusCount.lowStock++;
      else statusCount.outOfStock++;
    });

    const headers = ['#', 'Item Name / Description', 'Category', 'Stock Level', 'Unit', 'Min Stock', 'Expiration Date', 'Stock Status'];
    const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    const tableRows = rows.length === 0
      ? `<tr><td class="row-num">6</td><td colspan="8" style="text-align:center;padding:16px;color:#64748B;font-style:italic;">No ${statusFilter === 'all' ? '' : statusFilterLabel() + ' '}inventory items found for this period.</td></tr>`
      : rows.map((item, idx) => {
          const st = deriveStockStatus(item);
          const stLabel = deriveStockLabel(item);
          const stColor = st === 'in-stock' ? '#15803D' : st === 'low-stock' ? '#D97706' : '#DC2626';
          const rowNum = idx + 6;
          return `<tr>
            <td class="row-num">${rowNum}</td>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-weight:bold;color:#0F172A;">${item.name || '—'}</td>
            <td style="text-align:center;">${item.category || 'General'}</td>
            <td style="text-align:center;font-weight:bold;">${item.stock !== undefined && item.stock !== null ? item.stock : 0}</td>
            <td style="text-align:center;">${fmtUnit(item.unit) || 'Vials'}</td>
            <td style="text-align:center;">${item.minStock !== undefined && item.minStock !== null ? item.minStock : 10}</td>
            <td style="text-align:center;">${item.expiry || item.expiryDate || '—'}</td>
            <td style="text-align:center;font-weight:bold;color:${stColor};">${stLabel.toUpperCase()}</td>
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
              <td colspan="8" style="font-size:13px;font-weight:bold;color:#1D4ED8;background:#EFF6FF;">INVENTORY &amp; STOCK MANAGEMENT REGISTRY REPORT</td>
            </tr>
            <tr>
              <td class="row-num">2</td>
              <td colspan="8" style="color:#475569;background:#F8FAFC;">Period Covered: <strong>${periodLabelStr}</strong> &nbsp;|&nbsp; Category: <strong>${categoryFilterLabel()}</strong> &nbsp;|&nbsp; Status: <strong>${statusFilterLabel()}</strong> &nbsp;|&nbsp; Date Generated: ${new Date().toLocaleString('en-PH')}</td>
            </tr>
            <tr>
              <td class="row-num">3</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;">Total Items: ${rows.length}</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;color:#15803D;">In Stock: ${statusCount.inStock}</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;color:#D97706;">Low Stock: ${statusCount.lowStock}</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;color:#DC2626;">Out of Stock: ${statusCount.outOfStock}</td>
            </tr>
            <tr>
              <td class="row-num">4</td>
              <td colspan="8" style="background:#FFFFFF;height:4px;"></td>
            </tr>
            <tr style="background:#1D4ED8;color:#FFFFFF;font-weight:bold;">
              <td class="row-num" style="background:#F1F5F9;color:#64748B;">5</td>
              ${headers.map(h => `<td style="background:#1D4ED8;color:#FFFFFF;font-weight:bold;text-align:${h === '#' || h === 'Stock Level' || h === 'Unit' || h === 'Min Stock' || h === 'Expiration Date' || h === 'Stock Status' ? 'center' : 'left'};">${h}</td>`).join('')}
            </tr>
            ${tableRows}
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

  // Exact Landscape Multi-Page HTML Report with physical cut lines and page breaks
  function buildInventoryReportHtml(rows, logoSrc = CLINIC_LOGO_BASE64) {
    const pages = chunkInventoryIntoPages(rows);
    const totalPages = pages.length;
    const dateGeneratedStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentLogo = logoSrc || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;

    const renderedPagesHtml = pages.map((pageRows, pIdx) => {
      const pageNum = pIdx + 1;
      const startNum = pIdx === 0 ? 0 : PAGE_1_ROWS + (pIdx - 1) * CONT_PAGE_ROWS;

      const tableRows = pageRows.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748B;font-style:italic;">No ${statusFilter === 'all' ? '' : statusFilterLabel() + ' '}inventory items found for this period.</td></tr>`
        : pageRows.map((item, i) => {
            const st = deriveStockStatus(item);
            const stLabel = deriveStockLabel(item);
            const stColor = st === 'in-stock' ? '#15803D' : st === 'low-stock' ? '#D97706' : '#DC2626';

            return `
            <tr>
              <td class="col-center">${startNum + i + 1}</td>
              <td class="col-left" style="font-weight:700;">${item.name || '—'}</td>
              <td class="col-center">${item.category || 'General'}</td>
              <td class="col-center" style="font-weight:700;">${item.stock !== undefined && item.stock !== null ? item.stock : 0}</td>
              <td class="col-center">${fmtUnit(item.unit) || 'Vials'}</td>
              <td class="col-center">${item.minStock !== undefined && item.minStock !== null ? item.minStock : 10}</td>
              <td class="col-center">${item.expiry || item.expiryDate || '—'}</td>
              <td class="col-center" style="font-weight:700;color:${stColor};">${stLabel.toUpperCase()}</td>
            </tr>`;
          }).join('');

      const pageHeader = `
        <div class="report-header">
          <div class="header-left">
            <img src="${currentLogo}" alt="K&A Clinic Logo" class="header-logo" />
            <div>
              <div class="header-muni">Municipality of Libon, Province of Albay</div>
              <div class="header-brand">K&amp;A ANIMAL BITE CENTER &mdash; INVENTORY REPORT</div>
              <div class="header-sub">Inventory Stock Summary &mdash; ${periodLabel()}${pIdx > 0 ? ' &bull; Continuation' : ''}</div>
            </div>
          </div>
          <div class="header-right">
            <span>Category: ${categoryFilterLabel()}</span> &nbsp;|&nbsp; <span>Status: ${statusFilterLabel()}</span> &nbsp;|&nbsp; <span>Date: ${dateGeneratedStr}</span>
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
                  <th style="width:26%;text-align:left;">Item Name / Description</th>
                  <th style="width:14%;text-align:center;">Category</th>
                  <th style="width:12%;text-align:center;">Stock Level</th>
                  <th style="width:8%;text-align:center;">Unit</th>
                  <th style="width:10%;text-align:center;">Min Stock</th>
                  <th style="width:13%;text-align:center;">Expiration Date</th>
                  <th style="width:13%;text-align:center;">Stock Status</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <span>K&amp;A Animal Bite Treatment Center &bull; Rural Health Unit &bull; Official Inventory Registry Report</span>
            <span>Page ${pageNum} of ${totalPages}</span>
          </div>
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html><html><head><title>Inventory Report — ${periodLabel()}</title>
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
    const rows = getFilteredItems();
    if (rows.length === 0) { onToast('No inventory items found for this period', 'error'); return; }
    const w = window.open('', '_blank');
    w.document.write(buildInventoryReportHtml(rows, logoDataUrl || CLINIC_LOGO_BASE64));
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 250);
    onToast(`${period.charAt(0).toUpperCase() + period.slice(1)} inventory report opened for printing`, 'success');
  }

  function buildInventoryBulkPdf(rows, logoDataUrl = CLINIC_LOGO_BASE64) {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const dateGeneratedStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const logoToUse = logoDataUrl || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;

    const MARGIN = 14;
    const CONTENT_WIDTH = pageWidth - MARGIN * 2;
    const COL_PERCENT = [4, 26, 14, 12, 8, 10, 13, 13];
    const COL_ALIGN = ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center'];
    const columnStyles = COL_PERCENT.reduce((acc, pct, i) => {
      acc[i] = {
        halign: COL_ALIGN[i],
        cellWidth: (CONTENT_WIDTH * pct) / 100,
        ...(i === 7 ? { fontStyle: 'bold' } : {}),
      };
      return acc;
    }, {});

    function drawPdfHeader(isContinuation) {
      const hasLogo = Boolean(logoToUse);
      const textX = hasLogo ? 27 : MARGIN;

      if (hasLogo) {
        try {
          doc.addImage(logoToUse, 'PNG', MARGIN, 5.8, 10.5, 10.5);
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
      doc.text('K&A ANIMAL BITE CENTER — INVENTORY REPORT', textX, 12.5);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Inventory Stock Summary — ${periodLabel()}${isContinuation ? ' • Continuation' : ''}`, textX, 16.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(`Category: ${categoryFilterLabel()}  |  Status: ${statusFilterLabel()}  |  Date: ${dateGeneratedStr}`, pageWidth - MARGIN, 16.8, { align: 'right' });

      doc.setDrawColor(10, 29, 71);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 19.5, pageWidth - MARGIN, 19.5);
    }

    const bodyForChunk = (pageRows, startNum) => pageRows.map((item, i) => {
      const stLabel = deriveStockLabel(item);
      return [
        startNum + i + 1,
        item.name || '—',
        item.category || 'General',
        item.stock !== undefined && item.stock !== null ? String(item.stock) : '0',
        fmtUnit(item.unit) || 'Vials',
        item.minStock !== undefined && item.minStock !== null ? String(item.minStock) : '10',
        item.expiry || item.expiryDate || '—',
        stLabel.toUpperCase(),
      ];
    });

    const pages = chunkInventoryIntoPages(rows);
    pages.forEach((pageRows, pIdx) => {
      if (pIdx > 0) doc.addPage();
      drawPdfHeader(pIdx > 0);

      const startNum = pIdx === 0 ? 0 : PAGE_1_ROWS + (pIdx - 1) * CONT_PAGE_ROWS;
      autoTable(doc, {
        startY: 21.5,
        margin: { top: 21.5, bottom: 12, left: MARGIN, right: MARGIN },
        head: [['#', 'Item Name / Description', 'Category', 'Stock Level', 'Unit', 'Min Stock', 'Expiration Date', 'Stock Status']],
        body: pageRows.length
          ? bodyForChunk(pageRows, startNum)
          : [[{ content: `No ${statusFilter === 'all' ? '' : statusFilterLabel() + ' '}inventory items found for this period.`, colSpan: 8, styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' } }]],
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
          if (data.section === 'body' && data.column.index === 7) {
            if (data.cell.raw === 'IN STOCK') {
              data.cell.styles.textColor = [21, 128, 61];
            } else if (data.cell.raw === 'LOW STOCK') {
              data.cell.styles.textColor = [217, 119, 6];
            } else {
              data.cell.styles.textColor = [220, 38, 38];
            }
          }
        },
      });
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('K&A Animal Bite Treatment Center · Rural Health Unit · Confidential Inventory Report', MARGIN, pageHeight - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
    }

    return doc;
  }

  function exportBulkPdf() {
    const rows = getFilteredItems();
    if (rows.length === 0) { onToast('No inventory items found for this period', 'error'); return; }
    const logoToUse = logoDataUrl || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;
    const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
    buildInventoryBulkPdf(rows, logoToUse).save(`inventory-report-${period}${statusSlug}-${getTodayDateString()}.pdf`);
    onToast(`Landscape PDF exported (${rows.length} item${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  function exportBulkXLS() {
    const rows = getFilteredItems();
    if (rows.length === 0) { onToast('No inventory items found for this period', 'error'); return; }

    const statusCount = { inStock: 0, lowStock: 0, outOfStock: 0 };
    const categoryCount = {};
    rows.forEach(item => {
      const st = deriveStockStatus(item);
      if (st === 'in-stock') statusCount.inStock++;
      else if (st === 'low-stock') statusCount.lowStock++;
      else statusCount.outOfStock++;

      const cat = (item.category || 'Unspecified').trim() || 'Unspecified';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    const categoryPct = (n) => (rows.length ? `${Math.round((n / rows.length) * 1000) / 10}%` : '0%');
    const categoryRows = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => [cat, n, categoryPct(n)]);

    const headers = ['#', 'Item Name / Description', 'Category', 'Stock Level', 'Unit', 'Min Stock', 'Expiration Date', 'Stock Status'];

    const aoa = [
      ['INVENTORY & STOCK MANAGEMENT REGISTRY REPORT'],
      ['RURAL HEALTH UNIT • ANIMAL BITE TREATMENT CENTER • LIBON, ALBAY'],
      [`Period Covered: ${periodLabel()}`, `Category: ${categoryFilterLabel()}`, `Status: ${statusFilterLabel()}`, `Date Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      ['SUMMARY METRICS'],
      ['Total Items', rows.length, 'In Stock', statusCount.inStock, 'Low Stock', statusCount.lowStock, 'Out of Stock', statusCount.outOfStock],
      [],
      ['CATEGORY BREAKDOWN'],
      ['Category', 'Items', 'Share'],
      ...categoryRows,
      [],
      headers,
    ];

    const HEADER_ROW = aoa.length - 1;
    rows.forEach((item, idx) => {
      aoa.push([
        idx + 1,
        item.name || '—',
        item.category || 'General',
        item.stock !== undefined && item.stock !== null ? Number(item.stock) : 0,
        fmtUnit(item.unit) || 'Vials',
        item.minStock !== undefined && item.minStock !== null ? Number(item.minStock) : 10,
        item.expiry || item.expiryDate || '—',
        deriveStockLabel(item).toUpperCase(),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const TEXT_COLUMNS = [6];
    for (let r = HEADER_ROW + 1; r < aoa.length; r++) {
      TEXT_COLUMNS.forEach(c => {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref];
        if (cell) { cell.t = 's'; cell.z = '@'; cell.v = String(cell.v); }
      });
    }

    ws['!cols'] = [
      { wch: 5 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } },
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: HEADER_ROW + 1 };
    ws['!autofilter'] = {
      ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: aoa.length - 1, c: headers.length - 1 })}`,
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Registry');

    const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
    XLSX.writeFile(wb, `inventory-report-${period}${statusSlug}-${getTodayDateString()}.xlsx`);
    onToast(`Excel report exported (${rows.length} item${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  function runExport() {
    if (exportFormat === 'xls') exportBulkXLS();
    else exportBulkPdf();
  }

  async function emailBulkReportPdf(to) {
    try {
      const rows = getFilteredItems();
      if (rows.length === 0) {
        onToast('No inventory items found for this period', 'error');
        return;
      }
      const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
      const base64 = pdfToBase64(buildInventoryBulkPdf(rows, logo));
      if (!base64) {
        onToast('Could not generate the PDF report. Please try again.', 'error');
        return;
      }
      const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
      await sendReportEmail(
        to,
        `K&A Clinic — Inventory Stock Report (${periodLabel()})`,
        `<p>Attached is the K&amp;A Animal Bite Center official inventory stock report for <strong>${periodLabel()}</strong>.</p>`
          + `<p>Category: ${categoryFilterLabel()} &bull; Status: ${statusFilterLabel()} &bull; ${rows.length} item record${rows.length !== 1 ? 's' : ''}.</p>`
          + `<p>&mdash; K&amp;A Animal Bite Center</p>`,
        { base64, filename: `inventory-report-${period}${statusSlug}-${getTodayDateString()}.pdf` }
      );
    } catch (err) {
      console.error('emailBulkReportPdf error:', err);
      onToast('Failed to prepare PDF report for emailing.', 'error');
    }
  }

  useEffect(() => { setDocSheetHeight(null); }, [exportFormat, period, categoryFilter, statusFilter]);

  const preview = getFilteredItems();
  const previewPages = chunkInventoryIntoPages(preview).length;
  const sheetWidth = 1100;
  const sheetHeight = docSheetHeight || (previewPages * 790);

  const previewPane = (html, onMeasure) => (
    <iframe
      title="Report preview"
      sandbox="allow-same-origin"
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

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200"
        style={{ width: '1360px', maxWidth: '98vw', height: '92vh', maxHeight: '960px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Card header */}
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
              <h3 className="text-sm font-bold text-slate-900">Export Inventory Report</h3>
              <p className="text-[11px] text-slate-500 font-normal mt-0.5">Download, print, or email official clinic inventory reports</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* 2-column split body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT PANEL: settings */}
          <div style={{
            width: '340px', flexShrink: 0, background: '#F7F8FD',
            borderRight: '1px solid #E3E7F5', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto'
          }}>
            {/* Report Period */}
            <div>
              <label style={labelStyle}>Report Period</label>
              <select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
                <option value="monthly">Monthly (This Calendar Month)</option>
                <option value="daily">Daily (Today)</option>
                <option value="weekly">Weekly (Last 7 Days)</option>
                <option value="yearly">Yearly (This Calendar Year)</option>
                <option value="all">All Time (Full Inventory)</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label style={labelStyle}>Item Category</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Stock Status */}
            <div>
              <label style={labelStyle}>Stock Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Statuses</option>
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock (Reorder Needed)</option>
                <option value="out-of-stock">Out of Stock</option>
              </select>
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
                {preview.length} item{preview.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={runExport}
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

              <button
                type="button"
                onClick={() => {
                  setShowEmailInput(v => !v);
                  setSentTo('');
                }}
                disabled={preview.length === 0}
                style={{
                  width: '100%', height: 42, padding: '0 16px', borderRadius: 12,
                  border: showEmailInput ? '1px solid #3B50DF' : '1px solid #CBD5E1',
                  background: showEmailInput ? '#EEF2FF' : '#FFFFFF',
                  color: showEmailInput ? '#3B50DF' : '#0F172A',
                  fontSize: '.8125rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                  opacity: preview.length === 0 ? 0.5 : 1
                }}
              >
                <Mail size={14} />
                Email Report
              </button>

              {showEmailInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, marginTop: 2 }}>
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
                    disabled={sending || !emailTo.trim()}
                    onClick={() => emailBulkReportPdf(emailTo)}
                    style={{ width: '100%', height: 38, background: '#3B50DF', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', opacity: (sending || !emailTo.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {sending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Sending… this can take a few seconds</> : 'Send via Email'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: live paper document preview */}
          <div style={{ flex: 1, background: '#EDF0FA', padding: '16px 24px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Viewer toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#FFFFFF', padding: '6px 16px', borderRadius: 12,
              border: '1px solid #E2E8F0',
              color: '#334155', fontSize: '.8125rem', fontWeight: 600,
              boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 16, flexShrink: 0,
              position: 'sticky', top: 0, zIndex: 10
            }}>
              <span style={{ fontSize: '.78125rem', color: '#64748B' }}>
                {previewPages} page{previewPages !== 1 ? 's' : ''}
              </span>

              <div style={{ width: 1, height: 16, background: '#E2E8F0', margin: '0 4px' }} />

              <button type="button" onClick={() => setZoomLevel(z => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom Out">−</button>

              <span style={{ minWidth: 46, textAlign: 'center', fontWeight: 700, color: '#0F172A', background: '#F1F5F9', padding: '2px 8px', borderRadius: 6, fontSize: '.78125rem' }}>
                {Math.round(zoomLevel * 100)}%
              </span>

              <button type="button" onClick={() => setZoomLevel(z => Math.min(1.6, Math.round((z + 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom In">+</button>

              <div style={{ width: 1, height: 16, background: '#E2E8F0', margin: '0 4px' }} />

              <button type="button" onClick={() => setZoomLevel(0.85)} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '.9rem', cursor: 'pointer', padding: '0 4px' }} title="Fit to Page">↕</button>
            </div>

            {/* Paper sheet container */}
            <div style={{
              width: `${sheetWidth * zoomLevel}px`,
              height: `${sheetHeight * zoomLevel}px`,
              flexShrink: 0,
              transition: 'width 0.15s ease, height 0.15s ease',
            }}>
              <div style={{
                width: `${sheetWidth}px`,
                height: `${sheetHeight}px`,
                background: 'transparent',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease',
              }}>
                {previewPane(
                  exportFormat === 'xls'
                    ? buildExcelPreviewHtml(preview, periodLabel())
                    : buildInventoryReportHtml(preview, logoDataUrl),
                  setDocSheetHeight
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────── COMPONENT ─────────────────────────── */
export default function VaccineInventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });

  // Use stock modal state
  const [showUseStockModal, setShowUseStockModal] = useState(false);
  const [useStockQty, setUseStockQty] = useState(1);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    return onSnapshot(q, snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filtered = inventory.filter(item => {
    return (item.name || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());
  });

  /* ── Add Item ── */
  const handleSave = async () => {
    if (!formData.name || !formData.stock) return;
    setSaving(true);
    try {
      const stockNum = Number(formData.stock) || 0;
      const minStockNum = Number(formData.minStock) || 10;
      const selectedCapitalizedUnit = fmtUnit(formData.unit || 'Vials');
      const expirationDate = formData.expiry || '';

      const newItem = {
        name: formData.name.trim(),
        category: formData.category || 'Vaccine',
        stock: stockNum,
        minStock: minStockNum,
        unit: selectedCapitalizedUnit,
        expiry: expirationDate,
        expiryDate: expirationDate,
        status: stockNum <= 0 ? 'critical' : stockNum <= minStockNum ? 'warning' : 'in-stock',
        createdAt: Date.now()
      };
      await addDoc(collection(db, 'inventory'), newItem);
      setShowAddModal(false);
      setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });
    } catch (err) {
      console.error('Inventory add error:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Edit Item ── */
  const openEditModal = (item) => {
    setSelectedItem(item);
    setEditFormData({
      name: item.name || '',
      category: item.category || 'Vaccine',
      unit: item.unit || 'Vials',
      stock: String(item.stock ?? ''),
      minStock: String(item.minStock ?? 10),
      expiry: item.expiry || item.expiryDate || ''
    });
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedItem || !editFormData.name || editFormData.stock === '') return;
    setSaving(true);
    try {
      const stockNum = Number(editFormData.stock) || 0;
      const minStockNum = Number(editFormData.minStock) || 10;
      const selectedCapitalizedUnit = fmtUnit(editFormData.unit || 'Vials');
      const expirationDate = editFormData.expiry || '';

      const updated = {
        name: editFormData.name.trim(),
        category: editFormData.category,
        unit: selectedCapitalizedUnit,
        stock: stockNum,
        minStock: minStockNum,
        expiry: expirationDate,
        expiryDate: expirationDate,
        status: stockNum <= 0 ? 'critical' : stockNum <= minStockNum ? 'warning' : 'in-stock',
      };
      await updateDoc(doc(db, 'inventory', selectedItem.id), updated);
      setShowEditModal(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Inventory edit error:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Use Stock (reduce) ── */
  const openUseStockModal = (item) => {
    setSelectedItem(item);
    setUseStockQty(1);
    setShowUseStockModal(true);
  };

  const handleUseStock = () => {
    if (!selectedItem) return;
    const currentStock = parseInt(selectedItem.stock) || 0;
    const qty = parseInt(useStockQty) || 0;
    if (qty <= 0 || qty > currentStock) return;
    const newStock = currentStock - qty;
    setShowUseStockModal(false);
    setSelectedItem(null);
    updateDoc(doc(db, 'inventory', selectedItem.id), { stock: newStock }).catch(err => {
      console.error('Use stock error:', err);
    });
  };



  return (
    <div className="p-4">
      <style>{globalCSS}</style>

      {/* Stats Row */}
      {(() => {
        const stats = [
          { label: 'Total Items', value: inventory.length, sub: 'Active inventory items', icon: Package },
          { label: 'Low Stock', value: inventory.filter(i => i.stock < 10 && i.stock > 0).length, sub: 'Reorder recommended', icon: AlertCircle },
          { label: 'Out of Stock', value: inventory.filter(i => i.stock <= 0).length, sub: 'Immediate restocking required', icon: XCircle },
        ];
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {stats.map((s, i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-xl py-2.5 px-4 sm:py-3 sm:px-4.5 flex items-center gap-3.5 shadow-2xs hover:shadow-xs transition-all">
                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                  <s.icon size={16} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold text-slate-900 leading-none tabular-nums">{s.value}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-1 truncate">{s.label}</p>
                  <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Main Clean Table Card Container ── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', position: 'relative', zIndex: 10 }}>

        {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 280 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '22rem', minWidth: '16rem' }}>
              <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: .4, pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="text"
                placeholder="Search inventory items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '.8125rem', border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', outline: 'none' }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.78125rem', fontWeight: 600, padding: '7px 12px', border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
            >
              <Download size={13} />
              Export Report
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                background: '#6366F1', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '.5rem',
                fontWeight: 700, fontSize: '.78125rem', display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 4px rgba(99,102,241,0.2)', cursor: 'pointer'
              }}
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>
        </div>

        {/* ── Table Area ── */}
        <div style={{ overflowX: 'auto', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                <th style={{ padding: '16px 12px 16px 20px', width: '25%', fontWeight: 600, color: '#64748B' }}>Item Name</th>
                <th style={{ padding: '16px 12px', width: '18%', fontWeight: 600, color: '#64748B' }}>Category</th>
                <th style={{ padding: '16px 12px', width: '18%', fontWeight: 600, color: '#64748B' }}>Stock</th>
                <th style={{ padding: '16px 12px', width: '17%', fontWeight: 600, color: '#64748B' }}>Expiry</th>
                <th style={{ padding: '16px 12px', width: '12%', fontWeight: 600, color: '#64748B' }}>Status</th>
                <th style={{ padding: '16px 20px 16px 12px', width: '120px', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', transition: 'background .12s ease', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                >
                  <td style={{ padding: '16px 12px 16px 20px', fontWeight: 600, color: '#0F172A', fontSize: '.8125rem' }}>
                    {item.name}
                  </td>
                  <td style={{ padding: '16px 12px', color: '#475569', fontWeight: 500 }}>
                    {item.category}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.stock}</span>
                    <span style={{ fontSize: '.6875rem', color: '#64748B', fontWeight: 600, marginLeft: 4 }}>{fmtUnit(item.unit)}</span>
                  </td>
                  <td style={{ padding: '16px 12px', color: '#64748B', fontWeight: 400 }}>
                    {item.expiry || '—'}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    {(() => {
                      const st = deriveStockStatus(item);
                      const isOut = st === 'out-of-stock';
                      const isLow = st === 'low-stock';
                      const bg = isOut ? '#FEF2F2' : isLow ? '#FFFBEB' : '#ECFDF5';
                      const color = isOut ? '#DC2626' : isLow ? '#D97706' : '#059669';
                      const border = isOut ? '1px solid #FCA5A5' : isLow ? '1px solid #FDE68A' : '1px solid #A7F3D0';
                      return (
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600,
                          background: bg,
                          color: color,
                          border: border
                        }}>
                          {deriveStockLabel(item)}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '16px 20px 16px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit Item"
                        onClick={() => openEditModal(item)}
                        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>No items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }}>
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Add Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Fill in the details for the new vaccine or supply item</p>
              </div>
              <button onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors" title="Close" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="px-7 py-6 space-y-4.5">
              <div>
                <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. BCG Vaccine"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Stock <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stock}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Min Threshold</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={formData.minStock || ''}
                    onChange={e => setFormData(f => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiry}
                    onChange={e => setFormData(f => ({ ...f, expiry: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 pt-2 bg-white flex items-center gap-3">
              <button
                onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name || !formData.stock}
                className="flex-1 py-3 rounded-xl bg-[#3B50DF] text-white font-bold text-sm cursor-pointer hover:bg-indigo-700 shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={16} /> {saving ? 'Saving Item…' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Edit Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showEditModal && selectedItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => { setShowEditModal(false); setSelectedItem(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Edit Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Update details for <span className="font-bold text-slate-700">{selectedItem.name}</span></p>
              </div>
              
              <button onClick={() => { setShowEditModal(false); setSelectedItem(null); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors" title="Close" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="px-7 py-6 space-y-4.5">
              <div>
                <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. BCG Vaccine"
                  value={editFormData.name}
                  onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category</label>
                  <select
                    value={editFormData.category}
                    onChange={e => setEditFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit</label>
                  <select
                    value={editFormData.unit}
                    onChange={e => setEditFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Stock Quantity <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.stock}
                    onChange={e => setEditFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={editFormData.expiry}
                    onChange={e => setEditFormData(f => ({ ...f, expiry: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 pt-2 bg-white flex items-center gap-3">
              <button
                onClick={() => { setShowEditModal(false); setSelectedItem(null); }}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm cursor-pointer hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editFormData.name || !editFormData.stock}
                className="flex-1 py-3 rounded-xl bg-[#3B50DF] text-white font-bold text-sm cursor-pointer hover:bg-indigo-700 shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Check size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Use Stock Modal (Portaled to body) ── */}
      {showUseStockModal && selectedItem && createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur z-[9999] flex items-center justify-center p-4" onClick={() => { setShowUseStockModal(false); setSelectedItem(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Minus size={24} />
                </div>
                <h2 className="text-base font-bold text-gray-900">Use Stock</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Reduce stock for <span className="font-bold text-gray-600">{selectedItem.name}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Current stock: <span className="font-black text-gray-700">{selectedItem.stock}</span> {fmtUnit(selectedItem.unit)}
                </p>
              </div>
              <div className="mb-4">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Quantity to Use <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  max={selectedItem.stock}
                  value={useStockQty}
                  onChange={e => setUseStockQty(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-center focus:ring-1 focus:ring-amber-500 outline-none"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Remaining after use: <span className="font-bold text-gray-600">{Math.max(0, (parseInt(selectedItem.stock) || 0) - (parseInt(useStockQty) || 0))}</span> {fmtUnit(selectedItem.unit)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowUseStockModal(false); setSelectedItem(null); }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUseStock}
                  disabled={(parseInt(useStockQty) || 0) <= 0 || (parseInt(useStockQty) || 0) > (parseInt(selectedItem.stock) || 0)}
                  className="flex-1 py-2.5 text-white rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#F59E0B' }}
                >
                  <Minus size={13} /> Confirm
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Export Report Modal ── */}
      {showExportModal && (
        <ExportInventoryModal
          inventory={inventory}
          onClose={() => setShowExportModal(false)}
          onToast={showToast}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    </div>
  );
}
