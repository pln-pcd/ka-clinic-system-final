// Which clinical fields each service asks for and shows. The Register
// wizard, the Edit modal, the record's Medical History card, the
// previous-case pop-up, the Previous Services table and both medical record
// PDFs all read this one map, so a field one screen asks for can never be
// missing (or shown as an empty "—") on another.
//
// The patient app keeps a copy in patient-app/utils/serviceFields.ts (it is
// a separate build and cannot import this file). Change both together.

export const OTHERS = 'Others';
// Typed "Others" history: long enough for a few vaccines and dates.
export const OTHER_TEXT_MAX = 150;

export const PAST_VACCINE_OPTIONS = [
  'None',
  'Completed PEP (within 1 year)',
  'Completed PEP (1–3 years ago)',
  'Completed PEP (over 3 years ago)',
  'Incomplete / Interrupted PEP',
  'Pre-Exposure Prophylaxis (PrEP) only',
  'Tetanus Toxoid only',
  OTHERS,
];
// No longer offered, but still on older records. Those keep their value and
// show it as saved ("Unknown"); the Edit modal lists it only for them.
export const LEGACY_PAST_VACCINE_OPTIONS = ['Unknown'];

export const PNEUMO_HISTORY_OPTIONS = [
  'None',
  'PCV13',
  'PCV15',
  'PCV20',
  'PPSV23',
  'Both PCV and PPSV23',
  OTHERS,
];

export const RISK_CONDITION_OPTIONS = ['None', 'Asthma / COPD', 'Diabetes', 'Heart disease', 'Immunocompromised', 'Chronic kidney disease', 'Smoker', 'Age ≥ 65', OTHERS];
// Chosen before "Others" took typed text; older records keep it as saved.
export const LEGACY_RISK_CONDITION_OPTIONS = ['Other'];
export const WOUND_TYPE_OPTIONS = ['Laceration', 'Puncture', 'Abrasion', 'Burn', 'Crush injury', 'Other'];
export const LAST_TETANUS_OPTIONS = ['Unknown', 'Less than 5 years ago', '5–10 years ago', 'More than 10 years ago', 'Never vaccinated'];

// A dropdown with an "Others" choice keeps the choice and the typed text in
// separate fields; screens show the typed text in place of the word "Others".
const withOther = (choiceKey, textKey) => (r) => {
  const choice = String(r?.[choiceKey] || '').trim();
  return choice === OTHERS ? String(r?.[textKey] || '').trim() : choice;
};

// label: shown on screens and PDFs. value: display text, '' when not filled.
// clinicOnly: withheld from the patient-safe PDF (wound location and depth).
export const FIELD_DEFS = {
  cat: { label: 'Exposure Category', value: r => (r?.cat ? `Category ${String(r.cat).replace('Category ', '')}` : '') },
  animal: { label: 'Biting Animal', value: r => r?.animal || '' },
  woundLocation: { label: 'Wound Location', value: r => r?.woundLocation || r?.biteLocation || '', clinicOnly: true },
  woundDepth: { label: 'Wound Depth', value: r => r?.woundDepth || '', clinicOnly: true },
  numberOfBites: { label: 'Number of Bites', value: r => r?.numberOfBites || '' },
  woundWashed: { label: 'Wound Washed', value: r => r?.woundWashed || '' },
  pastVaccines: { label: 'Past Vaccines', value: withOther('pastVaccines', 'pastVaccinesOther') },
  pneumoHistory: { label: 'Past Pneumococcal Vaccination', value: withOther('pneumoHistory', 'pneumoHistoryOther') },
  riskCondition: { label: 'High-Risk Condition', value: withOther('riskCondition', 'riskConditionOther') },
  woundType: { label: 'Wound / Injury Type', value: r => r?.woundType || '' },
  lastTetanus: { label: 'Last Tetanus Shot', value: r => r?.lastTetanus || '' },
  allergies: { label: 'Known Allergies', value: withOther('allergies', 'allergiesOther') },
  notes: { label: 'Remarks', value: r => r?.notes || '' },
};

// exposure: PEP-only bite details. treatments: Category III RIG / Anti-Tetanus
// block (shown only when the case is Category III or has entries). history:
// medical history asked in the wizard's Medical History step, in screen
// order. oneOf: "fill in at least one" rule. required: must be chosen.
export const SERVICE_FIELDS = {
  PEP: {
    exposure: ['cat', 'animal', 'woundLocation', 'woundDepth', 'numberOfBites', 'woundWashed'],
    treatments: true,
    history: ['pastVaccines', 'allergies', 'notes'],
    oneOf: ['pastVaccines', 'allergies', 'notes'],
    required: [],
  },
  PrEP: {
    exposure: [],
    treatments: false,
    history: ['pastVaccines', 'allergies', 'notes'],
    oneOf: ['pastVaccines', 'allergies', 'notes'],
    required: [],
  },
  Tetanus: {
    exposure: [],
    treatments: false,
    history: ['pastVaccines', 'allergies', 'woundType', 'lastTetanus', 'notes'],
    oneOf: ['pastVaccines', 'allergies', 'notes'],
    required: [],
  },
  Pneumonia: {
    exposure: [],
    treatments: false,
    history: ['pneumoHistory', 'riskCondition', 'allergies', 'notes'],
    // The required pneumococcal history always satisfies this.
    oneOf: ['pneumoHistory', 'allergies', 'notes'],
    required: ['pneumoHistory'],
  },
};

// Services no longer offered (old "Hepatitis" records, anything unmatched)
// show the general history only.
const FALLBACK = {
  exposure: [],
  treatments: false,
  history: ['pastVaccines', 'allergies', 'notes'],
  oneOf: ['pastVaccines', 'allergies', 'notes'],
  required: [],
};

/** Stored service value → SERVICE_FIELDS key (matched loosely, like the app). */
export function serviceKey(service) {
  const s = String(service || 'PEP').trim().toLowerCase();
  if (s === 'prep' || s.includes('pre-exposure')) return 'PrEP';
  if (s === 'pep' || s.includes('post-exposure')) return 'PEP';
  if (s.includes('tetan')) return 'Tetanus';
  if (s.includes('pneumo')) return 'Pneumonia';
  return '';
}

export function serviceFields(service) {
  return SERVICE_FIELDS[serviceKey(service)] || FALLBACK;
}

export const fieldLabel = key => FIELD_DEFS[key]?.label || key;
export const fieldValue = (record, key) => FIELD_DEFS[key]?.value(record) || '';

/**
 * [{ key, label, value }] for one group of a record's service, '' value when
 * the service asks for the field but it was left empty. Fields the service
 * never asks for are not returned at all. audience 'patient' drops the
 * clinic-only wound fields.
 */
export function serviceFieldRows(record, group, { audience = 'clinic', exclude = [] } = {}) {
  const keys = serviceFields(record?.service)[group] || [];
  return keys
    .filter(k => !exclude.includes(k))
    .filter(k => audience !== 'patient' || !FIELD_DEFS[k]?.clinicOnly)
    .map(k => ({ key: k, label: fieldLabel(k), value: fieldValue(record, k) }));
}

/**
 * Category III block (RIG / Anti-Tetanus) applies: a PEP case at Category
 * III, or any case that has entries saved (saved data is never hidden).
 */
export function showsTreatments(record) {
  if (Array.isArray(record?.treatments) && record.treatments.length > 0) return true;
  return serviceFields(record?.service).treatments && String(record?.cat || '').replace('Category ', '').trim() === 'III';
}

/**
 * Wizard / Edit checks for the Medical History step. Returns a map of
 * field → message ('' when fine) for:
 *   history             at least one of the service's oneOf fields
 *   pastVaccinesOther   typed text when "Others" is chosen
 *   pneumoHistory       required for Pneumonia
 *   pneumoHistoryOther  typed text when "Others" is chosen
 *   riskConditionOther  typed text when "Others" is chosen
 */
export function historyErrors(f) {
  const cfg = serviceFields(f?.service);
  const filled = k => Boolean(String(f?.[k] || '').trim());
  const asks = k => cfg.history.includes(k);
  return {
    history: cfg.oneOf.some(filled) ? ''
      : `Add at least one: ${cfg.oneOf.map(k => fieldLabel(k).toLowerCase()).join(', ')}`,
    pastVaccinesOther: asks('pastVaccines') && f?.pastVaccines === OTHERS && !filled('pastVaccinesOther')
      ? 'Type the vaccination history' : '',
    pneumoHistory: cfg.required.includes('pneumoHistory') && !filled('pneumoHistory')
      ? 'Choose the past pneumococcal vaccination' : '',
    pneumoHistoryOther: asks('pneumoHistory') && f?.pneumoHistory === OTHERS && !filled('pneumoHistoryOther')
      ? 'Type the pneumococcal history' : '',
    riskConditionOther: asks('riskCondition') && f?.riskCondition === OTHERS && !filled('riskConditionOther')
      ? 'Type the high-risk condition' : '',
    allergiesOther: asks('allergies') && f?.allergies === OTHERS && !filled('allergiesOther')
      ? 'Type the specific allergy' : '',
  };
}
