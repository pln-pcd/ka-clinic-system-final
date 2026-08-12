// Batch 4 — brute-force lockout policy shared by the precheck/failure/OTP endpoints.
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function lockStatus(adminData) {
  const lockedUntil = adminData?.lockedUntil || null;
  const locked = !!lockedUntil && Date.now() < lockedUntil;
  const minutesRemaining = locked ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0;
  return { locked, minutesRemaining };
}
