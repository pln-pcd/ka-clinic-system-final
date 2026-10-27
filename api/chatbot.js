import fs from 'fs';
import { db } from './_lib/firebaseAdmin.js';
import {
  BLOCKED_REPLY,
  BLOCKED_REPLY_APP,
  BOOKING_REPLY,
  CLINIC,
  MEDICAL_OUTPUT_RE,
  OUT_OF_SCOPE_REPLY,
  PERSONAL_NAV_REPLY_APP,
  PERSONAL_NAV_REPLY_PUBLIC,
  PERSONAL_INFO_REPLY_APP,
  PERSONAL_INFO_REPLY_PUBLIC,
  PRICE_RE,
  PRICE_REPLY,
  THANKS_RE,
  THANKS_REPLY,
  VAGUE_REPLY,
  classifyMessage,
  fixedInScopeReply,
  isShortVague,
  vagueReply,
} from './_lib/chatbotRules.js';

const APP_GUIDE_TEXT = fs.readFileSync(new URL('./_lib/appGuide.md', import.meta.url), 'utf8');

// Shared K&A Clinic assistant (KAI): one backend used by the website chatbot
// (ka-clinic-admin/src/lib/geminiService.js) and the patient app
// (patient-app/services/chatbot.ts). The Gemini API key never ships in a
// client bundle.
//
// SCOPE (thesis ethics rules, see docs/STUDY_MODE.md): general clinic
// information, office hours, contact details, appointment procedures and
// app navigation only. No diagnosis, treatment, wound care, rabies-risk
// assessment, vaccine recommendations, PEP schedules, medication or
// emergency advice, and no patient's own dates or dose counts.
//
// Enforcement, in order:
//   1. classifyMessage() (api/_lib/chatbotRules.js) runs BEFORE any AI call.
//      Blocked, personal-schedule and out-of-scope messages get fixed replies
//      and never reach the model; anything it cannot place is blocked.
//   2. Allowed topics with a fixed answer (hours, contact, services, prices,
//      app help) are answered from chatbotRules, not the model.
//   3. Live appointment slots come straight from Firestore.
//   4. Only what is left reaches the model, under the instruction below.
//   5. The model's reply is checked again (MEDICAL_OUTPUT_RE); medical
//      content is replaced by the blocked reply.
const CLINIC_SYSTEM_INSTRUCTION = `
You are KAI, the official virtual assistant of ${CLINIC.name} (${CLINIC.address}, Philippines; Phone: ${CLINIC.phone}; Email: ${CLINIC.email}).

OFFICIAL CLINIC & PATIENT APP KNOWLEDGE BASE:
${APP_GUIDE_TEXT}

SERVICES OFFERED (name only these, never describe them clinically): Post-Exposure Prophylaxis (PEP), Pre-Exposure Prophylaxis (PrEP), Pneumonia (pneumococcal) vaccine, Anti-tetanus vaccine.

RATES (state exactly as written; never estimate a rate that is not listed):
• PEP Category II (with anti-tetanus): ₱1,000 for the first session, then ₱800 for each of the next 3 sessions
• PEP Category III: ₱4,500 for the full 4-session package (includes anti-tetanus and RIG)
• Pneumonia (pneumococcal) vaccine: ₱4,500
• PrEP and anti-tetanus on its own: no listed rate; the clinic staff give it.
Quoting a rate is not advice: never say which category or service the user needs.

HOW TO ANSWER:
- Be smart and flexible: understand what the user means even when it is phrased casually, misspelled, in Filipino/Taglish, or a follow-up to the earlier messages, and answer that exact question directly from the knowledge base. Combine facts when a question needs it (e.g. "can I book on a holiday Sunday?").
- Answer only what you know from the knowledge base and the facts above. If the answer is not there, say so in one short sentence and add that they can talk to the clinic staff. Never guess or invent facts.

STRICT CLINICAL & SAFETY RESTRICTIONS:
0. NAMES & PERSONAL DETAILS: Never respond to, use, repeat or acknowledge a name, phone number, address or other personal detail the user types, and never address the user by a name. Do not thank them for it. Say only that you can't respond to names or personal details, then offer what you can help with.
1. ZERO MEDICAL ADVICE: You must NEVER provide medical advice, diagnosis, triage, wound care, first aid, rabies-risk or exposure-category assessment, medication/drug advice, emergency advice, or PEP/PrEP regimens (no day numbers, no dose counts). If a medical question slips past the classifier, decline politely.
2. PATIENT PRIVACY: You cannot look up individual patient records, personal appointment dates, or personal dose schedules. Direct patients to their vaccination card and dose timeline on the Home screen.
3. OUT-OF-SCOPE TOPICS: For anything unrelated to K&A Clinic or the patient app (such as science, history, coding, homework, sports, politics, or general trivia), politely decline in ONE short sentence and redirect back to K&A Clinic matters. Do not lecture.
4. TONE & LANGUAGE: Answer naturally in the language of the user (English, Filipino / Tagalog, Taglish). Be helpful, warm, professional and direct.
5. FORMATTING: Answer what was asked, completely, so the patient does not need a follow-up question.
   - "How do I…" / procedure questions: one short lead sentence, then numbered steps (1. 2. 3.), one action per line, covering every step from where to start to the result (what the patient sees after, e.g. Pending until the clinic confirms). End with one line of useful related info when it helps (e.g. weekdays are walk-in, how to cancel or reschedule).
   - Facts (hours, location, prices, services): a short heading line in **bold**, then one item per line starting with "• ".
   - Simple yes/no or one-fact questions: one or two sentences, no list.
   - Keep each answer under about 120 words. Put a blank line between the lead sentence, the list and the closing line.
   Use **double asterisks** for tab names, button names and key times or prices. No single asterisks, no markdown headers (#), no tables. Do not greet unless greeted. Do not open with "Thanks" or filler; start with the answer. Never mention Gemini or any AI model.
6. APP & BOOKING GUIDANCE: When explaining app navigation, rescheduling, or booking procedures, do not mention clinical phrases like "dose schedule", "rabies", "treatment", or "wound care"; refer to appointments, services, or records.
`;

// Any sign the user is asking about times/slots/booking on some day. Paired
// with a resolved date, this routes to the live Firestore availability reply.
const SCHEDULING_RE = /\b(availab\w*|vacant|slots?|time|times|oras|book\w*|appointments?|appts?|schedul\w*|reserv\w*|still\s+open|free|left|remaining|bakante)\b/i;
const APPT_AVAILABILITY_RE = /\b(availab\w*|open\w*|free\w*)\s+(appointment|appt|slot|time)s?\b|\b(appointment|appt|slot)s?\s+(availab\w*|open\w*|schedule)\b|\bwhat\s+(are\s+the\s+)?(availab\w*\s+)?(appointment|appt|slot)s?\b|\bany\s+available\s+(appointment|appt|slot)s?\b/i;

const CLINIC_TIME_SLOTS = [
  '8:00 AM - 9:00 AM',
  '9:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '1:00 PM - 2:00 PM',
  '2:00 PM - 3:00 PM',
  '3:00 PM - 4:00 PM',
  '4:00 PM - 5:00 PM',
];

// ─── Dates & live slot availability ──────────────────────────────────────────
// The model is bad at calendar arithmetic (it called Sunday, Sept 27 a
// weekday), so every date is resolved here, in clinic time (Asia/Manila,
// UTC+8, no DST), and the model is only ever handed pre-computed facts.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE_SRC = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const WEEKDAY_RE = /\b(next\s+|this\s+(?:coming\s+)?)?(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\b/i;

const pad2 = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const isoDow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const addDaysIso = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const isWeekendIso = (iso) => { const d = isoDow(iso); return d === 0 || d === 6; };

function formatIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAY_NAMES[isoDow(iso)]}, ${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function manilaNow() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return { iso: now.toISOString().slice(0, 10), hour: now.getUTCHours(), minute: now.getUTCMinutes() };
}

// Rejects impossible dates like Feb 30 instead of letting Date roll them over.
function validIso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = toIso(y, m, d);
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

// A month/day with no year means the next time that date comes around.
function withInferredYear(m, d, yearStr, todayIso) {
  const thisYear = Number(todayIso.slice(0, 4));
  if (yearStr) return validIso(Number(yearStr), m, d);
  const iso = validIso(thisYear, m, d);
  if (iso && iso < todayIso) return validIso(thisYear + 1, m, d);
  return iso;
}

const monthIndex = (word) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(word.slice(0, 3).toLowerCase()) + 1;

// Pulls one concrete date out of free text: ISO, "September 27", "Sept 27, 2026",
// "27 September", "9/27", "today", "tomorrow", "next Saturday". Null if none.
function extractDate(text, todayIso) {
  const q = (text || '').toLowerCase();
  let m;

  if ((m = q.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/))) return validIso(+m[1], +m[2], +m[3]);
  if ((m = q.match(new RegExp(`\\b${MONTH_RE_SRC}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`)))) {
    return withInferredYear(monthIndex(m[0]), +m[2], m[3], todayIso);
  }
  if ((m = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE_SRC}(?:,?\\s+(20\\d\\d))?`)))) {
    const word = q.slice(m.index).replace(/^\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?/, '');
    return withInferredYear(monthIndex(word), +m[1], m[3], todayIso);
  }
  if ((m = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d\d))?\b/))) return withInferredYear(+m[1], +m[2], m[3], todayIso);
  if (/\b(day\s+after\s+tomorrow|samakalawa)\b/.test(q)) return addDaysIso(todayIso, 2);
  if (/\b(tomorrow|bukas)\b/.test(q)) return addDaysIso(todayIso, 1);
  if (/\b(today|tonight|ngayon)\b/.test(q)) return todayIso;
  if ((m = q.match(WEEKDAY_RE))) {
    const target = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[2].slice(0, 3));
    let diff = (target - isoDow(todayIso) + 7) % 7;
    if (m[1] && /next/.test(m[1]) && diff === 0) diff = 7;
    return addDaysIso(todayIso, diff);
  }
  return null;
}

// "What times are left that day?" carries no date of its own — take the most
// recent one the user mentioned earlier in the conversation.
function extractDateFromHistory(history, todayIso) {
  for (let i = history.length - 1; i >= 0 && i >= history.length - 8; i--) {
    const turn = history[i];
    if (turn?.role !== 'user') continue;
    const iso = extractDate(turn.text || '', todayIso);
    if (iso) return iso;
  }
  return null;
}

// Admin-entered times may use an en dash or odd spacing; compare canonically.
const normTime = (t) => String(t || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

// Slot occupancy for every date in [startIso, endIso]. appointmentSlots is the
// booking system's own source of truth (one doc per taken hour; cancellations
// keep their hold until staff release it), unioned with live appointment
// records in case a hold is missing. Range queries on one field — no index needed.
async function getTakenSlots(startIso, endIso) {
  const taken = new Map();
  const add = (date, time) => {
    if (!date || !time) return;
    if (!taken.has(date)) taken.set(date, new Set());
    taken.get(date).add(normTime(time));
  };
  const [slotsSnap, apptsSnap] = await Promise.all([
    db.collection('appointmentSlots').where('date', '>=', startIso).where('date', '<=', endIso).get(),
    db.collection('appointments').where('date', '>=', startIso).where('date', '<=', endIso).get(),
  ]);
  slotsSnap.docs.forEach(d => add(d.data().date, d.data().time));
  apptsSnap.docs.forEach(d => {
    const { date, time, status } = d.data();
    if (status !== 'cancelled' && status !== 'declined') add(date, time);
  });
  return taken;
}

// Start hour (24h) of a "8:00 AM - 9:00 AM" slot label.
function slotStartHour(label) {
  const m = label.match(/^(\d{1,2}):\d{2}\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (m[2].toUpperCase() === 'PM') h += 12;
  return h;
}

async function getActiveClosures() {
  try {
    const snap = await db.collection('scheduleClosures').where('active', '==', true).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Could not load closures in chatbot:', err);
    return [];
  }
}

function closureForDate(iso, closures) {
  for (const c of closures) {
    if (c.startDate <= iso && iso <= c.endDate) {
      return c;
    }
  }
  return null;
}

// Open/booked split for one weekend date, taking schedule closures into account.
function slotsForDate(iso, taken, now, closures = []) {
  const closure = closureForDate(iso, closures);
  if (closure && closure.type === 'day') {
    return { open: [], booked: [], closure, fullyClosed: true };
  }

  const closedSlots = (closure && closure.type === 'slots' && Array.isArray(closure.slots)) ? closure.slots : [];
  const set = taken.get(iso) || new Set();
  const open = [];
  const booked = [];
  for (const t of CLINIC_TIME_SLOTS) {
    if (closedSlots.includes(t)) continue;
    if (set.has(normTime(t))) booked.push(t);
    else if (iso === now.iso && slotStartHour(t) <= now.hour) continue;
    else open.push(t);
  }
  return { open, booked, closedSlots, closure };
}

// Next `count` Saturdays/Sundays on or after fromIso.
function upcomingWeekendDays(fromIso, count) {
  const days = [];
  for (let iso = fromIso; days.length < count; iso = addDaysIso(iso, 1)) {
    if (isWeekendIso(iso)) days.push(iso);
  }
  return days;
}

const BOOKING_TAIL = 'To book, open the **Appointments** tab in the patient app or tap **Book Appointment** on the website.';

function slotListText(iso, { open, booked, closure, fullyClosed, closedSlots }) {
  const lines = [`📅 **${formatIso(iso)}**`];
  if (fullyClosed) {
    lines.push(`• 🔒 **Appointments Closed:** ${closure?.reason || 'Clinic schedule closed.'}`);
    return lines.join('\n');
  }
  if (closedSlots && closedSlots.length > 0) {
    lines.push(`• 🔒 **Closed Slots (${closedSlots.length}):** ${closedSlots.join(', ')} (${closure?.reason || 'Closed'})`);
  }
  if (open.length === 0) lines.push('• All remaining appointment slots are **fully booked** for this day.');
  else lines.push(`**Open slots (${open.length}):**`, ...open.map(s => `• **${s}**`));
  if (booked.length > 0) lines.push(`(${booked.length} slot${booked.length === 1 ? '' : 's'} already booked)`);
  return lines.join('\n');
}

async function getAvailableAppointmentsReply(targetIso) {
  const now = manilaNow();
  try {
    const closures = await getActiveClosures();
    // No date given: today if it is a weekend, otherwise the coming weekend.
    if (!targetIso) {
      const days = upcomingWeekendDays(now.iso, 2);
      const taken = await getTakenSlots(days[0], days[1]);
      return `Today is **${formatIso(now.iso)}**. Appointments are booked on **Saturdays & Sundays** only.\n\n` +
        days.map(iso => slotListText(iso, slotsForDate(iso, taken, now, closures))).join('\n\n') +
        `\n\n${BOOKING_TAIL}`;
    }

    if (targetIso < now.iso) {
      return `**${formatIso(targetIso)}** has already passed. Today is **${formatIso(now.iso)}**. ` +
        'Ask me about an upcoming date and I will check the open slots.';
    }

    const closure = closureForDate(targetIso, closures);
    if (!isWeekendIso(targetIso)) {
      const days = upcomingWeekendDays(targetIso, 2);
      const taken = await getTakenSlots(days[0], days[1]);
      return `**${formatIso(targetIso)}** is a **weekday**, so there are no bookable appointment slots — ` +
        'walk-ins are accepted **Monday to Friday, 8:00 AM – 5:00 PM** (no booking needed).\n\n' +
        'If you prefer a scheduled visit, here are the nearest weekend days:\n\n' +
        days.map(iso => slotListText(iso, slotsForDate(iso, taken, now, closures))).join('\n\n') +
        `\n\n${BOOKING_TAIL}`;
    }

    // Weekend date: its own slots, plus the next weekend day that still has room if it is full/closed.
    const lookahead = upcomingWeekendDays(targetIso, 6);
    const taken = await getTakenSlots(targetIso, lookahead[lookahead.length - 1]);
    const target = slotsForDate(targetIso, taken, now, closures);
    let reply = slotListText(targetIso, target);
    if (target.open.length === 0) {
      const alt = lookahead.slice(1).find(iso => slotsForDate(iso, taken, now, closures).open.length > 0);
      if (alt) reply += `\n\nThe next weekend day with open slots:\n\n${slotListText(alt, slotsForDate(alt, taken, now, closures))}`;
    }
    return `${reply}\n\n${BOOKING_TAIL}`;
  } catch (err) {
    console.error('Error fetching available appointments:', err);
    return '📅 **K&A Clinic Appointment Information:**\n\n' +
      '• Scheduled appointments: **Saturdays & Sundays**, one patient per hour (**8:00 AM – 12:00 PM** and **1:00 PM – 5:00 PM**).\n' +
      '• Monday to Friday: **walk-ins, 8:00 AM – 5:00 PM**.\n\n' +
      'I could not load live slots just now — please check the **Appointments** tab, which always shows current availability.';
  }
}

// Facts handed to the model on every in-scope turn so it never has to work out
// a weekday or guess at availability on its own.
async function buildLiveContext(prompt, history) {
  const now = manilaNow();
  const calendar = [];
  for (let i = 0; i < 21; i++) {
    const iso = addDaysIso(now.iso, i);
    calendar.push(`${iso} = ${formatIso(iso)}${isWeekendIso(iso) ? ' (appointment day)' : ' (walk-in day)'}`);
  }
  let availability = '';
  let closuresSummary = '';
  try {
    const closures = await getActiveClosures();
    if (closures.length > 0) {
      closuresSummary = closures.map(c => {
        const dateDesc = c.startDate === c.endDate ? c.startDate : `${c.startDate} to ${c.endDate}`;
        const typeDesc = c.type === 'day' ? 'Whole day closed' : `Closed slots: ${(c.slots || []).join(', ')}`;
        return `• ${dateDesc}: ${typeDesc} — Reason: "${c.reason}"`;
      }).join('\n');
    } else {
      closuresSummary = 'None (no active closures; normal weekend schedule).';
    }

    const days = upcomingWeekendDays(now.iso, 6);
    const mentioned = extractDate(prompt, now.iso) || extractDateFromHistory(history, now.iso);
    if (mentioned && mentioned >= now.iso && isWeekendIso(mentioned) && !days.includes(mentioned)) days.push(mentioned);
    const sorted = [...days].sort();
    const taken = await getTakenSlots(sorted[0], sorted[sorted.length - 1]);
    availability = sorted.map(iso => {
      const { open, fullyClosed, closedSlots, closure } = slotsForDate(iso, taken, now, closures);
      if (fullyClosed) return `${formatIso(iso)}: CLOSED (${closure?.reason || 'Schedule closed'})`;
      if (closedSlots && closedSlots.length) return `${formatIso(iso)}: ${open.length ? `open ${open.join(', ')}` : 'fully booked'} (closed: ${closedSlots.join(', ')} — ${closure?.reason || ''})`;
      return `${formatIso(iso)}: ${open.length ? `open ${open.join(', ')}` : 'fully booked'}`;
    }).join('\n');
  } catch (err) {
    console.warn('Live availability unavailable for model context:', err);
    availability = 'Unavailable right now — tell the user to check the Appointments tab for live slots.';
  }
  return `
LIVE CLINIC CONTEXT (authoritative, computed by the clinic system — Asia/Manila time):
Today is ${formatIso(now.iso)}, ${pad2(now.hour)}:${pad2(now.minute)}.
Calendar (use ONLY this for days of the week; never calculate a weekday yourself):
${calendar.join('\n')}
Active Schedule Closures (clinic appointments are closed on these dates/times; answer from this if asked whether the clinic is open or appointments available):
${closuresSummary}
Live appointment slot availability (weekend days):
${availability}
If the user states a weekday that contradicts the calendar, politely correct them using the calendar.
If the user asks whether the clinic is open on a specific date, answer using the Active Schedule Closures and regular hours (Mon-Fri walk-in 8 AM-5 PM, Sat-Sun appointments 8 AM-12 PM & 1 PM-5 PM). Do not give medical advice.
Only state slot availability that appears above; never invent times.
`;
}

// Conversation history as Gemini expects it: roles alternate, it starts with
// a user turn, and a turn sent twice in a row (a double-tapped Send) is kept
// once. A duplicated turn in the history is what made the model restate an
// earlier answer inside a new one.
function cleanHistory(history) {
  const turns = [];
  for (const m of history.slice(-20)) {
    const role = m?.role === 'user' ? 'user' : 'model';
    const text = String(m?.text || m?.html || '').trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      if (last.text === text) continue;         // exact repeat: drop it
      last.text = `${last.text}\n\n${text}`;    // same speaker twice: merge
      continue;
    }
    turns.push({ role, text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

// Last line of defense: a reply never shows the same paragraph twice.
function dedupeParagraphs(text) {
  const seen = new Set();
  return String(text).split(/\n{2,}/).filter(p => {
    const key = p.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join('\n\n');
}

// Named export so the scope boundary can be asserted in isolation
// (scripts/test-chatbot-scope.mjs tests api/_lib/chatbotRules.js directly).
export { classifyMessage };

const blockedReplyFor = (channel) => (channel === 'public' ? BLOCKED_REPLY : BLOCKED_REPLY_APP);
const personalNavReplyFor = (channel) => (channel === 'public' ? PERSONAL_NAV_REPLY_PUBLIC : PERSONAL_NAV_REPLY_APP);

const send = (res, body) => res.status(200).json({ success: true, fallbackReason: null, ...body });

// Per-IP rate limit. The endpoint needs no sign-in (the website chatbot has
// no session), so this is what stops one caller from burning the Gemini
// quota for everyone. Best-effort: counts live in this function instance's
// memory, so a cold start or a second instance starts fresh — enough to stop
// a script hammering the endpoint without a Firestore write per message.
// The patient app falls back to its on-device replies on a non-OK response.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 30;
const MAX_PROMPT_CHARS = 1000;
const MAX_HISTORY_ITEMS = 20;
const rateBuckets = new Map(); // ip -> request timestamps within the window

function clientIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip, now = Date.now()) {
  const recent = (rateBuckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (rateBuckets.size > 5000) {
    for (const [key, times] of rateBuckets) {
      if (!times.length || now - times[times.length - 1] >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
  return false;
}

export default async function handler(req, res) {
  // Warm-up ping: the app calls this when the chat opens, so the first real
  // message does not wait for a cold start.
  if (req.method === 'GET' && req.query?.warm !== undefined) {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  if (isRateLimited(clientIp(req))) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
    res.status(429).json({ success: false, error: 'You are sending messages too quickly. Please wait a few minutes and try again.' });
    return;
  }

  try {
    const startTime = Date.now();
    const prompt = (req.body?.prompt || '').toString().slice(0, MAX_PROMPT_CHARS);
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-MAX_HISTORY_ITEMS) : [];
    // 'app' (patient app, has a "Talk to clinic staff" button) or 'public'
    // (the website chatbot). Only changes the wording of fixed replies.
    const channel = req.body?.channel === 'public' ? 'public' : 'app';
    if (!prompt.trim()) {
      res.status(400).json({ success: false, error: 'A message is required.' });
      return;
    }

    // 1. Deterministic triage before any AI call.
    const category = classifyMessage(prompt);
    if (category === 'clinical') {
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=classifier category=clinical duration=${duration}ms`);
      send(res, { text: blockedReplyFor(channel), source: 'classifier', category, needsEscalation: true });
      return;
    }
    if (category === 'personal_nav') {
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=classifier category=personal_nav duration=${duration}ms`);
      send(res, {
        text: personalNavReplyFor(channel), source: 'classifier', category, needsEscalation: false,
        ...(channel === 'app' ? { action: { label: 'Open my vaccination card', target: 'card' } } : {}),
      });
      return;
    }
    if (category === 'personal_info') {
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=classifier category=personal_info duration=${duration}ms`);
      send(res, {
        text: channel === 'public' ? PERSONAL_INFO_REPLY_PUBLIC : PERSONAL_INFO_REPLY_APP, source: 'classifier', category, needsEscalation: false,
        ...(channel === 'app' ? { action: { label: 'Open my vaccination card', target: 'card' } } : {}),
      });
      return;
    }
    if (category === 'out_of_scope') {
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=classifier category=out_of_scope duration=${duration}ms`);
      send(res, { text: OUT_OF_SCOPE_REPLY, source: 'classifier', category, needsEscalation: false });
      return;
    }
    // A short vague message, a bare name or an introduction gets a fixed
    // reply (names are never passed on or repeated); longer conversational
    // questions still reach the model.
    if (category === 'vague' && isShortVague(prompt)) {
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=classifier category=vague duration=${duration}ms`);
      send(res, { text: vagueReply(prompt), source: 'classifier', category, needsEscalation: false });
      return;
    }

    // 2. Fixed answers for allowed topics (hours, contact, services, prices,
    //    booking steps, app help): instant, and never reworded by the model.
    const fixed = category === 'in_scope' ? fixedInScopeReply(prompt) : null;
    if (fixed) {
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=fixed category=in_scope duration=${duration}ms`);
      send(res, { text: fixed, source: 'fixed', category: 'in_scope', needsEscalation: false });
      return;
    }

    // 3. Live appointment availability, straight from Firestore.
    const todayIso = manilaNow().iso;
    const promptDate = extractDate(prompt, todayIso);
    const wantsAvailability = APPT_AVAILABILITY_RE.test(prompt) ||
      ((promptDate || extractDateFromHistory(history, todayIso)) && SCHEDULING_RE.test(prompt));
    const bareDate = promptDate && prompt.replace(/[^a-z]/gi, '').length <= 40;
    if (wantsAvailability || bareDate) {
      const targetIso = promptDate || extractDateFromHistory(history, todayIso);
      const slotReply = await getAvailableAppointmentsReply(targetIso);
      const duration = Date.now() - startTime;
      console.log(`[chatbot] source=appointments_db category=in_scope duration=${duration}ms`);
      send(res, { text: slotReply, source: 'appointments_db', category: 'in_scope', needsEscalation: false });
      return;
    }

    // 3. The model, for allowed clinic topics and conversational questions.
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite';
    let text = null;
    let source = 'fallback';
    let fallbackReason = null;
    if (!apiKey) {
      fallbackReason = 'missing_api_key';
    } else {
      try {
        const turns = cleanHistory(history);
        if (turns.length && turns[turns.length - 1].role === 'user') turns.pop();
        const contents = [
          ...turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
          { role: 'user', parts: [{ text: prompt }] },
        ];
        const systemInstruction = { parts: [{ text: CLINIC_SYSTEM_INSTRUCTION + await buildLiveContext(prompt, history) }] };
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction,
            contents,
            generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
          }),
        });
        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const candidate = (data.candidates?.[0]?.content?.parts || [])
            .filter(p => typeof p.text === 'string' && !p.thought)
            .map(p => p.text)
            .join('');
          if (candidate.trim()) {
            text = dedupeParagraphs(candidate.trim());
            source = 'gemini';
          } else {
            fallbackReason = 'empty_response';
          }
        } else {
          fallbackReason = geminiRes.status === 429 ? 'quota_exhausted' : `http_${geminiRes.status}`;
        }
      } catch (err) {
        fallbackReason = 'network_error';
        console.warn('Gemini API network error:', err);
      }
    }

    // 4. Check the model's reply again for clinical boundaries or honest fallback.
    let finalCategory = 'in_scope';
    let needsEscalation = false;
    if (!text) {
      // Honest failure message: never quiet fallback to canned answers.
      text = `KAI can't answer right now. Please try again shortly or contact K&A Clinic at ${CLINIC.phone}.`;
      finalCategory = 'in_scope';
    } else if (/can't (help with|answer) medical questions/i.test(text) || MEDICAL_OUTPUT_RE.test(text)) {
      text = blockedReplyFor(channel);
      finalCategory = 'clinical';
      needsEscalation = true;
    } else if (/could you tell me a little more/i.test(text)) {
      text = VAGUE_REPLY;
      finalCategory = 'vague';
    } else if (/outside what i can help with/i.test(text)) {
      text = OUT_OF_SCOPE_REPLY;
      finalCategory = 'out_of_scope';
    }

    const duration = Date.now() - startTime;
    console.log(`[chatbot] source=${source} category=${finalCategory}${fallbackReason ? ` reason=${fallbackReason}` : ''} duration=${duration}ms model=${modelName}`);
    send(res, { text, source, category: finalCategory, needsEscalation, fallbackReason });
  } catch (err) {
    console.error('chatbot error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
