// "2026-08-08" → "Aug 8, 2026" for dose/date display; falls back to the raw
// string if the date is missing or malformed rather than rendering "Invalid Date".
export function formatDoseDate(ds?: string | null): string {
  if (!ds) return '—';
  const parts = String(ds).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return String(ds);
}
