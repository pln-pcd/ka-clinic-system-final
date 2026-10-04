// Firebase Auth password policy for the project (server-side enforcement for
// passwords set straight through Firebase: the admin "Change Password" screen
// and the patient password-reset page Firebase hosts).
//
//   node --env-file=.env scripts/set-password-policy.mjs          show the current policy
//   node --env-file=.env scripts/set-password-policy.mjs --apply  set the clinic policy
//
// Rules: at least 8 characters with an uppercase letter, a lowercase letter,
// a number and a symbol. forceUpgradeOnSignin stays false, so existing
// passwords keep working; the rules apply only when a password is set or
// changed. Same rules as api/_lib/passwordPolicy.js.
const { auth } = await import('../api/_lib/firebaseAdmin.js');

const POLICY = {
  enforcementState: 'ENFORCE',
  forceUpgradeOnSignin: false,
  constraints: {
    minLength: 8,
    maxLength: 4096,
    requireUppercase: true,
    requireLowercase: true,
    requireNumeric: true,
    requireNonAlphanumeric: true,
  },
};

const manager = auth.projectConfigManager();
if (process.argv.includes('--apply')) {
  await manager.updateProjectConfig({ passwordPolicyConfig: POLICY });
  console.log('Password policy applied.');
}
const config = await manager.getProjectConfig();
console.log('Current password policy:', JSON.stringify(config.passwordPolicyConfig || 'none', null, 1));
