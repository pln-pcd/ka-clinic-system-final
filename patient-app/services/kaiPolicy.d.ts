export type KaiLanguage = 'en' | 'tl' | 'taglish';
export type ReplyCategory = 'in_scope' | 'clinical' | 'out_of_scope';
export type KaiDecision = {
  intent: string;
  language: KaiLanguage;
  text?: string;
  category: ReplyCategory;
  needsEscalation: boolean;
  disclaimer?: string;
};
export function detectLanguage(text: string): KaiLanguage;
export function containsPersonalDetails(text: string): boolean;
export function getKaiDecision(text: string): KaiDecision;
export function availabilityFallback(language: KaiLanguage): KaiDecision & { text: string };
export const kaiCopy: Record<KaiLanguage, {
  disclaimer: string;
  rateLimit: string;
  tooLong: string;
  [key: string]: string | ((day: string) => string);
}>;
export const clinicKnowledge: Readonly<{
  address: string;
  phone: string | null;
  email: string | null;
  hours: string;
  appointmentDays: number[];
  walkInDays: number[];
  timeSlots: string[];
  services: string[];
  rates: { pepII: { first: number; following: number; followingSessions: number }; pepIII: number; pneumonia: number };
}>;
