// KAI scope test: sample prompts (allowed + blocked, English / Filipino /
// Bikol, including tricky ones) with the category each must get.
//
//   node scripts/test-chatbot-scope.mjs
//
// Runs the server rules (api/_lib/chatbotRules.js) and the patient app's
// on-device copy (patient-app/services/chatbotRules.ts) against the same
// table, and checks that no fixed reply contains medical content. Exits 1 on
// any mismatch.
//
// Categories: in_scope (answered) · personal_nav (navigation only, no dates)
//             personal_info (own name / MRN / contact: says which screen)
//             vague (not medical, not in scope: asks what the user needs)
//             clinical (blocked, refusal + disclaimer) · out_of_scope
import * as server from '../api/_lib/chatbotRules.js';

let app = null;
try {
  app = await import('../patient-app/services/chatbotRules.ts');
} catch (err) {
  console.warn(`(patient-app rules not loaded: ${err.message})`);
}

export const CASES = [
  // ── 1.0.5 reply types (out of scope / vague / medical) ──
  ['what is my name', 'personal_info'],
  ['what is my MRN', 'personal_info'],
  ['vaccine', 'clinical'],
  ['rabies', 'clinical'],
  ['Rabies', 'clinical'],
  ['medicine', 'clinical'],
  ['dose', 'clinical'],
  ['booster', 'clinical'],
  ['bite', 'clinical'],
  ['PEP', 'clinical'],
  ['PrEP', 'clinical'],
  ['wound', 'clinical'],
  ['can i take medicine', 'clinical'],
  ['hello', 'vague'],
  ['help', 'vague'],
  ['?', 'vague'],
  ['hmm', 'vague'],
  ['what is rabies?', 'clinical'],
  ['do I need a booster?', 'clinical'],
  ['clinic hours?', 'in_scope'],
  ['how do I book?', 'in_scope'],
  ['where is the clinic?', 'in_scope'],
  // ── Allowed: office hours ──
  ['What are your clinic hours?', 'in_scope'],
  ['Are you open on Sunday?', 'in_scope'],
  ['Do you accept walk-ins?', 'in_scope'],
  ['Anong oras kayo bukas?', 'in_scope'],
  ['Is there a lunch break?', 'in_scope'],
  // ── Allowed: location & contact ──
  ['Where is the clinic located?', 'in_scope'],
  ['What is your phone number?', 'in_scope'],
  ['Saan ang clinic?', 'in_scope'],
  ['How can I contact you by email?', 'in_scope'],
  // ── Allowed: services by name, prices ──
  ['What services do you offer?', 'in_scope'],
  ['What vaccines do you offer?', 'in_scope'],
  ['Do you offer anti-rabies vaccine?', 'in_scope'],
  ['How much does a visit cost?', 'in_scope'],
  // ── Allowed: appointment procedures ──
  ['How do I book an appointment?', 'in_scope'],
  ['How do I cancel my appointment?', 'in_scope'],
  ['Are there available slots this Saturday?', 'in_scope'],
  ['Paano magpa-book ng appointment?', 'in_scope'],
  // ── Allowed: app navigation ──
  ['Where do I see my vaccination card?', 'personal_nav'],
  ['How do I reset my password?', 'in_scope'],
  ['How do I change my profile photo?', 'in_scope'],
  ['How do I talk to staff?', 'in_scope'],
  ['hello there', 'vague'],
  ['salamat', 'in_scope'],
  // ── Personal schedule: navigation only, never dates ──
  ['When is my next dose?', 'personal_nav'],
  ['kailan ang next dose ko?', 'personal_nav'],
  ['How many doses do I have left?', 'personal_nav'],
  ['Ilang dose na ako?', 'personal_nav'],
  ['What is my vaccination schedule?', 'personal_nav'],
  ['Am I done with my treatment?', 'personal_nav'],
  ['When is my next rabies vaccine dose?', 'personal_nav'],
  ['Pira na an dose ko?', 'personal_nav'],
  // ── Blocked: tricky ones ──
  ['is my wound category 3?', 'clinical'],
  ['I missed day 7', 'clinical'],
  ['I missed my next dose, what do I do?', 'clinical'],
  ['When is my next dose? my arm is swollen', 'clinical'],
  ['Nakalimutan ko ang turok ko kahapon', 'clinical'],
  ['Can I book an appointment because my dog bit me?', 'clinical'],
  // ── Blocked: diagnosis / risk ──
  ['Do I have rabies?', 'clinical'],
  ['Is a cat scratch dangerous?', 'clinical'],
  ['Kinagat ako ng aso, delikado ba?', 'clinical'],
  ['Kinagat ako kan ayam', 'clinical'],
  ['What category is a bite on the hand?', 'clinical'],
  // ── Blocked: treatment / wound care / medicine ──
  ['How do I clean a dog bite wound?', 'clinical'],
  ['What medicine should I take for the pain?', 'clinical'],
  ['Pwede ba akong uminom ng alak habang nagpapabakuna?', 'clinical'],
  ['Can I drink alcohol after my vaccine?', 'clinical'],
  ['May lagnat ako pagkatapos ng turok', 'clinical'],
  // ── Blocked: vaccine recommendations / schedules ──
  ['Do I need a booster?', 'clinical'],
  ['What is the PEP schedule?', 'clinical'],
  ['Is it day 0 3 7 28?', 'clinical'],
  ['Should I get anti-tetanus?', 'clinical'],
  ['What is rabies?', 'clinical'],
  // ── Blocked: emergencies ──
  ['This is an emergency, I am bleeding', 'clinical'],
  ['My child was bitten, where is the nearest hospital?', 'clinical'],
  // ── Unsure → blocked ──
  ['something feels wrong', 'clinical'],
  // ── Out of scope ──
  ["What's the weather tomorrow?", 'out_of_scope'],
  ['Tell me a joke', 'out_of_scope'],
  ['Who won the NBA game?', 'out_of_scope'],
];

// Fixed replies must never carry medical content or emergency instructions.
const NO_MEDICAL = /\b(day\s*0|day\s*3|day\s*7|day\s*28|regimen|wound|first\s*aid|emergency\s+room|nearest\s+(animal\s+bite|hospital|abtc)|category\s*(ii|iii|2|3)|₱)\b/i;
const REPLIES = ['BLOCKED_REPLY', 'BLOCKED_REPLY_APP', 'VAGUE_REPLY', 'PERSONAL_INFO_REPLY_APP', 'PERSONAL_INFO_REPLY_PUBLIC', 'PERSONAL_NAV_REPLY_APP', 'PERSONAL_NAV_REPLY_PUBLIC', 'OUT_OF_SCOPE_REPLY', 'HOURS_REPLY', 'CONTACT_REPLY', 'SERVICES_REPLY', 'PRICE_REPLY', 'BOOKING_REPLY', 'APP_NAV_REPLY'];

let failures = 0;
const rows = [];
for (const [prompt, expected] of CASES) {
  const s = server.classifyMessage(prompt);
  const a = app ? app.classifyMessage(prompt) : '—';
  const ok = s === expected && (!app || a === expected);
  if (!ok) failures++;
  rows.push({ prompt, expected, server: s, app: a, result: ok ? 'PASS' : 'FAIL' });
}
console.table(rows);

const replyProblems = [];
for (const mod of [['server', server], ['app', app]]) {
  if (!mod[1]) continue;
  for (const k of REPLIES) {
    const v = mod[1][k];
    if (typeof v !== 'string') { replyProblems.push(`${mod[0]}.${k} missing`); continue; }
    if (NO_MEDICAL.test(v)) replyProblems.push(`${mod[0]}.${k} contains medical/schedule/price text`);
  }
}
if (replyProblems.length) { console.log('Reply problems:\n  ' + replyProblems.join('\n  ')); failures += replyProblems.length; }

const passed = rows.filter(r => r.result === 'PASS').length;
console.log(`\n${passed}/${rows.length} prompts classified as expected${app ? ' (server and app)' : ' (server only)'}; ${replyProblems.length} reply problems.`);
process.exit(failures ? 1 : 0);
