// Client for the shared chatbot engine (api/chatbot.js).
//
// SCOPE (thesis ethics rules, docs/STUDY_MODE.md): general clinic
// information, office hours, contact details, appointment procedures and app
// navigation only. No medical content of any kind, and no patient's own
// dates, dose counts or treatment status: those questions get a navigation
// reply ("see your schedule on Home under your vaccination card").
//
// The same deterministic rules as the server (services/chatbotRules.ts, a
// copy of api/_lib/chatbotRules.js) run here first, so a blocked or personal
// question never depends on the network to be answered correctly.
import { API_BASE_URL } from '../config/backend';
import {
  BLOCKED_REPLY_APP,
  BOOKING_REPLY,
  OUT_OF_SCOPE_REPLY,
  PERSONAL_INFO_REPLY_APP,
  PERSONAL_NAV_REPLY_APP,
  classifyMessage,
  fixedInScopeReply,
  isShortVague,
  vagueReply,
  type ScopeCategory,
} from './chatbotRules';

/** Wakes the chatbot server when the chat opens, so the first message does not wait for a cold start. */
export function warmClinicAssistant(): void {
  if (!API_BASE_URL) return;
  fetch(`${API_BASE_URL}/api/chatbot?warm=1`).catch(() => {});
}

export type ChatTurn = { role: 'user' | 'bot'; text: string };

/** A button under a reply: open the vaccination card on Home, or Appointments. */
export type ReplyAction = { label: string; target: 'card' | 'appointments' };

export type AssistantReply = {
  text: string;
  /** A blocked medical question: the reply mentions "Talk to clinic staff"
   *  and that button is highlighted. Never opens the staff pop-up by itself. */
  needsEscalation: boolean;
  category: ScopeCategory;
  action?: ReplyAction;
};

const CARD_ACTION: ReplyAction = { label: 'Open my vaccination card', target: 'card' };

export async function askClinicAssistant(prompt: string, history: ChatTurn[] = []): Promise<AssistantReply> {
  const category = classifyMessage(prompt);
  // 1. Strict on-device protections: medical queries and personal schedule navigation
  if (category === 'clinical') return { text: BLOCKED_REPLY_APP, needsEscalation: true, category };
  if (category === 'personal_nav') return { text: PERSONAL_NAV_REPLY_APP, needsEscalation: false, category, action: CARD_ACTION };
  if (category === 'personal_info') return { text: PERSONAL_INFO_REPLY_APP, needsEscalation: false, category, action: CARD_ACTION };
  if (category === 'out_of_scope') return { text: OUT_OF_SCOPE_REPLY, needsEscalation: false, category };
  // A bare name, an introduction or a short vague message: answered here, so
  // a name never leaves the phone and is never repeated back.
  if (category === 'vague' && isShortVague(prompt)) return { text: vagueReply(prompt), needsEscalation: false, category };
  // Allowed topics with a fixed answer (hours, contact, services, prices,
  // booking steps, app help): instant, no network. Same text as the server.
  if (category === 'in_scope') {
    const fixedReply = fixedInScopeReply(prompt);
    if (fixedReply) return { text: fixedReply, needsEscalation: false, category: 'in_scope' };
  }

  // 2. Online: Route all clinic questions, app navigation, booking, and conversational queries to backend
  if (API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: history.map(h => ({ role: h.role, text: h.text })), channel: 'app' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.text) {
          return {
            text: data.text as string,
            needsEscalation: !!data.needsEscalation,
            category: (data.category as ScopeCategory) ?? 'in_scope',
            action: data.action?.target === 'card' || data.action?.target === 'appointments' ? data.action : undefined,
          };
        }
      }
    } catch (err) {
      console.warn('Chatbot API request failed:', err);
    }
  }

  // 3. Offline / Network error fallback

  if (/\b(book|appointment|appt|reserv|cancel|reschedul|slot)/i.test(prompt)) {
    return { text: BOOKING_REPLY, needsEscalation: false, category: 'in_scope', action: { label: 'Open appointments', target: 'appointments' } };
  }
  if (category === 'vague') return { text: vagueReply(prompt), needsEscalation: false, category };

  return {
    text: "KAI can't answer right now. Please check your connection or contact K&A Clinic at +63 912 345 6789.",
    needsEscalation: false,
    category: 'in_scope',
  };
}
