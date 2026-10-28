import XLSX from 'xlsx-js-style';

/**
 * Shared styling tokens and helpers for Excel (.xlsx) exports.
 * Mirrors the on-screen live preview format (royal blue headers, light-blue banners,
 * formatted summary badges, and status colors) while auto-fitting column widths.
 */

export const EXCEL_PALETTE = {
  headerBg: '1D4ED8',        // Royal Blue #1D4ED8
  headerText: 'FFFFFF',      // White
  bannerBg: 'EFF6FF',        // Soft blue tint #EFF6FF
  bannerText: '1D4ED8',      // Royal Blue #1D4ED8
  subtitleBg: 'F8FAFC',      // Slate #F8FAFC
  subtitleText: '475569',    // Slate #475569
  cardBg: 'F1F5F9',          // Light gray card #F1F5F9
  gridBorder: 'CBD5E1',      // Light border #CBD5E1
  headerBorder: '1E40AF',    // Darker blue border for headers
  darkText: '0F172A',        // Dark slate #0F172A
  bodyText: '1E293B',        // Body text #1E293B
  // Status Colors
  ongoingBlue: '1D4ED8',     // Blue #1D4ED8
  overdueRed: 'DC2626',      // Red #DC2626
  completedGreen: '15803D',  // Green #15803D
  lowStockAmber: 'D97706',   // Amber #D97706
};

const thinBorder = {
  top: { style: 'thin', color: { rgb: EXCEL_PALETTE.gridBorder } },
  bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.gridBorder } },
  left: { style: 'thin', color: { rgb: EXCEL_PALETTE.gridBorder } },
  right: { style: 'thin', color: { rgb: EXCEL_PALETTE.gridBorder } },
};

export const EXCEL_STYLES = {
  // Title Banner (Row 1)
  title: {
    font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: EXCEL_PALETTE.bannerText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.bannerBg } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
    border: thinBorder,
  },

  // Subtitle (Row 2)
  subtitle: {
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.subtitleText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.subtitleBg } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
    border: thinBorder,
  },

  // Metric Cards (Row 3)
  metricCard: (colorRgb = EXCEL_PALETTE.darkText) => ({
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: colorRgb } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.cardBg } },
    alignment: { vertical: 'center', horizontal: 'center' },
    border: thinBorder,
  }),

  // Table Column Headers (Row 5)
  tableHeader: (align = 'center') => ({
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_PALETTE.headerText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.headerBg } },
    alignment: { vertical: 'center', horizontal: align },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.headerBorder } },
      bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.headerBorder } },
      left: { style: 'thin', color: { rgb: EXCEL_PALETTE.headerBorder } },
      right: { style: 'thin', color: { rgb: EXCEL_PALETTE.headerBorder } },
    },
  }),

  // Data Cells
  dataCell: ({ align = 'left', bold = false, colorRgb = EXCEL_PALETTE.bodyText, bgRgb = 'FFFFFF' } = {}) => ({
    font: { name: 'Calibri', sz: 11, bold, color: { rgb: colorRgb } },
    fill: { fgColor: { rgb: bgRgb } },
    alignment: { vertical: 'center', horizontal: align },
    border: thinBorder,
  }),

  // Section Banner in Summary
  sectionBanner: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_PALETTE.bannerText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.bannerBg } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
    border: thinBorder,
  },

  // Subtable Header in Summary
  summaryHeader: (align = 'left') => ({
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.bodyText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.cardBg } },
    alignment: { vertical: 'center', horizontal: align },
    border: thinBorder,
  }),

  // Summary Totals Label (Cols A-C)
  summaryLabel: {
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.bodyText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.subtitleBg } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
    border: thinBorder,
  },

  // Summary Totals Value (Col D)
  summaryValue: (align = 'right') => ({
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.darkText } },
    fill: { fgColor: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center', horizontal: align },
    border: thinBorder,
  }),

  // Empty Spacer Cell
  spacerCell: {
    fill: { fgColor: { rgb: 'FFFFFF' } },
    border: {
      top: { style: 'none' },
      bottom: { style: 'none' },
      left: { style: 'none' },
      right: { style: 'none' },
    },
  },
};

/**
 * Apply style to all cells in a merged range so the background fill and borders
 * span seamlessly across the entire merge block in Microsoft Excel.
 */
export function applyRangeStyle(ws, range, style) {
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = style;
    }
  }
}

/**
 * Compute auto-fit column widths (wch) dynamically from cell contents.
 * Cells that participate in a multi-column merge are skipped so that long
 * banners in A1 don't stretch column A alone.
 */
export function computeAutoFitColumns(aoa, merges = [], minWidths = []) {
  const colCount = aoa[0] ? aoa.reduce((max, r) => Math.max(max, r.length), 0) : 0;
  const colWidths = new Array(colCount).fill(0);

  for (let c = 0; c < colCount; c++) {
    colWidths[c] = minWidths[c] || 10;
  }

  const isMergedAcrossCols = (r, c) => {
    return merges.some(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c && m.s.c !== m.e.c);
  };

  aoa.forEach((row, r) => {
    row.forEach((cellVal, c) => {
      if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
        if (isMergedAcrossCols(r, c)) return;
        const str = String(cellVal);
        const lines = str.split('\n');
        const maxLineLen = Math.max(...lines.map(l => l.length));
        // Add + 4 chars padding for bold fonts and Excel auto-filter dropdown arrows
        if (maxLineLen + 4 > colWidths[c]) {
          colWidths[c] = maxLineLen + 4;
        }
      }
    });
  });

  return colWidths.map(w => ({ wch: Math.max(w, 8) }));
}

export default XLSX;
