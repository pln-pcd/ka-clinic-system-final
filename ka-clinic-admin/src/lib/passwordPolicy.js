// Password rules for NEW passwords (invite acceptance, reset, change). The
// same rules are enforced by the API (api/_lib/passwordPolicy.js) and by the
// patient app (patient-app/utils/passwordPolicy.ts). Existing passwords keep
// working: the rules only apply when a password is set or changed.
export const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: p => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter (A–Z)', test: p => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter (a–z)', test: p => /[a-z]/.test(p) },
  { key: 'number', label: 'One number (0–9)', test: p => /\d/.test(p) },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $)', test: p => /[^A-Za-z0-9\s]/.test(p) },
];

export const meetsPasswordPolicy = (p = '') => PASSWORD_RULES.every(r => r.test(p));

// One sentence naming what is still missing, or '' when the password passes.
export function passwordPolicyError(p = '') {
  const missing = PASSWORD_RULES.filter(r => !r.test(p));
  if (!missing.length) return '';
  const parts = missing.map(r => (r.key === 'length' ? 'at least 8 characters' : r.label.toLowerCase().replace(/\s*\(.*\)$/, '')));
  return `Password needs ${parts.join(', ')}.`;
}
