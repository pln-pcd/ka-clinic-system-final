// Patient intake: the Add and Edit patient modals, their option lists and
// checks, the duplicate-patient warning, and the pin-to-map confirmation.
import { formatTitleCase, formatDateMedium, serviceLabel, today } from "../../lib/formatters";
import Modal from '../../components/Modal';
import IconButton from '../../components/IconButton';
import Select from '../../components/Select';
import { useState } from "react";
import { buildScheduleDates, getSchedule, scheduleLabel, getEligibleVaccinesForService } from "../../lib/doseSchedules";
import { AlertTriangle, AlertCircle, CalendarDays, Check, MapPin, Pencil, ShieldCheck } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { brandAvailability } from "../../lib/inventoryStock";
import { BTN, BTN_ICON } from "../../lib/buttons";
import { LIBON_BARANGAYS } from '../../lib/libonGeo';
import { weekdayName } from '../../lib/clinicDays';
import DatePicker from '../../components/DatePicker';
import { FieldError, FormErrorNote, useFieldErrors } from '../../components/FormValidation';
import { SERVICE_TYPES, X } from "./shared";

/* ─────────────────────────── LIBON GEODATA DICTIONARY ─────────────────────────── */
// Standard option lists for the patient intake form. Free-text fields were
// converted to dropdowns so records stay consistent and searchable; each list
// keeps an "Other" escape hatch where clinical reality demands one.
export const ZONE_OPTIONS = [
  'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7',
  'Zone 8', 'Zone 9', 'Zone 10', 'Zone 11',
  'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6',
  'Sitio Proper', 'Poblacion',
];

export const WOUND_LOCATION_OPTIONS = [
  'Right Hand', 'Left Hand', 'Right Arm', 'Left Arm',
  'Right Leg', 'Left Leg', 'Right Foot', 'Left Foot',
  'Head', 'Face', 'Neck', 'Trunk / Torso', 'Back',
  'Multiple Sites', 'Other',
];

export const PAST_VACCINE_OPTIONS = [
  'None',
  'Completed PEP (within 1 year)',
  'Completed PEP (1–3 years ago)',
  'Completed PEP (over 3 years ago)',
  'Incomplete / Interrupted PEP',
  'Pre-Exposure Prophylaxis (PrEP) only',
  'Tetanus Toxoid only',
  'Unknown',
];

export const ALLERGY_OPTIONS = [
  'No known allergies',
  'Penicillin',
  'Sulfa drugs',
  'Aspirin / NSAIDs',
  'Eggs',
  'Seafood',
  'Latex',
  'Previous vaccine reaction',
  'Other',
];

export const PLACE_OF_EXPOSURE_OPTIONS = [
  'Own residence',
  "Neighbor's residence",
  'Street / Roadside',
  'Public market',
  'School premises',
  'Workplace',
  'Farm / Field',
  'Other municipality',
  'Other',
];

// Accepts the same shapes formatE164 normalizes: 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX.
// An empty value is treated as valid since the field is optional.
export function isValidPHPhone(v) {
  const digits = (v || '').replace(/\D/g, '');
  if (!digits) return true;
  return (
    (digits.startsWith('09') && digits.length === 11) ||
    (digits.startsWith('639') && digits.length === 12) ||
    (digits.startsWith('9') && digits.length === 10)
  );
}

/* ─────────────────────────── SERVICE SELECTOR ─────────────────────────── */
// Four cards in one row (2×2 on narrow screens). Selecting only changes the
// border colour and shows a check badge, so nothing moves.
function ServiceSelector({ value, onChange }) {
  return (
    <div role="radiogroup" id="reg-service" tabIndex={-1} aria-label="Service" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {SERVICE_TYPES.map(s => {
        const on = value === s.key;
        const Icon = s.icon;
        return (
          <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(s.key)}
            className={`relative text-left rounded-2xl border bg-white p-4 flex flex-col cursor-pointer transition-colors ${
              on ? 'border-[#3B50DF] bg-indigo-50/40 shadow-[inset_0_0_0_1px_#3B50DF]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
            <span aria-hidden="true" className={`absolute top-3 right-3 w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors ${on ? 'bg-[#3B50DF] text-white' : 'border border-slate-300 bg-white text-transparent'}`}>
              <Check size={12} strokeWidth={3} />
            </span>
            <span className={`w-11 h-11 rounded-full inline-flex items-center justify-center ${s.tint}`}>
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="mt-3 text-[15px] font-semibold text-slate-900">{s.label}</span>
            <span className="text-xs text-slate-500">{s.desc}</span>
            <span className="mt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">When it's used</span>
            <span className="mt-0.5 text-xs text-slate-600 leading-snug flex-1">{s.when}</span>
            <span className="mt-3 inline-flex items-center gap-1.5 self-start text-[11px] font-semibold text-slate-700 bg-slate-100 rounded-md px-2 py-1">
              <CalendarDays size={12} aria-hidden="true" /> {s.schedule}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── TOAST ─────────────────────────── */



/* ─────────────────────────── SCHEDULE TIMELINE ─────────────────────────── */
// "Session 2 (Day 3)" → { name: 'Session 2', day: 'Day 3' }
const splitDoseLabel = (label = '') => {
  const m = String(label).match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { name: m[1], day: m[2] } : { name: label, day: '' };
};

// Gap from the previous dose, from the schedule definition: "+3 days",
// "+1 month". Day 0 has none.
const spacingLabels = (service) => {
  const defs = getSchedule(service).doses;
  return defs.map((d, i) => {
    if (i === 0) return '';
    const p = defs[i - 1];
    if (typeof d.month === 'number') {
      const m = d.month - (typeof p.month === 'number' ? p.month : 0);
      return `+${m} month${m === 1 ? '' : 's'}`;
    }
    const n = (d.day || 0) - (p.day || 0);
    return `+${n} day${n === 1 ? '' : 's'}`;
  });
};

// The regimen as a vertical timeline: number, session, day, spacing, date
// and weekday. Weekdays are walk-in days, so no dose gets a warning.
function ScheduleTimeline({ service, baseDate, compact = false }) {
  if (!baseDate) {
    return <p className="text-xs text-slate-500">Choose the Day 0 date to preview the schedule.</p>;
  }
  // Resolved from src/lib/doseSchedules.js — the same definitions the record
  // is written from, so a preview can never promise a different schedule.
  const gaps = spacingLabels(service);
  const rows = buildScheduleDates(service, { day0: baseDate }).map((d, i) => ({ ...d, ...splitDoseLabel(d.label), gap: gaps[i] }));
  return (
    <ol className="relative" aria-label="Dose schedule">
      {rows.map((r, i) => (
        <li key={r.key || i} className={`relative flex items-center gap-3 ${compact ? 'py-1' : 'py-2.5'}`}>
          {i < rows.length - 1 && <span aria-hidden="true" className={`absolute ${compact ? 'left-[9px]' : 'left-[13px]'} top-1/2 h-full w-px bg-slate-200`} />}
          <span className={`relative z-[1] ${compact ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'} rounded-full bg-white border-2 border-[#3B50DF] text-[#3B50DF] font-bold inline-flex items-center justify-center shrink-0`}>{i + 1}</span>
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-900`}>{r.name}</span>
            {r.day && <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-px">{r.day}</span>}
            {!compact && r.gap && <span className="text-[11px] text-slate-400">{r.gap}</span>}
          </div>
          <div className={`text-right shrink-0 ${compact ? 'text-xs' : 'text-sm'}`}>
            <span className="font-semibold text-slate-900 tabular-nums">{formatDateMedium(r.date)}</span>
            <span className="text-slate-500"> · {compact ? weekdayName(r.date).slice(0, 3) : weekdayName(r.date)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Step title for the Add Patient wizard — same weight and size as the
// section titles on the patient record, not the old 800-weight navy.
function StepHeading({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// One labelled group of fields: a small heading on the left, the fields on
// the right (stacked on narrow screens).
function FormGroup({ title, hint, children }) {
  return (
    <section className="apw-group">
      <div className="apw-group-head">
        <h4>{title}</h4>
        {hint && <p>{hint}</p>}
      </div>
      <div className="apw-grid">{children}</div>
    </section>
  );
}

const Req = () => <span className="apw-req" aria-hidden="true">*</span>;
const Opt = ({ children = 'optional' }) => <span className="apw-opt">({children})</span>;

// Whole years between a birth date and today (clinic time).
function ageFromDob(dob) {
  if (!dob) return '';
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today().split('-').map(Number);
  if (!by) return '';
  const age = ty - by - ((tm < bm || (tm === bm && td < bd)) ? 1 : 0);
  return age >= 0 ? String(age) : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Field checks for the wizard, one message each (shown under the field).
const REGISTER_RULES = {
  fname: f => (f.fname.trim() ? '' : 'Enter the first name'),
  lname: f => (f.lname.trim() ? '' : 'Enter the last name'),
  dob: f => (f.dob && f.dob > today() ? 'Date of birth can’t be in the future' : ''),
  age: f => (!String(f.age).trim() ? 'Enter the age, or a date of birth'
    : Number(f.age) < 1 || Number(f.age) > 120 ? 'Enter an age from 1 to 120' : ''),
  email: f => (!f.email.trim() ? 'Enter an email; the patient signs in to the app with it'
    : !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email, e.g. name@gmail.com' : ''),
  contact: f => (f.contact && !isValidPHPhone(f.contact) ? 'Enter a PH mobile number, e.g. 0917 123 4567' : ''),
  sex: f => (f.sex ? '' : 'Choose the sex'),
  barangay: f => (f.barangay ? '' : 'Choose the barangay'),
  service: f => (f.service ? '' : 'Choose a service'),
  typeOfExposure: f => (f.typeOfExposure ? '' : 'Choose the type of exposure'),
  animal: f => (f.animal ? '' : 'Choose the animal'),
  woundWashed: f => (f.woundWashed ? '' : 'Choose yes or no'),
  rigGiven: f => (f.rigGiven ? '' : 'Choose whether RIG was given'),
  vaxGiven: f => (f.vaxGiven ? '' : 'Choose yes or no'),
  route: f => (f.route ? '' : 'Choose the route'),
  date: f => (f.date && f.date > today() ? 'Exposure date can’t be in the future' : ''),
  cat: f => (f.cat !== 'Category II' && f.cat !== 'Category III' ? 'Choose Category II or III'
    : f.animal === 'Bat' && f.cat !== 'Category III' ? 'Bat exposure must be Category III' : ''),
  history: f => ((f.pastVaccines || '').trim() || (f.allergies || '').trim() || (f.notes || '').trim()
    ? '' : 'Add at least one: past vaccination, allergy or clinical notes'),
};
// Checked on Next, in on-screen order (the first invalid one gets focus).
const STEP_FIELDS = {
  identity: ['fname', 'lname', 'sex', 'dob', 'age', 'email', 'contact', 'barangay'],
  services: ['service'],
  pep_details: ['date', 'typeOfExposure', 'animal', 'cat', 'woundWashed', 'rigGiven', 'vaxGiven', 'route'],
  history: ['history'],
};

/* ─────────────────────────── ADD PATIENT MODAL (MULTI-STEP WIZARD) ─────────────────────────── */
export function AddPatientModal({ onClose, onAdd }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [form, setForm] = useState({
    fname: '', mname: '', lname: '', suffix: '', email: '', age: '', sex: '',
    /* Vitals & birth date — optional, blank means "not recorded" everywhere
       they are displayed rather than a zero or a guess. */
    dob: '', height: '', weight: '', bloodPressure: '',
    barangay: '', zone: '', address: '',
    contact: '', service: '', vaccineBrand: '',
    /* PEP Details — every choice starts empty (grey placeholder). Only the
       exposure / Day 0 date defaults to today. */
    placeOfExposure: '', typeOfExposure: '', sourceOfExposure: '',
    cat: '', woundWashed: '', rigGiven: '', vaxGiven: '',
    genericName: '', route: '',
    animal: '', date: today(), woundLocation: '', woundDepth: '', numberOfBites: '',
    /* History & General */
    pastVaccines: '', allergies: '', notes: '',
    /* Tetanus */
    woundType: '', lastTetanus: '',
    /* Pneumonia */
    pneumoVaccine: '', riskCondition: '', priorPneumo: '',
  });

  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const v = useFieldErrors(REGISTER_RULES, form, 'reg');

  const isPep = form.service === 'PEP';

  // Dynamic Step List based on service selection (PEP vs Non-PEP)
  const steps = isPep ? [
    { id: 'identity', label: 'Patient Identity' },
    { id: 'services', label: 'Services' },
    { id: 'pep_details', label: 'PEP Details' },
    { id: 'history', label: 'Medical History' },
    { id: 'schedule', label: 'Vaccination Schedule' },
    { id: 'review', label: 'Review & Confirm' },
  ] : [
    { id: 'identity', label: 'Patient Identity' },
    { id: 'services', label: 'Services' },
    { id: 'history', label: 'Medical History' },
    { id: 'schedule', label: 'Vaccination Schedule' },
    { id: 'review', label: 'Review & Confirm' },
  ];

  // Safeguard index if step list contracts
  const safeStepIndex = Math.min(currentStepIndex, steps.length - 1);
  const currentStep = steps[safeStepIndex];
  const stepFields = STEP_FIELDS[currentStep.id] || [];
  const stepErrorCount = v.count(stepFields);

  const handleNext = () => {
    if (!v.validate(stepFields)) return;
    if (safeStepIndex < steps.length - 1) setCurrentStepIndex(safeStepIndex + 1);
  };

  const handleBack = () => {
    if (safeStepIndex > 0) setCurrentStepIndex(safeStepIndex - 1);
  };

  const jumpToStepId = (id) => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx !== -1) setCurrentStepIndex(idx);
  };

  // Confirm re-checks every step; a problem sends the nurse back to it.
  const handleConfirm = () => {
    for (const s of steps) {
      const keys = STEP_FIELDS[s.id] || [];
      if (keys.some(k => REGISTER_RULES[k](form))) {
        jumpToStepId(s.id);
        requestAnimationFrame(() => v.validate(keys));
        return;
      }
    }
    onAdd(form, setSaving);
  };

  const setAddress = (barangay, zone) => setForm(f => ({ ...f, barangay, zone, address: barangay ? `${zone ? zone + ', ' : ''}Brgy. ${barangay}, Libon, Albay` : '' }));
  const fullDisplayName = [form.fname, form.mname, form.lname].filter(Boolean).join(' ') + (form.suffix ? `, ${form.suffix}` : '');
  const ageFromBirth = ageFromDob(form.dob);
  const serviceLabel = SERVICE_TYPES.find(s => s.key === form.service)?.label || form.service;

  // Review: one compact card per step, each with an Edit link back to it.
  const SummaryCard = ({ title, stepId, rows, children }) => (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <h4 className="text-[13px] font-semibold text-slate-900">{title}</h4>
        <button type="button" onClick={() => jumpToStepId(stepId)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#3B50DF] hover:underline cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-[#3B50DF]/40"
          aria-label={`Edit ${title}`}>
          <Pencil size={12} aria-hidden="true" /> Edit
        </button>
      </div>
      {rows && (
        <dl className="px-4 py-2 grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {rows.filter(Boolean).map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-900 font-medium break-words line-clamp-2" title={typeof val === 'string' ? val : undefined}>{val || <span className="text-slate-400 font-normal">—</span>}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="px-4 py-1.5">{children}</div>}
    </section>
  );

  return (
    <Modal onClose={onClose}>
      <div className="apw bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden m-auto flex flex-col" style={{
        // Most of the screen: header + stepper pinned on top, footer pinned
        // at the bottom, only the step body scrolls.
        width: '76rem',
        maxWidth: 'calc(100vw - 32px)',
        height: 'min(calc(100vh - 32px), 900px)',
        maxHeight: 'calc(100vh - 32px)',
        transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}>

        {/* ── Modal Top Header — same light card head as the Add Report pop-up ── */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between" style={{ flexShrink: 0 }}>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Register New Patient</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Fill out patient registration details step-by-step</p>
          </div>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={onClose} />
        </div>

        {/* ── Persistent Step Indicator Bar ── */}
        <div style={{ padding: '10px 24px 8px', background: '#FFFFFF', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', maxWidth: '56rem', margin: '0 auto' }}>
            {/* Progress line background */}
            <div style={{ position: 'absolute', top: 13, left: 24, right: 24, height: 3, background: '#E2E8F0', zIndex: 1 }} />
            {/* Active progress line fill: spans the same track as the grey
                line and grows with transform (no layout animation). */}
            <div style={{
              position: 'absolute', top: 13, left: 24, right: 24,
              transform: `scaleX(${safeStepIndex / (steps.length - 1)})`, transformOrigin: 'left center',
              height: 3, background: '#3B50DF', zIndex: 1, transition: 'transform .25s ease'
            }} />

            {steps.map((s, idx) => {
              const isCompleted = idx < safeStepIndex;
              const isCurrent = idx === safeStepIndex;
              return (
                <div key={s.id} onClick={() => { if (idx <= safeStepIndex) setCurrentStepIndex(idx); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2, cursor: idx <= safeStepIndex ? 'pointer' : 'default', minWidth: 70 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.8125rem', fontWeight: 600,
                    background: isCurrent ? '#3B50DF' : (isCompleted ? '#3B50DF' : '#FFFFFF'),
                    color: (isCurrent || isCompleted) ? '#FFFFFF' : '#64748B',
                    border: `2px solid ${(isCurrent || isCompleted) ? '#3B50DF' : '#CBD5E1'}`,
                    boxShadow: isCurrent ? '0 0 0 4px rgba(59, 80, 223, 0.16)' : '0 2px 4px rgba(0,0,0,0.04)',
                    transition: 'all .2s ease',
                  }}>
                    {isCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div style={{
                    fontSize: '.65rem', fontWeight: 600,
                    color: isCurrent ? '#3B50DF' : (isCompleted ? '#0F172A' : '#94A3B8'),
                    marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em'
                  }}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Active Step Body (Scrollable Content Area) ── */}
        <div style={{ flex: 1, minHeight: 0, padding: '14px 24px 16px', overflowY: 'auto', background: '#FFFFFF' }}>

          {/* STEP 1: PATIENT IDENTITY */}
          {currentStep.id === 'identity' && (
            <div className="apw-step">
              <StepHeading title="Patient Identity" subtitle="Personal details, how to reach the patient, and where they live" />

              <div className="apw-groups">
                <FormGroup title="Personal info" hint="Name as written on a valid ID.">
                  <div className="form-field"><label htmlFor="reg-fname">First name <Req /></label>
                    <input type="text" {...v.field('fname')} value={form.fname} onChange={e => set('fname', e.target.value)} placeholder="e.g. Juan" autoComplete="off" />
                    <FieldError v={v} name="fname" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-lname">Last name <Req /></label>
                    <input type="text" {...v.field('lname')} value={form.lname} onChange={e => set('lname', e.target.value)} placeholder="e.g. Dela Cruz" autoComplete="off" />
                    <FieldError v={v} name="lname" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-mname">Middle initial <Opt /></label>
                    <input id="reg-mname" type="text" value={form.mname || ''} onChange={e => set('mname', e.target.value)} placeholder="e.g. P." maxLength={5} />
                  </div>
                  <div className="form-field"><label htmlFor="reg-suffix">Suffix <Opt>if any</Opt></label>
                    <input id="reg-suffix" type="text" value={form.suffix || ''} onChange={e => set('suffix', e.target.value)} placeholder="e.g. Jr., III" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-sex">Sex <Req /></label>
                    <Select {...v.field('sex', { withBlur: false })} value={form.sex} onChange={e => set('sex', e.target.value)}>
                      <option value="">Select sex</option><option>Male</option><option>Female</option>
                    </Select>
                    <FieldError v={v} name="sex" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-dob">Date of birth <Opt /></label>
                    <DatePicker {...v.field('dob')} value={form.dob || ''} max={today()} clearable
                      onChange={e => { const d = e.target.value; setForm(f => ({ ...f, dob: d, age: d ? (ageFromDob(d) || f.age) : f.age })); }} />
                    <FieldError v={v} name="dob" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-age">Age <Req /></label>
                    <input type="text" inputMode="numeric" {...v.field('age')} value={form.age} onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 25" />
                    {v.error('age') ? <FieldError v={v} name="age" />
                      : <span className="apw-help">{form.dob && ageFromBirth && ageFromBirth === String(form.age) ? 'Calculated from date of birth' : 'Years. Fills in from the date of birth.'}</span>}
                  </div>
                </FormGroup>

                <FormGroup title="Contact" hint="The email is the patient's app sign-in.">
                  <div className="form-field span-2"><label htmlFor="reg-email">Email <Req /> <Opt>for app login</Opt></label>
                    <input type="email" {...v.field('email')} value={form.email} onChange={e => set('email', e.target.value)} placeholder="patient@gmail.com" autoComplete="off" />
                    <FieldError v={v} name="email" />
                  </div>
                  <div className="form-field span-2"><label htmlFor="reg-contact">Contact number <Opt /></label>
                    <input type="text" inputMode="numeric" {...v.field('contact')} value={form.contact} onChange={e => set('contact', e.target.value.replace(/[^\d+\s-]/g, ''))} placeholder="0917 123 4567" />
                    <FieldError v={v} name="contact" />
                  </div>
                </FormGroup>

                <FormGroup title="Address" hint="Libon, Albay.">
                  <div className="form-field"><label htmlFor="reg-barangay">Barangay <Req /></label>
                    <Select {...v.field('barangay', { withBlur: false })} value={form.barangay || ''} onChange={e => setAddress(e.target.value, form.zone || '')}>
                      <option value="">Select barangay</option>
                      {LIBON_BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
                    </Select>
                    <FieldError v={v} name="barangay" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-zone">Zone / street / purok</label>
                    <Select id="reg-zone" value={form.zone || ''} onChange={e => setAddress(form.barangay || '', e.target.value)}>
                      <option value="">Select zone / purok</option>
                      {ZONE_OPTIONS.map(z => <option key={z} value={z}>{z}</option>)}
                    </Select>
                  </div>
                  <div className="form-field span-2"><label htmlFor="reg-address">Full address <Opt>auto-filled</Opt></label>
                    <input id="reg-address" type="text" value={form.address} placeholder="Fills in from the barangay and zone" readOnly tabIndex={-1} />
                  </div>
                </FormGroup>

                <FormGroup title="Vitals" hint="Optional. Leave blank if not measured.">
                  <div className="form-field"><label htmlFor="reg-bp">Blood pressure</label>
                    <input id="reg-bp" type="text" value={form.bloodPressure || ''} onChange={e => set('bloodPressure', e.target.value)} placeholder="e.g. 120/80" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-height">Height <Opt>cm</Opt></label>
                    <input id="reg-height" type="text" inputMode="decimal" value={form.height || ''} onChange={e => set('height', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))} placeholder="e.g. 165" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-weight">Weight <Opt>kg</Opt></label>
                    <input id="reg-weight" type="text" inputMode="decimal" value={form.weight || ''} onChange={e => set('weight', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))} placeholder="e.g. 58" />
                  </div>
                </FormGroup>
              </div>
            </div>
          )}

          {/* STEP 2: SERVICES */}
          {currentStep.id === 'services' && (
            <div className="apw-step">
              <StepHeading title="Select Service" subtitle="Choose the medical vaccination service category for this patient" />
              <ServiceSelector value={form.service} onChange={val => setForm(f => ({ ...f, service: val }))} />
              <FieldError v={v} name="service" />
              {(() => {
                const sel = SERVICE_TYPES.find(x => x.key === form.service);
                return sel && (
                  <p className="mt-4 text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">Selected: {sel.label}</span>
                    <span className="text-slate-300">·</span>
                    <span>{scheduleLabel(form.service)}</span>
                    <span className="text-slate-300">·</span>
                    <span>{isPep ? 'Next: exposure details, then medical history.' : 'Next: medical history, then the schedule.'}</span>
                  </p>
                );
              })()}
            </div>
          )}

          {/* STEP 3: PEP DETAILS (Only shown for PEP service), in clinical order */}
          {currentStep.id === 'pep_details' && (
            <div className="apw-step">
              <StepHeading title="Post-Exposure Prophylaxis (PEP) Details" subtitle="What happened, the wound, then the care already given" />

              <div className="apw-groups">
                <FormGroup title="Exposure" hint="When, how and by which animal.">
                  <div className="form-field"><label htmlFor="reg-date">Date of exposure</label>
                    <DatePicker {...v.field('date')} value={form.date || today()} max={today()} onChange={e => set('date', e.target.value || today())} />
                    <FieldError v={v} name="date" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-typeOfExposure">Type of exposure <Req /></label>
                    <Select {...v.field('typeOfExposure', { withBlur: false })} value={form.typeOfExposure || ''} onChange={e => set('typeOfExposure', e.target.value)}>
                      <option value="">Select type</option>
                      <option>Bite</option><option>Scratch</option><option>Saliva Contact</option><option>Non-bite Exposure</option>
                    </Select>
                    <FieldError v={v} name="typeOfExposure" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-animal">Biting animal <Req /></label>
                    <Select {...v.field('animal', { withBlur: false })} value={form.animal || ''} onChange={e => { const a = e.target.value; setForm(f => ({ ...f, animal: a, cat: a === 'Bat' ? 'Category III' : f.cat })); }}>
                      <option value="">Select animal</option>
                      <option>Dog</option><option>Cat</option><option>Monkey</option><option>Bat</option><option>Rat</option><option>Other</option>
                    </Select>
                    <FieldError v={v} name="animal" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-source">Source</label>
                    <Select id="reg-source" value={form.sourceOfExposure || ''} onChange={e => set('sourceOfExposure', e.target.value)}>
                      <option value="">Select source</option>
                      <option>Stray animal</option><option>Domestic pet</option><option>Wild animal</option><option>Unknown source</option>
                    </Select>
                  </div>
                  <div className="form-field span-2"><label htmlFor="reg-place">Place of exposure</label>
                    <Select id="reg-place" value={form.placeOfExposure || ''} onChange={e => set('placeOfExposure', e.target.value)}>
                      <option value="">Select place</option>
                      {PLACE_OF_EXPOSURE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </div>
                </FormGroup>

                <FormGroup title="Wound" hint="Category decides whether RIG is needed.">
                  <div className="form-field"><label htmlFor="reg-cat">Exposure category <Req /></label>
                    {/* Category I is no longer used: exposures start at Category II. */}
                    <Select {...v.field('cat', { withBlur: false })} value={form.cat || ''} onChange={e => set('cat', e.target.value)} placeholder="Select category">
                      <option value="">Select category</option><option disabled={form.animal === 'Bat'}>Category II</option><option>Category III</option>
                    </Select>
                    <FieldError v={v} name="cat" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-woundloc">Wound location</label>
                    <Select id="reg-woundloc" value={form.woundLocation || ''} onChange={e => set('woundLocation', e.target.value)}>
                      <option value="">Select location</option>
                      {WOUND_LOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </div>
                  <div className="form-field"><label htmlFor="reg-depth">Wound depth</label>
                    <Select id="reg-depth" value={form.woundDepth || ''} onChange={e => set('woundDepth', e.target.value)}>
                      <option value="">Select depth</option>
                      <option>Superficial</option><option>Deep / Penetrating</option><option>Multiple</option><option>Unknown</option>
                    </Select>
                  </div>
                  <div className="form-field"><label htmlFor="reg-bites">No. of bites / wounds</label>
                    <Select id="reg-bites" value={form.numberOfBites || ''} onChange={e => set('numberOfBites', e.target.value)}>
                      <option value="">Select number</option>
                      <option>1</option><option>2</option><option>3</option><option>4+</option>
                    </Select>
                  </div>
                  <div className="form-field"><label htmlFor="reg-woundWashed">Wound washed? <Req /></label>
                    <Select {...v.field('woundWashed', { withBlur: false })} value={form.woundWashed || ''} onChange={e => set('woundWashed', e.target.value)}>
                      <option value="">Select yes or no</option>
                      <option>Yes</option><option>No</option>
                    </Select>
                    <FieldError v={v} name="woundWashed" />
                  </div>
                  {(form.animal === 'Bat' || form.cat === 'Category III') && (
                    <p className="span-3 apw-note">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span>
                        {form.animal === 'Bat' ? 'Bat exposure is always Category III (WHO). Give' : 'Category III: give'}
                        {' '}rabies immunoglobulin (RIG) with the first vaccine dose.
                        {(form.rigGiven === 'No' || !form.rigGiven) && ' Record it under Treatment once given.'}
                      </span>
                    </p>
                  )}
                </FormGroup>

                <FormGroup title="Treatment" hint="Care already given at this visit.">
                  <div className="form-field"><label htmlFor="reg-rigGiven">RIG given? <Req /></label>
                    <Select {...v.field('rigGiven', { withBlur: false })} value={form.rigGiven || ''} onChange={e => set('rigGiven', e.target.value)}>
                      <option value="">Select RIG given</option>
                      <option>No</option><option>Yes (ERIG)</option><option>Yes (HRIG)</option>
                    </Select>
                    <FieldError v={v} name="rigGiven" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-vaxGiven">Anti-rabies vaccine given? <Req /></label>
                    <Select {...v.field('vaxGiven', { withBlur: false })} value={form.vaxGiven || ''} onChange={e => set('vaxGiven', e.target.value)}>
                      <option value="">Select yes or no</option>
                      <option>Yes</option><option>No</option>
                    </Select>
                    <FieldError v={v} name="vaxGiven" />
                  </div>
                  <div className="form-field"><label htmlFor="reg-route">Vaccine route <Req /></label>
                    <Select {...v.field('route', { withBlur: false })} value={form.route || ''} onChange={e => set('route', e.target.value)}>
                      <option value="">Select route</option>
                      <option value="IM">Intramuscular (IM)</option>
                      <option value="ID">Intradermal (ID)</option>
                    </Select>
                    <FieldError v={v} name="route" />
                  </div>
                </FormGroup>
              </div>
            </div>
          )}

          {/* STEP 4 (OR 3 NON-PEP): MEDICAL HISTORY, with a summary to double-check */}
          {currentStep.id === 'history' && (
            <div className="apw-step">
              <StepHeading title="Medical History & Clinical Notes" subtitle="Prior vaccinations, known allergies and clinical observations" />

              <div className="apw-history">
                <div className="apw-groups">
                  <section className="apw-group apw-group-stacked">
                    <div className="apw-grid apw-grid-2">
                      <div className="form-field"><label htmlFor="reg-history">Past vaccination history</label>
                        <Select id="reg-history" aria-invalid={v.error('history') ? true : undefined} value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)}>
                          <option value="">Select history</option>
                          {PAST_VACCINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      </div>
                      <div className="form-field"><label htmlFor="reg-allergies">Allergies</label>
                        <Select id="reg-allergies" aria-invalid={v.error('history') ? true : undefined} value={form.allergies || ''} onChange={e => set('allergies', e.target.value)}>
                          <option value="">Select allergy</option>
                          {ALLERGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      </div>

                      {form.service === 'Tetanus' && (
                        <>
                          <div className="form-field"><label htmlFor="reg-woundtype">Wound / injury type</label>
                            <Select id="reg-woundtype" value={form.woundType || ''} onChange={e => set('woundType', e.target.value)}>
                              <option value="">Select injury type</option>
                              <option>Laceration</option><option>Puncture</option><option>Abrasion</option><option>Burn</option><option>Crush injury</option><option>Other</option>
                            </Select>
                          </div>
                          <div className="form-field"><label htmlFor="reg-lasttt">Last tetanus shot</label>
                            <Select id="reg-lasttt" value={form.lastTetanus || ''} onChange={e => set('lastTetanus', e.target.value)}>
                              <option value="">Select last shot</option>
                              <option>Unknown</option><option>Less than 5 years ago</option><option>5–10 years ago</option><option>More than 10 years ago</option><option>Never vaccinated</option>
                            </Select>
                          </div>
                        </>
                      )}

                      {form.service === 'Pneumonia' && (
                        <>
                          <div className="form-field"><label htmlFor="reg-pneumo">Vaccine variant</label>
                            <Select id="reg-pneumo" value={form.pneumoVaccine || ''} onChange={e => set('pneumoVaccine', e.target.value)}>
                              <option value="">Select variant</option>
                              <option>PCV20 (Prevnar 20)</option><option>PPSV23 (Pneumovax 23)</option>
                            </Select>
                          </div>
                          <div className="form-field"><label htmlFor="reg-risk">High-risk condition</label>
                            <Select id="reg-risk" value={form.riskCondition || ''} onChange={e => set('riskCondition', e.target.value)}>
                              <option value="">Select condition</option>
                              <option>None</option><option>Asthma / COPD</option><option>Diabetes</option><option>Heart disease</option><option>Immunocompromised</option><option>Chronic kidney disease</option><option>Smoker</option><option>Age ≥ 65</option><option>Other</option>
                            </Select>
                          </div>
                        </>
                      )}

                      <div className="form-field span-all"><label htmlFor="reg-notes">Clinical notes</label>
                        <textarea id="reg-notes" aria-invalid={v.error('history') ? true : undefined} aria-describedby={v.error('history') ? 'reg-history-err' : undefined}
                          value={form.notes || ''} onChange={e => set('notes', e.target.value)} onBlur={() => v.blur('history')}
                          placeholder="Observations, lab results or assessment notes…" rows={7}
                          style={{ resize: 'none', height: 160, overflowY: 'auto' }} />
                        <FieldError v={v} name="history" />
                        {!v.error('history') && <span className="apw-help">Fill in at least one of the three.</span>}
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="apw-summary" aria-label="Patient so far">
                  <h4>Patient so far</h4>
                  <p>Double-check before continuing.</p>
                  <dl>
                    <dt>Name</dt><dd>{fullDisplayName.trim() || '—'}</dd>
                    <dt>Age / sex</dt><dd>{form.age ? `${form.age} yrs` : '—'} · {form.sex}</dd>
                    <dt>Service</dt><dd>{serviceLabel}</dd>
                    {isPep && <><dt>Category</dt><dd>{form.cat || '—'}{form.animal ? ` · ${form.animal}` : ''}</dd></>}
                    {isPep && <><dt>Exposure</dt><dd>{formatDateMedium(form.date || today())}</dd></>}
                    <dt>Barangay</dt><dd>{form.barangay || '—'}</dd>
                  </dl>
                  <button type="button" className="apw-link" onClick={() => jumpToStepId('identity')}><Pencil size={12} aria-hidden="true" /> Edit patient identity</button>
                </aside>
              </div>
            </div>
          )}

          {/* STEP 5 (OR 4 NON-PEP): VACCINATION SCHEDULE */}
          {currentStep.id === 'schedule' && (
            <div className="apw-step">
              <StepHeading title="Vaccination Schedule" subtitle="Calculated from the Day 0 date" />

              {/* Top: Day 0, regimen and dose count in one row; below: the
                  full-width timeline; notes last. */}
              <div className="apw-groups apw-pad">
                <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)_auto] gap-x-8 gap-y-3 items-end">
                  <div className="form-field"><label htmlFor="reg-day0">Day 0 (first dose)</label>
                    <DatePicker id="reg-day0" value={form.date || today()} max={today()} onChange={e => set('date', e.target.value || today())} />
                  </div>
                  <div className="pb-1.5">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Regimen</div>
                    <div className="text-sm font-semibold text-slate-900">{scheduleLabel(form.service)}</div>
                  </div>
                  <div className="pb-1.5 md:text-right">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Total</div>
                    <div className="text-sm font-semibold text-slate-900">{(() => { const n = buildScheduleDates(form.service, { day0: form.date || today() }).length; return `${n} dose${n === 1 ? '' : 's'}`; })()}</div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mb-1">Estimated schedule</div>
                  <ScheduleTimeline service={form.service} baseDate={form.date || today()} />
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 space-y-1">
                  <p>{isPep ? 'Day 0 is the date of exposure and is given at registration.' : 'Day 0 is given at registration.'} Later doses move with it.</p>
                  <p>Weekday doses are walk-in; weekend doses can be booked as appointments.</p>
                </div>
              </div>
            </div>
          )}

          {/* FINAL STEP: REVIEW & CONFIRM — full width, a 2-column grid of
              compact cards, each with an Edit link back to its step. */}
          {currentStep.id === 'review' && (
            <div className="apw-step apw-step-wide">
              <StepHeading title="Review & Confirm Registration" subtitle="Check each section. Use Edit to go back and change it." />

              <div className="apw-review">
                {/* Two stacked columns, so cards of different heights leave no gaps. */}
                <div className="flex flex-col gap-3 min-w-0">
                <SummaryCard title="Identity" stepId="identity" rows={[
                  ['Full name', fullDisplayName],
                  ['Age / sex', `${form.age} yrs · ${form.sex}`],
                  ['Date of birth', form.dob ? formatDateMedium(form.dob) : ''],
                  ['Vitals', [form.bloodPressure && `BP ${form.bloodPressure}`, form.height && `${form.height} cm`, form.weight && `${form.weight} kg`].filter(Boolean).join(' · ')],
                ]} />
                <SummaryCard title="Service" stepId="services" rows={[
                  ['Service', `${serviceLabel} · ${SERVICE_TYPES.find(x => x.key === form.service)?.desc || ''}`],
                  ['Regimen', scheduleLabel(form.service)],
                ]} />
                <SummaryCard title="Medical history" stepId="history" rows={[
                  ['Past vaccines', form.pastVaccines],
                  ['Allergies', form.allergies],
                  ['Notes', form.notes],
                  form.service === 'Tetanus' && ['Wound / last shot', `${form.woundType} · ${form.lastTetanus}`],
                  form.service === 'Pneumonia' && ['Variant / risk', `${form.pneumoVaccine} · ${form.riskCondition}`],
                ]} />
                </div>
                <div className="flex flex-col gap-3 min-w-0">
                <SummaryCard title="Contact & address" stepId="identity" rows={[
                  ['Email', form.email],
                  ['Contact', form.contact],
                  ['Address', form.address],
                ]} />
                {isPep && (
                  <SummaryCard title="Exposure" stepId="pep_details" rows={[
                    ['Exposure', `${formatDateMedium(form.date || today())} · ${form.typeOfExposure} · ${form.animal}`],
                    ['Source / place', [form.sourceOfExposure, form.placeOfExposure].filter(Boolean).join(' · ')],
                    ['Category', form.cat],
                    ['Wound', `${form.woundLocation || 'Location not set'} · ${form.woundDepth} · ${form.numberOfBites} bite(s) · washed: ${form.woundWashed}`],
                    ['Treatment', `RIG: ${form.rigGiven} · vaccine: ${form.vaxGiven} · ${form.route || 'IM'}`],
                  ]} />
                )}
                <SummaryCard title="Schedule" stepId="schedule">
                  <ScheduleTimeline service={form.service} baseDate={form.date || today()} compact />
                </SummaryCard>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Sticky Wizard Navigation Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3" style={{ flexShrink: 0 }}>
          <button
            type="button"
            onClick={safeStepIndex === 0 ? onClose : handleBack}
            className={BTN.outline}
          >
            {safeStepIndex === 0 ? 'Cancel' : '← Back'}
          </button>

          <div className="flex items-center gap-4">
            <FormErrorNote count={stepErrorCount} />
            {currentStep.id !== 'review' ? (
              <button
                type="button"
                onClick={handleNext}
                className={BTN.primary}
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirm}
                className={BTN.primary}
              >
                <Check size={BTN_ICON} aria-hidden="true" />
                {saving ? 'Registering…' : 'Register patient'}
              </button>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}

/* ─────────────────────────── EDIT PATIENT MODAL ─────────────────────────── */
const EDIT_RULES = {
  name: f => (f.name.trim() ? '' : 'Enter the full name'),
  age: REGISTER_RULES.age,
  dob: REGISTER_RULES.dob,
  // Email is optional here (older records may not have one), but must be valid.
  email: f => (f.email.trim() && !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email, e.g. name@gmail.com' : ''),
  contact: REGISTER_RULES.contact,
  date: REGISTER_RULES.date,
  // PEP needs an exposure category; Category I is no longer an option.
  cat: REGISTER_RULES.cat,
  animal: REGISTER_RULES.animal,
  service: f => (f.service ? '' : 'Choose a service'),
  vaccineBrand: f => (!f.service ? 'Choose a service first' : f.vaccineBrand ? '' : 'Choose the vaccine brand'),
};

export function EditPatientModal({ patient, onClose, onSave, inventoryItems = [] }) {
  const [form, setForm] = useState({
    // Saved values load as they are; anything never recorded stays empty
    // (grey placeholder) instead of a made-up default.
    name: patient.name || '', email: patient.email || '', age: patient.age || '', sex: patient.sex || '',
    dob: patient.dob || '', height: patient.height || '', weight: patient.weight || '', bloodPressure: patient.bloodPressure || '',
    address: patient.address || '', contact: patient.contact || '',
    service: patient.service || '', vaccineBrand: patient.vaccineBrand || '',
    animal: patient.animal || '', cat: patient.cat === 'II' || patient.cat === 'III' ? `Category ${patient.cat}` : '',
    date: patient.date || today(),
    woundLocation: patient.woundLocation || '', woundDepth: patient.woundDepth || '', numberOfBites: patient.numberOfBites || '',
    pastVaccines: patient.pastVaccines || '', allergies: patient.allergies || '', notes: patient.notes || '',
    woundType: patient.woundType || '', lastTetanus: patient.lastTetanus || '',
    pneumoVaccine: patient.pneumoVaccine || '', riskCondition: patient.riskCondition || '', priorPneumo: patient.priorPneumo || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isPep = form.service === 'PEP';
  // Only brands for the chosen service; none until a service is chosen.
  const eligibleVaccines = form.service ? getEligibleVaccinesForService(form.service, inventoryItems) : [];
  // Every eligible brand is listed; out-of-stock and expired ones are shown
  // disabled with a badge instead of silently missing.
  const vaccineItems = [...eligibleVaccines];
  if (form.vaccineBrand && !vaccineItems.some(item => item.name === form.vaccineBrand)) {
    vaccineItems.unshift({ id: 'current_assigned', name: form.vaccineBrand, stock: '?' });
  }

  // handleEditSave (parent) persists and closes this modal itself; the
  // checks here are the same inline ones as the Register wizard.
  const v = useFieldErrors(EDIT_RULES, form, 'edit');
  const editFields = ['name', 'age', 'dob', 'email', 'contact', 'service', 'vaccineBrand', ...(isPep ? ['date', 'animal', 'cat'] : [])];
  function handleSave() {
    if (!v.validate(editFields)) return;
    onSave(form);
  }

  return (
    <Modal onClose={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 m-auto flex flex-col"
        style={{
          width: '70rem',
          maxWidth: 'min(70rem, calc(100% - 32px))',
          maxHeight: 'calc(100vh - 128px)',
          transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Light Clean Header Bar (Matching Add Report Style) */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Edit Patient Record</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">{formatTitleCase(patient.name)} · ID: {patient.mrn || patient.id || 'N/A'}</p>
          </div>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={onClose} />
        </div>

        {/* Scrollable Landscape Form Body */}
        <div className="px-6 pt-4 pb-6 overflow-y-auto flex-1 text-xs font-semibold text-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            {/* LEFT COLUMN: Patient Identity */}
            <div className="space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a1d47] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                  Patient Identity
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Personal details & contact</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block mb-1.5 text-slate-500">Full Name <span style={{ color: '#C8151A' }}>*</span></label>
                  <input
                    type="text"
                    {...v.field('name')}
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Juan Dela Cruz"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                  <FieldError v={v} name="name" />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Age <span style={{ color: '#C8151A' }}>*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    {...v.field('age')}
                    value={form.age}
                    onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="e.g. 25"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                  <FieldError v={v} name="age" />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Sex</label>
                  <Select
                    value={form.sex}
                    onChange={e => set('sex', e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  >
                    <option value="">Select sex</option>
                    <option>Male</option>
                    <option>Female</option>
                  </Select>
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Date of Birth</label>
                  <DatePicker
                    {...v.field('dob')}
                    value={form.dob || ''}
                    max={today()}
                    clearable
                    onChange={e => { const d = e.target.value; setForm(f => ({ ...f, dob: d, age: d ? (ageFromDob(d) || f.age) : f.age })); }}
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                  <FieldError v={v} name="dob" />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Blood Pressure</label>
                  <input
                    type="text"
                    value={form.bloodPressure || ''}
                    onChange={e => set('bloodPressure', e.target.value)}
                    placeholder="e.g. 120/80"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Height (cm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.height || ''}
                    onChange={e => set('height', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
                    placeholder="e.g. 165"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Weight (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.weight || ''}
                    onChange={e => set('weight', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
                    placeholder="e.g. 58"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block mb-1.5 text-slate-500">Email Address</label>
                  <input
                    type="email"
                    {...v.field('email')}
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="patient@gmail.com"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                  <FieldError v={v} name="email" />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Contact Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    {...v.field('contact')}
                    value={form.contact}
                    onChange={e => set('contact', e.target.value.replace(/[^\d+\s-]/g, ''))}
                    placeholder="+63 9XX XXX XXXX"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                  <FieldError v={v} name="contact" />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                    placeholder="Zone, Brgy., Libon, Albay"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Service, Exposure & Medical History */}
            <div className="space-y-4">
              {/* Service & Vaccine Brand */}
              <div className="space-y-3 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a1d47] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                    Service & Vaccine Brand
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-service" className="block mb-1.5 text-slate-500">Service <span style={{ color: '#C8151A' }}>*</span></label>
                    {/* Changing the service always clears the brand: brands are per service. */}
                    <Select
                      {...v.field('service', { withBlur: false })}
                      value={form.service}
                      onChange={e => {
                        const newSvc = e.target.value;
                        setForm(f => ({ ...f, service: newSvc, vaccineBrand: newSvc === f.service ? f.vaccineBrand : '' }));
                      }}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">Select service</option>
                      {SERVICE_TYPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </Select>
                    <FieldError v={v} name="service" />
                  </div>
                  <div>
                    <label htmlFor="edit-vaccineBrand" className="block mb-1.5 text-slate-500">Vaccine Brand <span style={{ color: '#C8151A' }}>*</span></label>
                    <Select
                      {...v.field('vaccineBrand', { withBlur: false })}
                      value={form.vaccineBrand}
                      disabled={!form.service}
                      onChange={e => set('vaccineBrand', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">{form.service ? 'Select brand' : 'Choose a service first'}</option>
                      {vaccineItems.map(item => (
                        (() => { const a = brandAvailability(item, today());
                          return <option key={item.id} value={item.name} disabled={a.disabled} data-badge={a.badge} data-badge-tone={a.tone}>{item.name}</option>; })()
                      ))}
                    </Select>
                    <FieldError v={v} name="vaccineBrand" />
                  </div>
                </div>

                {/* Info about the chosen service: only once one is picked. */}
                {form.service && form.service !== 'PrEP' && (() => {
                  const sel = SERVICE_TYPES.find(s => s.key === form.service);
                  return sel && (
                    <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 text-xs text-indigo-900 mt-2">
                      <p className="font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#3B50DF]" />
                        {sel.label} · {sel.desc}
                      </p>
                      <p className="mt-1 text-slate-600 font-normal leading-relaxed">{sel.when} {sel.schedule}.</p>
                    </div>
                  );
                })()}

                {/* PrEP Information Notice */}
                {form.service === 'PrEP' && (
                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 text-xs text-indigo-900 mt-2">
                    <p className="font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#3B50DF]" />
                      Pre-Exposure Prophylaxis (PrEP)
                    </p>
                    <p className="mt-1 text-slate-600 font-normal leading-relaxed">
                      Preventive rabies immunization schedule before exposure (2 doses: Days 0 and 7). No animal bite exposure details required.
                    </p>
                  </div>
                )}

                {/* PEP Exposure Details */}
                {isPep && (
                  <div className="pt-2 border-t border-slate-200/70 space-y-3">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Exposure Details</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1.5 text-slate-500">Date of Exposure</label>
                        <DatePicker
                          {...v.field('date')}
                          value={form.date}
                          max={today()}
                          onChange={e => set('date', e.target.value || form.date)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        />
                        <FieldError v={v} name="date" />
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Biting Animal</label>
                        <Select
                          {...v.field('animal', { withBlur: false })}
                          value={form.animal}
                          onChange={e => { const a = e.target.value; setForm(f => ({ ...f, animal: a, cat: a === 'Bat' ? 'Category III' : f.cat })); }}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select animal</option>
                          <option>Dog</option><option>Cat</option><option>Monkey</option><option>Bat</option><option>Rat</option><option>Other</option>
                        </Select>
                        <FieldError v={v} name="animal" />
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Exposure Category</label>
                        <Select
                          {...v.field('cat', { withBlur: false })}
                          value={form.cat || ''}
                          onChange={e => set('cat', e.target.value)}
                          placeholder="Select category"
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select category</option><option disabled={form.animal === 'Bat'}>Category II</option><option>Category III</option>
                        </Select>
                        <FieldError v={v} name="cat" />
                        {form.animal === 'Bat' && !v.error('cat') && <p className="mt-1 text-[11px] font-semibold text-amber-700">Bat exposure is always Category III (WHO). Give ERIG.</p>}
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">No. of Bites / Wounds</label>
                        <Select
                          value={form.numberOfBites}
                          onChange={e => set('numberOfBites', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select number</option>
                          <option>1</option><option>2</option><option>3</option><option>4+</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Wound Location</label>
                        <Select
                          value={form.woundLocation || ''}
                          onChange={e => set('woundLocation', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select location</option>
                          {WOUND_LOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Wound Depth</label>
                        <Select
                          value={form.woundDepth}
                          onChange={e => set('woundDepth', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select depth</option>
                          <option>Superficial</option><option>Deep / Penetrating</option><option>Multiple</option><option>Unknown</option>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Medical History & Notes */}
              <div className="space-y-3 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a1d47] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                    Medical History & Clinical Notes
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1.5 text-slate-500">Past Vaccination History</label>
                    <Select
                      value={form.pastVaccines || ''}
                      onChange={e => set('pastVaccines', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">Select history</option>
                      {PAST_VACCINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-slate-500">Allergies</label>
                    <Select
                      value={form.allergies || ''}
                      onChange={e => set('allergies', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">Select allergy</option>
                      {ALLERGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </div>

                  {form.service === 'Tetanus' && (
                    <>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Wound / Injury Type</label>
                        <Select
                          value={form.woundType}
                          onChange={e => set('woundType', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select injury type</option>
                          <option>Laceration</option><option>Puncture</option><option>Abrasion</option><option>Burn</option><option>Crush injury</option><option>Other</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Last Tetanus Shot</label>
                        <Select
                          value={form.lastTetanus}
                          onChange={e => set('lastTetanus', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select last shot</option>
                          <option>Unknown</option><option>Less than 5 years ago</option><option>5–10 years ago</option><option>More than 10 years ago</option><option>Never vaccinated</option>
                        </Select>
                      </div>
                    </>
                  )}

                  {form.service === 'Pneumonia' && (
                    <>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Vaccine Variant</label>
                        <Select
                          value={form.pneumoVaccine}
                          onChange={e => set('pneumoVaccine', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select variant</option>
                          <option>PCV20 (Prevnar 20)</option><option>PPSV23 (Pneumovax 23)</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">High-Risk Condition</label>
                        <Select
                          value={form.riskCondition}
                          onChange={e => set('riskCondition', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">Select condition</option>
                          <option>None</option><option>Asthma / COPD</option><option>Diabetes</option><option>Heart disease</option><option>Immunocompromised</option><option>Chronic kidney disease</option><option>Smoker</option><option>Age ≥ 65</option><option>Other</option>
                        </Select>
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <label className="block mb-1.5 text-slate-500">Clinical Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Add any relevant observations, lab results, or clinical assessment notes..."
                      rows={2}
                      className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 resize-y"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={BTN.outline}
          >
            Cancel
          </button>
          <div className="flex items-center gap-4">
          <FormErrorNote count={v.count(editFields)} action="save" />
          <button
            type="button"
            onClick={handleSave}
            className={BTN.primary}
          >
            Save Changes
          </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── PIN MAP CONFIRM MODAL (LANDSCAPE) ─────────────────────────── */
// ── Duplicate-patient detection for the Add Patient wizard ──────────────
// Compares the form against every loaded record and returns the likely
// matches, strongest first. Email is already enforced unique elsewhere; this
// catches the same person re-registered under a new email or a typo'd name.
const _normName = (v) => (v || '').toLowerCase().replace(/[^a-z]/g, '');

const _digits = (v) => (v || '').replace(/\D/g, '').slice(-10); // PH mobile: last 10 digits

function _levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function findSimilarPatients(form, patients) {
  const fname = _normName(form.fname);
  const lname = _normName(form.lname);
  const full = fname + lname;
  const contact = _digits(form.contact);
  const dob = (form.dob || '').trim();
  const age = String(form.age || '').trim();
  if (!full) return [];

  const out = [];
  for (const p of patients) {
    const pFull = _normName(p.name);
    const pParts = (p.name || '').split(/[\s,]+/).filter(Boolean);
    const pFirst = _normName(pParts[0]);
    const pLast = _normName(pParts.filter(w => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).slice(-1)[0]);
    const pContact = _digits(p.contact);
    const pDob = (p.dob || '').trim();
    const pAge = String(p.age || '').trim();

    const reasons = [];
    const nameExact = pFirst === fname && pLast === lname;
    const nameClose = !nameExact && fname && lname && _levenshtein(pFirst + pLast, full) <= 2;
    const nameContained = !nameExact && !nameClose && (pFull.includes(full) || full.includes(pFull)) && Math.min(pFull.length, full.length) >= 6;
    if (nameExact) reasons.push('Same name');
    else if (nameClose) reasons.push('Very similar name');
    else if (nameContained) reasons.push('Similar name');
    if (contact && pContact && contact === pContact) reasons.push('Same contact number');
    if (dob && pDob && dob === pDob) reasons.push('Same date of birth');
    else if (age && pAge && age === pAge && (nameExact || nameClose)) reasons.push('Same age');

    // A contact match alone is worth showing; a name match needs no extra.
    if (!reasons.length) continue;
    const strength = (nameExact ? 3 : nameClose ? 2 : nameContained ? 1 : 0) + (reasons.length - 1) * 2;
    out.push({ patient: p, reasons, strength, exact: nameExact && reasons.length >= 2 });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

export function DuplicatePatientModal({ form, matches, onProceed, onCancel }) {
  if (!matches?.length) return null;
  const hasExact = matches.some(m => m.exact);
  const newName = [form.fname, form.mname, form.lname].filter(Boolean).map(formatTitleCase).join(' ');
  return (
    <Modal onClose={onCancel}>
      <div style={{ background: '#FFFFFF', borderRadius: '1.25rem', width: '40rem', maxWidth: '95vw', boxShadow: '0 24px 64px rgba(26,34,64,.22)', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <div style={{ padding: '16px 24px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#FEF3C7', border: '1px solid #FDE68A', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                {hasExact ? 'Possible Duplicate Patient' : 'Similar Patient Found'}
              </h3>
              <p style={{ fontSize: '.71875rem', color: '#92400E', margin: 0 }}>
                {matches.length === 1 ? 'A record' : `${matches.length} records`} already on file {matches.length === 1 ? 'looks' : 'look'} like <strong>{newName}</strong>. Check before registering again.
              </p>
            </div>
          </div>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={onCancel} />
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '55vh', overflowY: 'auto' }}>
          {matches.map(({ patient: p, reasons, exact }) => (
            <div key={p.id} style={{ border: `1px solid ${exact ? '#FCA5A5' : '#E2E8F0'}`, background: exact ? '#FEF2F2' : '#F8FAFC', borderRadius: '.75rem', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#0F172A' }}>{formatTitleCase(p.name)} <span style={{ fontWeight: 600, color: '#64748B', fontSize: '.75rem' }}>· MRN {p.id || p.mrn || '—'}</span></div>
                <div style={{ fontSize: '.75rem', color: '#475569', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                  <span>{p.age ? `${p.age} yrs` : 'Age —'} · {p.sex || '—'}</span>
                  <span>{p.contact || 'No contact'}</span>
                  <span>{p.email || 'No email'}</span>
                  {p.address && <span>{p.address}</span>}
                  <span>{serviceLabel(p.service || 'PEP')} · registered {p.date || '—'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                {reasons.map(r => (
                  <span key={r} style={{ fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', padding: '3px 8px', borderRadius: 999, background: exact ? '#FEE2E2' : '#E0E7FF', color: exact ? '#991B1B' : '#3730A3', whiteSpace: 'nowrap' }}>{r}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" className={BTN.outline} onClick={onCancel}>Go Back & Review</button>
          <button
            type="button"
            onClick={onProceed}
            className={hasExact ? BTN.danger : BTN.primary}
          >
            {hasExact ? 'Register Anyway (New Person)' : 'Register as New Patient'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PinMapConfirmModal({ patient, saving, onConfirm, onCancel }) {
  if (!patient) return null;
  const barangayVal = patient.barangay || (patient.address ? (patient.address.match(/Brgy\.\s*([^,]+)/)?.[1] || 'San Juan') : 'San Juan');
  const zoneVal = patient.zone || (patient.address ? patient.address.split(',')[0].replace(/Brgy\..*/, '').trim() : 'Zone 1');
  const locationStr = `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon, Albay`;
  const exposureTypeVal = patient.service === 'PEP' ? `${patient.animal || 'Dog'} Bite` : (patient.service || 'Bite Incident');
  return (
    <ConfirmDialog
      variant="neutral"
      icon={MapPin}
      title="Pin incident to the map?"
      subtitle="Anonymized bite / exposure incident"
      message={<>The exposure location is added to the <strong>Incident Map</strong>.</>}
      details={[
        ['Location', locationStr],
        ['Incident type', patient.cat ? `${exposureTypeVal} (Category ${patient.cat})` : exposureTypeVal],
        ['Exposure date', patient.date || 'Today'],
      ]}
      note={`No personal details (name, patient ID ${patient.id || ''}, contact or exact address) are attached to the pin.`}
      noteIcon={ShieldCheck}
      confirmLabel="Pin to map"
      busy={saving}
      busyLabel="Pinning…"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
