// Client for the shared chatbot engine (api/chatbot.js) — enhanced with fast local triage & strict scope limitations.
export type ChatTurn = { role: 'user' | 'bot'; text: string };

export type ReplyCategory = 'answerable' | 'restricted' | 'out_of_scope';

export type AssistantReply = {
  text: string;
  needsEscalation: boolean;
  category: ReplyCategory;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

// Fast local FAQ knowledge base for instant (<10ms) responses within clinic scope.
const LOCAL_FAQS: { keywords: string[]; text: string; needsEscalation: boolean; category: ReplyCategory }[] = [
  {
    keywords: ['bite', 'bitten', 'after a bite', 'wound', 'dog bite', 'cat bite', 'scratch', 'first aid'],
    text: "If you were bitten or scratched by an animal:\n1. Immediately wash the wound with soap and running water for at least 15 minutes.\n2. Apply disinfectant (such as povidone-iodine or alcohol).\n3. Visit K&A Animal Bite Center promptly for vaccination and professional assessment.",
    needsEscalation: false,
    category: 'answerable',
  },
  {
    keywords: ['dose', 'doses', 'dose count', 'schedule', 'day 0', 'day 3', 'day 7', 'day 14', 'day 28'],
    text: "Rabies Post-Exposure Prophylaxis (PEP) standard regimen consists of doses given on Day 0, Day 3, Day 7, and Day 14/28 as prescribed by clinic staff. Always adhere strictly to your scheduled dates.",
    needsEscalation: false,
    category: 'answerable',
  },
  {
    keywords: ['side effect', 'side-effects', 'side effects', 'fever', 'soreness', 'reaction'],
    text: "Common mild side effects of rabies vaccines include slight pain, swelling, or redness at the injection site, and mild fever or headache. Contact clinic staff if you experience severe allergic reactions.",
    needsEscalation: false,
    category: 'answerable',
  },
  {
    keywords: ['what is rabies', 'rabies info', 'about rabies', 'virus'],
    text: "Rabies is a preventable viral disease transmitted through animal bites or scratches. Once symptoms appear, rabies is almost 100% fatal, making immediate post-exposure vaccination essential.",
    needsEscalation: false,
    category: 'answerable',
  },
  {
    keywords: ['hours', 'schedule', 'open', 'operating hours', 'clinic hours', 'saturday', 'sunday'],
    text: "K&A Clinic accepts appointment bookings on Saturdays & Sundays from 8:00 AM to 5:00 PM. Walk-ins are also welcome during clinic hours.",
    needsEscalation: false,
    category: 'answerable',
  },
  {
    keywords: ['book', 'appointment', 'how to book', 'booking'],
    text: "You can book an appointment directly through the 'Appts' tab in this app by selecting a weekend date and preferred time slot.",
    needsEscalation: false,
    category: 'answerable',
  },
  {
    keywords: ['staff', 'human', 'doctor', 'nurse', 'person', 'talk to staff', 'speak with someone', 'admin', 'help me'],
    text: "I am connecting you with K&A Clinic staff. Please use the button below to start a direct chat with our team.",
    needsEscalation: true,
    category: 'restricted',
  },
];

export async function askClinicAssistant(prompt: string, history: ChatTurn[] = []): Promise<AssistantReply> {
  const pLower = prompt.toLowerCase().trim();

  // Fast local lookup
  for (const faq of LOCAL_FAQS) {
    if (faq.keywords.some(kw => pLower.includes(kw))) {
      return {
        text: faq.text,
        needsEscalation: faq.needsEscalation,
        category: faq.category,
      };
    }
  }

  // If backend API URL is available, try server-side chatbot
  if (API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: history.map(h => ({ role: h.role, text: h.text })) }),
      });
      const data = await res.json();
      if (data?.success && data.text) {
        return {
          text: data.text as string,
          needsEscalation: !!data.needsEscalation,
          category: (data.category as ReplyCategory) ?? 'answerable',
        };
      }
    } catch (err) {
      console.warn('Chatbot API request failed:', err);
    }
  }

  // Fallback response for unhandled / out-of-scope prompts
  return {
    text: "I am specialized in K&A Clinic services, rabies vaccination, and appointment FAQs. I cannot answer this specific request, but you can talk directly to clinic staff for assistance.",
    needsEscalation: true,
    category: 'restricted',
  };
}
