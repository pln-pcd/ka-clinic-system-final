// Which clinical fields each service asks for, so the records screen shows
// the same fields as the Admin Dashboard's record and never a "—" for a
// field the service does not ask.
//
// Copy of ka-clinic-admin/src/lib/serviceFields.js (the app is a separate
// build and cannot import it). Change both together.

import { EMPTY, normalizeService } from './patientRecord';

const OTHERS = 'Others';

// A dropdown with an "Others" choice keeps the choice and the typed text in
// separate fields; the typed text is shown in place of the word "Others".
// Older records saved as "Unknown" show "Unknown".
const withOther = (choiceKey: string, textKey: string) => (r: any): string => {
  const choice = String(r?.[choiceKey] || '').trim();
  return choice === OTHERS ? String(r?.[textKey] || '').trim() : choice;
};

type FieldKey =
  | 'pastVaccines' | 'pneumoHistory' | 'riskCondition'
  | 'woundType' | 'lastTetanus' | 'allergies';

const FIELD_DEFS: Record<FieldKey, { label: string; value: (r: any) => string }> = {
  pastVaccines: { label: 'Past Vaccines', value: withOther('pastVaccines', 'pastVaccinesOther') },
  pneumoHistory: { label: 'Past Pneumococcal Vaccination', value: withOther('pneumoHistory', 'pneumoHistoryOther') },
  riskCondition: { label: 'High-Risk Condition', value: r => r?.riskCondition || '' },
  woundType: { label: 'Wound / Injury Type', value: r => r?.woundType || '' },
  lastTetanus: { label: 'Last Tetanus Shot', value: r => r?.lastTetanus || '' },
  allergies: { label: 'Known Allergies', value: withOther('allergies', 'allergiesOther') },
};

// Medical history shown to the patient, per service, in screen order. The
// clinic's remarks are internal notes and are not shown in the app.
const HISTORY: Record<string, FieldKey[]> = {
  PEP: ['pastVaccines', 'allergies'],
  PrEP: ['pastVaccines', 'allergies'],
  Tetanus: ['pastVaccines', 'allergies', 'woundType', 'lastTetanus'],
  Pneumonia: ['pneumoHistory', 'riskCondition', 'allergies'],
  Other: ['pastVaccines', 'allergies'],
};

/** [{ key, label, value }] — value is "—" when the service asks but it was left empty. */
export function historyRows(record: any): { key: string; label: string; value: string }[] {
  const keys = HISTORY[normalizeService(record?.service)] || HISTORY.Other;
  return keys.map(k => ({ key: k, label: FIELD_DEFS[k].label, value: FIELD_DEFS[k].value(record) || EMPTY }));
}
