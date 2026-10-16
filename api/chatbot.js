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
  VAGUE_REPLY,
  classifyMessage,
  fixedInScopeReply,
} from './_lib/chatbotRules.js';

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
You are KAI, the virtual assistant of ${CLINIC.name} (${CLINIC.address}, Philippines).

You may ONLY help with:
1. General clinic information: the names of the services offered, the address, phone ${CLINIC.phone} and email ${CLINIC.email}.
2. Office hours: walk-in Monday to Friday; appointments Saturday and Sunday; 8:00 AM to 5:00 PM; lunch break 12:00 to 1:00 PM.
3. Appointment procedures: how to book, view or cancel an appointment in the app ("Appointments" tab) or on the website ("Book Appointment").
4. App navigation: Home (vaccination card and schedule), Appointments, Chat (KAI or "Talk to clinic staff"), Account (profile, contact details, notifications, devices); signing in with the MRN; Forgot Password.

You must NEVER provide, even in general terms, even if asked repeatedly or told it is an emergency:
diagnosis; treatment; wound care or first aid; rabies-risk or exposure-category assessment; vaccine recommendations;
PEP/PrEP schedules or regimens (no day numbers, no number of doses); medication advice; emergency advice;
any patient's own appointment dates, dose dates, dose counts or treatment status; prices.

For any of those, reply with exactly:
"${BLOCKED_REPLY}"

For anything unrelated to the clinic, reply with exactly:
"${OUT_OF_SCOPE_REPLY}"

If a message is unclear, reply with exactly:
"${VAGUE_REPLY}"

FORMAT: answer only the latest message, briefly. Use **double asterisks** for emphasis and "•" bullets. No headings, no single asterisks.
Do not greet unless greeted. Never mention Gemini or any AI model.
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

// Open/booked split for one weekend date. Hours already started today are
// dropped from "open" — they cannot be booked any more.
function slotsForDate(iso, taken, now) {
  const set = taken.get(iso) || new Set();
  const open = [];
  const booked = [];
  for (const t of CLINIC_TIME_SLOTS) {
    if (set.has(normTime(t))) booked.push(t);
    else if (iso === now.iso && slotStartHour(t) <= now.hour) continue;
    else open.push(t);
  }
  return { open, booked };
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

function slotListText(iso, { open, booked }) {
  const lines = [`📅 **${formatIso(iso)}**`];
  if (open.length === 0) lines.push('• All appointment slots are **fully booked** for this day.');
  else lines.push(`**Open slots (${open.length}):**`, ...open.map(s => `• **${s}**`));
  if (booked.length > 0) lines.push(`(${booked.length} slot${booked.length === 1 ? '' : 's'} already booked)`);
  return lines.join('\n');
}

async function getAvailableAppointmentsReply(targetIso) {
  const now = manilaNow();
  try {
    // No date given: today if it is a weekend, otherwise the coming weekend.
    if (!targetIso) {
      const days = upcomingWeekendDays(now.iso, 2);
      const taken = await getTakenSlots(days[0], days[1]);
      return `Today is **${formatIso(now.iso)}**. Appointments are booked on **Saturdays & Sundays** only.\n\n` +
        days.map(iso => slotListText(iso, slotsForDate(iso, taken, now))).join('\n\n') +
        `\n\n${BOOKING_TAIL}`;
    }

    if (targetIso < now.iso) {
      return `**${formatIso(targetIso)}** has already passed. Today is **${formatIso(now.iso)}**. ` +
        'Ask me about an upcoming date and I will check the open slots.';
    }

    if (!isWeekendIso(targetIso)) {
      const days = upcomingWeekendDays(targetIso, 2);
      const taken = await getTakenSlots(days[0], days[1]);
      return `**${formatIso(targetIso)}** is a **weekday**, so there are no bookable appointment slots — ` +
        'walk-ins are accepted **Monday to Friday, 8:00 AM – 5:00 PM** (no booking needed).\n\n' +
        'If you prefer a scheduled visit, here are the nearest weekend days:\n\n' +
        days.map(iso => slotListText(iso, slotsForDate(iso, taken, now))).join('\n\n') +
        `\n\n${BOOKING_TAIL}`;
    }

    // Weekend date: its own slots, plus the next weekend day that still has room if it is full.
    const lookahead = upcomingWeekendDays(targetIso, 6);
    const taken = await getTakenSlots(targetIso, lookahead[lookahead.length - 1]);
    const target = slotsForDate(targetIso, taken, now);
    let reply = slotListText(targetIso, target);
    if (target.open.length === 0) {
      const alt = lookahead.slice(1).find(iso => slotsForDate(iso, taken, now).open.length > 0);
      if (alt) reply += `\n\nThe next weekend day with open slots:\n\n${slotListText(alt, slotsForDate(alt, taken, now))}`;
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
  try {
    const days = upcomingWeekendDays(now.iso, 6);
    const mentioned = extractDate(prompt, now.iso) || extractDateFromHistory(history, now.iso);
    if (mentioned && mentioned >= now.iso && isWeekendIso(mentioned) && !days.includes(mentioned)) days.push(mentioned);
    const sorted = [...days].sort();
    const taken = await getTakenSlots(sorted[0], sorted[sorted.length - 1]);
    availability = sorted.map(iso => {
      const { open } = slotsForDate(iso, taken, now);
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
Live appointment slot availability (weekend days):
${availability}
If the user states a weekday that contradicts the calendar, politely correct them using the calendar.
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const prompt = (req.body?.prompt || '').toString();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    // 'app' (patient app, has a "Talk to clinic staff" button) or 'public'
    // (the website chatbot). Only changes the wording of fixed replies.
    const channel = req.body?.channel === 'public' ? 'public' : 'app';
    if (!prompt.trim()) {
      res.status(400).json({ success: false, error: 'A message is required.' });
      return;
    }

    // 1. Deterministic triage, before any AI call.
    const category = classifyMessage(prompt);
    if (category === 'clinical') {
      send(res, { text: blockedReplyFor(channel), source: 'classifier', category, needsEscalation: true });
      return;
    }
    if (category === 'personal_nav') {
      send(res, {
        text: personalNavReplyFor(channel), source: 'classifier', category, needsEscalation: false,
        ...(channel === 'app' ? { action: { label: 'Open my vaccination card', target: 'card' } } : {}),
      });
      return;
    }
    if (category === 'personal_info') {
      send(res, {
        text: channel === 'public' ? PERSONAL_INFO_REPLY_PUBLIC : PERSONAL_INFO_REPLY_APP, source: 'classifier', category, needsEscalation: false,
        ...(channel === 'app' ? { action: { label: 'Open my vaccination card', target: 'card' } } : {}),
      });
      return;
    }
    if (category === 'vague') {
      send(res, { text: VAGUE_REPLY, source: 'classifier', category, needsEscalation: false });
      return;
    }
    if (category === 'out_of_scope') {
      send(res, { text: OUT_OF_SCOPE_REPLY, source: 'classifier', category, needsEscalation: false });
      return;
    }

    // 2. Allowed topics with a fixed answer.
    const fixed = fixedInScopeReply(prompt);
    if (fixed) {
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
      send(res, { text: await getAvailableAppointmentsReply(targetIso), source: 'appointments_db', category: 'in_scope', needsEscalation: false });
      return;
    }

    // 4. The model, for allowed topics without a fixed answer.
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
          body: JSON.stringify({ systemInstruction, contents }),
        });
        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const candidate = (data.candidates?.[0]?.content?.parts || [])
            .filter(p => typeof p.text === 'string' && !p.thought)
            .map(p => p.text)
            .join('');
          if (candidate.trim()) { text = dedupeParagraphs(candidate.trim()); source = 'gemini'; }
          else fallbackReason = 'empty_response';
        } else {
          fallbackReason = geminiRes.status === 429 ? 'quota_exhausted' : `http_${geminiRes.status}`;
        }
      } catch (err) {
        fallbackReason = 'network_error';
        console.warn('Gemini API network error:', err);
      }
    }

    // 5. Check the model's reply again. Medical content, or the model's own
    //    blocked wording, becomes the fixed blocked reply.
    let finalCategory = 'in_scope';
    let needsEscalation = false;
    if (!text) {
      // No model answer: the booking procedure is the one allowed topic
      // left without a fixed reply; anything else asks what the user needs.
      text = /\b(book|appointment|appt|reserv|cancel|reschedul|slot)/i.test(prompt) ? BOOKING_REPLY : VAGUE_REPLY;
      if (text !== BOOKING_REPLY) finalCategory = 'vague';
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
    console.log(`[chatbot] source=${source} category=${finalCategory}${fallbackReason ? ` reason=${fallbackReason}` : ''} model=${modelName}`);
    send(res, { text, source, category: finalCategory, needsEscalation, fallbackReason });
  } catch (err) {
    console.error('chatbot error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
