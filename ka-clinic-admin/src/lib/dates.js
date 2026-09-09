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
