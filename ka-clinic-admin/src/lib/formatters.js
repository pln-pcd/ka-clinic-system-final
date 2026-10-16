// Display formatting shared across the dashboard: clinic-time dates
// (Asia/Manila) and patient names. The demo scripts load this file in Node too.

// ══════════════════════════════════════════════════════════════════════════
// Dates (Philippine Standard Time)
// ══════════════════════════════════════════════════════════════════════════
/**
 * Authoritative Philippine Standard Time (UTC+8 / Asia/Manila) Date Utilities
 * Ensures 100% calendrical and timezone accuracy for K&A Animal Bite Center, Libon, Albay
 */

export const CLINIC_TIMEZONE = 'Asia/Manila';

/**
 * Returns today's date in YYYY-MM-DD string specifically in Philippine Standard Time.
 * Avoids the UTC midnight bug where new Date().toISOString() returns yesterday's date
 * between 12:00 AM and 7:59 AM in the Philippines (UTC+8).
 */
export function getTodayDateString(d = new Date()) {
  const date = d instanceof Date ? d : (d?.toDate ? d.toDate() : new Date(d));
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Alias for getTodayDateString() -> 'YYYY-MM-DD' in Asia/Manila
 */
export const today = () => getTodayDateString();

/**
 * Accurately adds or subtracts days to a YYYY-MM-DD string without timezone or DST drift.
 */
export function addDaysToDateString(dStr, days) {
  if (!dStr) return '';
  const cleanStr = String(dStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    // Use UTC noon to safely do calendar arithmetic without local timezone clipping
    const utc = new Date(Date.UTC(year, month, day + Number(days), 12, 0, 0));
    const resYear = utc.getUTCFullYear();
    const resMonth = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const resDay = String(utc.getUTCDate()).padStart(2, '0');
    return `${resYear}-${resMonth}-${resDay}`;
  }
  const d = new Date(dStr);
  d.setDate(d.getDate() + Number(days));
  return getTodayDateString(d);
}

/**
 * Formats any date input (YYYY-MM-DD, ISO string, Date object, Firestore Timestamp, epoch ms)
 * into a concise display: e.g. "Sep 05"
 */
export const formatDateShort = (raw) => {
  if (!raw) return '—';
  try {
    let d;
    if (typeof raw === 'string') {
      const clean = raw.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: '2-digit' });
      }
      d = new Date(raw);
    } else if (raw?.toDate && typeof raw.toDate === 'function') {
      d = raw.toDate();
    } else if (typeof raw === 'number') {
      d = new Date(raw);
    } else if (raw instanceof Date) {
      d = raw;
    }
    if (!d || isNaN(d.getTime())) return String(raw || '—');
    return d.toLocaleDateString('en-US', { timeZone: CLINIC_TIMEZONE, month: 'short', day: '2-digit' });
  } catch {
    return String(raw || '—');
  }
};

/**
 * Formats any date input into a formal long display: e.g. "September 5, 2026"
 */
export const formatDateLong = (raw) => {
  if (!raw) return '—';
  try {
    let d;
    if (typeof raw === 'string') {
      const clean = raw.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        return d.toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
      }
      d = new Date(raw);
    } else if (raw?.toDate && typeof raw.toDate === 'function') {
      d = raw.toDate();
    } else if (typeof raw === 'number') {
      d = new Date(raw);
    } else if (raw instanceof Date) {
      d = raw;
    }
    if (!d || isNaN(d.getTime())) return String(raw || '—');
    return d.toLocaleDateString('en-PH', { timeZone: CLINIC_TIMEZONE, year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(raw || '—');
  }
};

/**
 * Compact date with year for tables and inline labels: e.g. "Sep 5, 2026".
 * formatDateLong is too wide for a table column; formatDateShort drops the year.
 */
// Display name of a service key: records store 'Tetanus', staff see
// "Anti-Tetanus" everywhere (badges, filters, reports).
export const serviceLabel = (service) => {
  const s = String(service || '').trim();
  return /^(tetanus|antitetano|anti-tetano|anti-tetanus)$/i.test(s) ? 'Anti-Tetanus' : s;
};

export const formatDateMedium = (raw) => {
  if (!raw) return '—';
  const opts = { year: 'numeric', month: 'short', day: 'numeric' };
  if (typeof raw === 'string') {
    const [y, m, d] = raw.split('T')[0].split('-').map(Number);
    if (y && m && d) return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  }
  const date = raw?.toDate ? raw.toDate() : new Date(raw);
  if (isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString('en-US', { ...opts, timeZone: CLINIC_TIMEZONE });
};

/**
 * Formats any date input into a standard numeric display: e.g. "9/5/2026"
 */
export const formatDateNumeric = (raw) => {
  if (!raw) return '—';
  try {
    let d;
    if (typeof raw === 'string') {
      const clean = raw.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return `${month + 1}/${day}/${year}`;
      }
      d = new Date(raw);
    } else if (raw?.toDate && typeof raw.toDate === 'function') {
      d = raw.toDate();
    } else if (typeof raw === 'number') {
      d = new Date(raw);
    } else if (raw instanceof Date) {
      d = raw;
    }
    if (!d || isNaN(d.getTime())) return String(raw || '—');
    return d.toLocaleDateString('en-PH', { timeZone: CLINIC_TIMEZONE });
  } catch {
    return String(raw || '—');
  }
};

// ══════════════════════════════════════════════════════════════════════════
// Patient names
// ══════════════════════════════════════════════════════════════════════════
// Patient name formatting shared across pages.
//
// There are two title-case helpers on purpose: they differ only in how they
// treat runs of spaces, and each page keeps the one it has always used.

// Title-cases each word; runs of spaces collapse to one. Used by the Patients
// pages and their reports.
export function formatTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Title-cases each word and keeps the spacing as stored.
export const titleCaseWords = (str = '') => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Display name for a patient record (Vaccination Tracker, Dashboard, Archive).
export const getName = (p) =>
  titleCaseWords(p.name || `${p.fname || ''} ${p.lname || ''}`.trim() || '—');

// Appointment service text for display. Older app bookings saved the vaccine
// id ("Vaccination – Post-Exposure") or nothing after the dash
// ("Vaccination – "); both read cleanly here.
const VACCINE_ID_LABELS = {
  'Post-Exposure': 'Anti-Rabies (PEP)',
  'Anti-Tetano': 'Anti-Tetanus',
  Booster: 'Booster Dose',
};
// Bookings saved before "Follow-up" was dropped from the labels still read
// "PEP Follow-up"; they show as "PEP", the same as new ones.
const LEGACY_APPT_TYPES = { 'pep follow-up': 'PEP', 'pep follow up': 'PEP', 'pep followup': 'PEP' };
export const normalizeApptType = (type) => LEGACY_APPT_TYPES[String(type || '').trim().toLowerCase()] || String(type || '').trim();

export function formatServiceType(type, fallback = 'Consultation') {
  const raw = normalizeApptType(type);
  if (!raw) return fallback;
  const [head, ...rest] = raw.split(/\s*[–—-]\s+|\s+[–—-]\s*/);
  const sub = rest.join(' – ').trim();
  if (!sub) return head.replace(/\s*[–—-]\s*$/, '').trim() || fallback;
  return `${head} – ${VACCINE_ID_LABELS[sub] || sub}`;
}
