// Single source of truth for every vaccine's dose schedule.
//
// Before this existed, three places defined schedules independently: the
// intake form's preview, the generator that writes a new patient's doses, and
// the vaccination tracker's fallback for records with none. They had already
// drifted — PrEP was previewed as a 5-dose post-exposure series, and the
// tracker's fallback handed every service the rabies ARV schedule. Everything
// now reads this file.
//
// Anchoring: most schedules count from the patient's Day 0 (the exposure or
// registration date on their record). The paediatric series count from the
// patient's DATE OF BIRTH instead, because "the dose at 4 months old" is a
// fact about the child, not about when the clinic first saw them.

import { addDaysToDateString } from './dates.js';

/** Calendar-month arithmetic — "1 month later" is not "30 days later". */
export function addMonthsToDateString(dStr, months) {
  if (!dStr) return '';
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp to the last valid day when the source day overflows the target
  // month (e.g. registering on the 31st and adding a 30-day month).
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// `age` entries are offsets from date of birth; `day`/`month` entries are
// offsets from Day 0. Keeping them declarative means the preview, the
// generator and the tracker cannot disagree about what a schedule is.
const SCHEDULES = {
  // Rabies post-exposure, intradermal Thai Red Cross 2-site regimen:
  // 4 sessions, two injection sites per visit on Day 0, 3 and 7.
  PEP: {
    anchor: 'day0',
    label: 'Anti-Rabies PEP (Intradermal, 2-site)',
    doses: [
      { key: 'd1', label: 'Session 1 (Day 0)', day: 0 },
      { key: 'd2', label: 'Session 2 (Day 3)', day: 3 },
      { key: 'd3', label: 'Session 3 (Day 7)', day: 7 },
      { key: 'd4', label: 'Session 4 (Day 28)', day: 28 },
    ],
  },

  // WHO abridged pre-exposure series.
  PrEP: {
    anchor: 'day0',
    label: 'Anti-Rabies PrEP',
    doses: [
      { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
      { key: 'd2', label: 'Dose 2 (Day 7)', day: 7 },
    ],
  },

  Hepatitis: {
    anchor: 'day0',
    label: 'Hepatitis B',
    doses: [
      { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
      { key: 'd2', label: 'Dose 2 (1 Month)', month: 1 },
      { key: 'd3', label: 'Dose 3 (6 Months)', month: 6 },
    ],
  },

  // Unvaccinated / unknown-history adult primary series.
  Tetanus: {
    anchor: 'day0',
    label: 'Tetanus Toxoid — Adult Primary Series',
    doses: [
      { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
      { key: 'd2', label: 'Dose 2 (1 Month)', month: 1 },
      { key: 'd3', label: 'Dose 3 (6 Months)', month: 6 },
    ],
  },

  // Childhood DTaP, counted from date of birth.
  'Tetanus:infant': {
    anchor: 'dob',
    label: 'DTaP Childhood Series',
    doses: [
      { key: 'd1', label: '1st DTaP (2 Months)', ageMonths: 2 },
      { key: 'd2', label: '2nd DTaP (4 Months)', ageMonths: 4 },
      { key: 'd3', label: '3rd DTaP (6 Months)', ageMonths: 6 },
      { key: 'd4', label: '4th DTaP (15–18 Months)', ageMonths: 15 },
      { key: 'd5', label: '5th DTaP (4–6 Years)', ageMonths: 48 },
    ],
  },

  // Adult pneumococcal — a single dose at the visit.
  Pneumonia: {
    anchor: 'day0',
    label: 'Pneumococcal (Adult)',
    doses: [
      { key: 'd1', label: 'Pneumococcal Dose', day: 0 },
    ],
  },

  // Infant PCV, counted from date of birth.
  'Pneumonia:infant': {
    anchor: 'dob',
    label: 'Pneumococcal Conjugate (PCV) — Infant Series',
    doses: [
      { key: 'd1', label: '1st PCV (2 Months)', ageMonths: 2 },
      { key: 'd2', label: '2nd PCV (4 Months)', ageMonths: 4 },
      { key: 'd3', label: '3rd PCV (6 Months)', ageMonths: 6 },
      { key: 'd4', label: 'PCV Booster (12–15 Months)', ageMonths: 12 },
    ],
  },
};

const FALLBACK = {
  anchor: 'day0',
  label: 'Vaccination',
  doses: [{ key: 'd1', label: 'Initial Dose', day: 0 }],
};

/** Services whose schedule depends on an adult/infant choice at intake. */
export const AGE_GROUPED_SERVICES = ['Tetanus', 'Pneumonia'];

export const isAgeGrouped = (service) => AGE_GROUPED_SERVICES.includes(service);

function scheduleKey(service, ageGroup) {
  const base = String(service || '').trim();
  if (ageGroup === 'infant' && SCHEDULES[`${base}:infant`]) return `${base}:infant`;
  return base;
}

/** The schedule definition itself — used by previews that only need labels. */
export function getSchedule(service, ageGroup) {
  return SCHEDULES[scheduleKey(service, ageGroup)] || FALLBACK;
}

export function scheduleLabel(service, ageGroup) {
  return getSchedule(service, ageGroup).label;
}

/**
 * Resolves a schedule to real calendar dates.
 *
 * `day0` is the exposure/registration date; `dob` is required only for the
 * paediatric series. A DOB-anchored schedule with no DOB falls back to Day 0
 * anchoring so a record is never left with no schedule at all — the caller is
 * expected to require DOB at intake for those services.
 */
export function buildScheduleDates(service, { day0, dob, ageGroup } = {}) {
  const schedule = getSchedule(service, ageGroup);
  const usesDob = schedule.anchor === 'dob' && !!dob;
  const anchorDate = usesDob ? String(dob).slice(0, 10) : String(day0 || '').slice(0, 10);

  return schedule.doses.map((d) => {
    let date;
    if (usesDob && typeof d.ageMonths === 'number') {
      date = addMonthsToDateString(anchorDate, d.ageMonths);
    } else if (typeof d.month === 'number') {
      date = addMonthsToDateString(anchorDate, d.month);
    } else if (typeof d.ageMonths === 'number') {
      // DOB-anchored schedule without a DOB — space the visits from Day 0 so
      // the intervals between doses are still right.
      const first = schedule.doses[0].ageMonths || 0;
      date = addMonthsToDateString(anchorDate, d.ageMonths - first);
    } else {
      date = addDaysToDateString(anchorDate, d.day || 0);
    }
    return { key: d.key, label: d.label, date };
  });
}

/**
 * The dose objects written to `vaccinations/{mrn}.doses`.
 *
 * Every dose starts `pending`, including the first. It used to be created as
 * already-administered, which recorded a dose nobody ticked and therefore
 * never deducted a vial — inventory could not reconcile against doses given.
 * Staff tick the first session like any other.
 */
export function buildInitialDoses(service, { day0, dob, ageGroup } = {}) {
  return buildScheduleDates(service, { day0, dob, ageGroup }).map(({ key, label, date }) => ({
    key,
    n: label,
    label,
    dose: label,
    name: label,
    date,
    status: 'pending',
    s: 'pending',
    statusText: 'Scheduled',
    done: false,
  }));
}
