// Single source of truth for how a patient's registered service is named in
// the app. Every screen that prints a vaccine type, a timeline heading or a
// protocol label reads it from here, off the `service` field the Admin
// Dashboard writes to `vaccinations/{mrn}` — so a PrEP patient can never be
// shown a "PEP Dose Timeline" again.
//
// The dose *schedule* itself is never derived here: doses are generated once
// at registration (ka-clinic-admin/src/pages/patients.jsx buildInitialDoses)
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
