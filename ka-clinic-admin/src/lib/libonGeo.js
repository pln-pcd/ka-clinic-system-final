// Libon, Albay barangay list and approximate map coordinates, shared by the
// patient intake form, the Incident Map and the demo seed script
// (scripts/demo). Pure data and math, no React, so Node can import it.

export const LIBON_BARANGAYS = [
  'San Juan', 'San Rafael', 'Matacon', 'Bulusan', 'Bonavista', 'Carisac East',
  'Carisac West', 'Rawis', 'Pantao', 'Bap-bap', 'Bambon', 'Barbon', 'Burabod',
  'Cagbulos', 'Harigue', 'Liberacion', 'Izcala', 'Labnig', 'Linao', 'Magcawayan',
  'Malabag', 'Maroba', 'Molosbolos', 'Nino Jesus', 'Nogpo', 'San Agustin',
  'San Antonio', 'San Isidro', 'San Jose', 'San Roque', 'San Vicente', 'Santa Cruz',
  'Sogo', 'Talin-talin', 'Tambo', 'Tipa-tipa', 'Zone 1', 'Zone 2', 'Zone 3',
  'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9', 'Zone 10', 'Zone 11'
];

export const LIBON_BARANGAY_COORDS = {
  'San Juan':       { lat: 13.3000, lng: 123.4350 },
  'San Rafael':     { lat: 13.2920, lng: 123.4280 },
  'Matacon':        { lat: 13.2850, lng: 123.4210 },
  'Bulusan':        { lat: 13.3150, lng: 123.4420 },
  'Bonavista':      { lat: 13.3210, lng: 123.4500 },
  'Carisac East':   { lat: 13.3100, lng: 123.4600 },
  'Carisac West':   { lat: 13.3080, lng: 123.4520 },
  'Rawis':          { lat: 13.3320, lng: 123.4650 },
  'Pantao':         { lat: 13.3450, lng: 123.4750 },
  'Bap-bap':        { lat: 13.2750, lng: 123.4100 },
  'Bambon':         { lat: 13.2980, lng: 123.4250 },
  'Barbon':         { lat: 13.2820, lng: 123.4310 },
  'Burabod':        { lat: 13.3040, lng: 123.4400 },
  'Cagbulos':       { lat: 13.3120, lng: 123.4310 },
  'Harigue':        { lat: 13.3180, lng: 123.4220 },
  'Liberacion':     { lat: 13.3010, lng: 123.4370 },
  'Izcala':         { lat: 13.2900, lng: 123.4480 },
  'Labnig':         { lat: 13.3250, lng: 123.4380 },
  'Linao':          { lat: 13.3300, lng: 123.4420 },
  'Magcawayan':     { lat: 13.3350, lng: 123.4550 },
  'Malabag':        { lat: 13.2950, lng: 123.4500 },
  'Maroba':         { lat: 13.2880, lng: 123.4600 },
  'Molosbolos':     { lat: 13.3060, lng: 123.4680 },
  'Nino Jesus':     { lat: 13.2990, lng: 123.4290 },
  'Nogpo':          { lat: 13.3400, lng: 123.4600 },
  'San Agustin':    { lat: 13.3050, lng: 123.4200 },
  'San Antonio':    { lat: 13.3100, lng: 123.4150 },
  'San Isidro':     { lat: 13.2920, lng: 123.4390 },
  'San Jose':       { lat: 13.2960, lng: 123.4440 },
  'San Roque':      { lat: 13.3020, lng: 123.4460 },
  'San Vicente':    { lat: 13.3080, lng: 123.4410 },
  'Santa Cruz':     { lat: 13.3150, lng: 123.4510 },
  'Sogo':           { lat: 13.3220, lng: 123.4620 },
  'Talin-talin':    { lat: 13.3280, lng: 123.4710 },
  'Tambo':          { lat: 13.3360, lng: 123.4800 },
  'Tipa-tipa':      { lat: 13.3420, lng: 123.4880 },
  'Zone 1':         { lat: 13.3005, lng: 123.4355 },
  'Zone 2':         { lat: 13.3015, lng: 123.4365 },
  'Zone 3':         { lat: 13.3025, lng: 123.4375 },
  'Zone 4':         { lat: 13.3035, lng: 123.4385 },
  'Zone 5':         { lat: 13.3045, lng: 123.4395 },
  'Zone 6':         { lat: 13.2995, lng: 123.4345 },
  'Zone 7':         { lat: 13.2985, lng: 123.4335 },
  'Zone 8':         { lat: 13.2975, lng: 123.4325 },
  'Zone 9':         { lat: 13.2965, lng: 123.4315 },
  'Zone 10':        { lat: 13.2955, lng: 123.4305 },
  'Zone 11':        { lat: 13.2945, lng: 123.4295 },
};

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

export function geocodeLibonAddress(barangay, zone) {
  const base = LIBON_BARANGAY_COORDS[barangay] || { lat: 13.3000, lng: 123.4350 };
  const { latOffset, lngOffset } = getHashOffset(zone || barangay);
  return {
    lat: +(base.lat + latOffset).toFixed(6),
    lng: +(base.lng + lngOffset).toFixed(6),
  };
}
