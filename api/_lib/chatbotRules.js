// KAI's scope rules: the deterministic classifier and the fixed replies.
// Pure (no Firebase, no network) so tests can import it directly
// (scripts/test-chatbot-scope.mjs). api/chatbot.js runs classifyMessage()
// BEFORE any AI call; only 'in_scope' messages ever reach the model.
//
// ETHICS RULES (thesis study). KAI may give ONLY:
//   • general clinic information (services by name, location, contact)
//   • office hours
//   • appointment procedures (how to book / cancel in the app)
//   • system-navigation help (where things are in the app / website)
// It must NOT give diagnosis, treatment, wound care, rabies-risk assessment,
// vaccine recommendations, PEP schedules, medication advice or emergency
// advice, and it never states a patient's own dates, sessions, dose counts
// or treatment status: those questions get a navigation-only reply.
// patient-app/services/chatbotRules.ts mirrors this file; the same test
// prompts run against both.

// ── Clinic facts (the only facts KAI states) ────────────────────────────────
export const CLINIC = {
  name: 'K&A Animal Bite Center',
  address: 'San Juan St., Libon, Albay',
  phone: '+63 912 345 6789',
  email: 'contact@kaclinic.ph',
};

// ── Categories ──────────────────────────────────────────────────────────────
//   'in_scope'     allowed topic: answered (fixed reply, live slots, or model)
//   'personal_nav' the patient's own schedule / doses / status: navigation only
//   'clinical'     blocked medical topic: fixed neutral reply + staff option
//   'out_of_scope' unrelated small talk: polite refusal, no staff option
// Anything the rules cannot place is treated as 'clinical' (the safe side).

const norm = (t) => String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

// Blocked medical topics, English + Filipino/Tagalog + common Bikol, in two
// tiers. BLOCKED_STRICT is checked first and wins over everything, including
// "my next dose" questions (a missed dose, a wound, a symptom, a request for
// advice). BLOCKED_DOMAIN (rabies, vaccines, doses, regimens) is checked after
// the personal-schedule rule, so "kailan ang next dose ko?" gets navigation
// while "what is the PEP schedule?" is blocked.
export const BLOCKED_STRICT = [
  // Missed / late / skipped doses (including "I missed day 7").
  /\b(miss(ed|ing)?|skip(ped)?|late|delayed|forgot|forget|overdue|lumagpas|lagpas|nakalimutan|nalimutan|hindi\s+nakapunta|di\s+nakapunta|nalingawan|nakalingaw|dai\s+nakaabot|dai\s+nakapunta)\b/,
  // Exposure events and wounds.
  /\b(bite|bites|bit|bitten|biting|scratch\w*|lick(ed)?|wound\w*|bleed\w*|puncture|laceration|kagat|kinagat|nakagat|mangagat|kalmot|nakalmot|kinalmot|kinamot|dilaan|dinilaan|laway|sugat|dugo|nagdudugo|nagdurugo|lugad|linugad)\b/,
  // Animals as exposure sources (English, Tagalog, Bikol).
  /\b(dog|dogs|cat|cats|puppy|kitten|bat|monkey|rat|animal|pet|aso|tuta|pusa|kuting|hayop|ayam|ikos|ido)\b/,
  // Exposure category / risk / triage.
  /\b(categor(y|ies)|cat\s*(i{1,3}|[123])\b|exposure|triage|risk|dangerous|delikado|peligro|observation\s+period|seryoso|serious)\b/,
  // Symptoms, diagnosis, treatment, medicine.
  /\b(symptom\w*|sintomas|sign\w*\s+of|fever|lagnat|kalintura|hilanat|swell\w*|namamaga|maga|redness|pus|nana|infect\w*|impeksyon|inflam\w*|rash|pain|painful|hurts?|hurting|sore|swollen|bruis\w*|sakit|masakit|makolog|numb|numbness|itch\w*|kati|makati|paralysis|seizure|vomit\w*|suka|headache)\b/,
  /\b(diagnos\w*|prognos\w*|gamutin|cure|therapy|medicine|medication|gamot|bulong|tableta|paracetamol|antibiotic\w*|antiseptic|betadine|povidone|alcohol|prescri\w*|reseta|drug|drugs|pill|pills)\b/,
  /\b(first\s*aid|wash\s+(the\s+)?wound|clean\s+(the\s+)?wound|hugasan|dressing|suture|stitch\w*|tahi)\b/,
  /\b(side\s*-?\s*effects?|adverse|reaction|allerg\w*|contraindicat\w*|pregnan\w*|buntis|breastfeed\w*|nagpapasuso)\b/,
  // Asking for an assessment or a recommendation.
  /\b(do|should|must|can)\s+i\s+(need|get|take|go|come|worry|drink|eat)\b/,
  /\bdo\s+i\s+have\s+(an?\s+)?(rabies|infection|tetanus|fever|allergy|to\s+(get|take|come|go|worry))\b/,
  /\b(am\s+i\s+(ok|okay|safe|infected|sick|at\s+risk|going\s+to)|is\s+it\s+(safe|serious|dangerous|normal|ok|okay|bad)|is\s+(my|this|that)\s+\w+\s+(serious|dangerous|normal|infected|category))\b/,
  /\b(kailangan\s+ko\s+ba|dapat\s+ba\s+ako|okay\s+lang\s+ba|delikado\s+ba|kaipuhan\s+ko\s+daw|pwede\s+ba\s+akong\s+(uminom|kumain))\b/,
  /\b(what\s+(should|do|can)\s+i\s+do|ano\s+(ang\s+)?(dapat|gagawin)\s+ko|anong\s+gagawin|ano\s+an\s+gigibuhon\s+ko)\b/,
  // Emergencies and any other medical matter.
  /\b(emergency|emerhensya|urgent|ambulance|unconscious|can'?t\s+breathe|chest\s+pain|poison\w*|overdose|snake|ahas|stroke|heart\s+attack|fractur\w*)\b/,
  /\b(doctor|doktor|physician|nurse|medical|medikal|health\s+advice|clinical)\b/,
  // Lab / record interpretation.
  /\b(lab|laboratory|test|titer|titre)\s+(result|report)s?\b|\b(interpret|explain)\s+(my|the|this)\s+(result|report|record)\b/,
];

export const BLOCKED_DOMAIN = [
  // The rabies domain.
  /\b(rabies|rabid|rabis|abtc|lyssa\w*|hydrophobia)\b/,
  // Vaccines, biologics, regimens, schedules.
  /\b(vaccin\w*|bakuna|binakunahan|pep|prep|post-?exposure|pre-?exposure|rig|erig|hrig|immunoglobulin|booster|tetanus|anti-?tetano|toxoid|serum|antigen|regimen|protocol|essen|zagreb|intradermal|intramuscular)\b/,
  /\b(dose|doses|dosage|jab|shot|shots|injection|inject\w*|turok|tinurukan|iniksyon|day\s*\d+|ika-?\s*\d+\s*na\s+araw)\b/,
  // Treatment in general ("how is it treated"); a patient's own treatment
  // status is caught by the personal-schedule rule first.
  /\b(treat\w*|gamutan)\b/,
];

// The patient's OWN schedule, dose count or treatment status. Answered with
// navigation only: where to see it, never what it says.
export const PERSONAL_SCHEDULE_PATTERNS = [
  /\b(my|me|i|ko|ako|ko\s*ba|ko\s*po|ko\s*na)\b.*\b(next|upcoming|susunod|sunod|second|third|fourth|last|final|remaining)\b.*\b(dose|session|shot|vaccin\w*|bakuna|turok|visit|balik|schedule|appointment)\b/,
  /\b(next|upcoming|susunod|sunod)\s+(dose|session|shot|vaccin\w*|bakuna|turok)\b/,
  /\b(when|kailan|kelan|san-?o|nuarin)\b.*\b(dose|session|shot|bakuna|turok|balik|babalik)\b/,
  /\b(how\s+many|ilan|ilang|pira)\b.*\b(dose|doses|session|sessions|shot|shots|bakuna|turok)\b/,
  /\b(dose|doses|sessions?)\s+(left|remaining|completed|done|finished|natitira|natapos)\b/,
  /\bmy\s+(vaccination\s+|dose\s+|treatment\s+|vaccine\s+)?(schedule|progress|status|card|record|records)\b/,
  /\b(am\s+i|tapos\s+na\s+ba\s+ako|tapos\s+na\s+ako|natapos\s+ko\s+na)\b.*\b(done|finished|complete\w*|tapos|treatment|gamutan)\b/,
  /\b(schedule|iskedyul|eskedyul)\s+(ko|ng\s+bakuna\s+ko)\b/,
];

// Allowed topics.
export const GREETING_RE = /^(hi|hello|hey|good\s*(morning|afternoon|evening|day)|greetings?|kumusta|kamusta|maayong\s+(aga|hapon|banggi)|magandang\s+(umaga|hapon|gabi)|howdy|yo)\b/;
export const THANKS_RE = /^(thanks?|thank\s+you|salamat|dios\s+mabalos|ok(ay)?|sige|bye|goodbye|paalam)\b[\s!.]*$/;
export const HOURS_RE = /\b(hours?|open|opening|close|closed|closing|what\s+time|anong\s+oras|oras|walk-?ins?|weekends?|weekdays?|saturday|sunday|monday|holiday|lunch|bukas\s+ba|sarado)\b/;
export const BOOKING_RE = /\b(book\w*|appointment|appointments|appt|reschedul\w*|cancel\w*|slots?|reserv\w*|availab\w*|magpa-?schedule|magpa-?book|mag-?book)\b/;
export const CONTACT_RE = /\b(address|location|located|where\s+(are|is)\s+(you|the\s+clinic|k&a)|directions?|contact|phone|number|telephone|call|email|e-mail|reach\s+you|saan|nasaan|hain)\b/;
export const SERVICES_RE = /\b(services?|serbisyo|what\s+(do\s+you|does\s+the\s+clinic)\s+(offer|provide|have)|what\s+vaccines?\s+(do\s+you|does\s+the\s+clinic)\s+(have|offer|provide|carry)|do\s+you\s+(offer|have|provide|give)\s+(anti-?rabies\s+|rabies\s+|anti-?tetanus\s+|tetanus\s+|pneumonia\s+|pneumococcal\s+)?(vaccines?|vaccinations?|shots?|bakuna)|anong\s+(mga\s+)?(serbisyo|bakuna)\s+(meron|mayroon|ang\s+meron))\b/;
export const PRICE_RE = /\b(price|prices|pricing|cost|costs|fee|fees|rate|rates|how\s+much|magkano|bayad|presyo|payment|pay)\b|₱/;
export const APP_NAV_RE = /\b(app|application|website|log\s*-?\s*in|login|log\s*-?\s*out|sign\s*-?\s*(in|up)|password|account|profile|register\w*|otp|verif\w*|tab|screen|button|navigate|where\s+(do|can)\s+i\s+(see|find|view|check)|how\s+do\s+i\s+(use|find|open|change|update|export|download|save)|notification\w*|mrn|chat\s+with\s+staff|talk\s+to\s+staff|card)\b/;

export const OUT_OF_SCOPE_PATTERNS = [
  /\b(weather|forecast|rain|typhoon|bagyo)\b/, /\b(movie|film|song|music|celebrity|artist|concert|k-?pop)\b/,
  /\b(recipe|cook|bake|adobo|sinigang|restaurant|food\s+delivery)\b/,
  /\b(homework|assignment|essay|thesis|math|algebra|calculus|physics)\b/,
  /\b(python|javascript|programming|software|algorithm)\b/,
  /\b(basketball|nba|football|soccer|volleyball|score|standings)\b/,
  /\b(president|election|senator|politic\w*|stock\s+market|crypto|bitcoin)\b/,
  /\b(joke|riddle|poem|story\s+about)\b/,
  /\b(weed|marijuana|shabu|cocaine|meth|hack(ing|er)?|scam|porn\w*|gambling|casino)\b/,
];

/** 'in_scope' | 'personal_nav' | 'clinical' | 'out_of_scope' */
export function classifyMessage(text) {
  const q = norm(text);
  if (!q) return 'in_scope';
  // 1. Missed doses, wounds, symptoms, advice: blocked, whatever else the
  //    message asks.
  if (BLOCKED_STRICT.some(re => re.test(q))) return 'clinical';
  // 2. The patient's own schedule / doses / status: navigation only.
  if (PERSONAL_SCHEDULE_PATTERNS.some(re => re.test(q))) return 'personal_nav';
  // 3. "Which services / vaccines do you offer?" names services only: allowed
  //    when nothing medical is left once the services phrase is set aside.
  if (SERVICES_RE.test(q) && !BLOCKED_DOMAIN.some(re => re.test(q.replace(SERVICES_RE, ' ')))) return 'in_scope';
  // 4. Rabies, vaccines, doses, regimens: blocked.
  if (BLOCKED_DOMAIN.some(re => re.test(q))) return 'clinical';
  // 5. Allowed topics.
  if (GREETING_RE.test(q) || THANKS_RE.test(q)) return 'in_scope';
  if (HOURS_RE.test(q) || BOOKING_RE.test(q) || CONTACT_RE.test(q) || SERVICES_RE.test(q) || PRICE_RE.test(q) || APP_NAV_RE.test(q)) return 'in_scope';
  // 6. Clearly unrelated small talk.
  if (OUT_OF_SCOPE_PATTERNS.some(re => re.test(q))) return 'out_of_scope';
  // 7. A bare date is a scheduling question ("Sept 27?").
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b(today|tomorrow|bukas)\b/.test(q) && q.length <= 40) return 'in_scope';
  // 8. Unsure: the blocked reply is the safe answer.
  return 'clinical';
}

// ── Fixed replies ───────────────────────────────────────────────────────────
// One neutral reply for every blocked topic: no medical content, no
// emergency instructions, no advice. The app adds its "Talk to clinic staff"
// button under it.
export const BLOCKED_REPLY =
  `I can't help with medical questions. Please contact K&A Clinic or a licensed healthcare professional. ` +
  `You can reach the clinic at **${CLINIC.phone}** or **${CLINIC.email}**.`;
export const BLOCKED_REPLY_APP = `${BLOCKED_REPLY} You can also tap **Talk to clinic staff** below.`;

export const PERSONAL_NAV_REPLY_APP =
  'You can see your vaccination schedule on the **Home** screen under your vaccination card. ' +
  'Tap **Open my vaccination card** below to go there.';
export const PERSONAL_NAV_REPLY_PUBLIC =
  'Your vaccination schedule is in the K&A Clinic patient app: sign in, then look on the **Home** screen under your vaccination card.';

export const OUT_OF_SCOPE_REPLY =
  'That is outside what I can help with. I can help with K&A Clinic information: office hours, location and contact details, ' +
  'how to book or cancel an appointment, and finding your way around the app.';

export const GREETING_REPLY =
  "**Hello!** I'm **KAI**, the K&A Clinic virtual assistant.\n\n" +
  'I can help with:\n' +
  '• **Office hours** and walk-in days\n' +
  '• **Booking or cancelling an appointment**\n' +
  '• **Clinic location and contact details**\n' +
  '• **Finding your way around the app**\n\n' +
  'I do not give medical advice.';

export const THANKS_REPLY = "You're welcome. Is there anything else about the clinic or the app I can help with?";

export const HOURS_REPLY =
  '🏥 **K&A Clinic Office Hours:**\n' +
  '• **Monday to Friday:** walk-in, 8:00 AM – 5:00 PM\n' +
  '• **Saturday and Sunday:** by appointment, 8:00 AM – 5:00 PM\n' +
  '• **Lunch break:** 12:00 – 1:00 PM\n' +
  `• **Address:** ${CLINIC.address}`;

export const CONTACT_REPLY =
  `📍 **${CLINIC.name}**\n` +
  `• **Address:** ${CLINIC.address}\n` +
  `• **Phone:** ${CLINIC.phone}\n` +
  `• **Email:** ${CLINIC.email}\n` +
  '• **Hours:** Monday to Friday walk-in, Saturday and Sunday by appointment, 8:00 AM – 5:00 PM (lunch 12:00 – 1:00 PM)';

export const SERVICES_REPLY =
  '🏥 **Services at K&A Clinic:**\n' +
  '• Anti-rabies vaccination\n' +
  '• Anti-tetanus vaccination\n' +
  '• Rabies immunoglobulin administration\n' +
  '• Pneumococcal (pneumonia) vaccination\n\n' +
  'Which service is right for you is decided by clinic staff, not by me. ' +
  `For questions about a service, contact the clinic at **${CLINIC.phone}**.`;

// Prices are not published on the clinic website, so KAI does not quote them.
export const PRICE_REPLY =
  `I can't quote prices. Please ask the clinic front desk at **${CLINIC.phone}** or **${CLINIC.email}**.`;

export const BOOKING_REPLY =
  '📅 **Booking an Appointment:**\n' +
  '• Appointments are on **Saturdays and Sundays**, one patient per hourly slot, 8:00 AM – 5:00 PM (no slots 12:00 – 1:00 PM).\n' +
  '• **Monday to Friday** is walk-in: no booking needed.\n' +
  '• **In the app:** open the **Appointments** tab, pick a weekend date and a free time, fill in your details, then tap **Request Appointment**. The clinic confirms it.\n' +
  '• **To cancel:** open the appointment in the **Appointments** tab and request cancellation; staff review it.\n' +
  '• **On the website:** tap **Book Appointment**.';

export const APP_NAV_REPLY =
  '📱 **Finding your way around the app:**\n' +
  '• **Home:** your vaccination card (tap it to flip; **Enlarge Card** to save a copy) and your schedule\n' +
  '• **Appointments:** book, view or cancel weekend appointments\n' +
  '• **Chat:** KAI, or **Talk to clinic staff**\n' +
  '• **Account:** profile photo, contact details, notifications, signed-in devices\n\n' +
  'Sign in with your **Medical Record Number (MRN)** and password; use **Forgot Password** on the login screen if needed.';

/** The fixed reply for an allowed topic, or null to let the server decide (live slots / model). */
export function fixedInScopeReply(text) {
  const q = norm(text);
  if (THANKS_RE.test(q)) return THANKS_REPLY;
  if (GREETING_RE.test(q) && !(HOURS_RE.test(q) || BOOKING_RE.test(q) || CONTACT_RE.test(q) || SERVICES_RE.test(q) || PRICE_RE.test(q) || APP_NAV_RE.test(q))) return GREETING_REPLY;
  if (PRICE_RE.test(q)) return PRICE_REPLY;
  if (SERVICES_RE.test(q)) return SERVICES_REPLY;
  if (CONTACT_RE.test(q)) return CONTACT_REPLY;
  if (APP_NAV_RE.test(q) && !BOOKING_RE.test(q)) return APP_NAV_REPLY;
  if (HOURS_RE.test(q) && !BOOKING_RE.test(q)) return HOURS_REPLY;
  return null;
}

// Final check on any model-written reply: if it drifted into medical
// content, schedules, or advice, it is replaced with the blocked reply.
export const MEDICAL_OUTPUT_RE = /\b(day\s*0|day\s*3|day\s*7|day\s*14|day\s*28|regimen|wound|rabies|vaccinat\w*\s+(schedule|course|series)|dose\s+schedule|immunoglobulin|tetanus|category\s*(i{1,3}|[123])|symptom|fever|treatment|medicine|medication|first\s*aid|emergency|nearest\s+(hospital|animal\s+bite|abtc|er)|consult\s+a\s+(doctor|physician))\b/i;
