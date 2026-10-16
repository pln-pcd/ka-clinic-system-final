// What the vaccination card (components/VaccinationCard.tsx) shows, built
// from the patient's current record — the same `vaccinations/{mrn}` doc and
// the same service-to-fields rules (utils/serviceFields.ts) the dashboard
// uses. Pure, so Home and the layout fixture build it the same way.
//
// Only PEP has exposure fields (date, type, source animal, category, number
// of bites, wound washed — the dashboard's patient-visible set); every
// other service hides them and never shows a PEP label or schedule. Wound
// location and depth are clinic-only and never shown, and the clinic's
// internal remarks are not shown either.
import type { CardData } from '../components/VaccinationCard';
import { historyRows } from './serviceFields';
import {
  caseStatusLabel, clinicToday, displayPatientId, doseBrand, doseState, doseStatus, EMPTY,
  exposureCategory, exposureTypeLabel, formatDoseDate, isPepService, protocolLabel, serviceCopy, splitName,
} from './patientRecord';

// Guests see the standard PEP shape with nothing filled in.
export const GUEST_PLACEHOLDER_DOSES = [
  { id: 'g1', label: 'Session 1 (Day 0)', done: false, blankRow: true },
  { id: 'g2', label: 'Session 2 (Day 3)', done: false, blankRow: true },
  { id: 'g3', label: 'Session 3 (Day 7)', done: false, blankRow: true },
  { id: 'g4', label: 'Session 4 (Day 28)', done: false, blankRow: true },
];
const NO_DOSES_ROW = [{ id: 'none', label: 'No doses recorded yet', blankRow: true }];

type Input = { record: any | null; mrn: string | null; isGuest: boolean; displayName?: string | null; today?: string };

export function buildCardData({ record, mrn, isGuest, displayName, today = clinicToday() }: Input): CardData {
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
  const given = realDoses.filter(d => doseState(d, today) === 'done').length;

  return {
    frontTitle: isRabies ? 'ANTI-RABIES VACCINATION RECORD CARD' : 'VACCINATION RECORD CARD',
    backTitle: isPep ? 'HISTORY OF EXPOSURE & CLINICAL RECORD' : 'CLINICAL RECORD & TREATMENT',
    backSubtitle: isPep ? 'Clinical Exposure History & Medical Profile' : 'Medical Profile & Treatment Status',
    lastName: pr.lastName || name.last || EMPTY,
    firstName: pr.firstName || name.first || EMPTY,
    mi: middle ? `${middle.charAt(0).toUpperCase()}.` : EMPTY,
    dob: pr.dob ? formatDoseDate(pr.dob) : EMPTY,
    mrn: isGuest && !mrn ? 'No Patient ID (Guest)' : displayPatientId(mrn, pr),
    purpose: pr.service ? serviceCopy(pr.service).long : EMPTY,
    category: isPep ? catVal : null,
    doses: doseList.map((d: any, idx: number) => {
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
    }),
    exposure: isPep ? [
      { label: 'Exposure Date', value: pr.date ? formatDoseDate(pr.date) : EMPTY },
      { label: 'Exposure Type', value: exposureTypeLabel(pr.typeOfExposure), accent: true },
      { label: 'Biting Animal', value: blank(pr.animal || pr.sourceOfExposure) },
      { label: 'Exposure Category', value: catVal, accent: true },
      { label: 'Number of Bites', value: blank(pr.numberOfBites) },
      { label: 'Wound Washed', value: blank(pr.woundWashed) },
    ] : [],
    profile: [
      { label: 'Age', value: pr.age ? `${pr.age} yrs` : EMPTY },
      { label: 'Sex', value: blank(pr.sex) },
      { label: 'Contact Number', value: blank(pr.contact), wide: true },
      ...historyRows(pr).map(r => ({ label: r.label, value: r.value })),
    ],
    treatment: [
      { label: 'Dose Schedule', value: realDoses.length ? protocolLabel(pr.service, realDoses.length) : EMPTY, wide: true },
      { label: 'Doses Given', value: realDoses.length ? `${given}/${realDoses.length}` : EMPTY },
      { label: 'Status', value: record ? caseStatusLabel(pr) : EMPTY, accent: true },
    ],
  };
}
