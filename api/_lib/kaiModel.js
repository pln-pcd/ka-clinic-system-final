// KAI's flexible answers for app and clinic questions (Gemini), behind the
// fixed policy in patient-app/services/kaiPolicy.js.
//
// Only messages the policy has already cleared reach this file: no personal
// details, nothing medical, nothing explicitly off-topic. The model answers
// from the app guide and the approved clinic facts only, in the user's
// language; its answer is checked again and replaced by the policy's fixed
// copy when it fails a check, times out or the model is unavailable.
import fs from 'node:fs';
import { clinicKnowledge, containsPersonalDetails, getKaiDecision, kaiCopy } from '../../patient-app/services/kaiPolicy.js';

const APP_GUIDE = fs.readFileSync(new URL('./appGuide.md', import.meta.url), 'utf8');

// Intents the model may answer. Everything else keeps its fixed reply.
export const SMART_INTENTS = new Set([
  'navigation', 'account', 'records', 'login', 'signup', 'forgot', 'forgot_password', 'cancel', 'reschedule',
  'booking', 'hours', 'location', 'contact', 'name', 'creator', 'capstone', 'staff', 'unknown', 'unmatched',
]);

const LANGUAGE_RULE = {
  en: 'Reply in clear, friendly English.',
  tl: 'Reply in natural, polite Filipino (Tagalog), using "po" and "opo" where natural. Keep app button and screen names in English exactly as they appear in the app.',
  taglish: 'Reply in natural Taglish (a friendly mix of Filipino and English, as the user wrote), with "po" where natural. Keep app button and screen names in English exactly as they appear in the app.',
};

const money = n => `₱${n.toLocaleString('en-PH')}`;
const r = clinicKnowledge.rates;
const FACTS = [
  `Clinic: K&A Animal Bite Center (K&A Anti-Rabies Vaccine Clinic), ${clinicKnowledge.address}.`,
  `Hours: ${clinicKnowledge.hours}, Monday to Sunday. Monday to Friday is walk-in (no booking). Saturday and Sunday are by appointment, one patient per hourly slot: ${clinicKnowledge.timeSlots.join(', ')} (no slots from 12:00 to 1:00 PM).`,
  `Services: ${clinicKnowledge.services.join(', ')}.`,
  `Rates: PEP Category II ${money(r.pepII.first)} first session, then ${money(r.pepII.following)} each for the next ${r.pepII.followingSessions}; PEP Category III ${money(r.pepIII)} complete package; Pneumonia vaccine ${money(r.pneumonia)}. PrEP and anti-tetanus alone: ask the clinic staff.`,
  'Clinic phone number and email: not provided in the app; patients can tap Talk to clinic staff in Chat.',
  'The patient app is called the K&A Clinic Patient App (shown as "K&A Clinic"). The assistant is KAI, the K&A Clinic virtual assistant.',
  'The app and the clinic staff web system were developed as a capstone project by Information Technology students of Bicol University Polangui. Never name individual people.',
  'Bottom tabs in the app: Home (vaccination card, dose timeline, previous treatments, notifications bell), Appointments (book, view, reschedule, cancel, delete cancelled ones), Chat (KAI and Talk to clinic staff), Account (profile photo, personal information, notifications, signed-in devices, privacy notice, sign out).',
  'Patients sign in with their Medical Record Number (MRN) and password; a 6-digit email code is asked when registering or on a new device. Forgot Password is on the sign-in screen.',
  'Height, weight and blood pressure are recorded by the clinic and are read-only in the app.',
  'Forgot Password: tap Forgot Password on the sign-in screen and enter your MRN; a reset link is sent to the email address the clinic has on file (shown masked).',
  'Cancelling: in Appointments, tap the appointment, tap Cancel, add an optional reason and confirm. It is cancelled right away and the time slot is freed; no staff approval is needed. Past appointments cannot be cancelled. An appointment affected by a clinic schedule closure cannot be cancelled; reschedule it instead.',
  'Rescheduling: in Appointments, tap the appointment, tap Reschedule, pick a new weekend date and an open time, then confirm.',
  'Cancelled appointments are listed under Cancelled in Appointments; a patient can delete their own cancelled appointment with its Delete button.',
].join('\n');

const SYSTEM = `You are KAI, the friendly virtual assistant inside the K&A Clinic Patient App.

APPROVED FACTS (these win over the guide when they differ):
${FACTS}

APP GUIDE (how the app works):
${APP_GUIDE}

WHAT YOU DO:
- Answer any question about using the app or about the clinic's general information, smartly and specifically: understand casual wording, typos, Filipino and Taglish, and follow-up questions, and answer the exact question. Give steps (1. 2. 3.) for "how do I" questions, one short sentence for simple facts.
- Use only the facts and guide above. If the answer is not there, say you don't have that information and suggest Talk to clinic staff. Never guess or invent features, numbers, phone numbers, emails or names.

STRICT LIMITS (never break these, in any language):
- No medical content of any kind: no diagnosis, symptoms, risk, wound care, first aid, medicines, side effects, which vaccine or category someone needs, dose days or schedules. If asked, say you can't answer medical questions and suggest Talk to clinic staff.
- Never state, guess or look up the user's own records, dates, doses or status; point them to the vaccination card on Home.
- Never use, repeat or ask for names, phone numbers, emails, addresses or MRNs.
- If the message is not about the app or the clinic (celebrities, sports, school work, coding, news, jokes, other topics), reply only with one kind sentence saying you can only help with K&A Clinic and the app.
- Be warm and polite, never curt or scolding. Do not greet unless greeted. Do not start with "Thanks". Keep answers under about 100 words. Plain text; you may use **bold** for button and screen names and "• " or "1." for lists. Never mention Gemini or AI models.`;

// Any of these in a model answer means it drifted into clinical content.
const CLINICAL_OUTPUT = /\b(day\s*(0|3|7|14|28)|regimen|wound|symptom|fever|swell\w*|infect\w*|medicine|medication|paracetamol|antibiotic|first\s*aid|emergency|nearest\s+(hospital|clinic|abtc)|consult\s+a\s+(doctor|physician)|you\s+(should|need\s+to|must)\s+(get|take|receive)|risk\s+of|diagnos\w*|sugat|lagnat|gamot|sintomas)\b/i;

function cleanHistory(history) {
  // Only earlier turns that the policy would itself accept: never forward a
  // turn with personal details or a blocked topic.
  return (Array.isArray(history) ? history : []).slice(-8)
    .filter(t => t && typeof t.text === 'string' && t.text.length <= 1000 && !containsPersonalDetails(t.text))
    .filter(t => t.role === 'bot' || ['in_scope', 'out_of_scope'].includes(getKaiDecision(t.text).category))
    .map(t => ({ role: t.role === 'bot' ? 'model' : 'user', parts: [{ text: t.text }] }));
}

/**
 * { text } for a cleared message, or { reason } when the caller should use
 * the fixed reply. `decision` is the policy's decision for the prompt.
 */
export async function smartReply(prompt, history, decision, { fetchImpl = fetch, timeoutMs = 9000 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { reason: 'no_api_key' };
  if (!SMART_INTENTS.has(decision.intent)) return { reason: 'not_smart' };
  const model = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const contents = [...cleanHistory(history), { role: 'user', parts: [{ text: prompt }] }];
  // Keep the conversation starting with a user turn.
  while (contents.length && contents[0].role !== 'user') contents.shift();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM}\n\nLANGUAGE: ${LANGUAGE_RULE[decision.language] || LANGUAGE_RULE.en}` }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 450 },
      }),
    });
    if (!res.ok) return { reason: `http_${res.status}` };
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
    if (!text) return { reason: 'empty' };
    if (text.length > 1200) return { reason: 'too_long' };
    // Checks on the answer itself: nothing clinical, no personal details.
    if (CLINICAL_OUTPUT.test(text)) return { reason: 'clinical_output' };
    if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || /(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/.test(text)) return { reason: 'contact_output' };
    return { text };
  } catch (err) {
    return { reason: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export { kaiCopy };
