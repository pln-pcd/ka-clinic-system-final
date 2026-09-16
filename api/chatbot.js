import { db } from './_lib/firebaseAdmin.js';

// Shared K&A Health Assistant engine — single backend implementation used by
// both the landing page chatbot (ka-clinic-admin/src/geminiService.js) and
// the patient app chatbot (patient-app/app/services/chatbot.ts), so both
// give identical, guardrailed answers. Moved here (server-side) from the
// old ka-clinic-admin/src/geminiService.js so the Gemini API key never ships
// in a client bundle.
// SCOPE BOUNDARY — non-clinical only.
//
// This assistant used to answer general rabies/PEP/first-aid education. It no
// longer does, for any caller. Unsupervised clinical content is now handled by
// clinic staff, and the bot's only job is logistics: using the app, when the
// clinic is open, how to book, and how to reach the clinic.
//
// The classifier below is the real enforcement — a clinical message never
// reaches Gemini at all. This instruction is the second layer, for anything
// that slips through as in-scope but turns clinical mid-answer.
const CLINIC_SYSTEM_INSTRUCTION = `
You are KAI, the official virtual assistant for K&A Clinic (K&A Anti-Rabies Clinic, San Juan St., Libon, Albay, Philippines).
Your job is strictly limited to helping users with general clinic information and routing clinical questions appropriately.

Categorize every incoming user message into exactly one of three categories and follow its rule strictly.

CATEGORY 1 — GENERAL CLINIC INFORMATION (answer directly)
Scope: clinic operating hours, clinic address/directions, appointment booking steps, walk-in schedules,
accepted payment methods, general descriptions of available clinic services, vaccine pricing and packages,
and using the patient app or website (tabs, records, account and login help).
Action: give a clear, polite, concise, direct answer using ONLY the verified clinic knowledge below. Do not guess.

CATEGORY 2 — MEDICAL, CLINICAL & SYMPTOM INQUIRIES (staff handoff)
Scope: animal bites, scratches, wound care, rabies concerns, vaccine/PEP regimens, symptoms, medications,
or any request for health or medical advice — however general, however often the user insists, even in an emergency.
Action: do not answer any part of it, do not summarize, do not caveat, do not offer a partial answer. Reply with exactly:
"That is a clinical question, so I will pass it to K&A Clinic staff rather than answer it myself."

CATEGORY 3 — OUT-OF-SCOPE, INAPPROPRIATE OR UNRELATED (polite rejection only)
Scope: anything NOT about K&A Clinic's services or operations — general knowledge, trivia, casual small talk,
jokes, trolling, illicit substances, sales of items the clinic does not provide, criminal behavior, anything outside the clinic helpdesk.
Action: reply with exactly:
"That request is outside what I can help with — I am only able to assist with K&A Clinic information such as hours, location, appointments, services, and pricing."
STRICT RULE: never treat a Category 3 message as clinical, and never offer, trigger, or mention "Talk to Clinic Staff" for it.

VERIFIED CLINIC KNOWLEDGE:
🏥 K&A Clinic Information:
• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)
• Walk-ins: Accepted Monday – Friday
• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)
• Address: San Juan St., Libon, Albay
• Booking: use the "Appts" tab in the app, or the "Book Appointment" button on the website.
• Booking slots: Saturdays & Sundays only, one patient per hour slot. Reschedule or cancel from the "Appts" tab; a cancellation request is reviewed by staff.
• Services: anti-rabies post-exposure prophylaxis (PEP) sessions, anti-tetanus, rabies immunoglobulin, and pneumonia vaccination. Describe services only in general terms; never advise which one a person needs.
• Payment: settled at the clinic front desk on the day of the visit. If asked about a specific payment method, say to confirm accepted options with the front desk.

📱 Patient App & Account:
• Sign in with the Medical Record Number (MRN) given by the clinic and your password. The email on your clinic record is used for verification codes.
• Forgot password: use "Forgot Password" on the login screen (a code is emailed to the address on file).
• The email address, name, and MRN on file CANNOT be changed inside the app — only clinic staff can update them. Tell the user to ask staff (in the app: "Talk to Clinic Staff" in the Chat tab).
• App tabs: Home (vaccination card, next appointment), Appts (booking), Records (medical records, reports), Chat (this assistant and clinic staff), Account (profile photo, contact details, notification settings).
• Profile photo and contact details can be updated from the Account tab.

💉 Vaccine Pricing & Packages:
• PEP Category 2 (with Anti-Tetanus): ₱1,000 for the 1st session, and ₱800 for each of the next 3 sessions.
• PEP Category 3: ₱4,500 for 4 sessions (complete package includes Anti-Tetanus and IRIG / Rabies Immunoglobulin).
• Pneumonia Vaccine: ₱4,500.

IMPORTANT NOTE ON HEPATITIS:
• K&A Clinic is NO LONGER catering or offering Hepatitis vaccines. If asked about Hepatitis, state clearly that the clinic no longer offers Hepatitis vaccination.

TONE & FORMATTING:
• Bold key headings, dates, services, and important terms using standard markdown double asterisks **like this**.
• Never use single asterisks (*word*), raw asterisks, or markdown heading hashes (#).
• Use clean bullet points (•) for itemized lists.
• When the user greets you (e.g. "hi", "hello", "good morning"), greet them back warmly and state how you can help.
• Never generate medical diagnoses, triage, exposure-category determination, or treatment recommendations.
• There is no "general information" exception for clinical topics. "What is rabies?" is Category 2.
• Keep responses professional, clear, helpful, and direct.
• Never mention 'Gemini' or any AI model name.
`;

// Two-way triage: may the bot answer this, yes or no?
//
//   'in_scope'    — non-clinical logistics (app usage, hours, booking,
//                   contact). The only category the bot answers itself.
//   'clinical'    — anything rabies/medical/clinical, however general.
//                   A person is waiting on an answer -> escalate.
//   'out_of_scope'— unrelated small talk (weather, sport, code). Standard
//                   fallback, NO escalation — routing this to staff would
//                   just fill the clinic inbox with noise.
//
// 'clinical' and 'out_of_scope' are both "the bot does not answer"; they are
// kept apart only because the escalation flag differs. That is the two-way
// split the button state machine consumes.
//
// This replaces the older answerable/restricted/out_of_scope triage, where
// 'answerable' covered general rabies education, first aid and dose
// schedules. None of that is answerable any more.
//
// Deliberately keyword-based rather than model-driven: this runs identically
// on the Gemini path and the keyword-fallback path, so classification does
// not silently change behavior when the API is unreachable or quota-limited.

// Any clinical or rabies-domain signal. Broad on purpose — over-escalating is
// the safe failure direction here, since the cost is a staff reply and the
// cost of the opposite is unsupervised medical advice.
const CLINICAL_PATTERNS = [
  // The domain itself.
  /\b(rabies|rabid|abtc|anti-?rabies|lyssa\w*)\b/,
  // Exposure events and wounds (English & Filipino / Tagalog).
  /\b(bite|bit|bitten|scratch|scratched|lick(ed)?|wound|bleed\w*|puncture|laceration|kagat|nakagat|kinagat|mangagat|kalmot|nakalmot|kinamot|dilaan|dinilaan|laway|sugat|dugo|nagdurugo)\b/,
  /\b(dog|cat|puppy|kitten|bat|monkey|rat|animal|aso|tuta|pusa|kuting|hayop)\b/,
  // Vaccines, biologics, protocols.
  /\b(vaccin\w*|pep|prep|post-?exposure|pre-?exposure|rig|erig|hrig|immunoglobulin|booster|tetanus|toxoid|essen|antigen|serum)\b/,
  /\b(dose|dosage|jab|injection|inject\w*|intradermal|intramuscular|day\s*\d+)\b/,
  // "shot" only as a vaccine shot — a bare "I got shot" is not a rabies-clinic
  // question and goes to KAI to judge rather than straight to staff.
  /\b(vaccine|vaccination|rabies|booster|tetanus|anti-?rabies|flu)\s+shots?\b|\bshots?\s+(schedule|for\s+rabies|of\s+(the\s+)?vaccine)\b/,
  // Triage, category, and risk language.
  /\b(categor(y|ies)\s*(i{1,3}|1|2|3)?|exposure\s+categor\w*|triage|risk\s+(level|assessment)|observation\s+period)\b/,
  // Symptoms, diagnosis, treatment.
  /\b(symptom\w*|sign\w*\s+of|fever|swelling|redness|pus|infect\w*|inflam\w*|rash|pain|numbness|hydrophobia|paralysis|seizure)\b/,
  /\b(diagnos\w*|prognos\w*|treat\w*|cure|therapy|medicine|medication|prescri\w*|antibiotic|antiseptic|povidone|betadine|alcohol\s+swab)\b/,
  /\b(first\s*aid|wash\s+(the\s+)?wound|clean\s+(the\s+)?wound|dressing|suture|stitch)\b/,
  /\b(side\s*-?\s*effects?|adverse|reaction|allerg\w*|contraindicat\w*|interaction)\b/,
  // Asking the bot to assess a person or an animal.
  /\b(do|have)\s+i\s+(have|got|need)\b/, /\bam\s+i\b/, /\bis\s+(it|this|that|my|the)\s+(serious|dangerous|bad|normal|okay|ok|safe)\b/,
  /\bshould\s+i\s+(go|come|worry|be\s+worried|get|take)\b/,
  // Lab and clinical records interpretation.
  /\b(lab|laboratory|test|titer|titre|dfa|blood)\s+(result|report)s?\b/,
  /\b(interpret|read|explain)\s+(my|the|these|this)\s+(result|report|lab)/,
  // Non-rabies medical emergencies still belong with a human, not the bot.
  /\b(fractur\w*|broken\s+(bone|arm|leg|rib)|heart\s+attack|stroke|unconscious|venomous|poison\w*|overdose|can'?t\s+breathe|chest\s+pain|appendicitis|diabet\w*|asthma)\b/,
  /\b(snake|scorpion|spider|centipede|jellyfish|stingray)\b/,
];

// The four permitted topics. Only consulted when nothing clinical matched.
const NON_CLINICAL_PATTERNS = [
  // Clinic hours.
  /\b(hours?|open(ing|ed)?|close?[sd]?|closing|what\s+time|when\s+(are|do)\s+you|walk-?in|weekend|saturday|sunday|holiday)\b/,
  // Booking and appointments.
  /\b(book\w*|appointment|reschedul\w*|cancel\w*|slot|reserve|reservation|schedule\s+(a\s+)?(visit|appointment)|availab\w*)\b/,
  // Contact and location.
  /\b(address|location|where\s+(are|is)|direction|contact|phone|number|email|reach\s+you|map)\b/,
  // App and account usage.
  /\b(app|application|website|log\s*-?\s*in|login|log\s*-?\s*out|sign\s*-?\s*(in|up)|password|account|profile|register\w*|otp|verif\w*|tab|screen|button|navigate|how\s+do\s+i\s+(use|find|open|change|update)|notification|record\s+card|mrn)\b/,
];

// Genuinely unrelated to the clinic in any way.
const OUT_OF_SCOPE_PATTERNS = [
  /\b(weather|forecast|rain|typhoon)\b/, /\b(movie|film|song|music|celebrity|artist|concert|k-?pop)\b/,
  /\b(recipe|cook|bake|adobo|sinigang|restaurant|food\s+delivery)\b/,
  /\b(homework|assignment|essay|thesis|math|algebra|calculus|physics|chemistry\s+problem)\b/,
  /\b(python|javascript|code|programming|software|algorithm)\b/,
  /\b(basketball|nba|football|soccer|volleyball|score|standings)\b/,
  /\b(president|election|senator|politic|stock\s+market|crypto|bitcoin)\b/,
  /\b(joke|riddle|poem|story\s+about)\b/,
  // Illicit / inappropriate — Category 3, never a staff hand-off.
  /\b(weed|marijuana|shabu|cocaine|meth|illegal\s+drugs?|drug\s+dealer|hack(ing|er)?|scam|porn\w*|gambling|casino)\b/,
];

// Word-boundary anchored: a plain includes('rate') matched "operate", '800'
// matched phone numbers, 'fee' matched "coffee".
const PRICING_RE = /\b(price|prices|pricing|cost|costs|fee|fees|rate|rates|how\s+much|magkano|payment|package|packages|bayad|pesos?|presyo|₱)\b|₱/;
const HEPATITIS_RE = /\b(hepatitis|hepa)\b/;
const GREETING_RE = /^(hi|hello|hey|good\s*(morning|afternoon|evening|day)|greetings?|kumusta|kamusta|howdy|sup|yo)\b/i;
const APPT_AVAILABILITY_RE = /\b(availab\w*|open\w*|free\w*)\s+(appointment|appt|slot|time)s?\b|\b(appointment|appt|slot)s?\s+(availab\w*|open\w*|schedule)\b|\bwhat\s+(are\s+the\s+)?(availab\w*\s+)?(appointment|appt|slot)s?\b|\bany\s+available\s+(appointment|appt|slot)s?\b/i;
const SERVICES_RE = /\b(services?|what\s+services|services\s+(offered|available|do\s+you)|what\s+vaccines?(\s+do\s+you)?\s+(have|offer|provide|carry)|do\s+you\s+(have|offer|provide|carry)\s+(anti-?rabies|tetanus|pneumonia|pep|vaccine|vaccines|shots?)|available\s+vaccines?|list\s+of\s+vaccines?|vaccine\s+(list|types|options|packages?)|anong\s+(mga\s+)?(bakuna|serbisyo))\b/i;
const WALKIN_RE = /\b(walk[- ]?in|can\s+i\s+walk[- ]?in|do\s+you\s+(accept|take)\s+walk[- ]?ins?|walk[- ]?in\s+(ba|pwede))\b/i;
const PREPARATION_RE = /\b(what\s+(to|should\s+i)\s+bring|requirements?|what\s+do\s+i\s+need(\s+to\s+bring)?|ano(ng)?\s+(dapat\s+dalhin|mga\s+kailangan))\b/i;
const RECORDS_HELP_RE = /\b(how\s+to\s+(view|see|check|export|download|save)\s+(my\s+)?(record|records|card|vaccin\w*\s+card)|paano\s+(makita|i-?download|i-?export)\s+ang\s+(card|record))\b/i;
const ACTIVE_WOUND_RE = /\b(bit|bitten|bite|scratch|bleeding|wound|pus|swelling|symptom|fever|pain|rash|puncture|laceration|am\s+i\s+(infected|sick)|kagat|nakagat|kinagat|kalmot|nakalmot|sugat|dugo|nagdurugo|lagnat|namamaga|nana)\b/i;

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

const GREETING_REPLY =
  "**Hello!** Welcome to **K&A Animal Bite Center**. I am **KAI**, your clinic virtual assistant.\n\n" +
  "How can I help you today? You can ask me about:\n" +
  "• **Clinic Operating Hours** and walk-in schedule\n" +
  "• **Available Appointments** and booking steps\n" +
  "• **Vaccine Pricing & Packages** (PEP, Anti-Tetanus, Pneumonia)\n" +
  "• **Clinic Location & Directions**\n" +
  "• Using the **Patient App** features";

function isPureGreeting(text) {
  const q = (text || '').toLowerCase().trim();
  if (!GREETING_RE.test(q)) return false;
  // If the user combined a greeting with an actual question, answer the question
  const questionWords = ['hour', 'open', 'close', 'price', 'cost', 'fee', 'vaccin', 'appoint', 'slot', 'book', 'where', 'address', 'locat', 'staff', 'doctor'];
  if (questionWords.some(w => q.includes(w))) return false;
  return true;
}

async function getAvailableAppointmentsReply(queryStr) {
  try {
    const q = (queryStr || '').toLowerCase();

    // Philippine time zone (Asia/Manila: UTC+8)
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const dayOfWeek = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const todayIso = now.toISOString().slice(0, 10);

    let targetIso = todayIso;
    let targetDayOfWeek = dayOfWeek;

    // Check if user specified an ISO date (e.g. 2026-09-26)
    const isoMatch = q.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
    if (isoMatch) {
      targetIso = isoMatch[1];
      const d = new Date(`${targetIso}T00:00:00Z`);
      targetDayOfWeek = d.getUTCDay();
    } else if (q.includes('tomorrow')) {
      const tomorrow = new Date(now.getTime() + 86400000);
      targetIso = tomorrow.toISOString().slice(0, 10);
      targetDayOfWeek = tomorrow.getUTCDay();
    } else if (q.includes('sunday')) {
      const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
      const sun = new Date(now.getTime() + daysUntilSunday * 86400000);
      targetIso = sun.toISOString().slice(0, 10);
      targetDayOfWeek = 0;
    } else if (q.includes('saturday')) {
      const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
      const sat = new Date(now.getTime() + daysUntilSaturday * 86400000);
      targetIso = sat.toISOString().slice(0, 10);
      targetDayOfWeek = 6;
    } else if (q.includes('today')) {
      targetIso = todayIso;
      targetDayOfWeek = dayOfWeek;
    } else {
      // Default: if today is weekend, check today; else upcoming Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        targetIso = todayIso;
        targetDayOfWeek = dayOfWeek;
      } else {
        const daysUntilSat = (6 - dayOfWeek + 7) % 7;
        const nextSat = new Date(now.getTime() + daysUntilSat * 86400000);
        targetIso = nextSat.toISOString().slice(0, 10);
        targetDayOfWeek = 6;
      }
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const [tY, tM, tD] = targetIso.split('-').map(Number);
    const dateFormatted = `${dayNames[targetDayOfWeek]}, ${monthNames[tM - 1]} ${tD}, ${tY}`;

    // If target day is Monday - Friday (weekday)
    if (targetDayOfWeek >= 1 && targetDayOfWeek <= 5) {
      // Find upcoming Saturday for booking
      const daysUntilSat = (6 - targetDayOfWeek + 7) % 7;
      const nextSat = new Date(new Date(`${targetIso}T12:00:00Z`).getTime() + daysUntilSat * 86400000);
      const satIso = nextSat.toISOString().slice(0, 10);
      const [sY, sM, sD] = satIso.split('-').map(Number);
      const satFormatted = `Saturday, ${monthNames[sM - 1]} ${sD}, ${sY}`;

      // Query slots for upcoming Saturday
      const slotsSnap = await db.collection('appointmentSlots').where('date', '==', satIso).get();
      const apptsSnap = await db.collection('appointments').where('date', '==', satIso).get();
      const bookedSet = new Set();
      slotsSnap.docs.forEach(d => bookedSet.add(d.data().time));
      apptsSnap.docs.forEach(d => {
        const st = d.data().status;
        if (st !== 'cancelled' && st !== 'declined') bookedSet.add(d.data().time);
      });

      const openSlots = CLINIC_TIME_SLOTS.filter(t => !bookedSet.has(t));

      return (
        `🏥 **K&A Clinic Appointment Information:**\n\n` +
        `• **${dateFormatted}** is a **weekday** (Monday – Friday). K&A Clinic operates on an **immediate walk-in basis** from **8:00 AM – 5:00 PM** (no scheduled appointment required).\n\n` +
        `• **Scheduled weekend appointments** run on **Saturdays & Sundays (8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM)**.\n\n` +
        `📅 **Available Slots for Upcoming Clinic Day (${satFormatted}):**\n` +
        (openSlots.length > 0
          ? openSlots.map(s => `• **${s}** — Available`).join('\n')
          : `• All slots are currently booked for ${satFormatted}.`) +
        `\n\n` +
        `You can book open slots in the **Appts** tab in the app or via the website booking form.`
      );
    }

    // Target day is Saturday or Sunday (appointment day)
    const slotsSnap = await db.collection('appointmentSlots').where('date', '==', targetIso).get();
    const apptsSnap = await db.collection('appointments').where('date', '==', targetIso).get();
    const bookedSet = new Set();
    slotsSnap.docs.forEach(d => bookedSet.add(d.data().time));
    apptsSnap.docs.forEach(d => {
      const st = d.data().status;
      if (st !== 'cancelled' && st !== 'declined') bookedSet.add(d.data().time);
    });

    const openSlots = CLINIC_TIME_SLOTS.filter(t => !bookedSet.has(t));
    const bookedSlots = CLINIC_TIME_SLOTS.filter(t => bookedSet.has(t));

    return (
      `📅 **Available Appointments for ${dateFormatted}:**\n\n` +
      `**Open Slots (${openSlots.length} available):**\n` +
      (openSlots.length > 0
        ? openSlots.map(s => `• **${s}** — Available`).join('\n')
        : `• All appointment slots are fully booked for this day.`) +
      (bookedSlots.length > 0
        ? `\n\n**Booked Slots (${bookedSlots.length}):**\n` +
          bookedSlots.map(s => `• ${s} (Booked)`).join('\n')
        : '') +
      `\n\n` +
      `To book any open slot, go to the **Appts** tab in the patient app or tap **Book Appointment** on the website.`
    );
  } catch (err) {
    console.error('Error fetching available appointments:', err);
    return (
      `📅 **K&A Clinic Appointment Information:**\n\n` +
      `• Scheduled appointments are available on **Saturdays & Sundays (8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM)**.\n` +
      `• Monday to Friday are **walk-in days (8:00 AM – 5:00 PM)**.\n\n` +
      `Please check the **Appts** tab in the app to view live available slots and book your preferred time.`
    );
  }
}

function classifyMessage(text) {
  const q = (text || '').toLowerCase().trim();
  if (!q) return 'in_scope';

  // Questions about prices/cost or hepatitis availability are in-scope logistics.
  if (PRICING_RE.test(q) || HEPATITIS_RE.test(q)) return 'in_scope';

  // Available appointment queries and greetings are in-scope logistics.
  if (APPT_AVAILABILITY_RE.test(q) || GREETING_RE.test(q)) return 'in_scope';

  // General clinic catalog, services, walk-in, requirements, and record management questions
  // are in-scope logistics as long as they do not describe an active wound, bite, or symptom.
  if (!ACTIVE_WOUND_RE.test(q)) {
    if (SERVICES_RE.test(q) || WALKIN_RE.test(q) || PREPARATION_RE.test(q) || RECORDS_HELP_RE.test(q)) {
      return 'in_scope';
    }
  }

  // Clinical wins outright, and wins over the non-clinical patterns too.
  if (CLINICAL_PATTERNS.some(re => re.test(q))) return 'clinical';

  if (NON_CLINICAL_PATTERNS.some(re => re.test(q))) return 'in_scope';

  if (OUT_OF_SCOPE_PATTERNS.some(re => re.test(q))) return 'out_of_scope';

  // Unrecognized: nothing clinical matched, so it is not a staff matter. Staff
  // hand-off is reserved for rabies/medical messages; everything else the bot
  // cannot place gets the polite out-of-scope rejection.
  return 'out_of_scope';
}

// Named export purely so the scope boundary can be asserted in isolation;
// Vercel only ever invokes the default export below.
export { classifyMessage };

// The reply for any clinical message. Deliberately attempts no partial answer,
// no reassurance, and no "but generally speaking" — the whole point of the
// narrowed scope is that the bot says nothing clinical at all.
//
// The closing line differs by channel because the two front-ends offer
// different next steps: the patient app has a "Talk to Clinic Staff" button
// that opens a real thread, while the public website chatbot has no such
// control and no signed-in patient to attach a thread to. Pointing a website
// visitor at a button that does not exist would be a dead end.
const CLINICAL_REPLY_BASE =
  'That is a clinical question, so I will not answer it myself — anything about rabies, wounds, ' +
  'symptoms, or vaccination needs a member of K&A Clinic staff.';
const EMERGENCY_TAIL =
  ' If this is an emergency, go to the nearest Animal Bite Treatment Center or emergency room now.';

const CLINICAL_REPLY_APP =
  `${CLINICAL_REPLY_BASE} Tap "Talk to Clinic Staff" below and someone will help you directly.${EMERGENCY_TAIL}`;
const CLINICAL_REPLY_PUBLIC =
  `${CLINICAL_REPLY_BASE} Please call or visit K&A Clinic at San Juan St., Libon, Albay ` +
  `(8:00 AM – 5:00 PM, Monday to Sunday), or sign in to the patient app to message our staff.${EMERGENCY_TAIL}`;

const clinicalReplyFor = (channel) => (channel === 'public' ? CLINICAL_REPLY_PUBLIC : CLINICAL_REPLY_APP);

const OUT_OF_SCOPE_REPLY =
  'That request is outside what I can help with — I am only able to assist with K&A Clinic information ' +
  'such as hours, location, appointments, services, and pricing.';

// The catch-all getFallbackReply returns when no keyword matched — i.e. the
// bot genuinely had nothing to say. Compared by identity at the end of the
// handler to tell "no answer" apart from a real keyword-matched answer, so it
// must stay a single shared constant rather than a duplicated literal.
const GENERIC_FALLBACK_REPLY = OUT_OF_SCOPE_REPLY;

// Section 5A applies to the Gemini path too: the model can return one of the
// system instruction's own non-answers (the "unrelated question" refusal, or
// the "consult a physician" deflection) with an otherwise successful HTTP 200.
// Those are non-answers to an in-domain question, so a human should pick them
// up — without this, a patient gets a dead end and no "Talk to Clinic Staff"
// button precisely when they were told to seek help elsewhere.
//
// Only applied to in-domain messages: classifyMessage already routes genuine
// small talk to 'out_of_scope' before any Gemini call, so a refusal reaching
// here means the model refused something it should have answered.
// KAI's own Category 3 rejection. Recognised so an out-of-scope message the
// keyword classifier did not catch is still returned WITHOUT a staff hand-off.
const MODEL_OUT_OF_SCOPE_RE = /outside what i can help with/i;

const MODEL_NON_ANSWER_PATTERNS = [
  /trained only to answer/i,
  /consult a physician or visit k&a clinic directly/i,
  /i (can|could) only assist with/i,
  /please ask a related query/i,
  /clinical question, so i will pass it/i,
  /not able to answer/i,
  /(i\s+)?(don'?t|do\s+not)\s+(know|have\s+(that|this)\s+information)/i,
  /(unable|cannot|can'?t)\s+(help|answer|assist)\s+with/i,
];

const isModelOutOfScope = (reply) => MODEL_OUT_OF_SCOPE_RE.test(reply || '');
const isModelNonAnswer = (reply) => !isModelOutOfScope(reply) && MODEL_NON_ANSWER_PATTERNS.some(re => re.test(reply || ''));

// Keyword fallback for when Gemini is unavailable. Only ever reached for
// messages already classified 'in_scope', so every branch here is logistics —
// there is deliberately no clinical branch left to fall back to.
function getFallbackReply(text) {
  const q = (text || '').toLowerCase().trim();

  if (GREETING_RE.test(q)) {
    return GREETING_REPLY;
  }

  const CLINIC_INFO =
    '🏥 **K&A Clinic Operating Information:**\n' +
    '• **Operating Hours:** 8:00 AM – 5:00 PM (Monday to Sunday)\n' +
    '• **Immediate Walk-ins:** Accepted Monday – Friday\n' +
    '• **Scheduled Appointments:** Saturdays & Sundays (8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM)\n' +
    '• **Address:** San Juan St., Libon, Albay';

  const hoursKeywords = ['hour', 'opening time', 'open', 'when close', 'close time', 'operating', 'walk-in', 'what time', 'weekend', 'saturday', 'sunday'];
  const contactKeywords = ['location', 'address', 'where', 'contact', 'phone', 'number', 'email', 'direction', 'map'];
  if (hoursKeywords.some(kw => q.includes(kw)) || contactKeywords.some(kw => q.includes(kw))) {
    return CLINIC_INFO;
  }

  if (q.includes('book') || q.includes('appointment') || q.includes('reserve') || q.includes('slot') || q.includes('reschedul') || q.includes('cancel')) {
    return '📅 **Booking an Appointment:**\n\n' +
      'To book an appointment, open the **Appts** tab in the K&A Clinic app (or tap **Book Appointment** on our website), pick a weekend date and an available time slot, and confirm.\n\n' +
      '• **Appointment Days:** Saturdays & Sundays (8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM)\n' +
      '• **Weekdays:** Immediate walk-ins (Monday – Friday, 8:00 AM – 5:00 PM)\n' +
      '• You can reschedule or request cancellation directly from the **Appts** tab.';
  }

  if (q.includes('log in') || q.includes('login') || q.includes('sign in') || q.includes('sign up') || q.includes('password') || q.includes('account') || q.includes('otp') || q.includes('verif')) {
    return '🔐 **Sign In & Account:**\n\n' +
      'Sign in with the email address and **Medical Record Number (MRN)** on file with the clinic. If you cannot get in, use **Forgot Password** on the login screen to reset your password, or visit the clinic front desk for account assistance.';
  }

  if (q.includes('app') || q.includes('tab') || q.includes('screen') || q.includes('navigate') || q.includes('how do i use') || q.includes('record') || q.includes('profile') || q.includes('notification')) {
    return '📱 **Navigating the Patient App:**\n\n' +
      '• **Home:** View your digital vaccination card and upcoming schedule\n' +
      '• **Appts:** Book, view, or manage weekend appointment slots\n' +
      '• **Records:** Review official medical records and reports\n' +
      '• **Chat:** Chat with this virtual assistant or connect with clinic staff\n' +
      '• **Account:** Manage profile settings and notification preferences';
  }

  if (PRICING_RE.test(q)) {
    return '💉 **K&A Clinic Vaccine Pricing:**\n' +
      '• **PEP Category 2 (with Anti-Tetanus):** ₱1,000 for the 1st session, and ₱800 for each of the next 3 sessions.\n' +
      '• **PEP Category 3:** ₱4,500 for 4 sessions (complete package includes Anti-Tetanus and IRIG / Rabies Immunoglobulin).\n' +
      '• **Pneumonia Vaccine:** ₱4,500.\n\n' +
      'Notice: K&A Clinic is no longer catering or offering Hepatitis vaccines.';
  }

  if (SERVICES_RE.test(q)) {
    return '💉 **K&A Clinic Available Services & Vaccines:**\n\n' +
      '• **Anti-Rabies Post-Exposure Prophylaxis (PEP):** Active immunization course for animal bite/scratch exposures.\n' +
      '• **Anti-Tetanus Immunization:** Protection against tetanus wound infection.\n' +
      '• **Rabies Immunoglobulin (RIG / IRIG):** Immediate passive antibody protection for high-risk exposures.\n' +
      '• **Pneumonia Vaccine:** Available for general respiratory protection (₱4,500).\n\n' +
      '⚠️ **Notice:** K&A Clinic is **no longer offering Hepatitis vaccines**.\n\n' +
      'For package pricing, ask "How much are the vaccines?" or tap the **Appts** tab to schedule your visit.';
  }

  if (WALKIN_RE.test(q)) {
    return '🏥 **K&A Clinic Walk-in Schedule:**\n\n' +
      '• **Mondays to Fridays:** Walk-in patients are accepted from **8:00 AM – 5:00 PM** (no advance appointment required).\n' +
      '• **Saturdays & Sundays:** Advance appointment slots only (**8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM**).\n\n' +
      'Weekend slots can be scheduled in the **Appts** tab of the patient app or on our website.';
  }

  if (PREPARATION_RE.test(q)) {
    return '📋 **What to Bring to K&A Clinic:**\n\n' +
      '• **Valid Government or Student ID** for patient identity verification.\n' +
      '• **K&A Medical Record Number (MRN)** or Clinic Card (if returning patient).\n' +
      '• **Previous Vaccination Records** (if you have received prior rabies or tetanus doses).\n' +
      '• For minors, please come with an accompanying parent or guardian.\n\n' +
      'Payment is settled at the clinic front desk during your visit.';
  }

  if (RECORDS_HELP_RE.test(q)) {
    return '📄 **Viewing & Exporting Your Vaccination Record:**\n\n' +
      '• Open the **Records** tab in the patient app to view your official immunization log.\n' +
      '• Tap on the **Vaccination Record Card** to flip between the front and back views in 3D.\n' +
      '• Tap **Export Card** to save an official digital image directly to your photo gallery.';
  }

  if (HEPATITIS_RE.test(q)) {
    return 'Notice: K&A Clinic is no longer catering or offering Hepatitis vaccines.';
  }

  return GENERIC_FALLBACK_REPLY;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const prompt = (req.body?.prompt || '').toString();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    // 'app' (patient app, has a Talk to Clinic Staff button) or 'public' (the
    // website chatbot, which does not). Only changes the wording of the
    // clinical hand-off, never whether a message is escalated.
    const channel = req.body?.channel === 'public' ? 'public' : 'app';
    if (!prompt.trim()) {
      res.status(400).json({ success: false, error: 'A message is required.' });
      return;
    }

    // Triage before spending a Gemini call. A clinical message must get the
    // same hand-off every time — never a partial answer the model improvised —
    // so it never reaches the model at all. Out-of-scope needs no model either.
    const category = classifyMessage(prompt);
    if (category === 'clinical') {
      res.status(200).json({
        success: true, text: clinicalReplyFor(channel), source: 'classifier',
        category, needsEscalation: true, fallbackReason: null,
      });
      return;
    }
    if (category === 'out_of_scope') {
      res.status(200).json({
        success: true, text: OUT_OF_SCOPE_REPLY, source: 'classifier',
        category, needsEscalation: false, fallbackReason: null,
      });
      return;
    }

    // Pure greeting check (e.g. "hi", "hello", "good morning")
    if (isPureGreeting(prompt)) {
      res.status(200).json({
        success: true,
        text: GREETING_REPLY,
        source: 'greeting',
        category: 'in_scope',
        needsEscalation: false,
        fallbackReason: null,
      });
      return;
    }

    // Available appointment inquiries: query live Firestore database
    if (APPT_AVAILABILITY_RE.test(prompt)) {
      const apptReply = await getAvailableAppointmentsReply(prompt);
      res.status(200).json({
        success: true,
        text: apptReply,
        source: 'appointments_db',
        category: 'in_scope',
        needsEscalation: false,
        fallbackReason: null,
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const contents = [
      { role: 'user', parts: [{ text: CLINIC_SYSTEM_INSTRUCTION }] },
      ...history.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || m.html || '' }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ];

    // Visibility into which path produced the reply — Gemini vs. the
    // keyword fallback — and, on fallback, exactly why: a 429 (free-tier
    // quota/rate-limit exhausted) is expected, graceful degradation for a
    // free-tier deployment, not a bug; a 404 means the model id itself is
    // wrong; anything else is a genuine upstream failure (e.g. the 503
    // "high demand" errors seen from gemini-3.5-flash).
    let text = null;
    let source = 'fallback';
    let fallbackReason = null;
    if (!apiKey) {
      fallbackReason = 'missing_api_key';
      console.warn('GEMINI_API_KEY is not set — using DOH fallback. Set it in the deployment environment.');
    } else try {
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      });
      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          text = candidate.trim();
          source = 'gemini';
        } else {
          fallbackReason = 'empty_response';
          console.warn(`Gemini returned no candidate text (model: ${modelName}) — using DOH fallback.`);
        }
      } else if (geminiRes.status === 429) {
        fallbackReason = 'quota_exhausted';
        console.warn(`Gemini free-tier quota/rate-limit exhausted (429, model: ${modelName}) — using DOH fallback (expected free-tier degradation).`);
      } else if (geminiRes.status === 404) {
        fallbackReason = 'model_not_found';
        console.warn(`Gemini model id not found (404, model: ${modelName}) — check GEMINI_MODEL. Using DOH fallback.`);
      } else {
        fallbackReason = `http_${geminiRes.status}`;
        console.warn(`Gemini API HTTP error ${geminiRes.status} ${geminiRes.statusText} (model: ${modelName}) — using DOH fallback.`);
      }
    } catch (err) {
      fallbackReason = 'network_error';
      console.warn('Gemini API network error, using DOH fallback:', err);
    }

    // A general fallback means the bot could not actually answer, so a human
    // should pick it up. Distinguishes a keyword-matched answer (hours,
    // booking: a real answer, no escalation) from the catch-all greeting
    // getFallbackReply returns when nothing matched at all.
    // Staff hand-off happens ONLY for clinical content. An in-scope question
    // the bot could not answer (keyword miss, model non-answer, model down)
    // gets the out-of-scope wording instead of a hand-off.
    let needsEscalation = false;
    let finalCategory = category;
    if (!text) {
      text = getFallbackReply(prompt);
      if (text === GENERIC_FALLBACK_REPLY) finalCategory = 'out_of_scope';
    } else if (isModelOutOfScope(text)) {
      // KAI's Category 3 rejection: polite refusal, never a staff hand-off.
      text = OUT_OF_SCOPE_REPLY;
      needsEscalation = false;
      finalCategory = 'out_of_scope';
    } else if (/clinical question, so i will pass it/i.test(text)) {
      // KAI's Category 2 refusal: swap in the channel-aware hand-off wording.
      text = clinicalReplyFor(channel);
      needsEscalation = true;
      finalCategory = 'clinical';
    } else if (isModelNonAnswer(text)) {
      // The model returned one of its own non-answers to an in-scope
      // question. Not clinical (that phrase is caught above), so no hand-off.
      text = OUT_OF_SCOPE_REPLY;
      finalCategory = 'out_of_scope';
    }
    console.log(`[chatbot] source=${source} category=${finalCategory} escalate=${needsEscalation}${fallbackReason ? ` reason=${fallbackReason}` : ''} model=${modelName}`);

    res.status(200).json({ success: true, text, source, category: finalCategory, needsEscalation, fallbackReason });
  } catch (err) {
    console.error('chatbot error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
