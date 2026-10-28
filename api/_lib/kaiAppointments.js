import { bukasMeansTomorrow, clinicKnowledge, getKaiDecision, kaiCopy } from '../../patient-app/services/kaiPolicy.js';

const DAY_NAMES = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  tl: ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'],
};
const WEEKDAYS = [
  /\b(?:sun(?:day)?|linggo)\b/i, /\b(?:mon(?:day)?|lunes)\b/i,
  /\b(?:tue(?:sday)?|martes)\b/i, /\b(?:wed(?:nesday)?|miyerk[ou]les)\b/i,
  /\b(?:thu(?:rsday)?|huwebes)\b/i, /\b(?:fri(?:day)?|biyernes)\b/i,
  /\b(?:sat(?:urday)?|sabado)\b/i,
];
const MONTHS = [
  'jan(?:uary)?|enero', 'feb(?:ruary)?|pebrero', 'mar(?:ch)?|marso', 'apr(?:il)?|abril',
  'may|mayo', 'jun(?:e)?|hunyo', 'jul(?:y)?|hulyo', 'aug(?:ust)?|agosto',
  'sep(?:t|tember)?|setyembre|septiyembre', 'oct(?:ober)?|oktubre', 'nov(?:ember)?|nobyembre', 'dec(?:ember)?|disyembre',
];
const dow = iso => new Date(`${iso}T00:00:00Z`).getUTCDay();
const addDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export function clinicNow(time = Date.now()) {
  const date = new Date(time + 8 * 3600000);
  return { iso: date.toISOString().slice(0, 10), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

function validDate(year, month, day) {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

// Explicit dates/weekdays win over "bukas" meaning "open" in questions
// such as "anong oras kayo bukas sa sabado?".
export function requestedDate(text, today) {
  const q = String(text || '').toLowerCase();
  let m = q.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/);
  if (m) return { iso: validDate(+m[1], +m[2], +m[3]), specified: true };
  const year = Number(today.slice(0, 4));
  const infer = (month, day, y) => {
    const iso = validDate(y ? +y : year, month, day);
    return !y && iso && iso < today ? validDate(year + 1, month, day) : iso;
  };
  for (let month = 0; month < MONTHS.length; month++) {
    const name = `(?:${MONTHS[month]})\\.?`;
    m = q.match(new RegExp(`\\b${name}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`));
    if (!m) m = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${name}(?:,?\\s+(20\\d\\d))?`));
    if (m) return { iso: infer(month + 1, +m[1], m[2]), specified: true };
  }
  m = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d\d))?\b/);
  if (m) return { iso: infer(+m[1], +m[2], m[3]), specified: true };
  const weekday = WEEKDAYS.findIndex(re => re.test(q));
  if (weekday !== -1) {
    let delta = (weekday - dow(today) + 7) % 7;
    if (delta === 0 && /\b(?:next|susunod)\b/.test(q)) delta = 7;
    return { iso: addDays(today, delta), specified: true };
  }
  if (/\b(?:day after tomorrow|samakalawa)\b/.test(q)) return { iso: addDays(today, 2), specified: true };
  if (/\btomorrow\b/.test(q) || bukasMeansTomorrow(q)) return { iso: addDays(today, 1), specified: true };
  if (/\b(?:today|tonight|ngayon|mamaya)\b/.test(q)) return { iso: today, specified: true };
  return { iso: null, specified: false };
}

const normTime = time => String(time || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

// Only occupancy leaves this provider, never names, MRNs or appointment owners.
export async function loadAppointmentAvailability(iso, now) {
  const { db } = await import('./firebaseAdmin.js');
  const [holds, appointments, closures] = await Promise.all([
    db.collection('appointmentSlots').where('date', '==', iso).get(),
    db.collection('appointments').where('date', '==', iso).get(),
    db.collection('scheduleClosures').where('active', '==', true).get(),
  ]);
  return availableFromRecords(iso, now, holds.docs.map(d => d.data()), appointments.docs.map(d => d.data()), closures.docs.map(d => d.data()));
}

export function availableFromRecords(iso, now, holds, appointments, closures = []) {
  const active = closures.filter(c => c.active !== false && c.startDate <= iso && iso <= c.endDate);
  if (active.some(c => c.type === 'day')) return { mode: 'closed', open: [] };
  if (clinicKnowledge.walkInDays.includes(dow(iso))) return { mode: 'walk_in', open: [] };
  if (!clinicKnowledge.appointmentDays.includes(dow(iso))) return { mode: 'closed', open: [] };
  const taken = new Set(holds.map(d => normTime(d.time)));
  active.filter(c => c.type === 'slots').flatMap(c => Array.isArray(c.slots) ? c.slots : []).forEach(slot => taken.add(normTime(slot)));
  appointments.filter(d => !['cancelled', 'declined'].includes(d.status)).forEach(d => taken.add(normTime(d.time)));
  const open = clinicKnowledge.timeSlots.filter(slot => {
    if (taken.has(normTime(slot))) return false;
    const [, hour, minute, meridiem] = slot.match(/^(\d+):(\d+)\s*(AM|PM)/);
    const start = ((+hour % 12) + (meridiem === 'PM' ? 12 : 0)) * 60 + +minute;
    return iso !== now.iso || start > now.hour * 60 + now.minute;
  });
  return { mode: 'appointment', open };
}

export async function appointmentReply(prompt, history, language, { now = clinicNow(), load = loadAppointmentAvailability } = {}) {
  const copy = kaiCopy[language];
  let date = requestedDate(prompt, now.iso);
  if (!date.specified) {
    for (const turn of history.slice(-8).reverse()) {
      if (turn?.role !== 'user' || typeof turn.text !== 'string' || turn.text.length > 1000) continue;
      if (getKaiDecision(turn.text).intent !== 'availability') continue;
      const previous = requestedDate(turn.text, now.iso);
      if (previous.specified) { date = previous; break; }
    }
  }
  if (!date.specified) return { text: copy.dateQuestion, source: 'knowledge' };
  if (!date.iso) return { text: copy.invalidDate, source: 'knowledge' };
  if (date.iso < now.iso) return { text: copy.pastDate, source: 'knowledge' };
  try {
    const data = await load(date.iso, now);
    const day = DAY_NAMES[language === 'en' ? 'en' : 'tl'][dow(date.iso)];
    if (data.mode === 'walk_in') return { text: copy.walkInDate(day), source: 'appointments_db' };
    if (data.mode === 'closed') return { text: copy.closedDate, source: 'appointments_db' };
    if (data.mode !== 'appointment' || !Array.isArray(data.open)) throw new Error('Invalid availability data');
    // Ignore unexpected provider fields, even if they contain patient details.
    const open = data.open.filter(slot => clinicKnowledge.timeSlots.includes(slot));
    return {
      text: `${day}, ${date.iso}\n${open.length ? `${copy.openSlots}:\n${open.map(slot => `• ${slot}`).join('\n')}` : copy.noSlots}\n${copy.booking}`,
      source: 'appointments_db',
    };
  } catch {
    return { text: copy.unavailable, source: 'fallback', fallbackReason: 'availability_unavailable' };
  }
}
