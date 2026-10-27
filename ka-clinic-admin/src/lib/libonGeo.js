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

// Libon municipal boundary as [lat, lng] points (PSA 2023 boundaries via
// github.com/faeldon/philippines-json-maps, MIT; medium resolution, 223 km²).
// The Incident Map is clipped to it.
export const LIBON_BOUNDARY = [[13.33012,123.40379],[13.33465,123.3988],[13.33919,123.3964],[13.34106,123.3926],[13.34028,123.38693],[13.33965,123.38588],[13.33609,123.38393],[13.33695,123.38211],[13.33821,123.37478],[13.33484,123.37562],[13.33091,123.38093],[13.32896,123.37872],[13.32595,123.3779],[13.32394,123.37817],[13.32278,123.38219],[13.32121,123.38385],[13.31803,123.38379],[13.31234,123.37988],[13.31167,123.37654],[13.31285,123.37355],[13.31018,123.37345],[13.30934,123.37661],[13.30557,123.37775],[13.30301,123.37566],[13.30038,123.37024],[13.30047,123.36663],[13.3025,123.36707],[13.30285,123.36477],[13.29991,123.36297],[13.2997,123.36045],[13.30194,123.35592],[13.30667,123.35269],[13.30113,123.34491],[13.29483,123.33555],[13.29031,123.3202],[13.28725,123.31225],[13.28352,123.3085],[13.27638,123.29827],[13.26951,123.28522],[13.26694,123.28219],[13.26342,123.28055],[13.26114,123.2826],[13.25882,123.28121],[13.25802,123.28259],[13.25769,123.28649],[13.25474,123.29116],[13.25314,123.29278],[13.24353,123.29973],[13.23958,123.30208],[13.23674,123.30469],[13.2326,123.30652],[13.22906,123.30954],[13.2216,123.31466],[13.21475,123.31679],[13.20947,123.31911],[13.20624,123.32283],[13.20327,123.32414],[13.19822,123.32734],[13.19486,123.32651],[13.19083,123.32426],[13.18879,123.32101],[13.18946,123.31679],[13.1921,123.31624],[13.19224,123.31351],[13.19108,123.31201],[13.19158,123.3096],[13.18711,123.30719],[13.18727,123.30492],[13.17783,123.30488],[13.17516,123.30664],[13.17223,123.30741],[13.17158,123.30921],[13.16862,123.31089],[13.16582,123.31006],[13.16315,123.30826],[13.1559,123.30126],[13.15372,123.29863],[13.14981,123.29269],[13.14826,123.28962],[13.14684,123.28868],[13.14198,123.28892],[13.13925,123.29047],[13.13497,123.29193],[13.13182,123.29224],[13.1307,123.29339],[13.12975,123.29775],[13.14459,123.31744],[13.1686,123.34595],[13.18172,123.36814],[13.18566,123.38039],[13.18471,123.38324],[13.18764,123.38452],[13.18853,123.38185],[13.19038,123.38333],[13.18856,123.38606],[13.19024,123.3866],[13.19074,123.39083],[13.19367,123.39137],[13.20826,123.40548],[13.22002,123.42002],[13.22139,123.42457],[13.22863,123.42862],[13.23539,123.43508],[13.24123,123.44102],[13.24785,123.45969],[13.2509,123.45982],[13.2524,123.46128],[13.25662,123.46209],[13.25927,123.46065],[13.26295,123.45955],[13.26315,123.45719],[13.26589,123.45443],[13.26695,123.45211],[13.26862,123.45194],[13.27779,123.46389],[13.28465,123.46416],[13.28559,123.46159],[13.28919,123.4606],[13.29135,123.45881],[13.29535,123.46192],[13.29794,123.46132],[13.29958,123.45874],[13.30509,123.45516],[13.30674,123.45261],[13.3089,123.45142],[13.31055,123.44747],[13.3135,123.44314],[13.31555,123.4421],[13.31571,123.44063],[13.31857,123.4382],[13.32205,123.43619],[13.32406,123.43392],[13.32428,123.43164],[13.32271,123.42947],[13.32409,123.42846],[13.3259,123.42367],[13.32496,123.42031],[13.32769,123.41671],[13.32862,123.41439],[13.32856,123.40987],[13.32702,123.40544],[13.33012,123.40379]];

/** True when the point lies inside Libon's boundary. */
export function insideLibon(lat, lng) {
  let c = false;
  for (let i = 0, k = LIBON_BOUNDARY.length - 1; i < LIBON_BOUNDARY.length; k = i++) {
    const [yi, xi] = LIBON_BOUNDARY[i], [yk, xk] = LIBON_BOUNDARY[k];
    if ((yi > lat) !== (yk > lat) && lng < ((xk - xi) * (lat - yi)) / (yk - yi) + xi) c = !c;
  }
  return c;
}
