// Thesis study settings (see docs/STUDY_MODE.md). Both are ON unless set to
// "false" in the build environment, so a build without the variables stays
// on the safe side.
//
// VITE_CHATBOT_STUDY_MODE  the website chatbot shows a "test environment"
//                          notice: KAI is used with test prompts only.
// VITE_MAP_STUDY_MODE      the Incident Map is demo-only: "Pin Incident Map"
//                          is hidden on patient records, so real patient
//                          data never becomes map data. (firestore.rules also
//                          accepts only simulated incidents.)
export const CHATBOT_STUDY_MODE = import.meta.env.VITE_CHATBOT_STUDY_MODE !== 'false';
export const MAP_STUDY_MODE = import.meta.env.VITE_MAP_STUDY_MODE !== 'false';

export const KAI_DISCLAIMER =
  'KAI gives general clinic and app information only. It does not give medical advice. ' +
  'For medical concerns, contact K&A Clinic or a licensed healthcare professional.';
export const KAI_DISCLAIMER_SHORT = 'KAI does not give medical advice. For medical concerns, contact the clinic.';
export const STUDY_NOTICE = 'Test environment — do not enter real patient information.';
export const MAP_BANNER = 'Simulated test data for demonstration only — not real cases.';
