// What the vaccination card (components/VaccinationCard.tsx) shows, built
// from one treatment's record — the patient's current `vaccinations/{mrn}`
// doc, or one previous treatment from its `caseHistory` — using the same
// service-to-fields rules (utils/serviceFields.ts) the dashboard uses. Pure,
// so Home, the previous-treatment viewer and the layout fixture all build it
// the same way.
//
// Only PEP has exposure fields (date, type, biting animal, category, number
// of bites, wound washed — the dashboard's patient-visible set); every other
// service hides them and never shows a PEP label or schedule. Wound location
// and depth are clinic-only and never shown, and the clinic's internal
// remarks are not shown either.
import type { CardData, CardField, CardRow } from '../components/VaccinationCard';
import { historyRows } from './serviceFields';
import {
  clinicToday, displayPatientId, doseBrand, doseState, doseStatus, EMPTY,
  exposureCategory, exposureTypeLabel, formatDoseDate, isPepService, serviceCopy, splitName,
} from './patientRecord';

// Guests see the standard PEP shape with nothing filled in.
export const GUEST_PLACEHOLDER_DOSES = [
  { id: 'g1', label: 'Session 1 (Day 0)', done: false, blankRow: true },
  { id: 'g2', label: 'Session 2 (Day 3)', done: false, blankRow: true },
  { id: 'g3', label: 'Session 3 (Day 7)', done: false, blankRow: true },
  { id: 'g4', label: 'Session 4 (Day 28)', done: false, blankRow: true },
];
const NO_DOSES_ROW = [{ id: 'none', label: 'No doses recorded yet', blankRow: true }];

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ── Previous treatments ───────────────────────────────────────────────────
// Same split as the dashboard's historicalCaseRecord (ka-clinic-admin/src/
// features/patients/PatientRecordView.jsx): identity from the patient, the
// treatment only from its snapshot, so nothing of the current treatment can
// leak into a past card.
const CASE_KEYS = [
  'service', 'date', 'status', 'completedAt', 'closedAt',
  'cat', 'animal', 'typeOfExposure', 'sourceOfExposure', 'woundWashed', 'numberOfBites', 'vaccineBrand',
  'pastVaccines', 'pastVaccinesOther', 'allergies', 'allergiesOther', 'woundType', 'lastTetanus',
  'pneumoHistory', 'pneumoHistoryOther', 'riskCondition', 'doses', 'route', 'patientNote',
];
export function historicalRecord(patient: any, entry: any): any {
  const p = patient || {};
  const caseFields = Object.fromEntries(CASE_KEYS.map(k => [k, entry?.[k] ?? (k === 'doses' ? [] : '')]));
  return {
    name: p.name, firstName: p.firstName, middleName: p.middleName, lastName: p.lastName,
    dob: p.dob, age: p.age, sex: p.sex, contact: p.contact, id: p.id, mrn: p.mrn,
    ...caseFields,
    service: entry?.service || 'PEP',
    status: entry?.status || 'completed',
    caseHistory: [],
  };
}

// completedAt is a 'YYYY-MM-DD' clinic date; closedAt is epoch ms.
export const toYmd = (v: any): string => {
  if (typeof v === 'number') return clinicToday(new Date(v));
  if (v && typeof v.toDate === 'function') return clinicToday(v.toDate());
  return String(v || '').slice(0, 10);
};

/** "Mar 2, 2025 – Mar 30, 2025" for a previous treatment (start – completion). */
export function treatmentRange(entry: any): string {
  const start = entry?.date ? formatDoseDate(entry.date) : EMPTY;
  const endRaw = entry?.completedAt || entry?.closedAt;
  return `${start} – ${endRaw ? formatDoseDate(toYmd(endRaw)) : EMPTY}`;
}

// ── The card ──────────────────────────────────────────────────────────────
type Input = { record: any | null; mrn: string | null; isGuest: boolean; displayName?: string | null; today?: string; tag?: string };

export function buildCardData({ record, mrn, isGuest, displayName, today = clinicToday(), tag }: Input): CardData {
  const pr = record || {};
  const blank = (v: any) => (v === undefined || v === null || v === '' ? EMPTY : String(v));
  const svc = serviceCopy(pr.service).short;
  const isPep = isGuest && !pr.service ? true : isPepService(pr.service);
  const isRabies = (isGuest && !pr.service) || svc === 'PEP' || svc === 'PrEP';

  const name = splitName(pr.name || (isGuest ? '' : displayName || ''));
  const middle = pr.middleName || name.middle;
  const cat = exposureCategory(pr.cat, pr.animal || pr.sourceOfExposure);
  const catVal = cat ? `Category ${cat}` : EMPTY;

  const realDoses: any[] = Array.isArray(pr.doses) ? pr.doses : [];
  const doseList: any[] = realDoses.length ? realDoses : (isGuest ? GUEST_PLACEHOLDER_DOSES : NO_DOSES_ROW);

  // Front: the original three field rows.
  const purpose: CardField = { label: 'Vaccination Purpose', value: pr.service ? serviceCopy(pr.service).long : EMPTY, flex: 1.5 };
  const frontRows: CardRow[] = [
    [
      { label: 'Last Name', value: pr.lastName || name.last || EMPTY, flex: 1.2 },
      { label: 'First Name', value: pr.firstName || name.first || EMPTY, flex: 1.2 },
      { label: 'MI', value: middle ? `${middle.charAt(0).toUpperCase()}.` : EMPTY, flex: 0.6 },
    ],
    [
      { label: 'Date of birth', value: pr.dob ? formatDoseDate(pr.dob) : EMPTY, flex: 1 },
      { label: 'Patient number (MRN)', value: isGuest && !mrn ? 'No Patient ID (Guest)' : displayPatientId(mrn, pr), flex: 2 },
    ],
    isPep ? [purpose, { label: 'Exposure Category', value: catVal, flex: 1.5, accent: true }] : [purpose],
  ];

  // Back: three fields to a row so the back fits inside the front's height.
  const exposure: CardRow[] = isPep ? [
    [
      { label: 'Exposure Date', value: pr.date ? formatDoseDate(pr.date) : EMPTY },
      { label: 'Exposure Type', value: exposureTypeLabel(pr.typeOfExposure), accent: true },
      { label: 'Biting Animal', value: blank(pr.animal || pr.sourceOfExposure) },
    ],
    [
      { label: 'Exposure Category', value: catVal, accent: true },
      { label: 'Number of Bites', value: blank(pr.numberOfBites) },
      { label: 'Wound Washed', value: blank(pr.woundWashed) },
    ],
  ] : [];
  const ageSex = [pr.age ? `${pr.age} yrs` : '', pr.sex || ''].filter(Boolean).join(' • ') || EMPTY;
  const profile: CardField[] = [
    { label: 'Age / Sex', value: ageSex },
    { label: 'Contact Number', value: blank(pr.contact) },
    ...historyRows(pr).map(r => ({ label: r.label, value: r.value })),
  ];

  return {
    tag,
    frontTitle: isRabies ? 'ANTI-RABIES VACCINATION RECORD CARD' : 'VACCINATION RECORD CARD',
    frontSubtitle: 'Official Prophylaxis & Immunization Record',
    backTitle: isPep ? 'HISTORY OF EXPOSURE & CLINICAL RECORD' : 'CLINICAL RECORD & TREATMENT',
    backSubtitle: isPep ? 'Clinical Exposure History & Medical Profile' : 'Medical Profile & Treatment Status',
    frontRows,
    backRows: [...exposure, ...chunk(profile, 3)],
    // Patient note removed from card per Item 14
    notes: '',
    doses: (() => {
      const rows = doseList.map((d: any, idx: number) => {
        const state = doseState(d, today);
        const brand = doseBrand(d, pr, state);
        const extras = [d.dosage || pr.route, d.lot].filter(Boolean).join(' · ');
        return {
          key: String(d.id || d.key || idx),
          label: d.label || d.n || d.name || `Dose ${idx + 1}`,
          vaccine: d.blankRow || brand === EMPTY ? EMPTY : (extras ? `${brand} (${extras})` : brand),
          date: d.blankRow ? EMPTY : (d.date ? formatDoseDate(d.date) : EMPTY),
          status: d.blankRow ? EMPTY : doseStatus(d, today).label,
        };
      });
      // Universal 4-dose rows across all services (PEP max doses = 4)
      while (rows.length < 4) {
        rows.push({
          key: `empty-row-${rows.length}`,
          label: EMPTY,
          vaccine: EMPTY,
          date: EMPTY,
          status: EMPTY,
        });
      }
      return rows;
    })(),
  };
}
