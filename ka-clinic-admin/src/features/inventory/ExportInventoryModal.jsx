// Export / print / email dialog for the inventory report.
import { Download, X, Printer, Mail, Loader2 } from 'lucide-react';
import Modal from '../../components/Modal';
import IconButton from '../../components/IconButton';
import Select from '../../components/Select';
import { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase';
import { getTodayDateString } from '../../lib/formatters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CLINIC_LOGO_BASE64 } from '../../assets/clinicLogoBase64';
import { clinicLogoBase64Cache, drawReportHeader, getClinicLogoBase64, pdfToBase64 } from '../../lib/pdfReport';
import { deriveStockLabel, deriveStockStatus, fmtUnit } from '../../lib/inventoryStock';
import PreviewViewer from '../../components/PreviewViewer';

// Which vaccine an item is, for the report summary. Immunoglobulin is checked
// before rabies so ERIG/HRIG are not counted as rabies vaccine. Non-vaccine
// categories (Medicine, Supply) are grouped by their category.
function vaccineTypeOf(item) {
  const n = String(item.name || '').toLowerCase();
  if ((item.category || 'Vaccine') !== 'Vaccine') return item.category || 'Other';
  if (/immunoglobulin|\berig\b|\bhrig\b|\brig\b/.test(n)) return 'Rabies Immunoglobulin (RIG)';
  if (/rabies|rabipur|verorab|speeda|pcec|pvrv|hdcv|\barv\b/.test(n)) return 'Anti-Rabies Vaccine';
  if (/tetanus|toxoid|\btt\b|\btd\b|\bats\b|\btig\b/.test(n)) return 'Anti-Tetanus';
  if (/pneumo|prevnar|pcv|ppsv/.test(n)) return 'Pneumococcal';
  if (/flu|influenza/.test(n)) return 'Influenza';
  return 'Other Vaccine';
}

// Closing summary of an inventory report: totals, per vaccine type counts,
// and every low or out-of-stock item. Out-of-stock items are always listed,
// so a vaccine at zero never drops out of the report.
function buildInventorySummary(rows) {
  const count = { 'in-stock': 0, 'low-stock': 0, 'out-of-stock': 0 };
  const byType = {};
  let units = 0;
  rows.forEach(item => {
    const st = deriveStockStatus(item);
    const stock = parseInt(item.stock, 10) || 0;
    count[st]++;
    units += Math.max(0, stock);
    const t = vaccineTypeOf(item);
    byType[t] = byType[t] || { items: 0, units: 0, 'in-stock': 0, 'low-stock': 0, 'out-of-stock': 0 };
    byType[t].items++;
    byType[t].units += Math.max(0, stock);
    byType[t][st]++;
  });
  return {
    totals: [
      ['Total items', rows.length],
      ['Units in stock', units],
      ['In stock', count['in-stock']],
      ['Low stock', count['low-stock']],
      ['Out of stock', count['out-of-stock']],
    ],
    types: Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, c]) => [t, c.items, c.units, c['in-stock'], c['low-stock'], c['out-of-stock']]),
    flags: rows
      .filter(i => deriveStockStatus(i) !== 'in-stock')
      .sort((a, b) => (parseInt(a.stock, 10) || 0) - (parseInt(b.stock, 10) || 0))
      .map(i => [i.name || '—', vaccineTypeOf(i), String(parseInt(i.stock, 10) || 0), String(parseInt(i.minStock, 10) || 10), deriveStockLabel(i)]),
  };
}

const SUMMARY_TYPE_HEAD = ['Vaccine type', 'Items', 'Units', 'In stock', 'Low', 'Out'];

const SUMMARY_FLAG_HEAD = ['Needs restocking', 'Type', 'Stock', 'Min', 'Status'];

// The summary shares the last page when few rows are on it, else it gets its own page.
const SUMMARY_FITS_AFTER_ROWS = 8;

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

export function ExportInventoryModal({ inventory, onClose, onToast }) {
  const [logoDataUrl, setLogoDataUrl] = useState(clinicLogoBase64Cache || CLINIC_LOGO_BASE64);
  useEffect(() => {
    getClinicLogoBase64().then(b64 => {
      if (b64) setLogoDataUrl(b64);
    });
  }, []);

  // A stock report is a snapshot of what the clinic holds now, so it covers
  // every item by default. The period filter (by the date an item was added)
  // used to default to "this month", which silently left out older items,
  // including ones that had run out.
  const [period, setPeriod] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf'); // 'pdf' | 'xls'
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
            ${(() => {
              if (rows.length === 0) return '';
              const s = buildInventorySummary(rows);
              let n = rows.length + 6;
              const line = cells => `<tr><td class="row-num">${n++}</td>${cells}</tr>`;
              const cells = (vals, bold) => vals.map((v, i) => `<td ${i === 0 ? 'colspan="3"' : ''} style="${bold ? 'font-weight:bold;background:#F1F5F9;' : ''}${i ? 'text-align:center;' : ''}">${v}</td>`).join('');
              return [
                line('<td colspan="8" style="height:4px;"></td>'),
                line('<td colspan="8" style="font-weight:bold;color:#1D4ED8;background:#EFF6FF;">INVENTORY SUMMARY</td>'),
                ...s.totals.map(([k, v]) => line(`<td colspan="3" style="background:#F8FAFC;">${k}</td><td style="font-weight:bold;text-align:center;">${v}</td><td colspan="4"></td>`)),
                line('<td colspan="8" style="height:4px;"></td>'),
                line(cells(SUMMARY_TYPE_HEAD, true)),
                ...s.types.map(r => line(cells(r))),
                ...(s.flags.length ? [
                  line('<td colspan="8" style="height:4px;"></td>'),
                  line(cells(SUMMARY_FLAG_HEAD, true) + '<td></td><td></td>'),
                  ...s.flags.map(r => line(cells(r) + '<td></td><td></td>')),
                ] : []),
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

  // Exact Landscape Multi-Page HTML Report with physical cut lines and page breaks
  function buildInventoryReportHtml(rows, logoSrc = CLINIC_LOGO_BASE64) {
    const pages = chunkInventoryIntoPages(rows);
    const summaryOwnPage = rows.length > 0 && pages[pages.length - 1].length > SUMMARY_FITS_AFTER_ROWS;
    const totalPages = pages.length + (summaryOwnPage ? 1 : 0);
    const summary = rows.length ? buildInventorySummary(rows) : null;
    const tbl = (head, body, numFrom = 1) => `
      <table class="summary-table">
        <thead><tr>${head.map((h, i) => `<th class="${i >= numFrom ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
        <tbody>${body.map(r => `<tr>${r.map((v, i) => `<td class="${i >= numFrom ? 'num' : ''}${String(v).toUpperCase() === 'OUT OF STOCK' ? ' out' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    const summaryHtml = summary ? `
      <div class="summary">
        <div class="summary-title">Inventory Summary</div>
        <div class="summary-grid">
          <table class="summary-table"><tbody>${summary.totals.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>
          ${tbl(SUMMARY_TYPE_HEAD, summary.types)}
        </div>
        ${summary.flags.length ? `<div style="margin-top:10px;">${tbl(SUMMARY_FLAG_HEAD, summary.flags, 2)}</div>` : '<p class="summary-ok">No low or out-of-stock items.</p>'}
      </div>` : '';
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
            ${pIdx === pages.length - 1 && !summaryOwnPage ? summaryHtml : ''}
          </div>

          <div class="footer">
            <span>K&amp;A Animal Bite Treatment Center &bull; Rural Health Unit &bull; Official Inventory Registry Report</span>
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
                  <div class="header-brand">K&amp;A ANIMAL BITE CENTER &mdash; INVENTORY REPORT</div>
                  <div class="header-sub">Inventory Stock Summary &mdash; ${periodLabel()} &bull; Summary</div>
                </div>
              </div>
            </div>
            <div class="header-line"></div>
            ${summaryHtml}
          </div>
          <div class="footer">
            <span>K&amp;A Animal Bite Treatment Center &bull; Rural Health Unit &bull; Official Inventory Registry Report</span>
            <span>Page ${totalPages} of ${totalPages}</span>
          </div>
        </div>` : '');

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

      .summary{margin-top:12px;}
      .summary-title{font-size:10px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;border-bottom:1.5px solid #0A1D47;margin-bottom:8px;}
      .summary-grid{display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;}
      table.summary-table{width:100%;border-collapse:collapse;font-size:8.5px;border:1px solid #CBD5E1;}
      table.summary-table th, table.summary-table td{border:1px solid #CBD5E1;padding:4px 7px;text-align:left;white-space:nowrap;}
      table.summary-table th{background:#EFF6FF;font-weight:800;}
      table.summary-table .num{text-align:center;font-variant-numeric:tabular-nums;}
      table.summary-table td.out{color:#DC2626;font-weight:700;}
      .summary-ok{font-size:9px;color:#15803D;margin:8px 0 0;}
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
      drawReportHeader(doc, {
        logo: logoToUse,
        margin: MARGIN,
        pageWidth,
        title: 'K&A ANIMAL BITE CENTER — INVENTORY REPORT',
        subtitle: `Inventory Stock Summary — ${periodLabel()}${isContinuation ? ' • Continuation' : ''}`,
        filters: `Category: ${categoryFilterLabel()}  |  Status: ${statusFilterLabel()}  |  Date: ${dateGeneratedStr}`,
      });
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

    // Closing summary: on the last page when it fits, else on its own page.
    if (rows.length > 0) {
      const summary = buildInventorySummary(rows);
      const ownPage = pages[pages.length - 1].length > SUMMARY_FITS_AFTER_ROWS;
      let y;
      if (ownPage) { doc.addPage(); drawPdfHeader(true); y = 26; } else { y = doc.lastAutoTable.finalY + 8; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('INVENTORY SUMMARY', MARGIN, y);
      doc.setDrawColor(10, 29, 71);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y + 1.5, pageWidth - MARGIN, y + 1.5);
      const base = {
        theme: 'grid',
        headStyles: { fillColor: [239, 246, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', cellPadding: 1.4, lineColor: [203, 213, 225], lineWidth: 0.1 },
        styles: { fontSize: 7, cellPadding: 1.4, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.1 },
        margin: { bottom: 12 },
        didParseCell: (data) => {
          if (data.section === 'body' && String(data.cell.raw).toUpperCase() === 'OUT OF STOCK') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      };
      const leftW = CONTENT_WIDTH * 0.3;
      autoTable(doc, { ...base, startY: y + 4, margin: { ...base.margin, left: MARGIN }, tableWidth: leftW, body: summary.totals, columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } } });
      const leftEnd = doc.lastAutoTable.finalY;
      autoTable(doc, { ...base, startY: y + 4, margin: { ...base.margin, left: MARGIN + leftW + 8 }, tableWidth: CONTENT_WIDTH - leftW - 8, head: [SUMMARY_TYPE_HEAD], body: summary.types, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } } });
      if (summary.flags.length) {
        autoTable(doc, { ...base, startY: Math.max(leftEnd, doc.lastAutoTable.finalY) + 5, margin: { ...base.margin, left: MARGIN, right: MARGIN }, head: [SUMMARY_FLAG_HEAD], body: summary.flags, columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } } });
      }
    }

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

    const LAST_DATA_ROW = aoa.length - 1;
    const summary = buildInventorySummary(rows);
    aoa.push([], ['INVENTORY SUMMARY']);
    const SUMMARY_TITLE_ROW = aoa.length - 1;
    summary.totals.forEach(r => aoa.push(r));
    aoa.push([], SUMMARY_TYPE_HEAD, ...summary.types);
    if (summary.flags.length) aoa.push([], SUMMARY_FLAG_HEAD, ...summary.flags);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const TEXT_COLUMNS = [6];
    for (let r = HEADER_ROW + 1; r <= LAST_DATA_ROW; r++) {
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
      { s: { r: SUMMARY_TITLE_ROW, c: 0 }, e: { r: SUMMARY_TITLE_ROW, c: headers.length - 1 } },
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: HEADER_ROW + 1 };
    ws['!autofilter'] = {
      ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: LAST_DATA_ROW, c: headers.length - 1 })}`,
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

  return (
    <Modal onClose={onClose}>
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
            {/* Report Period */}
            <div>
              <label style={labelStyle}>Report Period</label>
              <Select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
                <option value="monthly">Monthly (This Calendar Month)</option>
                <option value="daily">Daily (Today)</option>
                <option value="weekly">Weekly (Last 7 Days)</option>
                <option value="yearly">Yearly (This Calendar Year)</option>
                <option value="all">All Time (Full Inventory)</option>
              </Select>
            </div>

            {/* Category */}
            <div>
              <label style={labelStyle}>Item Category</label>
              <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
            </div>

            {/* Stock Status */}
            <div>
              <label style={labelStyle}>Stock Status</label>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Statuses</option>
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock (Reorder Needed)</option>
                <option value="out-of-stock">Out of Stock</option>
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

          {/* RIGHT PANEL: live paper document preview (shared viewer) */}
          <PreviewViewer
            pages={previewPages}
            sheetWidth={sheetWidth}
            sheetHeight={sheetHeight}
            sheetStyle={{ background: 'transparent' }}
          >
            {previewPane(
              exportFormat === 'xls'
                ? buildExcelPreviewHtml(preview, periodLabel())
                : buildInventoryReportHtml(preview, logoDataUrl),
              setDocSheetHeight
            )}
          </PreviewViewer>

        </div>
      </div>
    </Modal>
  );
}
