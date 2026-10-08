# Security audit before fixes — 2026-10-08

Scope: existing working tree, local Firebase Auth/Firestore emulators and simulated accounts only. Live HTTPS/header checks are read-only. This is evidence of findings, not certification.

| Finding | Original location | Consequence | Required fix |
| --- | --- | --- | --- |
| Public patient directory; update checks new UID rather than stored owner | ka-clinic-admin/firestore.rules:134 | Unauthenticated PII access and record takeover | Owner-scoped reads; server-only identity writes |
| Revoked manager retains roster write/list rights | ka-clinic-admin/firestore.rules:373 | Revoked manager can edit roles directly | Active manager reads; account mutations through API only |
| Appointment cancellation can edit arbitrary fields | ka-clinic-admin/firestore.rules:64 | Patient can change clinical/ownership fields | Changed-field allowlist and stored ownership |
| Patient can spoof staff chat messages and change thread ownership | ka-clinic-admin/firestore.rules:310 | Staff impersonation and data corruption | Sender validation and immutable ownership |
| OTP gate exists only in UI | patient-app/context/PatientAuthContext.tsx:115; ka-clinic-admin/firestore.rules:12 | Password-only tokens can query protected data | Server-issued second-factor session checked by rules/APIs |
| Push registration trusts supplied MRN and overwrites authUid | api/notifications.js:96 | Patient can claim another record | Verify stored ownership before all writes |
| OTPs stored in plaintext; generator uses Math.random | api/_lib/auth.js:279; api/admin-auth.js:207; api/patient-auth.js:89 | Disclosure, weak generation | Cryptographic generator, contextual SHA-256 hashes |
| Admin OTP guessing unlimited; verification/resends not atomic | api/admin-auth.js:281 | Brute force and replay races | Transactions, five attempts, cooldown |
| Signup completion relies on global verified flag | api/patient-auth.js:275 | Anyone knowing MRN can finish someone else's verified signup | Random caller-held proof, hashed and consumed atomically |
| Public admin password unlock | api/admin-auth.js:524 | Unauthenticated caller clears lockout | Remove unlock action; reset proof required |
| Lockout relies on client reporting failures | api/admin-auth.js:83; ka-clinic-admin/src/features/auth/LoginPage.jsx:270 | Direct requests bypass attempt tracking | Server password verification and persistent rate limits |
| MRN and recovery responses reveal account existence | patient-app/config/backend.ts:164; api/admin-auth.js:375 | Enumeration | Generic pre-auth failures/recovery responses |
| No admin idle timeout | ka-clinic-admin/src/App.jsx:36 | Unattended protected session | 30-minute expiry, one-minute warning, server expiry |
| Ordinary sign-out leaves trust cookie/server session | ka-clinic-admin/src/features/dashboard/AdminDashboard.jsx:816 | Session can be restored after sign-out | Invalidate security session and clear cookie |
| Missing security headers | vercel.json:110 | No explicit CSP, HSTS, anti-framing controls | Global headers and API no-store |
| No automated security matrix/report | package.json:4 | No reproducible security evidence | Emulator matrix, API adversarial tests, report with limitations |

Cloud gaps: Vercel CLI authentication initially unavailable; no separate Firebase test project identified. Do not substitute production for destructive testing. API key restrictions/App Check need project configuration and compatible clients.
