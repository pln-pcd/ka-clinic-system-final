// Libon, Albay barangays and their map points, shared by the patient intake
// form, the Patients list, the Incident Map and the seed scripts. Pure data
// and math, no React, so Node can import it.
//
// Source: the 47 barangays of Libon as listed by PSA (via PhilAtlas,
// philatlas.com/luzon/r05/albay/libon.html), with each barangay's point from
// its PhilAtlas page. The seven Poblacion barangays (Zone I to Zone VII) are
// chosen as "Poblacion" plus a zone, so the barangay list has no zone entries.
// Puroks and sitios are set by each barangay and have no official published
// list, so they are typed in, not chosen.

export const POBLACION = 'Poblacion';
export const POBLACION_ZONES = ['Zone I', 'Zone II', 'Zone III', 'Zone IV', 'Zone V', 'Zone VI', 'Zone VII'];

const BARANGAY_POINTS = {
  'Alongong':        { lat: 13.2825, lng: 123.3231 },
  'Apud':            { lat: 13.1378, lng: 123.2979 },
  'Bacolod':         { lat: 13.2699, lng: 123.4353 },
  'Bariw':           { lat: 13.2788, lng: 123.3617 },
  'Bonbon':          { lat: 13.2823, lng: 123.3928 },
  'Buga':            { lat: 13.2944, lng: 123.3540 },
  'Bulusan':         { lat: 13.2899, lng: 123.4063 },
  'Burabod':         { lat: 13.2667, lng: 123.4128 },
  'Caguscos':        { lat: 13.2293, lng: 123.3440 },
  'East Carisac':    { lat: 13.2988, lng: 123.4538 },
  'Harigue':         { lat: 13.2538, lng: 123.3480 },
  'Libtong':         { lat: 13.2677, lng: 123.3674 },
  'Linao':           { lat: 13.2525, lng: 123.4415 },
  'Mabayawas':       { lat: 13.2202, lng: 123.4098 },
  'Macabugos':       { lat: 13.2437, lng: 123.3148 },
  'Magallang':       { lat: 13.2627, lng: 123.3871 },
  'Malabiga':        { lat: 13.2186, lng: 123.3654 },
  'Marayag':         { lat: 13.2825, lng: 123.4564 },
  'Matara':          { lat: 13.1963, lng: 123.3778 },
  'Molosbolos':      { lat: 13.2670, lng: 123.3357 },
  'Natasan':         { lat: 13.2244, lng: 123.3848 },
  'Niño Jesus':      { lat: 13.2503, lng: 123.4054 },
  'Nogpo':           { lat: 13.2903, lng: 123.3764 },
  'Pantao':          { lat: 13.1953, lng: 123.3373 },
  'Rawis':           { lat: 13.1501, lng: 123.3117 },
  'Sagrada Familia': { lat: 13.2708, lng: 123.3897 },
  'Salvacion':       { lat: 13.2055, lng: 123.3880 },
  'Sampongan':       { lat: 13.2041, lng: 123.3680 },
  'San Agustin':     { lat: 13.3177, lng: 123.4249 },
  'San Antonio':     { lat: 13.2379, lng: 123.3961 },
  'San Isidro':      { lat: 13.2765, lng: 123.4427 },
  'San Jose':        { lat: 13.2413, lng: 123.3628 },
  'San Pascual':     { lat: 13.2150, lng: 123.3960 },
  'San Ramon':       { lat: 13.2349, lng: 123.4253 },
  'San Vicente':     { lat: 13.2574, lng: 123.4290 },
  'Santa Cruz':      { lat: 13.3184, lng: 123.3949 },
  'Talin-talin':     { lat: 13.1656, lng: 123.3245 },
  'Tambo':           { lat: 13.2634, lng: 123.2939 },
  'Villa Petrona':   { lat: 13.2544, lng: 123.3774 },
  'West Carisac':    { lat: 13.3107, lng: 123.4428 },
};

export const POBLACION_ZONE_COORDS = {
  'Zone I':   { lat: 13.2884, lng: 123.4459 },
  'Zone II':  { lat: 13.2924, lng: 123.4407 },
  'Zone III': { lat: 13.2989, lng: 123.4434 },
  'Zone IV':  { lat: 13.2954, lng: 123.4213 },
  'Zone V':   { lat: 13.3043, lng: 123.4430 },
  'Zone VI':  { lat: 13.3069, lng: 123.4157 },
  'Zone VII': { lat: 13.3084, lng: 123.4322 },
};

// The town proper (PhilAtlas' point for Libon), used for Poblacion without a
// zone and for anything that cannot be placed.
export const LIBON_CENTER = { lat: 13.2998, lng: 123.4384 };

/** The barangay dropdown: the 40 named barangays and Poblacion, A–Z. */
export const LIBON_BARANGAYS = [...Object.keys(BARANGAY_POINTS), POBLACION].sort((a, b) => a.localeCompare(b));

export const LIBON_BARANGAY_COORDS = { ...BARANGAY_POINTS, [POBLACION]: LIBON_CENTER };

// Names older records were saved with, mapped to today's list. Barangays
// that are not in Libon at all (San Rafael, Matacon, ...) have no mapping
// and are shown as saved.
const ALIASES = {
  'carisac east': 'East Carisac',
  'carisac west': 'West Carisac',
  'nino jesus': 'Niño Jesus',
  'santo niño jesus': 'Niño Jesus',
  'santo nino jesus': 'Niño Jesus',
  'tambo walis': 'Tambo',
};
const ROMAN = { 1: 'Zone I', 2: 'Zone II', 3: 'Zone III', 4: 'Zone IV', 5: 'Zone V', 6: 'Zone VI', 7: 'Zone VII' };

/** "Zone 3", "zone iii", "Zone III (Poblacion)" → "Zone III"; '' when not a Poblacion zone. */
export function poblacionZone(name) {
  const s = String(name || '').trim().replace(/\s*\(pob(lacion|\.)?\)\s*$/i, '');
  const m = s.match(/^zone\s+([0-9]+|[ivx]+)$/i);
  if (!m) return '';
  if (/^\d+$/.test(m[1])) return ROMAN[Number(m[1])] || '';
  return POBLACION_ZONES.find(z => z.toLowerCase() === `zone ${m[1].toLowerCase()}`) || '';
}

/** An official barangay name for `name` (old spellings and Poblacion zones included), or ''. */
export function knownBarangay(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'poblacion' || poblacionZone(s)) return POBLACION;
  return LIBON_BARANGAYS.find(b => b.toLowerCase() === lower) || ALIASES[lower] || '';
}

/** The address line a registration saves: "Zone II, Poblacion, Libon, Albay" or "Purok 3, Brgy. Linao, Libon, Albay". */
export function libonAddress(barangay, zone) {
  if (!barangay) return '';
  if (barangay === POBLACION) return `${zone ? `${zone}, ` : ''}${POBLACION}, Libon, Albay`;
  return `${zone ? `${zone}, ` : ''}Brgy. ${barangay}, Libon, Albay`;
}

/**
 * The barangay of a patient record for lists: the `barangay` saved at
 * registration (old spellings mapped to the official name); for older records
 * without it, the barangay named in the registration address. A saved name
 * that is not a Libon barangay is shown as saved; nothing is guessed from
 * other free text.
 */
export function recordBarangay(p) {
  const saved = String(p?.barangay || '').trim();
  if (saved) return knownBarangay(saved) || saved;
  const address = String(p?.address || '');
  const m = address.match(/\bBrgy\.?\s+([^,]+)/i);
  if (m) return knownBarangay(m[1]);
  return /\bPoblacion\b/i.test(address) ? POBLACION : '';
}

function getHashOffset(str) {
  if (!str) return { latOffset: 0, lngOffset: 0 };
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((Math.abs(hash) % 30) - 15) * 0.0001;
  const lngOffset = ((Math.abs(hash * 31) % 30) - 15) * 0.0001;
  return { latOffset, lngOffset };
}

/**
 * A map point for a barangay (and, in Poblacion, its zone): the barangay's
 * point plus a small fixed offset (up to ~170 m) from the zone/purok text, so
 * cases from one barangay do not all sit on one spot.
 */
export function geocodeLibonAddress(barangay, zone) {
  const brgy = knownBarangay(barangay);
  const pobZone = brgy === POBLACION ? (poblacionZone(zone) || poblacionZone(barangay)) : '';
  const base = (pobZone && POBLACION_ZONE_COORDS[pobZone]) || LIBON_BARANGAY_COORDS[brgy] || LIBON_CENTER;
  const { latOffset, lngOffset } = getHashOffset(zone || barangay);
  return {
    lat: +(base.lat + latOffset).toFixed(6),
    lng: +(base.lng + lngOffset).toFixed(6),
  };
}
