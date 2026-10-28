import { API_BASE_URL } from '../config/backend';
import { availabilityFallback, getKaiDecision, kaiCopy, type KaiLanguage, type ReplyCategory } from './kaiPolicy';

export type { ReplyCategory } from './kaiPolicy';
export type ChatTurn = { role: 'user' | 'bot'; text: string };
export type ReplyAction = { label: string; target: 'card' | 'appointments' };
export type AssistantReply = {
  text: string;
  needsEscalation: boolean;
  category: ReplyCategory;
  language: KaiLanguage;
  disclaimer?: string;
  action?: ReplyAction;
};

export function warmClinicAssistant(): void {
  if (API_BASE_URL) fetch(`${API_BASE_URL}/api/chatbot?warm=1`).catch(() => {});
}

export async function askClinicAssistant(prompt: string, history: ChatTurn[] = []): Promise<AssistantReply> {
  const decision = getKaiDecision(prompt);
  if (prompt.trim().length > 1000) return { ...decision, text: kaiCopy[decision.language].tooLong, needsEscalation: false };
  if (decision.text) return {
    ...decision, text: decision.text,
    ...(['own_schedule', 'own_details'].includes(decision.intent)
      ? { action: { label: decision.language === 'en' ? 'Open my vaccination card' : 'Buksan ang vaccination card', target: 'card' as const } }
      : {}),
  };

  // Only date/availability queries need a network request. Do not send names,
  // personal details or unrelated transcript turns as appointment context.
  const safeHistory = history.slice(-20).filter(turn => turn.role === 'user'
    && turn.text.length <= 1000 && getKaiDecision(turn.text).intent === 'availability');
  if (API_BASE_URL) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API_BASE_URL}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: safeHistory, channel: 'app' }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.status === 429) return { ...decision, text: kaiCopy[decision.language].rateLimit };
      // Require the new structured contract; an older deployed chatbot can
      // otherwise reintroduce its English-only, unrestricted fallback copy.
      if (data?.success && data.intent === 'availability' && data.language === decision.language
        && data.category === 'in_scope' && data.needsEscalation === false && typeof data.text === 'string') {
        return { ...decision, text: data.text };
      }
    } catch {
      // Live data could not be verified. Do not invent open slots.
    } finally {
      clearTimeout(timeout);
    }
  }
  return availabilityFallback(decision.language);
}
