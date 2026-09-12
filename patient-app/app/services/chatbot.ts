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

import { API_BASE_URL } from '../../config/apiBase';

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
  /\b(bite|bit|bitten|scratch|scratched|lick|licked|wound|bleeding|puncture)\b/,
  /\b(dog|cat|puppy|kitten|bat|monkey|rat|animal|pet)\b/,
  /\b(vaccin\w*|pep|prep|rig|erig|hrig|immunoglobulin|booster|tetanus|toxoid|essen)\b/,
  /\b(dose|doses|dosage|shot|shots|jab|inject\w*|day\s*\d+)\b/,
  /\b(categor\w*|triage|exposure|observation\s+period)\b/,
  /\b(symptom\w*|fever|swelling|redness|pus|infect\w*|rash|pain|numbness)\b/,
  /\b(diagnos\w*|treat\w*|cure|medicine|medication|prescri\w*|antiseptic|antibiotic)\b/,
  /\b(first\s*aid|side\s*-?\s*effects?|allerg\w*|reaction)\b/,
];

// Non-clinical answers worth serving instantly, without a round trip. Kept to
// the four permitted topics; consulted only after CLINICAL_HINTS has passed.
const LOCAL_FAQS: { keywords: string[]; text: string }[] = [
  {
    keywords: ['hours', 'open', 'operating hours', 'clinic hours', 'what time', 'walk-in', 'walk in'],
    text: 'K&A Clinic is open 8:00 AM – 5:00 PM, Monday to Sunday. Walk-ins are accepted Monday – Friday, and scheduled appointments run Saturdays & Sundays, 8:00 AM – 12:00 PM.',
  },
  {
    keywords: ['book', 'appointment', 'how to book', 'booking', 'reschedule', 'cancel my appointment', 'slot'],
    text: "You can book from the 'Appts' tab in this app — pick a weekend date and an available time slot, then confirm. Reschedule or cancel from the same tab.",
  },
  {
    keywords: ['address', 'location', 'where is', 'where are', 'contact', 'phone', 'direction'],
    text: 'K&A Anti-Rabies Clinic is at San Juan St., Libon, Albay. Open 8:00 AM – 5:00 PM, Monday to Sunday.',
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

  // Vaccine pricing and hepatitis availability inquiries are in-scope logistics
  const PRICING_KEYWORDS = ['price', 'pricing', 'cost', 'fee', 'how much', 'magkano', 'rate', 'rates', 'payment', 'package', 'bayad', 'pesos', 'peso', '1k', '4.5k', '800'];
  if (PRICING_KEYWORDS.some(kw => pLower.includes(kw))) {
    return {
      text: '💉 K&A Clinic Vaccine Pricing:\n' +
        '• PEP Category 2 (with Anti-Tetanus): ₱1,000 for the 1st session, and ₱800 for each of the next 3 sessions.\n' +
        '• PEP Category 3: ₱4,500 for 4 sessions (complete package includes Anti-Tetanus and IRIG).\n' +
        '• Pneumonia Vaccine: ₱4,500.\n\n' +
        'Notice: K&A Clinic is no longer catering or offering Hepatitis vaccines.',
      needsEscalation: false,
      category: 'in_scope',
    };
  }

  if (pLower.includes('hepatitis') || pLower.includes('hepa')) {
    return {
      text: 'Notice: K&A Clinic is no longer catering or offering Hepatitis vaccines.',
      needsEscalation: false,
      category: 'in_scope',
    };
  }

  // Clinical check runs first and wins over the FAQ list below, so "can I book
  // an appointment for my next dose" escalates rather than being answered as a
  // booking question.
  if (CLINICAL_HINTS.some(re => re.test(pLower))) {
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

  for (const faq of LOCAL_FAQS) {
    if (faq.keywords.some(kw => pLower.includes(kw))) {
      return { text: faq.text, needsEscalation: false, category: 'in_scope' };
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

  // Nothing matched locally and the server could not be reached. Hand off
  // rather than guess — the message is already known not to be one of the four
  // logistics topics, so a human is the right destination.
  return {
    text: 'I can help with using the app, clinic hours, booking appointments, and how to reach the clinic. ' +
      'I could not handle that one, so please tap "Talk to Clinic Staff" below and our team will help you.',
    needsEscalation: true,
    category: 'clinical',
  };
}
