// Reading and displaying the patient's own record: the shared field rules,
// how their registered service (vaccine type) is named, and dose dates.

// ══════════════════════════════════════════════════════════════════════════
// Record fields and dose states
// ══════════════════════════════════════════════════════════════════════════
// Shared reading rules for the patient's own `vaccinations/{mrn}` record, so
// every screen shows exactly what the clinic recorded — the same values the
// Admin Dashboard's patient record shows — and never a sample value in its
// place. A field the clinic has not filled shows as an em dash.

export const EMPTY = '—';

/** Today in Asia/Manila as YYYY-MM-DD — the clinic's calendar, not UTC. */
export function clinicToday(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Clinic IDs are "2026-001" — no "MRN-" prefix (see api/_lib/auth.js normalizeMRN). */
export function displayPatientId(mrn?: string | null, record?: { id?: string } | null): string {
  return mrn || record?.id || EMPTY;
}

export type DoseState = 'done' | 'missed' | 'pending';

/**
 * Same rules as the dashboard's buildDoses (ka-clinic-admin/src/features/
 * vaccination/VaccinationTrackerPage.jsx): done if marked done, missed if marked missed or its date
 * has passed without being given, otherwise pending.
 */
export function doseState(d: any, today: string = clinicToday()): DoseState {
  const raw = String(d?.status || d?.s || '').toLowerCase();
  if (d?.done === true || raw === 'done' || raw === 'completed') return 'done';
  if (raw === 'miss' || raw === 'missed' || raw === 'overdue') return 'missed';
  const date = typeof d?.date === 'string' ? d.date.slice(0, 10) : '';
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today ? 'missed' : 'pending';
}

/**
 * The dose status shown to the patient, with the same names and rules as the
 * Admin Dashboard (StatusBadge): Given, Due today, Overdue · Nd, Upcoming.
 * Counted on the clinic's calendar (Asia/Manila). A dose is only "Given" once
 * staff mark it done, so a future date can never show as given.
 */
export type DoseStatus = 'given' | 'due_today' | 'overdue' | 'upcoming';

export function doseStatus(d: any, today: string = clinicToday()): { status: DoseStatus; label: string } {
  const state = doseState(d, today);
  if (state === 'done') return { status: 'given', label: 'Given' };
  const date = typeof d?.date === 'string' ? d.date.slice(0, 10) : '';
  if (date === today) return { status: 'due_today', label: 'Due today' };
  if (state === 'missed') {
    const days = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000)
      : 0;
    return { status: 'overdue', label: days > 0 ? `Overdue · ${days}d` : 'Overdue' };
  }
  return { status: 'upcoming', label: 'Upcoming' };
}

/**
 * Case status as the dashboard derives it (features/patients/shared.jsx
 * derivePatientStatus): Completed once archived/completed or every dose is
 * given, otherwise the stored status (Ongoing by default).
 */
export function caseStatusLabel(record: any): string {
  if (!record) return EMPTY;
  const doses: any[] = Array.isArray(record.doses) ? record.doses : [];
  const allDone = doses.length > 0 && doses.every(d => doseState(d) === 'done');
  const raw = String(record.isArchived || record.status === 'archived' || record.status === 'completed' || allDone ? 'completed' : record.status || 'ongoing').toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** PEP is the only service with exposure details (animal, category, wound, date). */
export function isPepService(service?: string | null): boolean {
  return normalizeService(service) === 'PEP';
}

/**
 * Brand actually given for a dose. The dashboard records it per dose as
 * `brand`; the record-level vaccineBrand is only a fallback for a dose that
 * was given before per-dose brands existed. A dose not yet given has no brand.
 */
export function doseBrand(d: any, record: any, state: DoseState): string {
  if (state !== 'done') return EMPTY;
  return d?.brand || d?.vaccineBrand || d?.b || record?.vaccineBrand || EMPTY;
}

/**
 * Splits a stored name into card fields. The dashboard saves "First M. Last"
 * (optionally ", Suffix"); older records may be "Last, First M.". The middle
 * initial is the single-letter part, so multi-word first or last names
 * ("Maria Clara", "Dela Cruz") stay whole.
 */
export function splitName(full: string): { first: string; middle: string; last: string } {
  const name = (full || '').trim();
  if (!name) return { first: '', middle: '', last: '' };
  const isInitial = (p: string) => /^[A-Za-z]\.?$/.test(p);
  if (name.includes(',')) {
    const [lastPart, rest = ''] = name.split(',').map(s => s.trim());
    const restParts = rest.split(/\s+/).filter(Boolean);
    // "First M. Last, Jr." — the comma introduces a suffix, not a last name.
    if (/^(jr|sr|i{1,3}|iv|v)\.?$/i.test(rest)) {
      const base = splitName(lastPart);
      return { ...base, last: `${base.last} ${rest}`.trim() };
    }
    const mi = restParts.findIndex(isInitial);
    return mi === -1
      ? { first: rest, middle: '', last: lastPart }
      : { first: restParts.slice(0, mi).join(' '), middle: restParts[mi], last: lastPart };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
  const mi = parts.findIndex((p, i) => i > 0 && i < parts.length - 1 && isInitial(p));
  return mi === -1
    ? { first: parts.slice(0, -1).join(' '), middle: '', last: parts[parts.length - 1] }
    : { first: parts.slice(0, mi).join(' '), middle: parts[mi], last: parts.slice(mi + 1).join(' ') };
}

// ══════════════════════════════════════════════════════════════════════════
// Vaccine type (service) naming
// ══════════════════════════════════════════════════════════════════════════
// Single source of truth for how a patient's registered service is named in
// the app. Every screen that prints a vaccine type, a timeline heading or a
// protocol label reads it from here, off the `service` field the Admin
// Dashboard writes to `vaccinations/{mrn}` — so a PrEP patient can never be
// shown a "PEP Dose Timeline" again.
//
// The dose *schedule* itself is never derived here: doses are generated once
// at registration (ka-clinic-admin/src/features/patients/PatientsPage.jsx buildInitialDoses)
// and stored on the record, so the app renders whatever is actually stored.

export type ServiceKey = 'PEP' | 'PrEP' | 'Tetanus' | 'Pneumonia' | 'Other';

type ServiceCopy = {
  /** Badge/abbreviation, e.g. "PEP". */
  short: string;
  /** Full clinical name with the abbreviation, for the vaccination card. */
  long: string;
  /** Section heading above the dose table. */
  timelineTitle: string;
  /** Regimen name used in the tracker header, before the dose count. */
  protocol: string;
};

const SERVICE_COPY: Record<ServiceKey, ServiceCopy> = {
  PEP: {
    short: 'PEP',
    long: 'Post-Exposure Prophylaxis (PEP)',
    timelineTitle: 'PEP Dose Timeline',
    protocol: 'Post-Exposure ARV Protocol',
  },
  PrEP: {
    short: 'PrEP',
    long: 'Pre-Exposure Prophylaxis (PrEP)',
    timelineTitle: 'PrEP Dose Timeline',
    protocol: 'Pre-Exposure Prophylaxis',
  },
  Tetanus: {
    short: 'Anti-Tetanus',
    long: 'Anti-Tetanus (Tetanus Toxoid)',
    timelineTitle: 'Anti-Tetanus Dose Timeline',
    protocol: 'Anti-Tetanus Protocol',
  },
  Pneumonia: {
    short: 'Pneumonia',
    long: 'Pneumococcal Vaccination',
    timelineTitle: 'Pneumonia Dose Timeline',
    protocol: 'Pneumococcal Protocol',
  },
  Other: {
    short: 'Vaccination',
    long: 'Vaccination',
    timelineTitle: 'Dose Timeline',
    protocol: 'Vaccination Protocol',
  },
};

// The stored value is whatever the dashboard's service picker wrote, so match
// loosely rather than requiring an exact key.
export function normalizeService(service?: string | null): ServiceKey {
  const s = String(service || '').trim().toLowerCase();
  if (!s) return 'Other';
  if (s === 'prep' || s.startsWith('pre-exposure') || s.includes('pre-exposure')) return 'PrEP';
  if (s === 'pep' || s.startsWith('post-exposure') || s.includes('post-exposure')) return 'PEP';
  if (s.includes('tetan')) return 'Tetanus';
  if (s.includes('pneumo')) return 'Pneumonia';
  return 'Other';
}

export function serviceCopy(service?: string | null): ServiceCopy {
  return SERVICE_COPY[normalizeService(service)];
}

/** "Pre-Exposure Prophylaxis · 2-Dose Series" — count comes from the record. */
export function protocolLabel(service?: string | null, doseCount = 0): string {
  const { protocol } = serviceCopy(service);
  return doseCount > 0 ? `${protocol} · ${doseCount}-Dose Series` : protocol;
}

// ══════════════════════════════════════════════════════════════════════════
// Dose dates
// ══════════════════════════════════════════════════════════════════════════
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

// Exposure category on a PEP record. Category I is no longer used; any other
// stored value (including an old "I") is shown as not recorded. A bat
// exposure is always Category III (WHO), the same rule the dashboard enforces.
export type ExposureCategory = 'II' | 'III' | '';

export function exposureCategory(raw: unknown, animal?: unknown): ExposureCategory {
  if (String(animal ?? '').trim().toLowerCase() === 'bat') return 'III';
  const v = String(raw ?? '').replace(/Category\s*/i, '').trim().toUpperCase();
  return v === 'II' || v === 'III' ? v : '';
}

// Type of exposure as the clinic records it now: Bite or Scratch. Older
// records may still hold a removed type ("Saliva Contact", "Non-bite
// Exposure"); those show as not recorded instead of a type that no longer exists.
export const EXPOSURE_TYPES = ['Bite', 'Scratch'] as const;
export function exposureTypeLabel(raw: unknown): string {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t.includes('non-bite') || t.includes('saliva')) return EMPTY;
  if (t.includes('scratch')) return 'Scratch';
  if (t.includes('bite')) return 'Bite';
  return EMPTY;
}
