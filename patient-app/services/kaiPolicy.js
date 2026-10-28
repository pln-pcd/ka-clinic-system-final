import { clinicKnowledge, kaiCopy } from './kaiKnowledge.js';

export { clinicKnowledge, kaiCopy };

const normalize = text => String(text || '').normalize('NFKC').replace(/[’‘]/g, "'").trim();
const TAGALOG = /\b(po|opo|ako|ko|kong|ka|kayo|ninyo|niyo|mo|namin|natin|si|sino|ano|anong|paano|pano|kailan|kelan|saan|nasaan|magkano|presyo|bayad|oras|bukas|ngayon|mamaya|samakalawa|ba|pa|ang|ng|sa|may|meron|wala|puwede|pwede|gusto|salamat|kumusta|kamusta|pakitingnan|pakisabi|nakalimutan|susunod|turok|bakuna|rabis|sabado|linggo|lunes|martes|miyerkules|miyerkoles|huwebes|biyernes|pangalan|nakagat|kagat|sugat|kalmot|lagnat|buntis|gamot|tulong|serbisyo)\b/i;
// Common app/clinic loanwords (appointment, slot, vaccine card, Home, etc.) do
// not by themselves turn a Filipino sentence into Taglish.
const ENGLISH = /\b(hello|hi|hey|what|who|how|when|where|why|which|please|thanks|thank|your|my|you|i|can|could|would|should|is|are|do|does|did|have|need|want|help|open|available|hours|price|cost|with|for|today|tomorrow|next)\b/i;

export function detectLanguage(text) {
  const q = normalize(text);
  return TAGALOG.test(q) ? (ENGLISH.test(q) ? 'taglish' : 'tl') : 'en';
}

const PRICING = /\b(price|prices|pricing|costs?|fees?|rates?|how much|magkano|presyo|bayad|packages?)\b|₱/i;
const SERVICES = /\b(services?|serbisyo|anong (?:mga )?bakuna|what (?:vaccines?|vaccinations?)(?: do you)? (?:have|offer|provide)|(?:available|offered) vaccines?|vaccine (?:list|types|options)|(?:do you|may|meron|mayroon).{0,25}(?:offer|provide|carry|pep|prep|pneumonia|pneumococcal|tetanus|bakuna)|(?:offer|provide|carry).{0,20}(?:vaccin|pep|prep|pneumonia|tetanus))\b/i;
const OFF_TOPIC = /\b(weather|forecast|rain|typhoon|lebron|nba|basketball|football|soccer|sports?|celebrit\w*|movies?|songs?|music|k-?pop|homework|assignment|essay|math|algebra|calculus|coding|programming|python|javascript|politics?|president|election|senator|jokes?|riddles?|crypto|bitcoin|stocks?|recipes?|adobo|sinigang|shabu|marijuana|cocaine|illegal|hack(?:ing)?|scam|porn\w*|gambling|casino)\b/i;
const HARD_CLINICAL = [
  /\b(bites?|bitten|bit|scratche?s?|scratched|lick(?:s|ed)?|wounds?|bleed\w*|puncture|kagat|nakagat|kinagat|kalmot|nakalmot|dinilaan|dilaan|laway|sugat|dugo|nagdurugo|aso|pusa|hayop|dogs?|cats?|pupp(?:y|ies)|kittens?|bats?|animals?)\b/i,
  /\b(symptoms?|medical advice|medikal|diagnos\w*|treat\w*|cure|therapy|risk|serious|safe|normal|dangerous|infect\w*|fever\w*|swelling|redness|pain|rash|numbness|hydrophobia|paralysis|seizure|lagnat|namamaga|masakit|maselan|delikado|ligtas|nana|pamamaga|sintomas|sakit|hapdi|pamamanhid|may rabis)\b/i,
  /\b(first[- ]?aid|wound care|wash|hugasan|linisin|lunas|gamot|gagamot|medicines?|medication|side[- ]?effects?|allerg\w*|pregnan\w*|buntis|breastfeed\w*|nagpapasuso|emergenc\w*|ospital|hospitals?|nearest|lab(?:oratory)?|results?|pills?|paracetamol|ibuprofen|amoxicillin|aspirin|antibiotics?|betadine)\b/i,
  /\b(regimens?|protocols?|dosage|intradermal|intramuscular|immunoglobulin|irig|erig|hrig|booster|day\s*\d+|araw\s*(?:na\s*)?\d+|(?:pep|prep|vaccine|vaccination|dose|bakuna|turok)\s+(?:days?|regimen))\b/i,
  /\b(?:ano gagawin|anong gagawin)\b/i,
];
const MEDICAL_DOMAIN = /\b(rabies|rabis|rabid|vaccin\w*|bakuna|turok|doses?|shots?|jabs?|inject\w*|iniksyon|ineksyon|syringes?|needles?|karayom|anti-?rabies|pep|prep|tetanus|pneumonia|pneumococcal|exposure|categor(?:y|ies)|triage)\b/i;
const DATE_WORD = /\b(today|tomorrow|tonight|ngayon|mamaya|samakalawa|sunday|monday|tuesday|wednesday|thursday|friday|saturday|linggo|lunes|martes|miyerkules|miyerkoles|huwebes|biyernes|sabado)\b|\b20\d\d-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\b/i;
const AVAILABILITY = /\b(slots?|availability|available appointments?|available times?|vacant|bakante|may appointment|may schedule|anong petsa|what dates?|what times? (?:are )?(?:left|available))\b/i;
// "Who is ...?" about anyone but KAI itself.
const PERSON = /(?:^|[^\p{L}])(?:who\s+(?:is|was|are|were)|who's|sino\s+(?:po\s+|ba\s+)*(?:si|sina|ang|yung|iyong)|kilala\s+mo\s+ba)\s+(?!(?:you|kai|ka|this\s+(?:app|chatbot|assistant))\b)/iu;
const STAFF_PEOPLE = /\b(?:nurses?|nars|doctors?|doktor|physicians?|vaccinators?|midwi(?:fe|ves)|(?:staff|employees?|workers?)(?:'s)?\s+names?|names?\s+of\s+(?:the\s+)?(?:staff|employees?|workers?)|pangalan\s+ng\s+(?:staff|empleyado))\b/i;
const CREATOR = /\b(?:who|sino)\b.{0,25}(?:creat|made|make|built|develop|gumawa|program)|\b(?:developers?|creators?|programmers?|gumawa|capstone|bu polangui|bicol university)\b/i;
const APP_NAME = /\b(?:name\s+of\s+(?:the\s+|this\s+)?(?:app|application)|(?:app|application)(?:'s)?\s+name|(?:what|which)\s+app\s+is\s+this|anong\s+app\s+(?:ito|to)|pangalan\s+ng\s+(?:app|application))\b/i;
// Attempts to switch KAI's rules off. Refused with fixed copy and never sent to the model.
const OVERRIDE = /\b(?:ignore|forget|disregard|bypass|override|skip|break|remove|disable|turn\s+off|kalimutan|balewalain|huwag\s+(?:mong\s+)?sundin)\b.{0,40}\b(?:rules?|instructions?|restrictions?|limits?|limitations?|guidelines?|policy|policies|prompt|filters?|patakaran|utos|bawal)\b|\b(?:no|without|walang)\s+(?:more\s+)?(?:rules?|restrictions?|limits?|filters?|patakaran)\b|\b(?:jailbreak\w*|dan\s+mode|developer\s+mode|god\s+mode|unrestricted|unfiltered|system\s+prompt|your\s+(?:instructions|prompt|rules)|pretend\s+(?:you(?:'re|\s+are)|to\s+be)|act\s+as|role-?play|you\s+are\s+now|from\s+now\s+on\s+you)\b/i;
const CLINIC_TOPIC = /\b(clinic|klinika|parking|requirements?|requirements|payment|gcash|maya|cash|contact|phone|telephone|number|email|address|location|directions?|map|app|account|mrn|appointment|appts|booking|staff|walk[- ]?in|vaccination card)\b/i;

export function containsPersonalDetails(text) {
  const q = normalize(text);
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(q) || /(?:\+?63[\s-]*|0)9(?:[\s().-]*\d){9}\b/.test(q)
    || /\b(?:MRN[- :]*\d[\d-]*|20\d\d-\d{3,})\b/i.test(q)
    || /\b(?:\d[\s().-]*){10,}\b/.test(q)) return true;
  if (/\bmy name's\s+\S|\bpangalan ko(?:\s+ay|\s*:)?\s+(?!(?:ba|po|sa|nga|naman)\b)[\p{L}]+/iu.test(q)) return true;
  if (/\b(?:my (?:name|email|phone|address|mrn|number|birthday|date of birth) is|(?:pangalan|numero|tirahan|kaarawan) ko(?: ay|:)\s*\S|ako si|i live (?:at|in)|(?:i am|i'm)\s+\d+\s*(?:years? old|y\/?o)|(?:name|pangalan|address|mrn|email|phone)\s*:\s*\S|(?:i am|i'm|this is|call me)\s+(?!kai\b|(?:a |an )?(?:patient|user|looking|asking|trying|pregnant|sick|allergic|worried|having|feeling|bleeding|bitten|not|at|in|on|from)\b)[a-z]+(?:\s+[a-z]+){0,3})\b/i.test(q)) return true;
  // Names typed alone, or following a greeting. Do not mistake ordinary
  // questions or known clinic terms for a person's name.
  const bare = q.replace(/^(?:hello|hi|hey|kumusta|kamusta)[,!\s]+/i, '').split(/[,.!?]/)[0].trim();
  const known = /\b(clinic|kai|hello|hi|good|morning|afternoon|evening|thank|thanks|salamat|kumusta|kamusta|pep|prep|vaccine|vaccination|pneumonia|tetanus|rabies|rabis|dose|bakuna|what|when|where|who|how|my|please|appointment|account|forgot|password|medical|record|number|home|records|services|rates|hours|contact|talk|staff|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|sabado|linggo|lunes|martes|miyerkules|huwebes|biyernes|reschedul\w*|cancel\w*|login|logout|signup|register|registration|profile|notifications?|capstone|developer|creator|programmer|yes|no|ok|okay|okey|oks|sige|noted|done|good|nice|cool|great|wow|sorry|hmm+|huh|test|testing|menu|settings?|photos?|pic|pictures?|sched|notifs?|sign\s?out|log\s?out|help|card|cards|tabs?|sure|again|why|bakit|ano|paano|pano)\b/i;
  return !known.test(bare) && !ENGLISH.test(bare) && !MEDICAL_DOMAIN.test(bare) && !TAGALOG.test(bare) && !CLINIC_TOPIC.test(bare) && !AVAILABILITY.test(bare)
    && !OFF_TOPIC.test(bare) && !HARD_CLINICAL.some(re => re.test(bare))
    && /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,4}$/u.test(bare);
}

function priceReply(q, language) {
  const copy = kaiCopy[language];
  const lines = [];
  if (/\bprep\b/i.test(q)) lines.push(copy.prepRate);
  if (/\b(?:anti[- ]?)?tetanus\b/i.test(q) && !/\bpep\b/i.test(q)) lines.push(copy.tetanusRate);
  if (/\b(flu|hepatitis|hpv|covid|measles)\b/i.test(q)) return copy.unknown;
  const pneumo = /\b(pneumonia|pneumococcal)\b/i.test(q);
  const pep = /\bpep\b/i.test(q) || /\b(?:cat(?:egory)?\s*)?(?:ii|iii|2|3)\b/i.test(q);
  const all = !lines.length && !pneumo && !pep;
  if (all && q.replace(/\b(?:hi|hello|hey|what|are|is|the|your|clinic|k&a|how|much|price|prices|pricing|costs?|fees?|rates?|rate|of|for|a|an|vaccine|vaccines|vaccination|vaccinations|anti[- ]?rabies|rabies|bakuna|magkano|po|ang|mga|sa|ba|presyo|bayad|package|packages|lahat|all|total|everything|list|services?|serbisyo|nyo|ninyo|niyo|kayo)\b|[₱\s?.,!&]/gi, '').trim()) return copy.unknown;
  const r = clinicKnowledge.rates;
  const money = n => `₱${n.toLocaleString('en-PH')}`;
  if (all || pep) {
    if (all || !/\b(?:iii|3)\b/i.test(q) || /\b(?:ii|2)\b/i.test(q)) {
      lines.push(language === 'tl'
        ? `PEP Category II: ${money(r.pepII.first)} sa unang session, at ${money(r.pepII.following)} sa bawat isa sa susunod na tatlong session (kasama ang Anti-tetanus).`
        : language === 'taglish'
          ? `PEP Category II: ${money(r.pepII.first)} for the first session, at ${money(r.pepII.following)} bawat next session sa tatlong kasunod (with Anti-tetanus).`
          : `PEP Category II: ${money(r.pepII.first)} for the first session and ${money(r.pepII.following)} for each of the next three sessions (with Anti-tetanus).`);
    }
    if (all || !/\b(?:ii|2)\b/i.test(q) || /\b(?:iii|3)\b/i.test(q)) lines.push(`PEP Category III: ${money(r.pepIII)} ${language === 'tl' ? 'para sa buong package.' : language === 'taglish' ? 'for the complete package po.' : 'for the complete package.'}`);
  }
  if (all || pneumo) lines.push(`Pneumonia vaccine: ${money(r.pneumonia)}${language === 'taglish' ? ' po' : ''}.`);
  return lines.length > 1 ? lines.map(s => `• ${s}`).join('\n') : lines[0];
}

// Every reply is selected from clinic knowledge or fixed copy. No user text
// is interpolated into a reply or forwarded to a text-generation service.
export function getKaiDecision(text) {
  const raw = normalize(text);
  const q = raw.toLowerCase();
  const language = detectLanguage(raw);
  const copy = kaiCopy[language];
  const reply = (intent, value, category = 'in_scope', needsEscalation = false) => ({
    intent, language, text: value, category, needsEscalation,
    ...(category === 'clinical' ? { disclaimer: copy.disclaimer } : {}),
  });
  if (containsPersonalDetails(raw)) return reply('privacy', copy.privacy);
  if (OFF_TOPIC.test(q)) return reply('off_topic', copy.offTopic, 'out_of_scope');
  if (/\b(?:data|privacy|personal (?:info|information|details)|information|impormasyon|records?|account)\b.{0,25}\b(?:safe|secure|protected|private|ligtas)\b|\bwho can (?:see|view|access) my\b|\bsino (?:ang )?(?:makakakita|nakakakita)\b/.test(q)) return reply('data_privacy', copy.dataPrivacy);
  if (HARD_CLINICAL.some(re => re.test(q))) return reply('blocked', copy.blocked, 'clinical', true);
  if (OVERRIDE.test(q)) return reply('override', copy.override, 'out_of_scope');
  // KAI talks about the app only: never about people (public figures, the
  // app's makers, clinic staff, nurses or doctors).
  if (/\b(?:who|sino)\b.{0,25}\b(?:kakausapin|kausapin|tatawagan|lalapitan|sasagot|magre-?reply|(?:can|should|do) i (?:talk|speak|ask|contact|message)|will (?:reply|answer|respond))\b/.test(q)) return reply('staff', copy.staff, 'in_scope', true);
  if (PERSON.test(q) || STAFF_PEOPLE.test(q)) return reply('people', copy.people, 'out_of_scope');
  if (CREATOR.test(q)) return reply('creator', copy.notAnswerable, 'out_of_scope');

  if (/\b(?:who am i|sino ako|my (?:name|mrn|email|phone|contact|address)|(?:ano|saan).{0,20}(?:pangalan|mrn|email|numero|contact).{0,10}(?:ko|kong)|(?:name|mrn|email|numero|pangalan) ko)\b/.test(q)) return reply('own_details', copy.ownDetails);
  if (/\b(?:my (?:next |last |vaccination )?(?:dose|doses|shot|schedule|status)|(?:dose|doses|turok|schedule|status|bakuna) (?:ko|kong)|susunod (?:kong|na) (?:turok|dose|bakuna)|how many .{0,15}(?:have i|i have)|when .{0,15}(?:my|i am|am i))\b/.test(q) && /\b(dose|doses|shot|schedule|status|turok|bakuna|vaccination)\b/.test(q)) return reply('own_schedule', copy.ownSchedule);

  if (MEDICAL_DOMAIN.test(q) && /\b(?:schedules?|regimens?|days?)\b/.test(q) && !/\b(?:view|see|find|check|tingnan|makita)\b/.test(q)) return reply('blocked', copy.blocked, 'clinical', true);
  if (MEDICAL_DOMAIN.test(q) && /\b(?:need|should|take|skip|choose|kailangan|dapat|puwede|pwede|ilang|how many|for me|para sa akin)\b/.test(q)) return reply('blocked', copy.blocked, 'clinical', true);

  if (/^(?:pay|payment|payments)[?.!\s]*$/.test(q) || /\b(?:pay|payment|payments|magbayad|magbabayad|bayaran)\b.{0,30}\b(?:app|online|gcash|maya|card)\b|\b(?:app|online)\b.{0,20}\b(?:pay|payment|magbayad|bayad)\b/.test(q)) return reply('payment', copy.payment);
  if (PRICING.test(q)) return reply('rates', priceReply(q, language));
  if (SERVICES.test(q) && (/\b(?:services?|serbisyo)\b/.test(q) || !/\b(?:what is|explain|describe|paano gumagana|ano ang)\b/.test(q))) {
    return reply('services', clinicKnowledge.services.map(s => `• ${s}`).join('\n'));
  }
  // Viewing a card is app navigation; interpreting its contents is clinical.
  const cardHelp = /\b(?:view|see|find|export|download|save|tingnan|makita|i-download|i-export)\b/.test(q) && /\b(?:card|records?)\b/.test(q);
  if (cardHelp) return reply('records', copy.records);
  if (/\b(?:how|paano|pano|can i).{0,35}(?:book|magbook|mag-book|magpa-appointment|reserve)\b/.test(q) && !DATE_WORD.test(q) && !/\bbukas\b/.test(q)) return reply('booking', copy.booking);
  if (MEDICAL_DOMAIN.test(q)) return reply('blocked', copy.blocked, 'clinical', true);
  if (APP_NAME.test(q)) return reply('app_name', copy.appName);
  if (/\b(?:your name|name are you|who are you|pangalan mo|sino ka|(?:who|what)(?:'s|\s+is)\s+kai|(?:sino|ano)\s+(?:po\s+)?si\s+kai)\b/.test(q)) return reply('name', copy.name);
  if (/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening|day)|greetings|kumusta|kamusta)(?:\s+(?:po|kayo|kai|there))*[!?.\s]*$/.test(q)) return reply('greeting', copy.greeting);
  if (/^(?:thanks|thank you|salamat|maraming salamat)(?:\s+(?:po|kai))*[!?.\s]*$/.test(q)) return reply('thanks', copy.thanks);
  if (/^(?:ok|okay|okey|oks|k|sige|noted|yes|yup|no|nope|opo|oo|hindi|done|got it|alright|cool|nice|great)(?:\s+(?:po|kai|thanks|salamat))*[!?.\s]*$/.test(q)) return reply('ack', copy.ack);
  if (/^(?:help|tulong|hmm+|huh|test|testing|menu|\?+|ano|what|eh)(?:\s+(?:po|kai|me|please))*[!?.\s]*$/.test(q) || /\b(?:what can you do|what do you do|ano(?:ng)? (?:kaya|magagawa|maitutulong) mo|paano mo ako matutulungan)\b/.test(q)) return reply('help', copy.help);
  if (/\b(?:change|palitan|baguhin|update|i-?change)\b.{0,20}\bpassword\b|\bpassword\b.{0,12}\b(?:change|palitan|baguhin)\b/.test(q)) return reply('change_password', copy.changePassword);
  if (/\b(?:log\s?-?out|sign\s?-?out|mag-?logout|mag-?sign\s?out)\b/.test(q)) return reply('logout', copy.logout);
  if (/\b(?:notifications?|notifs?|abiso)\b/.test(q)) return reply('notifications', copy.notifications);
  if (/\b(?:height|weight|blood pressure|bp|timbang)\b/.test(q)) return reply('physical', copy.physical);
  if (/\b(?:appointments?|appt|booking)\b/.test(q) && /\b(?:status|confirmed|approved|accepted|pending|na-?confirm|kumpirmado|see|view|check|makita|malalaman|tingnan)\b/.test(q) && !/\b(?:cancel\w*|reschedul\w*|delete|book\s+an?)\b/.test(q)) return reply('appt_status', copy.apptStatus);
  if (/\b(?:forgot|forgotten|reset|nakalimutan).{0,25}(?:password)|\bforgot password\b/.test(q)) return reply('forgot_password', copy.forgot);
  if (/\b(?:delete|remove|erase|burahin|burahin|tanggalin|i-delete|idelete)\b/.test(q) && /\b(?:appointments?|appt|cancel\w*|kanselado)\b/.test(q)) return reply('delete', copy.deleteCancelled);
  if (/\b(?:cancel\w*|magkansela|pagkansela|kanselahin)\b/.test(q)) return reply('cancel', copy.cancel);
  if (/\b(?:reschedul\w*|magpa-reschedule)\b|\b(?:magpalit|palitan|baguhin|ilipat|change|move)\b.{0,20}\b(?:schedule|sched|appointment|appt|petsa|oras|date|time)\b/.test(q)) return reply('reschedule', copy.reschedule);
  if (/\b(?:how|paano|pano).{0,35}(?:book|magbook|mag-book|magpa-appointment|appointment|reserve)\b/.test(q)) return reply('booking', copy.booking);

  const hasDate = DATE_WORD.test(q) || bukasMeansTomorrow(q);
  if (AVAILABILITY.test(q) || hasDate) return { intent: 'availability', language, category: 'in_scope', needsEscalation: false };
  if (/\b(?:hours?|oras|open|opening|close|closing|sarado|bukas|magbubukas|nagbubukas|walk[- ]?in)\b/.test(q)) return reply('hours', /walk[- ]?in/.test(q) ? copy.walkIn : copy.hours);
  if (/\b(?:phone|telephone|number|email|contact)\b/.test(q) && !/\b(?:change|update|palitan|baguhin)\b/.test(q)) {
    const value = /\bemail\b/.test(q) ? clinicKnowledge.email : /\b(?:phone|telephone|number)\b/.test(q) ? clinicKnowledge.phone : null;
    return reply('contact', value || copy.unknown);
  }
  if (/\b(?:address|location|where|directions?|map|saan|nasaan)\b/.test(q)) return reply('location', `${language === 'en' ? 'The clinic is at' : language === 'tl' ? 'Nasa' : 'Located po ang clinic sa'} ${clinicKnowledge.address}${language === 'tl' ? ' po ang clinic.' : '.'}`);
  if (/\b(?:sign[- ]?up|register|registration|magrehistro)\b/.test(q)) return reply('signup', copy.signup);
  if (/\b(?:sign[- ]?in|log[- ]?in|login|password|otp|verification|mrn)\b/.test(q)) return reply('login', copy.login);
  if (/\b(?:account|profile|photos?|pic|pictures?|settings?|change|update|palitan|baguhin)\b/.test(q)) return reply('account', copy.account);
  if (/\b(?:talk|speak|connect|kausap|makipag-usap|staff|human)\b/.test(q)) return reply('staff', copy.staff, 'in_scope', true);
  if (/\b(?:records?|card)\b/.test(q)) return reply('records', copy.records);
  if (/\b(?:use|navigate|gamitin|app|tabs?|screens?)\b/.test(q)) return reply('navigation', copy.navigation);
  // Not matched by any rule above. The server's model may still answer it if
  // it turns out to be about the app or clinic ('unmatched'); explicit
  // off-topic subjects were already answered with the fixed reply.
  if (q.split(/\s+/).length <= 3 && /\b(?:appointments?|appt|booking|book|magbook|mag-book|sched|schedule)\b/.test(q)) return reply('booking', copy.booking);
  return CLINIC_TOPIC.test(q) ? reply('unknown', copy.unknown) : reply('unmatched', copy.offTopic, 'out_of_scope');
}

/**
 * "Bukas" means both "tomorrow" and "open". It is tomorrow when the sentence
 * is about slots, appointments, booking or a time of day ("may slot pa ba
 * bukas?", "para bukas", "bukas ng umaga"); it is open when it asks whether
 * the clinic is open ("bukas po ba kayo?", "bukas ba ang clinic?", "anong
 * oras kayo bukas?"). On its own it is read as tomorrow.
 */
export function bukasMeansTomorrow(text) {
  const q = normalize(text).toLowerCase();
  if (!/\bbukas\b/.test(q)) return false;
  if (/\b(?:slots?|appointments?|appt|schedule|iskedyul|book\w*|magpa-?book|magpa-?schedule|available|availability|bakante|vacant|reserve|para\s+bukas|bukas\s+ng\s+(?:umaga|hapon|gabi|tanghali)|ngayon\s+o\s+bukas|bukas\s+o\s+\w+)\b/.test(q)) return true;
  if (/\b(?:bukas\s+(?:po\s+)?(?:ba|pa|na|kayo|ang\s+(?:clinic|klinika))|(?:kayo|clinic|klinika)(?:\s+(?:ay|po|ba|pa))*\s+bukas|anong\s+oras\b.*\bbukas)\b/.test(q)) return false;
  return true;
}

export function availabilityFallback(language) {
  return { intent: 'availability', language, text: kaiCopy[language].unavailable, category: 'in_scope', needsEscalation: false };
}
