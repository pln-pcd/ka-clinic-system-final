// ka-clinic-admin/src/geminiService.js
//
// Thin client for the shared chatbot engine (api/chatbot.js) — the system
// prompt, Gemini call, and keyword fallback all now live server-side so the
// Gemini API key never ships in this bundle. Also used by the patient app
// (patient-app/services/chatbot.ts) so both entry points give identical,
// guardrailed answers.
export async function askGemini(prompt, history = []) {
  try {
    const res = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        history: history.map(m => ({ role: m.role, text: m.text || m.html || '' })),
        // Public website: no "Talk to Clinic Staff" button and no signed-in
        // patient, so clinical hand-offs must point at the phone/address
        // instead of a control this surface does not have.
        channel: 'public',
      }),
    });
    const data = await res.json();
    if (data?.success && data.text) return data.text;
  } catch (err) {
    console.warn('Chatbot request failed:', err);
  }
  return "I'm having trouble connecting right now. Please call K&A Clinic directly or try again shortly.";
}
