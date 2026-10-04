// Password rules for NEW passwords. Same rules as the API
// (api/_lib/passwordPolicy.js) and the admin app. Existing passwords keep
// working: the rules apply only when a password is set or changed.
export type PasswordRule = { key: string; label: string; test: (p: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: 'At least 8 characters', test: p => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter (A–Z)', test: p => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter (a–z)', test: p => /[a-z]/.test(p) },
  { key: 'number', label: 'One number (0–9)', test: p => /\d/.test(p) },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $)', test: p => /[^A-Za-z0-9\s]/.test(p) },
];

export const meetsPasswordPolicy = (p: string) => PASSWORD_RULES.every(r => r.test(p));

// One sentence naming what is still missing, or '' when the password passes.
export function passwordPolicyError(p: string): string {
  const missing = PASSWORD_RULES.filter(r => !r.test(p));
  if (!missing.length) return '';
  const parts = missing.map(r => (r.key === 'length' ? 'at least 8 characters' : r.label.toLowerCase().replace(/\s*\(.*\)$/, '')));
  return `Password needs ${parts.join(', ')}.`;
}
