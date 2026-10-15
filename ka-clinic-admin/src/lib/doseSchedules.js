// Single source of truth for every vaccine's dose schedule.
//
// Before this existed, three places defined schedules independently: the
// intake form's preview, the generator that writes a new patient's doses, and
// the vaccination tracker's fallback for records with none. They had already
// drifted — PrEP was previewed as a 5-dose post-exposure series, and the
// tracker's fallback handed every service the rabies ARV schedule. Everything
// now reads this file.
//
// Anchoring: every schedule counts from the patient's Day 0 (the exposure or
// registration date on their record). The clinic runs no infant series, so no
// schedule depends on date of birth or an age group.
import { itemServesService } from './inventoryCategories.js';
import { addDaysToDateString, getTodayDateString } from './formatters.js';

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

  // Pneumococcal is adult only at this clinic: a single dose on Day 0
  // (Prevnar 20 or Pneumovax 23).
  Pneumonia: {
    anchor: 'day0',
    label: 'Pneumococcal (Adult)',
    doses: [
      { key: 'd1', label: 'Pneumococcal Dose', day: 0 },
    ],
  },
};

const FALLBACK = {
  anchor: 'day0',
  label: 'Vaccination',
  doses: [{ key: 'd1', label: 'Initial Dose', day: 0 }],
};

/** The schedule definition itself — used by previews that only need labels. */
export function getSchedule(service) {
  return SCHEDULES[String(service || '').trim()] || FALLBACK;
}

export function scheduleLabel(service) {
  return getSchedule(service).label;
}

/** Resolves a schedule to real calendar dates, counted from `day0`. */
export function buildScheduleDates(service, { day0 } = {}) {
  const anchorDate = String(day0 || '').slice(0, 10);
  return getSchedule(service).doses.map((d) => {
    const date = typeof d.month === 'number'
      ? addMonthsToDateString(anchorDate, d.month)
      : addDaysToDateString(anchorDate, d.day || 0);
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
export function buildInitialDoses(service, { day0 } = {}) {
  return buildScheduleDates(service, { day0 }).map(({ key, label, date }) => ({
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

/**
 * Checks whether an inventory vaccine item belongs to a specific clinical service.
 * E.g., PEP and PrEP are strictly for rabies vaccines (Rabipur, Verorab, Speeda),
 * Tetanus is for anti-tetanus biologics, Hepatitis for Hepatitis vaccines, etc.
 *
 * @param {string} service - e.g. 'PEP', 'PrEP', 'Tetanus', 'Hepatitis', 'Pneumonia'
 * @param {object|string} item - Inventory item object or vaccine name string
 * @returns {boolean}
 */
export function isVaccineForService(service, item) {
  const name = typeof item === 'string' ? item : (item?.name || '');
  const n = name.toLowerCase();
  const s = String(service || 'PEP').trim().toUpperCase();

  // If the inventory item explicitly specifies a service
  if (typeof item === 'object' && item !== null) {
    if (item.service && String(item.service).trim().toUpperCase() === s) return true;
  }

  // Rabies PEP & PrEP:
  // Strictly Rabies vaccines (Rabipur, Verorab, Speeda, PCEC, PVRV, HDCV, ARV)
  if (s === 'PEP' || s === 'PREP') {
    return n.includes('rabies') ||
           n.includes('rabipur') ||
           n.includes('verorab') ||
           n.includes('speeda') ||
           n.includes('pcec') ||
           n.includes('pvrv') ||
           n.includes('hdcv') ||
           n.includes('arv');
  }

  // Anti-Tetanus:
  if (s === 'TETANUS') {
    return n.includes('tetanus') ||
           n.includes('toxoid') ||
           n.includes('ats') ||
           n.includes('tig') ||
           n.includes(' tt') ||
           n.startsWith('tt') ||
           n.includes('td');
  }

  // Pneumonia / Pneumococcal:
  if (s === 'PNEUMONIA') {
    return n.includes('pneumo') ||
           n.includes('prevnar') ||
           n.includes('pcv') ||
           n.includes('ppsv');
  }

  // Flu:
  if (s === 'FLU' || s === 'INFLUENZA') {
    return n.includes('flu') || n.includes('influenza');
  }

  // Fallback for custom or unrecognized services
  return true;
}

/**
 * Returns the inventory items that belong to the specified service, by the
 * item's Inventory category (lib/inventoryCategories.js): Anti-Rabies for
 * PEP/PrEP, Anti-Tetanus for Tetanus, Pneumonia for Pneumonia. RIG items
 * are never dose brands (they have their own card). Older items saved as
 * "Vaccine" are placed by their name. No service, or no match, gives an
 * empty list: other services' brands are never offered.
 */
export function getEligibleVaccinesForService(service, inventoryItems = []) {
  if (!service) return [];
  return inventoryItems.filter(i => itemServesService(i, service));
}

// ══════════════════════════════════════════════════════════════════════════
// Dose rows for a patient record (buildDoses)
// ══════════════════════════════════════════════════════════════════════════
// Dose rows for a patient record: the stored doses when there are any,
// otherwise the schedule from src/lib/doseSchedules.js. Shared by the
// Vaccination Tracker, the Dashboard and the Patients pages.

// A record with no stored doses falls back to the shared schedule definitions
// in src/lib/doseSchedules.js — the same ones registration writes from, so a
// PrEP patient can never be handed the post-exposure series by default.
const scheduleDatesFor = (p) => buildScheduleDates(p?.service, {
  day0: p?.date || getTodayStr(),
});

export const getTodayStr = () => getTodayDateString();

export const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const todayStr = getTodayStr();
  return dateStr < todayStr;
};

export const buildDoses = (p) => {
  const stored = p?.doses || [];
  if (stored.length > 0) {
    return stored.map((d, i) => {
      const rawStatus = String(d.status || d.s || 'pending').toLowerCase();
      let status = (rawStatus === 'done' || rawStatus === 'completed' || d.done === true)
        ? 'done'
        : (rawStatus === 'miss' || rawStatus === 'missed' || rawStatus === 'overdue')
        ? 'miss'
        : 'pending';

      // Normalize date to standard YYYY-MM-DD
      let normalizedDate = '';
      const rawDate = d.date;
      if (rawDate) {
        if (typeof rawDate === 'string') {
          normalizedDate = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
        } else if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
          normalizedDate = getTodayDateString(rawDate.toDate());
        } else if (rawDate instanceof Date) {
          normalizedDate = getTodayDateString(rawDate);
        } else if (typeof rawDate === 'number') {
          normalizedDate = getTodayDateString(new Date(rawDate));
        }
      }

      const overdueFlag = status === 'pending' && isOverdue(normalizedDate);
      if (overdueFlag) status = 'miss';
      const label = d.n || d.label || d.dose || d.name || `Dose ${i + 1}`;
      const doseBrand = d.brand || (status === 'done' ? (d.vaccineBrand || p?.vaccineBrand || '') : '');
      return {
        key:        d.key || `d${i + 1}`,
        label,
        n:          label,
        dose:       label,
        date:       normalizedDate || null,
        status,
        s:          status,
        note:       d.note || '',
        brand:      doseBrand,
        ml:         status === 'done' ? (d.ml ?? d.mg ?? null) : null,
        stockDeducted: d.stockDeducted,
        givenByName: d.givenByName || '',
        autoMissed: overdueFlag && status !== 'done',
      };
    });
  }

  // Derive registration date accurately: never fallback to today if record has createdAt or no date!
  let regDate = p?.date || p?.regDate || '';
  if (!regDate && p?.createdAt) {
    if (typeof p.createdAt === 'object' && p.createdAt?.toDate) {
      regDate = getTodayDateString(p.createdAt.toDate());
    } else if (typeof p.createdAt === 'number') {
      regDate = getTodayDateString(new Date(p.createdAt));
    } else if (typeof p.createdAt === 'string') {
      regDate = p.createdAt.split('T')[0];
    }
  }

  // If patient has absolutely no registration date or creation timestamp, do not invent doses!
  if (!regDate) {
    return [];
  }
  if (typeof regDate === 'string' && regDate.includes('T')) {
    regDate = regDate.split('T')[0];
  }

  return scheduleDatesFor({ ...p, date: regDate }).map(s => {
    const overdueFlag = isOverdue(s.date);
    return {
      key:        s.key,
      label:      s.label,
      date:       s.date,
      status:     overdueFlag ? 'miss' : 'pending',
      note:       '',
      brand:      '',
      autoMissed: overdueFlag,
    };
  });
};
