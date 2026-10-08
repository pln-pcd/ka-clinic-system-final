// Thesis study settings and the wording the ethics rules require (see
// docs/STUDY_MODE.md).
//
// EXPO_PUBLIC_CHATBOT_STUDY_MODE: on unless set to "false". While on, the
// chat shows a "test environment" notice: during the study KAI is used with
// test prompts only, never by real patients.
export const CHATBOT_STUDY_MODE = process.env.EXPO_PUBLIC_CHATBOT_STUDY_MODE !== 'false';

export const KAI_DISCLAIMER =
  'KAI gives general clinic and app information only. It does not give medical advice. ' +
  'For medical concerns, contact K&A Clinic or a licensed healthcare professional.';
export const KAI_DISCLAIMER_SHORT = 'KAI does not give medical advice. For medical concerns, contact the clinic.';
export const STUDY_NOTICE = 'Test environment — do not enter real patient information.';
