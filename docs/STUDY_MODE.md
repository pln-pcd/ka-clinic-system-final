# Study mode & ethics

These rules come from the thesis ethics approval and apply to the whole system during the study. They take precedence over any earlier feature behaviour.

## Chatbot (KAI)

**Allowed:** general clinic information (services by name, location, phone, email), office hours (walk-in Monday–Friday, appointments Saturday–Sunday, 8 AM–5 PM, lunch 12–1), appointment procedures (how to book or cancel in the app), app navigation, and the clinic's listed rates (quoted, never as advice on which service is needed). Names and other personal details typed in the chat are never used or repeated.

**Not allowed:** diagnosis, treatment, wound care, rabies-risk assessment, vaccine recommendations, PEP schedules or regimens, medication advice, emergency advice, and the patient's own dates, dose counts or treatment status.

How it is enforced:

| Layer | Where |
|---|---|
| Deterministic classifier, run **before** any AI call (English, Filipino/Tagalog, common Bikol). Anything it cannot place gets the blocked reply. | `api/_lib/chatbotRules.js` (server), `patient-app/services/chatbotRules.ts` (on-device copy) |
| Blocked topics → one fixed neutral reply: "I can't help with medical questions. Please contact K&A Clinic or a licensed healthcare professional." + clinic phone/email + "Talk to clinic staff" (app). | same |
| Personal schedule questions ("When is my next dose?") → navigation only: "You can see your vaccination schedule on the Home screen under your vaccination card." + a button to the card. No dates, sessions or counts. | same |
| The AI system prompt restates the same limits, and the AI's reply is checked again; medical content is replaced by the blocked reply. | `api/chatbot.js` |
| One persistent disclaimer at the top of every chatbot screen: "No medical advice. For urgent or medical concerns, contact the clinic or a licensed healthcare professional." | `patient-app/app/(tabs)/chat.tsx`, `ka-clinic-admin/src/components/landing/Chatbot.jsx` |

Test it: `node scripts/test-chatbot-scope.mjs` (sample prompts with expected categories, run against the server rules and the app copy; also checks that no fixed reply carries medical text).

During the study the chatbot is used with **test prompts only**, never by real patients.

## Incident map

- Shows **one pin per open PEP case in the patient records**, which are simulated test data during the study. The page computes the pins from the live records; nothing is stored, so a case that is completed or archived drops off the map silently, with no notification.
- Each pin sits at the record's barangay point (or Poblacion zone point) from `ka-clinic-admin/src/lib/libonGeo.js`, never a house. A record whose barangay is not a Libon barangay gets no pin. Pins and the incident list show type, category, barangay and month only: no name, MRN, address or contact.
- The map is locked to Libon's municipal boundary (PSA 2023 boundaries, via github.com/faeldon/philippines-json-maps); the area outside is dimmed and cannot be reached.
- A note above the map and a "SIMULATED DATA" label on it say the data is simulated, for demonstration only, not real cases.
- Only signed-in, active staff can open it (dashboard route + `firestore.rules`). Patients and the public cannot; the landing page and the patient app do not show the map.
- The older simulated incident documents (`incidents` collection, `scripts/seed-simulated-incidents.mjs`) are no longer shown on the map.

## Flags

| Variable | Default | Effect |
|---|---|---|
| `VITE_MAP_STUDY_MODE` (admin build) | on unless `false` | "Pin Incident Map" is hidden on patient records and the pin action refuses, so real patient data never becomes map data. |

Turning `VITE_MAP_STUDY_MODE` off after the study is **not enough** to pin real records again: `firestore.rules` also accepts only simulated incidents, and that rule has to be changed and redeployed deliberately.

Chatbot study sessions use test prompts only. The test-environment banner and
the former chatbot study-mode display flags were removed in release 1.0.4;
the medical disclaimer stays visible in empty and active assistant chats.

## Data

- The study environment uses **seed data only** (`isSeedData` / `isDemo` docs from the scripts in `scripts/`). Check with `node --env-file=.env scripts/verify-sample-data.mjs`, which also fails if any incident is not simulated, carries an identifying field, or is linked from a patient record.
- Reports (clinic registry, patient record, inventory) contain no incident locations.
