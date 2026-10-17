// KAI's scope rules on the device: an exact copy of api/chatbot.js's rules
// (api/_lib/chatbotRules.js), so a blocked or personal-schedule question is
// answered instantly and identically even offline. Keep the two in step:
// scripts/test-chatbot-scope.mjs runs the same prompts against both.
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
//   'personal_info' the user's own name / MRN / contact details: KAI cannot
//                  look them up; it says which screen shows them
//   'vague'        a message that is neither medical nor clearly in scope
//                  ("hello", "help", "?", "hmm"): KAI asks what the user
//                  needs and lists what it can help with. A medical word on
//                  its own ("rabies", "vaccine", "dose") is 'clinical'.
// Only 'clinical' replies mention Talk to clinic staff; no reply ever opens
// the staff pop-up by itself (the app opens it only when the user taps it).

const norm = (t: unknown): string => String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

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
  /\b(feel\w*\s+(wrong|sick|bad|unwell|ill|dizzy|weak|off|strange|weird)|not\s+feeling\s+well|unwell|dizzy|nahihilo|masama\s+ang\s+pakiramdam)\b/,
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


// ── Medical vocabulary (with misspellings) ──────────────────────────────────
// Diseases and conditions, symptoms, medicines and drug names, vaccines and
// treatments. Any word within a small spelling distance of one of these
// ("pnuemonia", "paracetmol") counts, in any letter case, so medical
// detection does not depend on an exact keyword list. Short words (4 letters
// or fewer) must match exactly, so ordinary words are never mistaken.
export const MEDICAL_TERMS = [
  // diseases and conditions
  'pneumonia', 'pneumococcal', 'dengue', 'covid', 'coronavirus', 'influenza', 'flu', 'tuberculosis', 'tb',
  'hepatitis', 'measles', 'chickenpox', 'mpox', 'monkeypox', 'smallpox', 'malaria', 'cholera', 'typhoid',
  'leptospirosis', 'diabetes', 'hypertension', 'asthma', 'cancer', 'tumor', 'stroke', 'anemia', 'allergy',
  'allergic', 'infection', 'infected', 'virus', 'viral', 'bacteria', 'bacterial', 'disease', 'illness',
  'sickness', 'sick', 'ill', 'pregnancy', 'pregnant', 'tetanus', 'lockjaw', 'rabies', 'rabid', 'hiv', 'aids',
  'pneumonitis', 'bronchitis', 'sinusitis', 'tonsillitis', 'conjunctivitis', 'dermatitis', 'eczema', 'psoriasis',
  'ulcer', 'gastritis', 'appendicitis', 'arthritis', 'gout', 'migraine', 'epilepsy', 'seizure', 'convulsion',
  // symptoms
  'fever', 'lagnat', 'headache', 'migraine', 'pain', 'painful', 'ache', 'aching', 'sore', 'swelling', 'swollen',
  'itch', 'itchy', 'itching', 'rash', 'rashes', 'cough', 'coughing', 'colds', 'sneezing', 'vomit', 'vomiting',
  'nausea', 'diarrhea', 'diarrhoea', 'dizzy', 'dizziness', 'fatigue', 'weakness', 'numb', 'numbness', 'tingling',
  'bleeding', 'blood', 'bruise', 'bruising', 'inflammation', 'inflamed', 'redness', 'pus', 'chills', 'shivering',
  'breathless', 'wheezing', 'palpitations', 'insomnia', 'symptom', 'symptoms', 'sintomas', 'masakit', 'sakit',
  // medicines and drug names
  'medicine', 'medicines', 'medication', 'medications', 'drug', 'drugs', 'pill', 'pills', 'tablet', 'tablets',
  'capsule', 'syrup', 'ointment', 'cream', 'antibiotic', 'antibiotics', 'antiviral', 'painkiller', 'analgesic',
  'paracetamol', 'acetaminophen', 'ibuprofen', 'mefenamic', 'aspirin', 'amoxicillin', 'amoxicilin', 'cefalexin',
  'cephalexin', 'azithromycin', 'ciprofloxacin', 'metronidazole', 'cetirizine', 'loratadine', 'antihistamine',
  'biogesic', 'neozep', 'bioflu', 'decolgen', 'alaxan', 'tempra', 'calpol', 'betadine', 'povidone', 'hydrogen',
  'peroxide', 'vitamin', 'vitamins', 'supplement', 'steroid', 'insulin', 'gamot', 'reseta', 'prescription',
  // vaccines and treatments
  'vaccine', 'vaccines', 'vaccination', 'vaccinated', 'immunization', 'booster', 'dose', 'doses', 'dosage',
  'injection', 'shot', 'shots', 'jab', 'immunoglobulin', 'antiserum', 'serum', 'toxoid', 'treatment', 'therapy',
  'surgery', 'operation', 'stitches', 'suture', 'bandage', 'dressing', 'diagnosis', 'diagnose', 'cure', 'remedy',
  'bakuna', 'turok', 'pep', 'prep', 'erig', 'rig', 'verorab', 'rabipur', 'speeda',
];
// Body parts count only with a health word next to them ("my arm hurts",
// "swollen hand"); on their own they are not medical.
const BODY_PARTS_RE = /\b(head|eye|eyes|ear|ears|nose|mouth|throat|neck|chest|stomach|belly|tummy|back|arm|arms|hand|hands|finger|fingers|leg|legs|knee|foot|feet|toe|toes|skin|face|lip|lips|tooth|teeth|heart|lungs?|ulo|mata|tiyan|kamay|paa|braso|binti)\b/;
const HEALTH_CONTEXT_RE = /\b(hurt\w*|pain\w*|ache\w*|sore|swell\w*|swollen|itch\w*|red|bleed\w*|bruis\w*|numb\w*|burn\w*|cut|broken|injur\w*|infect\w*|masakit|sakit|namamaga|makati)\b/;

// Optimal string alignment distance (insertions, deletions, substitutions,
// and swapping two neighbouring letters), stopping early past `max`.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const EXACT_TERMS = new Set(MEDICAL_TERMS);
const FUZZY_TERMS = MEDICAL_TERMS.filter(t => t.length >= 6);
// Ordinary words that sit one letter away from a medical term.
const NOT_MEDICAL = new Set(['clinic', 'clinics', 'cancel', 'cancels', 'sicker', 'doesn', 'hosting', 'shout', 'shoot', 'serve', 'served', 'service', 'services', 'payment', 'treated', 'booking', 'booked', 'schedule', 'available', 'address', 'contact', 'located', 'location', 'thanks', 'hours', 'appointment', 'appointments', 'tomorrow', 'weekend', 'weekends', 'saturday', 'sunday', 'monday', 'friday', 'website', 'account', 'password', 'profile', 'notification', 'notifications', 'register']);

/** True when the message names a disease, symptom, medicine, vaccine or treatment (spelling-tolerant). */
export function mentionsMedical(q: string): boolean {
  const words = q.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  if (BODY_PARTS_RE.test(q) && HEALTH_CONTEXT_RE.test(q)) return true;
  return words.some(w => {
    if (EXACT_TERMS.has(w)) return true;
    if (w.length < 6 || NOT_MEDICAL.has(w)) return false;
    const max = w.length >= 8 ? 2 : 1;
    return FUZZY_TERMS.some(t => Math.abs(t.length - w.length) <= max && editDistance(w, t, max) <= max);
  });
}

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

// The user's own name, MRN or contact details ("what is my name"). KAI does
// not read records; it points to the screen that shows them.
export const PERSONAL_INFO_PATTERNS = [
  /\b(what('?s|\s+is|\s+are)|tell\s+me|give\s+me|show\s+me|do\s+you\s+know|ano\s+(ang|yung)|anong)\b.*\bmy\s+(name|full\s+name|first\s+name|last\s+name|surname|mrn|medical\s+record\s+number|patient\s+(id|number)|email|e-mail|address|contact\s*(number|details)?|phone(\s+number)?|birthday|birth\s*date|date\s+of\s+birth|age|details|info\w*|account)\b/,
  /\bwho\s+am\s+i\b/,
  /^my\s+(name|mrn|email|age|birthday|address|phone|contact\s+number)\??$/,
  /\b(ano|anong)\s+(ang\s+)?(pangalan|mrn|edad|email|address)\s+ko\b/,
];

// Allowed topics.
export const GREETING_RE = /^(hi|hello|hey|good\s*(morning|afternoon|evening|day)|greetings?|kumusta|kamusta|maayong\s+(aga|hapon|banggi)|magandang\s+(umaga|hapon|gabi)|howdy|yo)\b/;
export const THANKS_RE = /^(thanks?|thank\s+you|salamat|dios\s+mabalos|ok(ay)?|sige|bye|goodbye|paalam)\b[\s!.]*$/;
export const HOURS_RE = /\b(hours?|open|opening|close|closed|closing|what\s+time|anong\s+oras|oras|walk-?ins?|weekends?|weekdays?|saturday|sunday|monday|holiday|lunch|bukas\s+ba|sarado)\b/;
export const BOOKING_RE = /\b(book\w*|appointment|appointments|appt|reschedul\w*|cancel\w*|slots?|reserv\w*|availab\w*|magpa-?schedule|magpa-?book|mag-?book)\b/;
export const CONTACT_RE = /\b(address|location|located|where\s+(are|is)\s+(you|the\s+clinic|k&a)|directions?|contact|phone|number|telephone|call|email|e-mail|reach\s+you|saan|nasaan|hain)\b/;
export const SERVICES_RE = /\b(services?|serbisyo|what\s+(do\s+you|does\s+the\s+clinic)\s+(offer|provide|have|carry|give)|what\s+(are\s+the\s+|your\s+)?(vaccines?|services?)(\s+(and|or|\/|at|tsaka)\s+(the\s+)?(services?|vaccines?))?(\s+(do\s+you|does\s+the\s+clinic)\s+(have|offer|provide|carry|give)|\s+(are\s+)?(available|offered|provided)|(\s+(ang\s+)?(meron|mayroon|na\s+meron)))?|do\s+you\s+(offer|have|provide|give|carry)\s+(anti-?rabies\s+|rabies\s+|anti-?tetanus\s+|tetanus\s+|pneumonia\s+|pneumococcal\s+|hepatitis\s+|hepa\s+|verorab\s*|speeda\s*|rabipur\s*|erig\s*|rig\s*|ats\s*|toxoid\s*)?(vaccines?|vaccinations?|shots?|bakuna)?|(available|list\s+of)\s+(vaccines?|services?|bakuna|serbisyo)|(vaccines?|services?|bakuna|serbisyo)\s+(available|list|offered)|(vaccines?\s+(and|or|\/|at|tsaka)\s+services?|services?\s+(and|or|\/|at|tsaka)\s+vaccines?)|(bakuna\s+(at|o)\s+serbisyo|serbisyo\s+(at|o)\s+bakuna)|anong\s+(mga\s+)?(serbisyo|bakuna)\s+(meron|mayroon|ang\s+meron)|(meron|mayroon)\s+(ba\s+)?(kayong\s+|ng\s+)?(anti-?rabies|rabies|verorab|speeda|rabipur|tetanus|anti-?tetanus|pneumonia|erig|rig|bakuna)|available\s+ba\s+(ang\s+)?(verorab|speeda|rabipur|anti-?rabies|tetanus|pneumonia|erig|rig|bakuna))\b/;
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
export type ScopeCategory = 'in_scope' | 'personal_nav' | 'personal_info' | 'vague' | 'clinical' | 'out_of_scope';

export function classifyMessage(text: string): ScopeCategory {
  const q = norm(text);
  if (!q) return 'in_scope';
  // 1. Missed doses, wounds, symptoms, advice: blocked, whatever else the
  //    message asks.
  // ("forgot my password" is an account question, not a missed dose.)
  const accountOnly = /\b(password|passcode|log\s*-?\s*in|login|sign\s*-?\s*in|mrn|account|otp|verification\s+code)\b/.test(q)
    && !mentionsMedical(q) && !BLOCKED_DOMAIN.some(re => re.test(q));
  if (!accountOnly && BLOCKED_STRICT.some(re => re.test(q))) return 'clinical';
  // 2. The patient's own schedule / doses / status: navigation only.
  if (PERSONAL_SCHEDULE_PATTERNS.some(re => re.test(q))) return 'personal_nav';
  // 2b. The user's own name / MRN / contact details: say where they are shown.
  if (PERSONAL_INFO_PATTERNS.some(re => re.test(q))) return 'personal_info';
  // 3. "Which services / vaccines do you offer?" names services only: allowed
  //    when nothing medical is left once the services phrase is set aside.
  if (SERVICES_RE.test(q)) {
    const rest = q.replace(SERVICES_RE, ' ').replace(/\b(vaccines?|vaccinations?|bakuna|services?|serbisyo|and|or|at|tsaka|mga|do|you|the|clinic|offer|have|provide|carry|give|available|list|of|anong?|ano|meron|mayroon|ba|kayo|kayong|sa|ang|ng|is|are|there|your|what|anti-?rabies|rabies|verorab|speeda|rabipur|tetan\w*|anti-?tetano|pneumo\w*|erig|rig|ats|toxoid|hepatitis|hepa)\b/g, ' ');
    if (!BLOCKED_DOMAIN.some(re => re.test(rest)) && !mentionsMedical(rest)) return 'in_scope';
  }
  // 3b. Pricing inquiries: "How much does a visit cost?", "How much is the anti-rabies vaccine?", "Price of treatment"
  if (PRICE_RE.test(q)) {
    const rest = q.replace(PRICE_RE, ' ').replace(/\b(vaccin\w*|bakuna|shot|shots|dose|doses|treatment|gamutan|rabies|anti-?rabies|pep|prep|tetan\w*|anti-?tetano|pneumo\w*|hepatitis|hepa|visit|session|sessions|for|of|the|a|an|in|at|ng|sa|ang|is|are|it|po)\b/g, ' ');
    if (!BLOCKED_DOMAIN.some(re => re.test(rest)) && !mentionsMedical(rest)) return 'in_scope';
  }
  // 4. Rabies, vaccines, doses, regimens, even as a single word: blocked.
  if (BLOCKED_DOMAIN.some(re => re.test(q)) || mentionsMedical(q)) return 'clinical';
  // 5. Allowed topics. A greeting with nothing else gets the "tell me more"
  //    reply, which lists what KAI can help with.
  if (THANKS_RE.test(q)) return 'in_scope';
  if (GREETING_RE.test(q) && !(HOURS_RE.test(q) || BOOKING_RE.test(q) || CONTACT_RE.test(q) || SERVICES_RE.test(q) || PRICE_RE.test(q) || APP_NAV_RE.test(q))) return 'vague';
  if (HOURS_RE.test(q) || BOOKING_RE.test(q) || CONTACT_RE.test(q) || SERVICES_RE.test(q) || PRICE_RE.test(q) || APP_NAV_RE.test(q)) return 'in_scope';
  // 6. Clearly unrelated small talk.
  if (OUT_OF_SCOPE_PATTERNS.some(re => re.test(q))) return 'out_of_scope';
  // 7. A bare date is a scheduling question ("Sept 27?").
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b(today|tomorrow|bukas)\b/.test(q) && q.length <= 40) return 'in_scope';
  // 8. Unsure: ask what the user needs. The reply lists only allowed topics,
  //    so nothing medical is said either way.
  return 'vague';
}

// ── Fixed replies ───────────────────────────────────────────────────────────
// The one disclaimer sentence, used wherever KAI states it.
export const DISCLAIMER =
  'This chatbot does not provide medical advice. For urgent or medical concerns, contact the clinic or a licensed healthcare professional.';

// Formatting rule for every fixed reply: only a reply's title line is bold.
// List items, numbered steps and sentences are plain text, so bold is never
// partial within an item and never splits across lines.

// One neutral reply for every blocked topic: no medical content, no
// emergency instructions, no advice. The app also shows its "Talk to clinic
// staff" button (the pop-up opens only when the user taps it).
export const BLOCKED_REPLY =
  `I can't answer medical questions. ${DISCLAIMER} ` +
  `You can reach the clinic at ${CLINIC.phone} or ${CLINIC.email}.`;
export const BLOCKED_REPLY_APP =
  `I can't answer medical questions. ${DISCLAIMER} If you'd like to reach the clinic, tap Talk to clinic staff.`;

export const PERSONAL_NAV_REPLY_APP =
  'You can see your vaccination schedule on the Home screen under your vaccination card. ' +
  'Tap Open my vaccination card below to go there.';
export const PERSONAL_NAV_REPLY_PUBLIC =
  'Your vaccination schedule is in the K&A Clinic patient app: sign in, then look on the Home screen under your vaccination card.';

export const OUT_OF_SCOPE_REPLY =
  "That's outside what I can help with. I can help with clinic information, office hours, contact details, " +
  'appointments, and using the app.';

export const PERSONAL_INFO_REPLY_APP =
  "I can't look up your personal details. I can help with clinic information, office hours, contact details, appointments, and using the app.\n\n" +
  'Your name, MRN and date of birth are on your vaccination card on the Home screen, and your contact details are under Account → Personal Information.';
export const PERSONAL_INFO_REPLY_PUBLIC =
  "I can't look up your personal details. I can help with clinic information, office hours, contact details, appointments, and using the app. " +
  'Your details are in the K&A Clinic patient app: sign in and check your vaccination card on the Home screen.';

export const VAGUE_REPLY =
  'Could you tell me a little more about what you need? I can help with:\n' +
  '• Clinic hours and walk-in days\n' +
  '• Booking or cancelling an appointment\n' +
  '• Clinic location and contact details\n' +
  '• Finding something in the app';

export const THANKS_REPLY = "You're welcome. Is there anything else about the clinic or the app I can help with?";

export const HOURS_REPLY =
  '🏥 **K&A Clinic office hours**\n' +
  '• Monday to Friday: walk-in, 8:00 AM – 5:00 PM\n' +
  '• Saturday and Sunday: by appointment, 8:00 AM – 5:00 PM\n' +
  '• Lunch break: 12:00 – 1:00 PM\n' +
  `• Address: ${CLINIC.address}`;

export const CONTACT_REPLY =
  `📍 **${CLINIC.name}**\n` +
  `• Address: ${CLINIC.address}\n` +
  `• Phone: ${CLINIC.phone}\n` +
  `• Email: ${CLINIC.email}\n` +
  '• Hours: Monday to Friday walk-in, Saturday and Sunday by appointment, 8:00 AM – 5:00 PM (lunch 12:00 – 1:00 PM)';

export const SERVICES_REPLY =
  '🏥 **Vaccines & Services at K&A Clinic**\n\n' +
  '💉 **Vaccines Offered:**\n' +
  '• Anti-Rabies Vaccines (Verorab, Speeda, Rabipur)\n' +
  '• Rabies Immunoglobulin (RIG / ERIG)\n' +
  '• Anti-Tetanus Vaccines (Tetanus Toxoid, ATS)\n' +
  '• Pneumococcal (Pneumonia) Vaccine\n\n' +
  '🩺 **Clinical Services:**\n' +
  '• Post-Exposure Prophylaxis (PEP) after animal bites & scratches\n' +
  '• Pre-Exposure Prophylaxis (PrEP) preventive immunization\n' +
  '• Anti-Tetanus prophylaxis & immunization\n' +
  '• Rabies Immunoglobulin (RIG) administration\n' +
  '• Animal bite consultation & exposure assessment\n\n' +
  'Notice: K&A Clinic is no longer catering or offering Hepatitis vaccines. ' +
  `For questions or consultation, contact the clinic at ${CLINIC.phone} or ${CLINIC.email}.`;

// Vaccine & treatment pricing at K&A Clinic
export const PRICE_REPLY =
  '💉 **K&A Clinic Vaccine Pricing**\n' +
  '• PEP Category 2 (with Anti-Tetanus): ₱1,000 for the 1st session, and ₱800 for each of the next 3 sessions\n' +
  '• PEP Category 3: ₱4,500 for 4 sessions (complete package includes Anti-Tetanus and IRIG)\n' +
  '• Pneumonia Vaccine: ₱4,500\n\n' +
  `Notice: K&A Clinic is no longer catering or offering Hepatitis vaccines. For other questions, contact the clinic front desk at ${CLINIC.phone} or ${CLINIC.email}.`;

// Matches the app's booking flow (patient-app/app/(tabs)/appt.tsx): the
// Appointments tab, the Book Appointment calendar (weekends only), the
// Pick a Time Slot pop-up (TIME_SLOTS: hourly 8:00 AM – 5:00 PM, none from
// 12:00 to 1:00 PM) and Next, the Patient Details form, Request Appointment,
// and My Appointments. The website does not take bookings; it points to the
// patient app.
export const BOOKING_REPLY =
  '📅 **How to book an appointment**\n' +
  '1. Open the Appointments tab at the bottom of the screen.\n' +
  '2. In the Book Appointment calendar, tap a highlighted Saturday or Sunday. Weekdays are walk-in, no booking needed.\n' +
  '3. Pick an available time slot and tap Next. There is one patient per hourly slot, 8:00 AM to 5:00 PM, with no slots from 12:00 to 1:00 PM.\n' +
  '4. Check your patient details, choose the appointment type, and add patient notes if you like.\n' +
  '5. Tap Request Appointment. It shows as Pending until the clinic confirms it.\n' +
  '6. Track it under My Appointments, where you can also request a cancellation.\n\n' +
  'The clinic website does not take bookings; it points you to this app.';

export const APP_NAV_REPLY =
  '📱 **Finding your way around the app**\n' +
  '• Home: your vaccination card (tap it to flip, or Enlarge Card to save a copy) and your dose timeline\n' +
  '• Appointments: book, view or cancel weekend appointments\n' +
  '• Chat: KAI, or Talk to clinic staff\n' +
  '• Account: profile photo, contact details, notifications, signed-in devices\n\n' +
  'Sign in with your Medical Record Number (MRN) and password; use Forgot Password on the login screen if needed.';

// A booking question about a particular day or open slots: answered from
// live availability (server), not the how-to steps.
const BOOKING_LIVE_RE = /\d|\b(availab\w*|vacant|free|open|left|remaining|slots?|today|tomorrow|bukas|weekend|saturday|sunday|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\b/;

/** The fixed reply for an allowed topic, or null to let the server decide (live slots / model). */
export function fixedInScopeReply(text: string): string | null {
  const q = norm(text);
  if (THANKS_RE.test(q)) return THANKS_REPLY;
  if (PRICE_RE.test(q)) return PRICE_REPLY;
  if (SERVICES_RE.test(q)) return SERVICES_REPLY;
  if (CONTACT_RE.test(q)) return CONTACT_REPLY;
  if (APP_NAV_RE.test(q) && !BOOKING_RE.test(q)) return APP_NAV_REPLY;
  if (HOURS_RE.test(q) && !BOOKING_RE.test(q)) return HOURS_REPLY;
  if (BOOKING_RE.test(q) && !BOOKING_LIVE_RE.test(q)) return BOOKING_REPLY;
  return null;
}

// Final check on any model-written reply: if it drifted into medical
// content, schedules, or advice, it is replaced with the blocked reply.
export const MEDICAL_OUTPUT_RE = /\b(day\s*0|day\s*3|day\s*7|day\s*14|day\s*28|regimen|wound|rabies|vaccinat\w*\s+(schedule|course|series)|dose\s+schedule|immunoglobulin|tetanus|category\s*(i{1,3}|[123])|symptom|fever|treatment|medicine|medication|first\s*aid|emergency|nearest\s+(hospital|animal\s+bite|abtc|er)|consult\s+a\s+(doctor|physician))\b/i;
