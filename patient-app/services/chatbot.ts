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
  VAGUE_REPLY,
  classifyMessage,
  fixedInScopeReply,
  type ScopeCategory,
} from './chatbotRules';

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
  if (category === 'out_of_scope') return { text: OUT_OF_SCOPE_REPLY, needsEscalation: false, category };

  const fixed = fixedInScopeReply(prompt);
  if (fixed) return { text: fixed, needsEscalation: false, category: 'in_scope' };

  if (/\b(book|appointment|appt|reserv|cancel|reschedul|slot)/i.test(prompt)) {
    return { text: BOOKING_REPLY, needsEscalation: false, category: 'in_scope', action: { label: 'Open appointments', target: 'appointments' } };
  }
  if (category === 'vague') return { text: VAGUE_REPLY, needsEscalation: false, category };

  return {
    text: "KAI can't answer right now. Please check your connection or contact K&A Clinic at +63 912 345 6789.",
    needsEscalation: false,
    category: 'in_scope',
  };
}
