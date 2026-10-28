import { detectLanguage, getKaiDecision, kaiCopy } from '../patient-app/services/kaiPolicy.js';
import { appointmentReply, clinicNow, loadAppointmentAvailability } from './_lib/kaiAppointments.js';

// The same policy runs on the patient device and server. Responses come only
// from approved clinic knowledge and live occupancy; user text is never sent
// to a generative model or interpolated into an answer.
export const classifyMessage = text => getKaiDecision(text).category;

export function createChatbotHandler({ load = loadAppointmentAvailability, now = Date.now } = {}) {
  const buckets = new Map();
  const windowMs = 5 * 60 * 1000;
  return async function handler(req, res) {
    if (req.method === 'GET' && req.query?.warm !== undefined) return res.status(204).end();
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const language = detectLanguage(prompt);
    const copy = kaiCopy[language];
    if (!prompt) return res.status(400).json({ success: false, error: 'A message is required.' });
    // Reject rather than truncate: a clinical/privacy signal at the end of a
    // long message must not be silently dropped before classification.
    if (prompt.length > 1000) return res.status(400).json({ success: false, error: copy.tooLong, language });

    const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    const time = now();
    const recent = (buckets.get(ip) || []).filter(t => time - t < windowMs);
    if (recent.length >= 30) {
      res.setHeader('Retry-After', '300');
      return res.status(429).json({ success: false, error: copy.rateLimit, language });
    }
    recent.push(time);
    buckets.set(ip, recent);
    if (buckets.size > 5000) {
      for (const [key, times] of buckets) if (time - times.at(-1) >= windowMs) buckets.delete(key);
      // Also bound traffic from distinct active IPs.
      while (buckets.size > 5000) buckets.delete(buckets.keys().next().value);
    }

    const decision = getKaiDecision(prompt);
    if (decision.intent !== 'availability') {
      return res.status(200).json({ success: true, ...decision, source: 'knowledge', fallbackReason: null });
    }
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-20) : [];
    const answer = await appointmentReply(prompt, history, language, { now: clinicNow(time), load });
    return res.status(200).json({ success: true, ...decision, fallbackReason: null, ...answer });
  };
}

export default createChatbotHandler();
