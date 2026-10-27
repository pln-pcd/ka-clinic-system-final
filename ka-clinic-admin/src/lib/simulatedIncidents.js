// Simulated incident pins for the thesis demo (see docs/STUDY_MODE.md).
//
// Every pin is made up: coordinates are uniformly random inside a box around
// Libon's town area, not derived from any address, barangay or patient, and
// the documents carry no address, zone, barangay, patient or MRN fields. The
// Incident Map shows only documents with isSimulated: true, and
// firestore.rules accepts only those.
//
// Pure data and math (no Firebase), so the seed scripts and the dashboard
// share it.

// A box around the municipality's barangays (lib/libonGeo.js); pins land
// anywhere inside it.
export const SIM_BOUNDS = { south: 13.140, north: 13.320, west: 123.295, east: 123.460 };

const TYPES = ['Dog bite', 'Dog bite', 'Dog bite', 'Cat bite', 'Cat scratch', 'Dog scratch'];
// Category I is not used at the clinic: exposures start at Category II.
const CATEGORIES = ['Category II', 'Category II', 'Category III', 'Category III'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Small deterministic PRNG, so a given seed always produces the same set.
function prng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** "2026-09" → "Sep 2026" */
export const simulatedMonthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : '';
};

/** "Incident #12 · Dog bite · Category II · Sep 2026" */
export const simulatedIncidentLabel = (inc) =>
  [`Incident #${inc.simNo ?? '?'}`, inc.type, inc.category, simulatedMonthLabel(inc.month)].filter(Boolean).join(' · ');

/**
 * count simulated incidents spread over the `months` months up to `todayIso`.
 * Returns [{ id, data }]; data has only: isSimulated, simNo, type, category,
 * month (YYYY-MM), lat, lng, source, status, createdAt.
 */
export function buildSimulatedIncidents({ count = 30, seed = 2026, todayIso, months = 6, extra = {} } = {}) {
  const rand = prng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const [ty, tm] = String(todayIso).slice(0, 7).split('-').map(Number);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const back = Math.floor(rand() * months);
    const d = new Date(Date.UTC(ty, tm - 1 - back, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const lat = +(SIM_BOUNDS.south + rand() * (SIM_BOUNDS.north - SIM_BOUNDS.south)).toFixed(5);
    const lng = +(SIM_BOUNDS.west + rand() * (SIM_BOUNDS.east - SIM_BOUNDS.west)).toFixed(5);
    out.push({
      id: `sim-${String(i).padStart(3, '0')}`,
      data: {
        isSimulated: true,
        simNo: i,
        type: pick(TYPES),
        category: pick(CATEGORIES),
        month,
        lat,
        lng,
        source: 'simulation',
        status: 'active',
        createdAt: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1 + Math.floor(rand() * 27)),
        ...extra,
      },
    });
  }
  return out;
}

// Fields a simulated incident must never carry.
export const FORBIDDEN_INCIDENT_FIELDS = ['address', 'location', 'barangay', 'zone', 'mrn', 'patientName', 'victimName', 'patient', 'patientId', 'description', 'latitude', 'longitude'];
