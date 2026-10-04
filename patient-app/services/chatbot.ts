// Client for the shared chatbot engine (api/chatbot.js).
//
// SCOPE: non-clinical only. The assistant answers questions about using the
// app, clinic hours, booking appointments, and clinic contact details. Every
// clinical or rabies-related message — including general education that used
// to be answered here — is handed to clinic staff instead.
export type ChatTurn = { role: 'user' | 'bot'; text: string };

// 'in_scope'     — non-clinical, the bot answered it
// 'clinical'     — handed off to staff (needsEscalation true)
// 'out_of_scope' — unrelated small talk (needsEscalation false)
export type ReplyCategory = 'in_scope' | 'clinical' | 'out_of_scope';

export type AssistantReply = {
  text: string;
  needsEscalation: boolean;
  category: ReplyCategory;
};

import { API_BASE_URL } from '../config/backend';

// Any clinical signal short-circuits to a staff hand-off without a round trip.
// This mirrors api/chatbot.js CLINICAL_PATTERNS in intent: the server is the
// authority, but a message that is obviously clinical should never depend on
// the network to be routed correctly — if the request failed, the old code
// fell through to a generic reply, and a clinical question deserves better
// than that. Broad on purpose; over-escalating is the safe direction.
// Word-boundary anchored, not substring: a plain `includes('cat')` matches
// "location", `'rig'` matches "right", and `'pep'` matches "pepper" — which
// would escalate ordinary questions about the clinic's location.
const CLINICAL_HINTS: RegExp[] = [
  /\b(rabies|rabid|abtc)\b/,
  /\b(bite|bit|bitten|scratch|scratched|lick|licked|wound|bleeding|puncture|kagat|nakagat|kinagat|mangagat|kalmot|nakalmot|kinamot|dilaan|dinilaan|laway|sugat|dugo|nagdurugo)\b/,
  /\b(dog|cat|puppy|kitten|bat|monkey|rat|animal|pet|aso|tuta|pusa|kuting|hayop)\b/,
  /\b(vaccin\w*|pep|prep|rig|erig|hrig|immunoglobulin|booster|tetanus|toxoid|essen)\b/,
  /\b(dose|doses|dosage|jab|inject\w*|day\s*\d+)\b/,
  // "shot" only as a vaccine shot; a bare "I got shot" is not a clinic matter.
  /\b(vaccine|vaccination|rabies|booster|tetanus|anti-?rabies|flu)\s+shots?\b|\bshots?\s+(schedule|for\s+rabies)\b/,
  /\b(categor\w*|triage|exposure|observation\s+period)\b/,
  /\b(symptom\w*|fever|swelling|redness|pus|infect\w*|rash|pain|numbness)\b/,
  /\b(diagnos\w*|treat\w*|cure|medicine|medication|prescri\w*|antiseptic|antibiotic)\b/,
  /\b(first\s*aid|side\s*-?\s*effects?|allerg\w*|reaction)\b/,
];

const GREETING_RE = /^(hi|hello|hey|good\s*(morning|afternoon|evening|day)|greetings?|kumusta|kamusta|howdy|sup|yo)\b/i;

const GREETING_REPLY =
  "**Hello!** Welcome to **K&A Animal Bite Center**. I am **KAI**, your clinic virtual assistant.\n\n" +
  "How can I help you today? You can ask me about:\n" +
  "• **Clinic Operating Hours** and walk-in schedule\n" +
  "• **Available Appointments** and booking steps\n" +
  "• **Vaccine Pricing & Packages** (PEP, Anti-Tetanus, Pneumonia)\n" +
  "• **Clinic Location & Directions**\n" +
  "• Using the **Patient App** features";

function isPureGreeting(text: string) {
  const q = (text || '').toLowerCase().trim();
  if (!GREETING_RE.test(q)) return false;
  const questionWords = ['hour', 'open', 'close', 'price', 'cost', 'fee', 'vaccin', 'appoint', 'slot', 'book', 'where', 'address', 'locat', 'staff', 'doctor'];
  if (questionWords.some(w => q.includes(w))) return false;
  return true;
}

const SERVICES_RE = /\b(services?|what\s+services|services\s+(offered|available|do\s+you)|what\s+vaccines?(\s+do\s+you)?\s+(have|offer|provide|carry)|do\s+you\s+(have|offer|provide|carry)\s+(anti-?rabies|tetanus|pneumonia|pep|vaccine|vaccines|shots?)|available\s+vaccines?|list\s+of\s+vaccines?|vaccine\s+(list|types|options|packages?)|anong\s+(mga\s+)?(bakuna|serbisyo))\b/i;
const WALKIN_RE = /\b(walk[- ]?in|can\s+i\s+walk[- ]?in|do\s+you\s+(accept|take)\s+walk[- ]?ins?|walk[- ]?in\s+(ba|pwede))\b/i;
const PREPARATION_RE = /\b(what\s+(to|should\s+i)\s+bring|requirements?|what\s+do\s+i\s+need(\s+to\s+bring)?|ano(ng)?\s+(dapat\s+dalhin|mga\s+kailangan))\b/i;
const RECORDS_HELP_RE = /\b(how\s+to\s+(view|see|check|export|download|save)\s+(my\s+)?(record|records|card|vaccin\w*\s+card)|paano\s+(makita|i-?download|i-?export)\s+ang\s+(card|record))\b/i;
const ACTIVE_WOUND_RE = /\b(bit|bitten|bite|scratch|bleeding|wound|pus|swelling|symptom|fever|pain|rash|puncture|laceration|am\s+i\s+(infected|sick)|kagat|nakagat|kinagat|kalmot|nakalmot|sugat|dugo|nagdurugo|lagnat|namamaga|nana)\b/i;

// Non-clinical answers worth serving instantly, without a round trip. Kept to
// the permitted clinic topics; consulted after safety checks.
const LOCAL_FAQS: { keywords: string[]; text: string }[] = [
  {
    keywords: ['hours', 'open', 'operating hours', 'clinic hours', 'what time', 'operating time'],
    text: '🏥 **K&A Clinic Operating Information:**\n• **Operating Hours:** 8:00 AM – 5:00 PM (Monday to Sunday)\n• **Immediate Walk-ins:** Accepted Monday – Friday\n• **Scheduled Appointments:** Saturdays & Sundays (8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM)\n• **Address:** San Juan St., Libon, Albay',
  },
  {
    keywords: ['walk-in', 'walk in', 'can i walk in', 'pwede walk in'],
    text: '🏥 **K&A Clinic Walk-in Schedule:**\n• **Mondays to Fridays:** Walk-in patients accepted from **8:00 AM – 5:00 PM** (no booking needed).\n• **Saturdays & Sundays:** Advance appointment slots only (**8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM**).\n\nYou can book weekend slots in the **Appts** tab.',
  },
  {
    keywords: ['services', 'what vaccines', 'available vaccines', 'vaccine list', 'vaccine types', 'anong bakuna', 'anong serbisyo'],
    text: '💉 **K&A Clinic Available Services & Vaccines:**\n• **Anti-Rabies Post-Exposure Prophylaxis (PEP):** Active immunization course for animal exposures.\n• **Anti-Tetanus Immunization:** Protection against tetanus infection.\n• **Rabies Immunoglobulin (RIG / IRIG):** Passive antibody protection for high-risk exposures.\n• **Pneumonia Vaccine:** For adults, a single dose (₱4,500).\n\nFor pricing details, ask "How much are the vaccines?" or tap **Appts** to schedule your visit.',
  },
  {
    keywords: ['what to bring', 'requirements', 'what do i need to bring', 'anong dapat dalhin'],
    text: '📋 **What to Bring to K&A Clinic:**\n• **Valid Government or Student ID** for identity verification.\n• **K&A Medical Record Number (MRN)** or Clinic Card (if returning patient).\n• **Previous Vaccination Records** (if you had prior rabies or tetanus doses).\n• For minors, please come with an accompanying parent or guardian.',
  },
  {
    keywords: ['how to book', 'booking steps', 'reschedule', 'cancel my appointment', 'paano magbook'],
    text: "📅 **Booking an Appointment:**\nYou can book from the **Appts** tab in this app — pick a weekend date and an available time slot, then confirm. Reschedule or request cancellation from the same tab.",
  },
  {
    keywords: ['export card', 'download card', 'view my record', 'save card', 'vaccination card'],
    text: '📄 **Viewing & Exporting Your Vaccination Record:**\n• Open the **Records** tab in this app to view your official immunization log.\n• Tap the **Vaccination Record Card** to flip between the front and back views in 3D.\n• Tap **Export Card** to save an official copy directly to your phone’s photo gallery.',
  },
  {
    keywords: ['address', 'location', 'where is', 'where are', 'contact', 'phone', 'direction'],
    text: '📍 **K&A Anti-Rabies Clinic** is located at **San Juan St., Libon, Albay**. Open **8:00 AM – 5:00 PM**, Monday to Sunday.',
  },
];

// The staff hand-off reply. Kept identical in wording to the server's
// CLINICAL_REPLY_APP so the patient sees one consistent boundary whether the
// classification happened on the device or on the server.
const CLINICAL_REPLY =
  'That is a clinical question, so I will not answer it myself — anything about rabies, wounds, ' +
  'symptoms, or vaccination needs a member of K&A Clinic staff. Tap "Talk to Clinic Staff" below ' +
  'and someone will help you directly. If this is an emergency, go to the nearest Animal Bite ' +
  'Treatment Center or emergency room now.';

export async function askClinicAssistant(prompt: string, history: ChatTurn[] = []): Promise<AssistantReply> {
  const pLower = prompt.toLowerCase().trim();

  // Pure greeting check — greet back warmly
  if (isPureGreeting(prompt)) {
    return {
      text: GREETING_REPLY,
      needsEscalation: false,
      category: 'in_scope',
    };
  }

  // How to pay (GCash, cards, cash, installments) is out of scope, same as the
  // server's PAYMENT_METHOD_RE. Checked before pricing so "how much" still
  // gets prices.
  if (/\b(gcash|g-cash|maya|paymaya|credit\s+cards?|debit\s+cards?|cards?|cash|installments?|e-?wallets?|bank\s+transfer|pay\s+(with|using|by|via|through|in)|payment\s+(methods?|options?|modes?)|mode\s+of\s+payment)\b/.test(pLower)) {
    return {
      text: 'That request is outside what I can help with — I am only able to assist with K&A Clinic ' +
        'information such as hours, location, appointments, services, and pricing.',
      needsEscalation: false,
      category: 'out_of_scope',
    };
  }

  // Vaccine pricing inquiries are in-scope logistics.
  // Word-boundary anchored, same as the server (see api/chatbot.js PRICING_RE).
  const PRICING_RE = /\b(price|prices|pricing|cost|costs|fee|fees|rate|rates|how\s+much|magkano|payment|package|packages|bayad|pesos?|presyo)\b|₱/;
  if (PRICING_RE.test(pLower)) {
    return {
      text: '💉 **K&A Clinic Vaccine Pricing:**\n' +
        '• **PEP Category 2 (with Anti-Tetanus):** ₱1,000 for the 1st session, and ₱800 for each of the next 3 sessions.\n' +
        '• **PEP Category 3:** ₱4,500 for 4 sessions (complete package includes Anti-Tetanus and IRIG / Rabies Immunoglobulin).\n' +
        '• **Pneumonia Vaccine (adults, single dose):** ₱4,500.',
      needsEscalation: false,
      category: 'in_scope',
    };
  }

  // General clinic catalog, services, walk-in, requirements, and record management questions
  // are in-scope logistics as long as they do not describe an active wound, bite, or symptom.
  const isCatalogQuery = !ACTIVE_WOUND_RE.test(pLower) &&
    (SERVICES_RE.test(pLower) || WALKIN_RE.test(pLower) || PREPARATION_RE.test(pLower) || RECORDS_HELP_RE.test(pLower));

  // Clinical check runs first (unless it is a catalog/logistics inquiry), so "can I book
  // an appointment for my next dose" escalates rather than being answered as a booking question.
  if (!isCatalogQuery && CLINICAL_HINTS.some(re => re.test(pLower))) {
    return { text: CLINICAL_REPLY, needsEscalation: true, category: 'clinical' };
  }

  // Explicit request for a human — same hand-off, no round trip.
  if (['talk to staff', 'speak with someone', 'human', 'real person', 'doctor', 'nurse', 'admin'].some(kw => pLower.includes(kw))) {
    return {
      text: 'I am connecting you with K&A Clinic staff. Please use the button below to start a direct chat with our team.',
      needsEscalation: true,
      category: 'clinical',
    };
  }

  // Check if query is about available appointments; if so, skip LOCAL_FAQS so
  // it goes to the server API to query real-time Firestore appointment slots.
  // Any specific date ("Sept 27", "9/27", "tomorrow", "Saturday") also goes to
  // the server, which resolves the real weekday and live slots for it.
  const mentionsDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b\d{1,2}\/\d{1,2}\b|\b20\d\d-\d{1,2}-\d{1,2}\b|\b(today|tomorrow|bukas|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(pLower);
  const isAvailableApptQuery = mentionsDate ||
    /\b(availab\w*|vacant|slots?|left|remaining)\b/i.test(pLower) ||
    /\b(availab\w*|open\w*|free\w*)\s+(appointment|appt|slot|time)s?\b|\b(appointment|appt|slot)s?\s+(availab\w*|open\w*|schedule)\b|\bwhat\s+(are\s+the\s+)?(availab\w*\s+)?(appointment|appt|slot)s?\b/i.test(pLower);

  if (!isAvailableApptQuery) {
    for (const faq of LOCAL_FAQS) {
      if (faq.keywords.some(kw => pLower.includes(kw))) {
        return { text: faq.text, needsEscalation: false, category: 'in_scope' };
      }
    }
  }

  // If backend API URL is available, try server-side chatbot
  if (API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          history: history.map(h => ({ role: h.role, text: h.text })),
          // Selects the app-flavoured clinical hand-off, which points at the
          // "Talk to Clinic Staff" button this screen actually has.
          channel: 'app',
        }),
      });
      const data = await res.json();
      if (data?.success && data.text) {
        return {
          text: data.text as string,
          needsEscalation: !!data.needsEscalation,
          category: (data.category as ReplyCategory) ?? 'in_scope',
        };
      }
    } catch (err) {
      console.warn('Chatbot API request failed:', err);
    }
  }

  // If the query was about available appointments but the server was unreachable,
  // return clear schedule instructions rather than a generic out-of-scope reply.
  if (isAvailableApptQuery) {
    return {
      text: '📅 **K&A Clinic Appointment Hours:**\n' +
        '• **Saturdays & Sundays:** Advance scheduled appointments (8:00 AM – 12:00 PM and 1:00 PM – 5:00 PM).\n' +
        '• **Mondays to Fridays:** Walk-in patients accepted (8:00 AM – 5:00 PM; no booking required).\n\n' +
        'To view live open slots and book your appointment, please tap the **Appts** tab below.',
      needsEscalation: false,
      category: 'in_scope',
    };
  }

  // Nothing matched locally and the server could not be reached. Nothing
  // clinical was detected, so this is not a staff matter: polite out-of-scope
  // reply, no hand-off. (Same rule as api/chatbot.js.)
  return {
    text: 'That request is outside what I can help with — I am only able to assist with K&A Clinic ' +
      'information such as hours, location, appointments, services, and pricing.',
    needsEscalation: false,
    category: 'out_of_scope',
  };
}
