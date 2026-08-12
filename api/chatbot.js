// Shared K&A Health Assistant engine — single backend implementation used by
// both the landing page chatbot (ka-clinic-admin/src/geminiService.js) and
// the patient app chatbot (patient-app/app/services/chatbot.ts), so both
// give identical, guardrailed answers. Moved here (server-side) from the
// old ka-clinic-admin/src/geminiService.js so the Gemini API key never ships
// in a client bundle.
const DOH_SYSTEM_INSTRUCTION = `
You are the official AI Health Assistant for K&A Anti-Rabies Clinic located at San Juan St., Libon, Albay, Philippines.
Your responses MUST adhere strictly to the Philippine Department of Health (DOH) Anti-Rabies Vaccination Guidelines and clinic policies.

CRITICAL RULES FOR INTENT DISAMBIGUATION:
- Rule 1: If the user asks about 'hours', 'schedule', 'opening time', 'when open', 'clinic schedule', 'operating hours', 'what time', or 'when close', ALWAYS answer with K&A Clinic's physical operating hours (8:00 AM – 5:00 PM, Monday to Sunday) and walk-in/appointment availability. Do NOT explain vaccine dose intervals unless specifically asked.
- Rule 2: ONLY explain the 5-dose Day 0, 3, 7, 14, 28 PEP scheme if the user explicitly asks about 'vaccine doses', 'PEP schedule', 'dose schedule', 'injection intervals', 'treatment schedule', 'Essen scheme', 'how many shots', or 'when is my next dose'.
- Rule 3: NEVER mix clinic opening times with medical dose schedules in a single response unless the user specifically asks for both.

CATEGORY A — CLINIC OPERATING HOURS & LOCATION (Non-Medical):
When asked about hours, opening time, schedule, location, address, or walk-in availability, respond with:
🏥 K&A Clinic Operating Information:
• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)
• Emergency PEP Walk-ins: Accepted Monday – Friday
• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)
• Address: San Juan St., Libon, Albay

CATEGORY B — VACCINATION TREATMENT PROTOCOLS (Medical):
When asked about PEP, vaccine doses, dose intervals, Essen scheme, or treatment schedule, respond with:
💉 DOH Anti-Rabies Vaccination Protocols:
• PEP (Post-Exposure Prophylaxis) Essen Scheme: 5 Doses given on Day 0 (Bite/Consultation Date), Day 3, Day 7, Day 14, and Day 28.
• Category III Bites: Requires ERIG/HRIG (Rabies Immunoglobulin) on Day 0 alongside Dose 1.
• PrEP (Pre-Exposure Prophylaxis): 3 Doses on Day 0, Day 7, and Day 21/28 (for high-risk individuals).
• Tetanus Toxoid (TT): Administered on Day 0 based on wound risk and past vaccination history.

CATEGORY C — ANIMAL BITE FIRST AID:
When asked about first aid, what to do after a bite, bitten, scratched, or dog/cat bite:
🧼 Immediate First Aid for Animal Bites/Scratches:
1. Wash the wound thoroughly with clean running water and soap for at least 15 minutes.
2. Apply antiseptic (povidone-iodine or 70% alcohol).
3. Seek medical evaluation at K&A Clinic immediately.
⚠️ Do NOT apply garlic, coins, or traditional concoctions.

CATEGORY D — APPOINTMENTS & BOOKING:
When asked about booking, appointments, or how to schedule a visit, instruct the user to click the "Book Appointment" button on the website or app.

CATEGORY E — GENERAL RABIES & PUBLIC HEALTH EDUCATION:
General educational questions about rabies ARE in scope and MUST be answered directly — never refused. This includes: what rabies is, how it is transmitted, its symptoms and incubation period, why it is fatal once symptoms begin, which animals carry it, how it is prevented, the 14-day animal observation period, DOH exposure categories (I/II/III), and RA 9482 content (mandatory pet vaccination, impoundment, leash laws).
Example — "What is rabies?" is an in-scope educational question. Answer it: rabies is a viral infection of the central nervous system, transmitted through the saliva of an infected animal via bites, scratches, or licks on broken skin or mucous membranes; it is almost always fatal once symptoms appear, but is nearly always preventable with prompt wound care and post-exposure prophylaxis.
Bites to the head, neck, or face are always treated as Category III regardless of how minor they look.

CATEGORY F — MEDICAL GUARDRAILS:
- If a user asks for specific clinical diagnosis, prescription, deep medical advice, or treatment modification (e.g. "diagnose my wound", "what medicine should I take", "can I stop treatment"), respond: "For specific clinical diagnosis or medical evaluation, please consult a physician or visit K&A Clinic directly."
- If a user mentions bleeding, pus, fever, allergic reaction, severe pain, or wants to speak with a doctor, respond with medical caution and suggest they contact the clinic directly or speak with an admin.
- Refuse ONLY questions with no connection at all to rabies, animal bites, tetanus, or K&A Clinic services — for example weather, sports, celebrities, recipes, coding, or homework. For those, respond: "I am trained only to answer questions regarding rabies, animal bite care, and K&A Clinic services. Please ask a related query." Never use this refusal for a question that mentions rabies, animal bites, vaccination, or the clinic — those are in scope, and a general or one-word question about them (e.g. just "rabies") should be answered with the relevant general information rather than refused.
- Keep responses friendly, informative, professional, and clear. Never mention 'Gemini' or any AI model name.
`;

// Three-way triage of an incoming message, per the chatbot scope reference:
//
//   'answerable'  — in scope, the bot may answer directly
//   'restricted'  — in scope (rabies/ABTC) but off-limits for the bot, so a
//                   human is genuinely waiting on an answer -> escalate
//   'out_of_scope'— not rabies/ABTC at all -> standard fallback, NO escalation
//
// The distinction that matters is between 'restricted' and 'out_of_scope':
// both get a non-answer from the bot, but only 'restricted' should surface a
// "Talk to Clinic Staff" button. Escalating out-of-scope chatter (weather,
// recipes) would just fill the admin inbox with noise.
//
// Deliberately keyword-based rather than model-driven: this runs identically
// on the Gemini path and the keyword-fallback path, so classification does
// not silently change behavior when the API is unreachable or quota-limited.
const RESTRICTED_PATTERNS = [
  // Definitive clinical diagnosis — human patient or biting animal.
  /\b(do|have)\s+i\s+(have|got)\s+rabies\b/, /\bam\s+i\s+(infected|rabid|going to die)\b/,
  /\bis\s+(the|my|that|this)?\s*(dog|cat|animal|bat|monkey)\s+(rabid|infected|sick|have rabies)\b/,
  /\bdiagnos(e|is|ing)\b/, /\bis\s+my\s+wound\s+(infected|serious|bad)\b/,
  // Prescribing / substituting / changing dose or schedule.
  /\b(can|should|may)\s+i\s+(skip|miss|delay|stop|postpone|reschedule|discontinue)\b.*\b(dose|day|shot|vaccine|jab|treatment|pep|schedule)\b/,
  /\b(skip|miss|delay|stop|postpone)\s+(day\s*\d+|dose\s*\d+|my\s+(next\s+)?(dose|shot))\b/,
  /\b(different|another|substitute|change|switch|cheaper|alternative)\s+(vaccine|brand|dose|dosage|schedule|treatment)\b/,
  /\bwhat\s+(dose|dosage|brand|vaccine)\s+should\s+i\b/, /\bprescri(be|ption|bing)\b/,
  /\b(increase|decrease|adjust|double|halve)\s+(the\s+)?(dose|dosage)\b/,
  // Substituting for a physical medical procedure.
  /\b(how\s+do\s+i|can\s+i|teach\s+me|show\s+me|walk\s+me\s+through|guide\s+me)\b.*\b(inject|injection|infiltrat\w*|suture|stitch|flush)\w*\b/,
  /\b(infiltrat\w*|suturing)\b/,
  /\b(self|at\s*-?\s*home|myself)\s*-?\s*(inject|administer|vaccinat)/,
  /\b(id|im|intradermal|intramuscular|rig|erig|hrig)\b.*\b(technique|how\s+to|administer|inject|myself)\b/,
  // Veterinary diagnosis / lab-result interpretation.
  /\b(lab|laboratory|test|titer|titre|fat|dfa|blood)\s+(result|report)s?\b/,
  /\b(interpret|read|explain)\s+(my|the|these|this)\s+(result|report|lab)/,
  /\b(treat|cure|medicine|medication)\s+(for\s+)?(my\s+)?(dog|cat|pet|animal)\b/,
  // Non-rabies medical emergency.
  /\b(fractur\w*|broken\s+(bone|arm|leg|rib)|heart\s+attack|stroke|seizure|unconscious|venomous|poison\w*|overdose|bleeding\s+heavily|can'?t\s+breathe|chest\s+pain|appendicitis|diabet\w*|asthma\s+attack)\b/,
  /\b(snake|scorpion|spider|centipede|jellyfish|stingray)\b/,
  // Legal / financial / administrative.
  /\b(philhealth|insurance|claim|reimburse|refund|billing|bill\s+dispute|overcharge|liab(le|ility)|sue|lawsuit|legal|malpractice)\b/,
  /\bcomplain(t|ing)?\b.*\b(against|about)\b|\b(file|lodge|submit)\s+a\s+complaint\b/,
];

// Genuinely outside the rabies/ABTC domain. Checked only after the restricted
// patterns, and only when no in-domain term appears, so "can I skip Day 7 of
// my vaccine" is never misread as small talk.
const OUT_OF_SCOPE_PATTERNS = [
  /\b(weather|forecast|rain|typhoon)\b/, /\b(movie|film|song|music|celebrity|artist|concert|k-?pop)\b/,
  /\b(recipe|cook|bake|adobo|sinigang|restaurant|food\s+delivery)\b/,
  /\b(homework|assignment|essay|thesis|math|algebra|calculus|physics|chemistry\s+problem)\b/,
  /\b(python|javascript|code|programming|software|algorithm)\b/,
  /\b(basketball|nba|football|soccer|volleyball|score|standings)\b/,
  /\b(president|election|senator|politic|stock\s+market|crypto|bitcoin)\b/,
  /\b(joke|riddle|poem|story\s+about)\b/,
];

// Anything that keeps a message inside the clinic's domain even when it also
// trips an out-of-scope keyword.
const IN_DOMAIN_PATTERNS = [
  /\b(rabies|rabid|abtc|anti-?rabies)\b/, /\b(bite|bitten|scratch|scratched|lick(ed)?)\b/,
  /\b(vaccin|pep|prep|rig|erig|hrig|immunoglobulin|booster|tetanus|toxoid)\b/,
  /\b(dog|cat|puppy|kitten|bat|monkey|animal)\b/, /\b(clinic|appointment|schedule|dose|shot|jab|wound)\b/,
  /\b(day\s*0|day\s*3|day\s*7|day\s*14|day\s*28|essen|observation)\b/,
];

function classifyMessage(text) {
  const q = (text || '').toLowerCase().trim();
  if (!q) return 'answerable';

  // Restricted wins outright: these are in-domain by construction, and a
  // person is waiting on an answer the bot is not allowed to give.
  if (RESTRICTED_PATTERNS.some(re => re.test(q))) return 'restricted';

  // Out-of-scope only when nothing anchors the message to the clinic domain.
  const inDomain = IN_DOMAIN_PATTERNS.some(re => re.test(q));
  if (!inDomain && OUT_OF_SCOPE_PATTERNS.some(re => re.test(q))) return 'out_of_scope';

  return 'answerable';
}

// The reply the bot gives when it must not answer a restricted in-domain
// question. Deliberately does not attempt a partial answer.
const RESTRICTED_REPLY =
  'That needs a member of our clinical staff — it is not something I can safely answer myself. ' +
  'Please tap "Talk to Clinic Staff" below and someone from K&A Clinic will help you directly. ' +
  'If this is an emergency, go to the nearest ABTC or emergency room now.';

const OUT_OF_SCOPE_REPLY =
  'I can only assist with rabies and ABTC-related concerns. Please ask a question about animal bites, ' +
  'rabies vaccination, or K&A Clinic services.';

// The catch-all getFallbackDOHReply returns when no keyword matched — i.e. the
// bot genuinely had nothing to say. Compared by identity at the end of the
// handler to tell "no answer" apart from a real keyword-matched answer, so it
// must stay a single shared constant rather than a duplicated literal.
const GENERIC_FALLBACK_REPLY =
  "👋 Hello! I'm the K&A Health Assistant. I can answer questions about rabies first aid, PEP & PrEP vaccination schedules, clinic operating hours, and appointment booking. How can I help you?";

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
const MODEL_NON_ANSWER_PATTERNS = [
  /trained only to answer/i,
  /consult a physician or visit k&a clinic directly/i,
  /i (can|could) only assist with/i,
  /please ask a related query/i,
];

const isModelNonAnswer = (reply) => MODEL_NON_ANSWER_PATTERNS.some(re => re.test(reply || ''));

function getFallbackDOHReply(text) {
  const q = (text || '').toLowerCase().trim();

  const medicalKeywords = ['diagnose', 'prescription', 'allergic reaction', 'medicine to take', 'stop treatment', 'is my wound infected', 'deep advice'];
  if (medicalKeywords.some(kw => q.includes(kw))) {
    return 'For specific clinical diagnosis or medical evaluation, please consult a physician or visit K&A Clinic directly.';
  }

  const irrelevantKeywords = ['weather', 'sports', 'president', 'movie', 'game', 'recipe', 'python', 'code', 'math'];
  if (irrelevantKeywords.some(kw => q.includes(kw)) && !q.includes('bite') && !q.includes('rabies') && !q.includes('vaccine')) {
    return 'I am trained only to answer questions regarding rabies, animal bite care, and K&A Clinic services. Please ask a related query.';
  }

  const escalationKeywords = ['bleeding', 'pus', 'fever', 'severe pain', 'speak with admin', 'speak with doctor', 'talk to doctor'];
  if (escalationKeywords.some(kw => q.includes(kw))) {
    return '⚠️ This sounds like it may require immediate medical attention. Please contact K&A Clinic directly at San Juan St., Libon, Albay or speak with our clinic staff for urgent assistance.';
  }

  const hoursKeywords = ['hour', 'opening time', 'when open', 'when close', 'close time', 'operating', 'walk-in', 'location', 'address', 'where'];
  if (hoursKeywords.some(kw => q.includes(kw))) {
    return '🏥 K&A Clinic Operating Information:\n• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)\n• Emergency PEP Walk-ins: Accepted Monday – Friday\n• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)\n• Address: San Juan St., Libon, Albay';
  }

  if (q.includes('schedule')) {
    const isDoseSchedule = q.includes('dose') || q.includes('vaccine') || q.includes('pep') || q.includes('prep') || q.includes('injection') || q.includes('treatment') || q.includes('shot');
    if (isDoseSchedule) {
      return '💉 DOH Anti-Rabies Vaccination Protocols:\n• PEP (Post-Exposure Prophylaxis) Essen Scheme: 5 Doses on Day 0 (Bite/Consultation Date), Day 3, Day 7, Day 14, and Day 28.\n• Category III Bites: Requires ERIG/HRIG on Day 0 alongside Dose 1.\n• PrEP (Pre-Exposure Prophylaxis): 3 Doses on Day 0, Day 7, and Day 21/28.';
    }
    return '🏥 K&A Clinic Operating Information:\n• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)\n• Emergency PEP Walk-ins: Accepted Monday – Friday\n• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)\n• Address: San Juan St., Libon, Albay';
  }

  if (q.includes('first aid') || q.includes('bitten') || q.includes('scratched') || q.includes('what to do') || q.includes('dog bite') || q.includes('cat scratch') || q.includes('emergency')) {
    return '🧼 Immediate First Aid for Animal Bites/Scratches:\n1. Wash the wound thoroughly with clean running water and soap for at least 15 minutes.\n2. Apply antiseptic (povidone-iodine or 70% alcohol).\n3. Seek medical evaluation at K&A Clinic immediately.\n⚠️ Do NOT apply garlic, coins, or traditional concoctions.';
  }

  if (q.includes('pep') || q.includes('dose') || q.includes('essen') || q.includes('post-exposure') || q.includes('how many injection') || q.includes('how many shot') || q.includes('next shot') || q.includes('next dose')) {
    return '💉 DOH Anti-Rabies Vaccination Protocols:\n• PEP (Post-Exposure Prophylaxis) Essen Scheme: 5 Doses on Day 0 (Bite/Consultation Date), Day 3, Day 7, Day 14, and Day 28.\n• Category III Bites: Requires ERIG/HRIG on Day 0 alongside Dose 1.\n• PrEP (Pre-Exposure Prophylaxis): 3 Doses on Day 0, Day 7, and Day 21/28.';
  }

  if (q.includes('prep') || q.includes('pre-exposure') || q.includes('preventive vaccine')) {
    return '💉 Pre-Exposure Prophylaxis (PrEP) consists of 3 vaccine doses on Day 0, Day 7, and Day 21 or 28. Recommended for high-risk individuals such as veterinarians, animal handlers, and travelers.';
  }

  // General rabies education — Category E. Checked after the specific branches
  // above (first aid, PEP, hours) so a more precise question still wins, but
  // before the catch-all so "what is rabies" is never treated as a non-answer.
  if (q.includes('rabies') || q.includes('rabid')) {
    return '🦠 About Rabies:\n• Rabies is a viral infection of the central nervous system, spread through the saliva of an infected animal — usually via a bite, scratch, or a lick on broken skin or mucous membranes.\n• Common carriers in the Philippines are dogs and cats; bats and monkeys can also carry it.\n• Once symptoms begin it is almost always fatal, but it is nearly always preventable with prompt wound washing and post-exposure prophylaxis (PEP).\n• Symptoms can appear weeks to months after exposure, so never wait for them before seeking care.\n➡️ If you were bitten or scratched, wash the wound with soap and running water for 15 minutes and go to K&A Clinic or the nearest ABTC immediately.';
  }

  if (q.includes('tetanus') || q.includes('tt')) {
    return 'Tetanus Toxoid (TT) is administered on Day 0 alongside Dose 1 depending on wound severity and past vaccination history.';
  }

  if (q.includes('book') || q.includes('appointment') || q.includes('reserve') || q.includes('slot')) {
    return '📅 To book an appointment at K&A Clinic, click the "Book Appointment" button on our website or use the K&A Clinic mobile app. Weekend slots (Saturday & Sunday, 8:00 AM – 12:00 PM) are available for scheduled consultations.';
  }

  if (q.includes('cost') || q.includes('price') || q.includes('how much') || q.includes('fee') || q.includes('payment')) {
    return 'For current vaccine pricing and payment options, please contact K&A Clinic directly at San Juan St., Libon, Albay. We accept PhilHealth for covered treatments.';
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
    if (!prompt.trim()) {
      res.status(400).json({ success: false, error: 'A message is required.' });
      return;
    }

    // Triage before spending a Gemini call: a restricted question must get the
    // same hand-off reply every time (never a partial answer the model
    // improvised), and an out-of-scope one never needs the model at all.
    const category = classifyMessage(prompt);
    if (category === 'restricted') {
      res.status(200).json({
        success: true, text: RESTRICTED_REPLY, source: 'classifier',
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

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const contents = [
      { role: 'user', parts: [{ text: DOH_SYSTEM_INSTRUCTION }] },
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

    // Section 5A — a general fallback means the bot could not actually answer,
    // so a human should pick it up. Distinguishes a keyword-matched answer
    // (hours, first aid: a real answer, no escalation) from the catch-all
    // greeting getFallbackDOHReply returns when nothing matched at all.
    let needsEscalation = false;
    if (!text) {
      text = getFallbackDOHReply(prompt);
      needsEscalation = text === GENERIC_FALLBACK_REPLY;
    } else if (isModelNonAnswer(text)) {
      // The model answered, but its answer was one of its own non-answers.
      needsEscalation = true;
    }
    console.log(`[chatbot] source=${source} category=${category} escalate=${needsEscalation}${fallbackReason ? ` reason=${fallbackReason}` : ''} model=${modelName}`);

    res.status(200).json({ success: true, text, source, category, needsEscalation, fallbackReason });
  } catch (err) {
    console.error('chatbot error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
