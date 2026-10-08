# K&A Clinic Technical Security Verification

Date: 2026-10-08T02:10:46.008Z. Release: patient app 1.0.3 / Android versionCode 4.

## Scope and safety

All destructive, guessing, replay and simulated-record tests used loopback Firebase Auth/Firestore emulators under the fixed project ID `demo-ka-security`. No real account or production record was mutated by tests. Manager, staff, patient A, patient B, archived patient and revoked admin fixtures use `example.test` email addresses and fictional records. Real SMTP delivery was suppressed for emulator/test recipients. Production checks used headers, browser navigation, Rules API source retrieval and non-mutating authentication API precheck/missing-token requests. No production passwords were tested. Rules deployment was separately authorized by the user.

The new free Firebase project `ka-clinic-security-test` contains the published rules and an empty Firestore database. The Rules API confirms byte-for-byte equality; attack/CRUD execution used the emulator, not that cloud database. Firebase CLI created the test database in nam5.

Before API evidence uses Git HEAD `392b9a2`; pre-existing uncommitted user changes are excluded from that API baseline. Before rules evidence uses the original working-tree rules. Before/after tests with changed contracts are compatibility failures as well as security failures; they are not all distinct exploitable vulnerabilities. Additional tests were added after the baseline. Stored evidence is preserved; do not interpret the different total counts as identical matrices.

## Summary

| Evidence | Total | PASS | FAIL |
| --- | ---: | ---: | ---: |
| Before remediation | 665 | 618 | 47 |
| After remediation | 785 | 782 | 3 |
| api-after.json | 65 | 65 | 0 |
| apk-after.json | 6 | 6 | 0 |
| cloud-rules-ka-clinic-security-test.json | 1 | 1 | 0 |
| cloud-rules-ka-clinic-system.json | 1 | 1 | 0 |
| dependencies-after.json | 3 | 1 | 2 |
| headers-after.json | 9 | 9 | 0 |
| live-after.json | 7 | 7 | 0 |
| rules-after.json | 682 | 682 | 0 |
| runtime-after.json | 1 | 1 | 0 |
| secrets-after.json | 4 | 3 | 1 |
| ui-after.json | 6 | 6 | 0 |

PASS means the observed result matched the stated expectation, including expected permission denials. Open FAILs are retained honestly. This report is verification evidence, not a claim of complete security or a penetration-test certification.

## Audit findings and fixes

See [initial file:line audit](docs/SECURITY-AUDIT-GAPS.md) for original locations.

1. Removed public patient-directory reads, patient UID takeover, unrestricted cancellation edits, staff chat spoofing, thread takeover and revoked-manager direct writes. Account mutation is server-only. Clinical records remain staff/manager-owned; patient profile writes go through a server allowlist.
2. Added a server password gateway and custom-token sign-in. Direct password-provider tokens cannot use protected APIs or Firestore data. Five admin failures lock access for 15 minutes; unknown identities and patient sign-ins also have persistent five-attempt buckets. Recovery responses no longer expose email/MRN existence.
3. Replaced plaintext OTP storage with contextual SHA-256, cryptographic generation, five-minute expiry, 30-second transactional send reservation, five guesses and single-use transactional consumption. Signup completion requires a random caller-held proof whose hash is stored and consumed once. OTP email subjects/logs omit the code.
4. Added server-owned OTP security sessions. Admin sessions expire after 30 minutes; active browser events trigger heartbeats. A one-minute warning requires an explicit Keep working action. Normal logout invalidates the current server session and trust cookie; logout-all deletes sessions and revokes refresh tokens.
5. Hardened hashed 30-day device trust and account/device binding. Archived patients and revoked admins are rejected. Push-token registration now checks stored record ownership before binding a UID.
6. Added CSP, HSTS, nosniff, anti-framing, referrer/permissions policy, and API no-store. Android cleartext traffic is disabled with a persisted Expo config plugin; production API URLs require HTTPS. SMTP transport uses port 465 with TLS and Gmail hostname validation.
7. Replaced raw map tooltip HTML with a DOM node whose textContent is populated. Existing map popup escaping, React text rendering and chatbot escaping were reviewed. Browser name-injection test confirms literal markup and no execution.
8. Upgraded vulnerable dependencies including firebase-admin, nodemailer, grpc-js, maintained SheetJS 0.20.3 and transitive packages. Server dependency audit is clean. Remaining upstream advisories are listed below.

## Vercel authentication runtime follow-up

The initial release checks covered the static login page but missed a deployed function initialization crash: `jwks-rsa` required the ESM-only `jose` package in a loader without native `require(esm)` support. A scoped `jose@5.10.0` override preserves Firebase Admin 14.5/JWKS 4.1 with a CommonJS-compatible export. The runtime regression disables `require(esm)` and verifies generated RSA keys and rejection of tampered data. The live browser suite now checks admin precheck and three missing-token API guards as well as page rendering. See [incident and remediation](docs/LOGIN-RUNTIME-INCIDENT.md). This server-only correction does not change the APK or security rules.

## User-facing changes

- Install APK 1.0.3 before using the hardened patient flow. Older APKs and password-only client integrations can no longer access protected records. Existing browser sessions must sign in again; legacy raw admin trusted-device entries are ignored and require fresh OTP.
- Admins see a warning after 29 idle minutes and are signed out after 30. Ordinary sign-out clears device trust for the current device; logout-all revokes every server session and refresh token. Patient Sign out all devices now includes the current device.
- Login/recovery errors are generic. Requesting too many passwords/codes is rate limited. Email codes expire after five minutes and permit five guesses.
- Signup uses its own email proof, then completes the normal login OTP flow. New users may receive a second sign-in code after signup.
- Public website booking now directs patients to the authenticated Android app. Appointments are linked to the patient's own MRN; anonymous booking is unavailable.

## Remaining limitations and required actions

1. **Rotate the exposed Gemini API key.** Gitleaks found it in historical `landing/src/LandingPage.jsx:957`, commit `87b352d2130fbd7c7c1aa5e4057f397061467083`. Replace the server-side Vercel value, remove unused `VITE_GEMINI_API_KEY` local values, and revoke the old key. No secret value is printed in this report. History was not force-rewritten; revocation is the necessary mitigation. Current tracked/pending source and production client bundles were separately checked.
2. **Two upstream dependency advisories remain.** braces 3.0.3 has a deeply nested pattern stack-exhaustion advisory; node-forge 1.4.0 has an RSA signature-validation advisory. npm reports transitive cascades separately, so counts are affected-package entries, not distinct vulnerabilities. These packages originate in build/development tooling; clinic password/OTP authentication does not invoke the affected code paths. No fixed upstream release was available at audit time. Avoid processing untrusted build inputs and update when patched versions become available. FAILs remain in the summary.
3. Firebase web/Android API keys are public configuration, not service-account credentials. Data protection relies on the tested rules and server session gate. Use separate web and Android keys before applying HTTP-referrer and package/SHA restrictions; applying web-only restrictions to the shared key would break Android/server sign-in. Roll out App Check with web reCAPTCHA/Android Play Integrity providers and callable/API token verification, observe valid clients, then enforce. App Check and key restrictions were recommended, not silently enabled. They are not counted as passed tests.
4. Account-level password buckets can temporarily deny legitimate users when an attacker targets their identity. Remote patient-device revocation now removes both server sessions and the hashed trust token. The client also resets its second-factor UI flag on sign-out. Add edge/IP abuse controls and monitoring; generic responses reduce enumeration but do not establish constant-time behavior.
5. OTP SHA-256 storage satisfies the requested hashing test; a six-digit space is small if database hashes leak. Keep OTP collections server-only, enforce short TTL and guessing limits, and consider keyed HMAC as defense in depth.
6. Server session expiry in Rules is checked on each operation. Revocation/archival denials apply to new requests. A previously authorized client may already hold data in memory; sign-out clears app caches/listeners, but data already downloaded cannot be remotely erased. Remote individual admin trust revocation blocks future trusted logins; a currently active remote session can remain valid until its idle expiry unless logout-all/account revocation is used.
7. Physical Android install, real SMTP receipt, foreground/background/back-button behavior on a phone, clinical workflow regression, authenticated production map/network requests, and App Check enforcement need manual evaluation. Signed APK creation, TypeScript checks, emulator APIs/rules and browser admin idle behavior are automated evidence; onboarding launch was tested on an isolated Android emulator with fresh private data. Signed-in physical-device behavior remains untested.

## Manual evaluation checklist (not executed; not counted as PASS)

Identity/data tests below must use a test-configured APK/API and the separate Firebase test project or loopback emulators. The production APK was used only for installation, upgrade and public onboarding smoke checks, without account sign-in.

| ID | Steps | Expected | Status |
| --- | --- | --- | --- |
| MANUAL-ANDROID | Install release APK on a test phone; use simulated manager-approved MRN; sign in, receive OTP, trust device, restart, revoke trust, log out, press Back | No protected screen after logout; trusted login only while valid; next login after revocation needs OTP | NOT EXECUTED |
| MANUAL-SMTP | Send only to a dedicated test mailbox; observe delivery and negotiated TLS | OTP received, not logged; certificate-validated TLS on 465 | NOT EXECUTED |
| MANUAL-XSS-NOTES-CHAT | Add script/img-onerror markup to fictional notes and chats; open admin and patient screens | Markup displayed as text; no script/network side effects | NOT EXECUTED |
| MANUAL-WORKFLOWS | Exercise patient signup/login, booking/cancellation, avatar/profile, staff clinical edits, manager invite/revoke/delete, reports with fictional data | Allowed operations succeed; forbidden operations rejected | NOT EXECUTED |
| MANUAL-AUTH-NETWORK | In test deployment, capture all authenticated map/report/patient network requests | HTTPS only; no CSP blocks; no PHI in unauthenticated responses | NOT EXECUTED |

## Reproduction

Install Node 24, Java 21, Chrome, Firebase CLI and Gitleaks. Run `npm ci`, `npm ci --prefix ka-clinic-admin`, and `npm ci --prefix patient-app`. Never point guessing/destructive tests at production.

In terminal 1:

```powershell
firebase emulators:start --project demo-ka-security --only auth,firestore --config firebase.json
```

In terminal 2, from ka-clinic-admin:

```powershell
$env:FIREBASE_EMULATOR_PROJECT_ID='demo-ka-security'
$env:VITE_FIREBASE_PROJECT_ID='demo-ka-security'
npm run dev:emulator -- --port 5178
```

In terminal 3, from repository root, run serially because rules tests clear emulator Firestore:

```powershell
node scripts/security/rules.mjs
node --no-experimental-require-module scripts/security/api.mjs
node scripts/security/runtime.mjs
node scripts/security/ui.mjs
npm run build --prefix ka-clinic-admin
Push-Location patient-app
npx tsc --noEmit
Pop-Location
node scripts/security/headers.mjs
node scripts/security/live.mjs
node scripts/security/cloud-rules.mjs ka-clinic-security-test
node scripts/security/cloud-rules.mjs ka-clinic-system
node scripts/security/dependencies.mjs
vercel env pull .tmp/security/production.env --environment=production --yes
$env:GITLEAKS_PATH='C:/tools/gitleaks.exe'
node scripts/security/secrets.mjs 'C:/short-build/android/app/build/generated/assets/react/release/index.android.bundle'
node scripts/security/report.mjs
```

The cloud verifier uses the installed Firebase CLI's logged-in account and only reads Rules API sources; set FIREBASE_CLI_ROOT when Firebase CLI is installed elsewhere. Secret scanning only prints counts/metadata and redacts Gitleaks findings. Secret values are read from ignored local environment files for exact-value bundle comparison; no environment values are written into reports. An expected nonzero exit from history/dependency scans indicates the documented unresolved items. Run APK artifact checks with `python scripts/security/apk.py <release.apk> <compiled.bundle>`. The optional --emulator switch only inspects the isolated emulator-5580; it does not install or alter accounts. Stored before JSON files are historical evidence; do not overwrite them with current code using --before.

Android release builds should use a short path without spaces, Expo prebuild with the current SDK, and the existing private release keystore. The local generated project needed the Hermes compiler path updated to `node_modules/hermes-compiler/hermesc/win64-bin/hermesc.exe` because its older template referenced the removed React Native sdks path. Generated native files, keystore/passwords, local caches, data backups, .env files and node_modules are excluded from Git/Vercel uploads.

## Primary references

- [Firebase rules testing](https://firebase.google.com/docs/rules/unit-tests)
- [Firebase refresh-token revocation](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Vercel headers configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [SheetJS maintained installation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)
- [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)

## Numbered test cases

### 1. Role-based access control

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-001 | staff cannot invite admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-002 | staff cannot revoke admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-003 | staff cannot delete admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-004 | a cannot invite admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-005 | a cannot revoke admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-006 | a cannot delete admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-007 | b cannot invite admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-008 | b cannot revoke admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-009 | b cannot delete admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-010 | archived cannot invite admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-011 | archived cannot revoke admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-012 | archived cannot delete admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-013 | revoked cannot invite admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-014 | revoked cannot revoke admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-015 | revoked cannot delete admins | Direct handler request with real Firebase emulator token; simulated documents only. | 403 or 401 | 403 or 401 | PASS | PASS | Regression check passed. |
| API-020 | Active staff allowed report email | Direct handler request with real Firebase emulator token; simulated documents only. | 200 | 200 | FAIL | PASS | Shared authenticated role/session guards and input ownership validation. |
| API-021 | Patient cannot request admin OTP | Direct handler request with real Firebase emulator token; simulated documents only. | 403 | 403 | PASS | PASS | Regression check passed. |
| API-059 | Revoked/disabled admin cannot sign in | Direct handler request with real Firebase emulator token; simulated documents only. | Auth emulator rejects password | Auth emulator rejects password | PASS | PASS | Regression check passed. |
| API-065 | Auth UID fallback refuses an admin record for a different email | Direct handler request with real Firebase emulator token; simulated documents only. | No admin identity resolved | No admin identity resolved | Not in baseline | PASS | Additional verification after remediation. |
| UI-STAFF | Staff UI hides manager roster | Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks. | Patient Records visible; Manage Admins absent | Patient Records visible; Manage Admins absent | Not in baseline | PASS | Additional verification after remediation. |
| UI-MANAGER | Manager UI includes manager roster | Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks. | Manage Admins visible | Manage Admins visible | Not in baseline | PASS | Additional verification after remediation. |

### 2. Incorrect password handling

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-035 | Unauthenticated unlock cannot clear lockout | Direct handler request with real Firebase emulator token; simulated documents only. | 403; lock remains | 403; lock remains | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-036 | Five admin wrong passwords cause server lockout | Direct handler request with real Firebase emulator token; simulated documents only. | Five 401 responses; lock set for 15 minutes | Five 401 responses; lock set for 15 minutes | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-037 | Correct admin password rejected during server lock | Direct handler request with real Firebase emulator token; simulated documents only. | 401 or 429 | 401 or 429 | PASS | PASS | Regression check passed. |
| API-038 | Expired lock permits correct admin password | Direct handler request with real Firebase emulator token; simulated documents only. | 200 custom token | 200 custom token | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-039 | Unknown/known bad admin credentials have same message/status | Direct handler request with real Firebase emulator token; simulated documents only. | Identical status and error | Identical status and error | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-040 | Patient password failures rate limited server-side | Direct handler request with real Firebase emulator token; simulated documents only. | Five 401 then 429, including correct password | Five 401 then 429, including correct password | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-041 | Recovery does not enumerate admin emails | Direct handler request with real Firebase emulator token; simulated documents only. | Identical generic response | Identical generic response | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-042 | Signup does not enumerate MRNs | Direct handler request with real Firebase emulator token; simulated documents only. | Identical generic response | Identical generic response | FAIL | PASS | Server password gateway, persistent attempt buckets and generic errors. |
| API-064 | Legacy mixed-case admin email permits correct login through verified Auth UID | Direct handler request with real Firebase emulator token; simulated documents only. | 200 custom token; correct account UID | 200 custom token; correct account UID | Not in baseline | PASS | Additional verification after remediation. |

### 3. OTP expiration and abuse

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-043 | admin OTP stored hashed; no API/log plaintext | Direct handler request with real Firebase emulator token; simulated documents only. | SHA-256 codeHash, no code or otp field/API code | SHA-256 codeHash, no code or otp field/API code | FAIL | PASS | Hashed OTP, transactional consumption, five-attempt limit and caller-held signup proof. |
| API-044 | admin OTP resend cooldown | Direct handler request with real Firebase emulator token; simulated documents only. | 429 within 30 seconds | 429 within 30 seconds | PASS | PASS | Regression check passed. |
| API-045 | admin expired OTP rejected | Direct handler request with real Firebase emulator token; simulated documents only. | 400 | 400 | PASS | PASS | Regression check passed. |
| API-046 | admin OTP max five wrong attempts | Direct handler request with real Firebase emulator token; simulated documents only. | Sixth attempt 429 | Sixth attempt 429 | FAIL | PASS | Hashed OTP, transactional consumption, five-attempt limit and caller-held signup proof. |
| API-047 | admin OTP single use under concurrent replay | Direct handler request with real Firebase emulator token; simulated documents only. | Exactly one 200 | Exactly one 200 | FAIL | PASS | Hashed OTP, transactional consumption, five-attempt limit and caller-held signup proof. |
| API-048 | patient OTP stored hashed; no API/log plaintext | Direct handler request with real Firebase emulator token; simulated documents only. | SHA-256 codeHash, no code or otp field/API code | SHA-256 codeHash, no code or otp field/API code | FAIL | PASS | Hashed OTP, transactional consumption, five-attempt limit and caller-held signup proof. |
| API-049 | patient OTP resend cooldown | Direct handler request with real Firebase emulator token; simulated documents only. | 429 within 30 seconds | 429 within 30 seconds | PASS | PASS | Regression check passed. |
| API-050 | patient expired OTP rejected | Direct handler request with real Firebase emulator token; simulated documents only. | 400 | 400 | PASS | PASS | Regression check passed. |
| API-051 | patient OTP max five wrong attempts | Direct handler request with real Firebase emulator token; simulated documents only. | Sixth attempt 429 | Sixth attempt 429 | PASS | PASS | Regression check passed. |
| API-052 | patient OTP single use under concurrent replay | Direct handler request with real Firebase emulator token; simulated documents only. | Exactly one 200 | Exactly one 200 | FAIL | PASS | Hashed OTP, transactional consumption, five-attempt limit and caller-held signup proof. |
| API-053 | Signup completion rejects shared verified flag without caller proof | Direct handler request with real Firebase emulator token; simulated documents only. | 403; no account created | 403; no account created | FAIL | PASS | Hashed OTP, transactional consumption, five-attempt limit and caller-held signup proof. |
| API-054 | Patient trust token hash, expiry, revocation, cross-account binding | Direct handler request with real Firebase emulator token; simulated documents only. | Only owning account/device accepts unexpired token | Only owning account/device accepts unexpired token | PASS | PASS | Regression check passed. |
| API-061 | Remote patient-device revocation removes trust and server sessions | Direct handler request with real Firebase emulator token; simulated documents only. | Device marked revoked; trust rejected; server session deleted | Device marked revoked; trust rejected; server session deleted | Not in baseline | PASS | Additional verification after remediation. |
| API-062 | Legitimate signup proof creates an account once and still requires login OTP | Direct handler request with real Firebase emulator token; simulated documents only. | Account linked; proof replay rejected; no protected session yet | Account linked; proof replay rejected; no protected session yet | Not in baseline | PASS | Additional verification after remediation. |
| API-063 | Admin trusted-device cookie stores only a 30-day hash | Direct handler request with real Firebase emulator token; simulated documents only. | Secure HttpOnly cookie; SHA-256 hash; trusted shortcut accepts current account | Secure HttpOnly cookie; SHA-256 hash; trusted shortcut accepts current account | Not in baseline | PASS | Additional verification after remediation. |

### 4. Session timeout and logout

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-055 | Password-only SDK token cannot use protected admin API | Direct handler request with real Firebase emulator token; simulated documents only. | 401 without second factor/gateway | 401 without second factor/gateway | FAIL | PASS | Server expiry/revocation and client idle guard. |
| API-056 | Admin idle session expiration enforced by API | Direct handler request with real Firebase emulator token; simulated documents only. | 401 after expiry | 401 after expiry | FAIL | PASS | Server expiry/revocation and client idle guard. |
| API-057 | Sign-out invalidates server session and clears cookie | Direct handler request with real Firebase emulator token; simulated documents only. | 200; cookie Max-Age=0; next API rejected | 200; cookie Max-Age=0; next API rejected | FAIL | PASS | Server expiry/revocation and client idle guard. |
| API-058 | Sign out all revokes refresh tokens and all server sessions | Direct handler request with real Firebase emulator token; simulated documents only. | 200; session docs removed; old token rejected | 200; session docs removed; old token rejected | FAIL | PASS | Server expiry/revocation and client idle guard. |
| UI-IDLE-WARNING | One-minute idle warning | Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks. | Warning visible after 29 minutes | Warning visible after 29 minutes | Not in baseline | PASS | Additional verification after remediation. |
| UI-IDLE-EXPIRY | 30-minute idle sign-out | Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks. | Login visible; dashboard removed | Login visible; dashboard removed | Not in baseline | PASS | Additional verification after remediation. |
| UI-BACK-AFTER-LOGOUT | Back button cannot expose dashboard | Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks. | Login only | Login only | Not in baseline | PASS | Additional verification after remediation. |

### 5. Admin/patient access separation

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-022 | Admin cannot enter patient trust/login flow | Direct handler request with real Firebase emulator token; simulated documents only. | 403 | 403 | PASS | PASS | Regression check passed. |
| API-023 | Archived patient cannot complete login | Direct handler request with real Firebase emulator token; simulated documents only. | 403 | 403 | PASS | PASS | Regression check passed. |
| API-024 | Patient A cannot claim B through push-token registration | Direct handler request with real Firebase emulator token; simulated documents only. | 403; B owner unchanged | 403; B owner unchanged | FAIL | PASS | Shared authenticated role/session guards and input ownership validation. |
| API-025 | Patient A cannot edit B profile | Direct handler request with real Firebase emulator token; simulated documents only. | 403 | 403 | PASS | PASS | Regression check passed. |
| API-026 | Patient A cannot remove B avatar | Direct handler request with real Firebase emulator token; simulated documents only. | 403 | 403 | PASS | PASS | Regression check passed. |

### 6. Firebase security rules

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-027 | Patient cannot update clinical profile fields | Direct handler request with real Firebase emulator token; simulated documents only. | No write to clinical field | No write to clinical field | PASS | PASS | Regression check passed. |
| CLOUD-RULES-ka-clinic-security-test | Deployed rules equal repository source | Read Firebase Rules release and referenced ruleset; compare content and SHA-256 | Byte-for-byte equality | Byte-for-byte equal | Not in baseline | PASS | Additional verification after remediation. |
| CLOUD-RULES-ka-clinic-system | Deployed rules equal repository source | Read Firebase Rules release and referenced ruleset; compare content and SHA-256 | Byte-for-byte equality | Byte-for-byte equal | Not in baseline | PASS | Additional verification after remediation. |
| RULE-vaccinations-anonymous-read | anonymous: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-anonymous-create | anonymous: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-anonymous-update | anonymous: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-anonymous-delete | anonymous: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-own-read | patient-own: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-own-create | patient-own: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-own-update | patient-own: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-own-delete | patient-own: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-other-read | patient-other: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-other-create | patient-other: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-other-update | patient-other: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-patient-other-delete | patient-other: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-staff-read | staff: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-staff-create | staff: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-staff-update | staff: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-staff-delete | staff: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-manager-read | manager: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-manager-create | manager: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-manager-update | manager: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-manager-delete | manager: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-vaccinations-revoked-read | revoked: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-revoked-create | revoked: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-revoked-update | revoked: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-revoked-delete | revoked: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-pending-read | pending: read vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-pending-create | pending: create vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-pending-update | pending: update vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-vaccinations-pending-delete | pending: delete vaccinations | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-anonymous-read | anonymous: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-authorizedPatients-anonymous-create | anonymous: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-anonymous-update | anonymous: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-anonymous-delete | anonymous: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-patient-own-read | patient-own: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-patient-own-create | patient-own: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-patient-own-update | patient-own: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-authorizedPatients-patient-own-delete | patient-own: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-patient-other-read | patient-other: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-authorizedPatients-patient-other-create | patient-other: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-patient-other-update | patient-other: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-patient-other-delete | patient-other: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-staff-read | staff: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-staff-create | staff: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-staff-update | staff: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-staff-delete | staff: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-manager-read | manager: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-manager-create | manager: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-manager-update | manager: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-manager-delete | manager: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-revoked-read | revoked: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-authorizedPatients-revoked-create | revoked: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-revoked-update | revoked: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-revoked-delete | revoked: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-pending-read | pending: read authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-authorizedPatients-pending-create | pending: create authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-pending-update | pending: update authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-authorizedPatients-pending-delete | pending: delete authorizedPatients | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-anonymous-read | anonymous: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-anonymous-create | anonymous: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-anonymous-update | anonymous: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-anonymous-delete | anonymous: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-own-read | patient-own: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-own-create | patient-own: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-own-update | patient-own: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-own-delete | patient-own: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-other-read | patient-other: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-other-create | patient-other: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-other-update | patient-other: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-patient-other-delete | patient-other: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-staff-read | staff: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-staff-create | staff: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-staff-update | staff: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-staff-delete | staff: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-manager-read | manager: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-manager-create | manager: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-manager-update | manager: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-manager-delete | manager: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-appointments-revoked-read | revoked: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-revoked-create | revoked: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-revoked-update | revoked: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-revoked-delete | revoked: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-pending-read | pending: read appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-pending-create | pending: create appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-pending-update | pending: update appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointments-pending-delete | pending: delete appointments | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-anonymous-read | anonymous: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-anonymous-create | anonymous: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-anonymous-update | anonymous: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-anonymous-delete | anonymous: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-own-read | patient-own: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-own-create | patient-own: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-own-update | patient-own: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-own-delete | patient-own: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-other-read | patient-other: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-other-create | patient-other: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-other-update | patient-other: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-patient-other-delete | patient-other: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-staff-read | staff: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-staff-create | staff: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-staff-update | staff: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-staff-delete | staff: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-manager-read | manager: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-manager-create | manager: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-manager-update | manager: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-manager-delete | manager: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-inventory-revoked-read | revoked: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-revoked-create | revoked: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-revoked-update | revoked: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-revoked-delete | revoked: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-pending-read | pending: read inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-pending-create | pending: create inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-pending-update | pending: update inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-inventory-pending-delete | pending: delete inventory | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-anonymous-read | anonymous: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-anonymous-create | anonymous: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-anonymous-update | anonymous: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-anonymous-delete | anonymous: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-own-read | patient-own: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-own-create | patient-own: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-own-update | patient-own: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-own-delete | patient-own: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-other-read | patient-other: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-other-create | patient-other: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-other-update | patient-other: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-patient-other-delete | patient-other: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-staff-read | staff: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-staff-create | staff: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-staff-update | staff: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-staff-delete | staff: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-manager-read | manager: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-manager-create | manager: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-manager-update | manager: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-manager-delete | manager: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-incidents-revoked-read | revoked: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-revoked-create | revoked: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-revoked-update | revoked: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-revoked-delete | revoked: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-pending-read | pending: read incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-pending-create | pending: create incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-pending-update | pending: update incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-incidents-pending-delete | pending: delete incidents | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-anonymous-read | anonymous: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-anonymous-create | anonymous: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-anonymous-update | anonymous: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-anonymous-delete | anonymous: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-own-read | patient-own: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-own-create | patient-own: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-own-update | patient-own: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-own-delete | patient-own: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-other-read | patient-other: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-other-create | patient-other: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-other-update | patient-other: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-patient-other-delete | patient-other: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-staff-read | staff: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-staff-create | staff: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-staff-update | staff: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-staff-delete | staff: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-manager-read | manager: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-manager-create | manager: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-manager-update | manager: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-manager-delete | manager: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatThreads-revoked-read | revoked: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-revoked-create | revoked: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-revoked-update | revoked: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-revoked-delete | revoked: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-pending-read | pending: read chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-pending-create | pending: create chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-pending-update | pending: update chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatThreads-pending-delete | pending: delete chatThreads | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-anonymous-read | anonymous: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-anonymous-create | anonymous: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-anonymous-update | anonymous: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-anonymous-delete | anonymous: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-own-read | patient-own: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-own-create | patient-own: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-own-update | patient-own: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-own-delete | patient-own: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-other-read | patient-other: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-other-create | patient-other: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-other-update | patient-other: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-patient-other-delete | patient-other: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-staff-read | staff: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-staff-create | staff: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-staff-update | staff: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-staff-delete | staff: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-manager-read | manager: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-manager-create | manager: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-manager-update | manager: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-manager-delete | manager: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-chatMessages-revoked-read | revoked: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-revoked-create | revoked: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-revoked-update | revoked: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-revoked-delete | revoked: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-pending-read | pending: read chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-pending-create | pending: create chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-pending-update | pending: update chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chatMessages-pending-delete | pending: delete chatMessages | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-anonymous-read | anonymous: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-anonymous-create | anonymous: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-anonymous-update | anonymous: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-anonymous-delete | anonymous: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-own-read | patient-own: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-own-create | patient-own: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-own-update | patient-own: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-own-delete | patient-own: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-other-read | patient-other: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-other-create | patient-other: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-other-update | patient-other: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-patient-other-delete | patient-other: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-staff-read | staff: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-staff-create | staff: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-staff-update | staff: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-staff-delete | staff: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-manager-read | manager: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-manager-create | manager: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-manager-update | manager: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-manager-delete | manager: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-revoked-read | revoked: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-revoked-create | revoked: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-revoked-update | revoked: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-revoked-delete | revoked: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-pending-read | pending: read patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-pending-create | pending: create patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-pending-update | pending: update patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientNotifications-pending-delete | pending: delete patientNotifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-anonymous-read | anonymous: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-anonymous-create | anonymous: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-anonymous-update | anonymous: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-anonymous-delete | anonymous: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-own-read | patient-own: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-own-create | patient-own: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-own-update | patient-own: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-own-delete | patient-own: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-other-read | patient-other: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-other-create | patient-other: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-other-update | patient-other: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-patient-other-delete | patient-other: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-staff-read | staff: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-staff-create | staff: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-staff-update | staff: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-staff-delete | staff: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-manager-read | manager: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-admins-manager-create | manager: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-manager-update | manager: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-admins-manager-delete | manager: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-admins-revoked-read | revoked: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-admins-revoked-create | revoked: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-admins-revoked-update | revoked: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-admins-revoked-delete | revoked: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-admins-pending-read | pending: read admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-pending-create | pending: create admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-pending-update | pending: update admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-admins-pending-delete | pending: delete admins | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-anonymous-read | anonymous: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-anonymous-create | anonymous: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-anonymous-update | anonymous: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-anonymous-delete | anonymous: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-own-read | patient-own: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-own-create | patient-own: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-own-update | patient-own: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-own-delete | patient-own: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-other-read | patient-other: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-other-create | patient-other: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-other-update | patient-other: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-patient-other-delete | patient-other: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-staff-read | staff: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-staff-create | staff: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-staff-update | staff: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-staff-delete | staff: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-manager-read | manager: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-manager-create | manager: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-manager-update | manager: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-manager-delete | manager: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-revoked-read | revoked: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-revoked-create | revoked: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-revoked-update | revoked: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-revoked-delete | revoked: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-pending-read | pending: read patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-pending-create | pending: create patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-pending-update | pending: update patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientTrustedDevices-pending-delete | pending: delete patientTrustedDevices | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-anonymous-read | anonymous: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-anonymous-create | anonymous: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-anonymous-update | anonymous: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-anonymous-delete | anonymous: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-own-read | patient-own: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-own-create | patient-own: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-own-update | patient-own: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-own-delete | patient-own: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-other-read | patient-other: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-other-create | patient-other: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-other-update | patient-other: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-patient-other-delete | patient-other: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-staff-read | staff: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-staff-create | staff: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-staff-update | staff: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-staff-delete | staff: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-manager-read | manager: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-manager-create | manager: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-manager-update | manager: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-manager-delete | manager: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-revoked-read | revoked: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-revoked-create | revoked: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-revoked-update | revoked: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-revoked-delete | revoked: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-pending-read | pending: read patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-pending-create | pending: create patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-pending-update | pending: update patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientAvatars-pending-delete | pending: delete patientAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-anonymous-read | anonymous: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-anonymous-create | anonymous: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-anonymous-update | anonymous: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-anonymous-delete | anonymous: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-own-read | patient-own: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-own-create | patient-own: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-own-update | patient-own: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-own-delete | patient-own: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-other-read | patient-other: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-other-create | patient-other: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-other-update | patient-other: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-patient-other-delete | patient-other: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-staff-read | staff: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-staff-create | staff: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-staff-update | staff: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-staff-delete | staff: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-manager-read | manager: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-manager-create | manager: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-manager-update | manager: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-manager-delete | manager: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-revoked-read | revoked: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-revoked-create | revoked: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-revoked-update | revoked: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-revoked-delete | revoked: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-pending-read | pending: read adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-pending-create | pending: create adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-pending-update | pending: update adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-adminAvatars-pending-delete | pending: delete adminAvatars | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-anonymous-read | anonymous: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-settings-anonymous-create | anonymous: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-anonymous-update | anonymous: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-anonymous-delete | anonymous: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-patient-own-read | patient-own: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-settings-patient-own-create | patient-own: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-patient-own-update | patient-own: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-patient-own-delete | patient-own: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-patient-other-read | patient-other: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-settings-patient-other-create | patient-other: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-patient-other-update | patient-other: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-patient-other-delete | patient-other: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-staff-read | staff: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-staff-create | staff: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-staff-update | staff: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-staff-delete | staff: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-manager-read | manager: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-manager-create | manager: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-manager-update | manager: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-manager-delete | manager: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-settings-revoked-read | revoked: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-settings-revoked-create | revoked: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-revoked-update | revoked: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-revoked-delete | revoked: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-pending-read | pending: read settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-settings-pending-create | pending: create settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-pending-update | pending: update settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-settings-pending-delete | pending: delete settings | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-anonymous-read | anonymous: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-anonymous-create | anonymous: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-anonymous-update | anonymous: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-anonymous-delete | anonymous: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-own-read | patient-own: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-own-create | patient-own: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-own-update | patient-own: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-own-delete | patient-own: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-other-read | patient-other: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-other-create | patient-other: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-other-update | patient-other: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-patient-other-delete | patient-other: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-staff-read | staff: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-staff-create | staff: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-staff-update | staff: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-staff-delete | staff: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-manager-read | manager: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-manager-create | manager: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-manager-update | manager: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-manager-delete | manager: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-revoked-read | revoked: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-revoked-create | revoked: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-revoked-update | revoked: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-revoked-delete | revoked: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-pending-read | pending: read patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-pending-create | pending: create patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-pending-update | pending: update patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientSessions-pending-delete | pending: delete patientSessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-anonymous-read | anonymous: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-anonymous-create | anonymous: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-anonymous-update | anonymous: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-anonymous-delete | anonymous: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-own-read | patient-own: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-own-create | patient-own: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-own-update | patient-own: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-own-delete | patient-own: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-other-read | patient-other: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-other-create | patient-other: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-other-update | patient-other: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-patient-other-delete | patient-other: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-staff-read | staff: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-stockMovements-staff-create | staff: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-stockMovements-staff-update | staff: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-staff-delete | staff: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-manager-read | manager: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-stockMovements-manager-create | manager: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | PASS | PASS | Regression check passed. |
| RULE-stockMovements-manager-update | manager: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-manager-delete | manager: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-revoked-read | revoked: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-revoked-create | revoked: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-revoked-update | revoked: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-revoked-delete | revoked: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-pending-read | pending: read stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-pending-create | pending: create stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-pending-update | pending: update stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-stockMovements-pending-delete | pending: delete stockMovements | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-anonymous-read | anonymous: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-anonymous-create | anonymous: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-anonymous-update | anonymous: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-anonymous-delete | anonymous: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-own-read | patient-own: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-own-create | patient-own: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-own-update | patient-own: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-own-delete | patient-own: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-other-read | patient-other: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-other-create | patient-other: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-other-update | patient-other: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-patient-other-delete | patient-other: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-staff-read | staff: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-staff-create | staff: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-staff-update | staff: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-staff-delete | staff: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-manager-read | manager: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-manager-create | manager: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-manager-update | manager: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-manager-delete | manager: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-revoked-read | revoked: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-revoked-create | revoked: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-revoked-update | revoked: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-revoked-delete | revoked: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-pending-read | pending: read securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-pending-create | pending: create securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-pending-update | pending: update securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-securitySessions-pending-delete | pending: delete securitySessions | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-anonymous-read | anonymous: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-anonymous-create | anonymous: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-anonymous-update | anonymous: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-anonymous-delete | anonymous: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-own-read | patient-own: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-own-create | patient-own: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-own-update | patient-own: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-own-delete | patient-own: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-other-read | patient-other: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-other-create | patient-other: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-other-update | patient-other: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-patient-other-delete | patient-other: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-staff-read | staff: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-staff-create | staff: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-staff-update | staff: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-staff-delete | staff: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-manager-read | manager: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-manager-create | manager: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-manager-update | manager: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-manager-delete | manager: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-revoked-read | revoked: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-revoked-create | revoked: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-revoked-update | revoked: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-revoked-delete | revoked: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-pending-read | pending: read otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-pending-create | pending: create otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-pending-update | pending: update otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otpVerifications-pending-delete | pending: delete otpVerifications | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-anonymous-read | anonymous: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-anonymous-create | anonymous: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-anonymous-update | anonymous: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-anonymous-delete | anonymous: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-own-read | patient-own: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-own-create | patient-own: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-own-update | patient-own: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-own-delete | patient-own: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-other-read | patient-other: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-other-create | patient-other: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-other-update | patient-other: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-patient-other-delete | patient-other: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-staff-read | staff: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-staff-create | staff: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-staff-update | staff: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-staff-delete | staff: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-manager-read | manager: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-manager-create | manager: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-manager-update | manager: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-manager-delete | manager: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-revoked-read | revoked: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-revoked-create | revoked: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-revoked-update | revoked: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-revoked-delete | revoked: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-pending-read | pending: read patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-pending-create | pending: create patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-pending-update | pending: update patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-patientLoginOtps-pending-delete | pending: delete patientLoginOtps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-anonymous-read | anonymous: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-anonymous-create | anonymous: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-anonymous-update | anonymous: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-anonymous-delete | anonymous: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-own-read | patient-own: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-own-create | patient-own: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-own-update | patient-own: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-own-delete | patient-own: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-other-read | patient-other: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-other-create | patient-other: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-other-update | patient-other: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-patient-other-delete | patient-other: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-staff-read | staff: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-staff-create | staff: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-staff-update | staff: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-staff-delete | staff: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-manager-read | manager: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-manager-create | manager: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-manager-update | manager: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-manager-delete | manager: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-revoked-read | revoked: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-revoked-create | revoked: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-revoked-update | revoked: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-revoked-delete | revoked: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-pending-read | pending: read otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-pending-create | pending: create otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-pending-update | pending: update otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-otps-pending-delete | pending: delete otps | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-anonymous-read | anonymous: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-anonymous-create | anonymous: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-anonymous-update | anonymous: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-anonymous-delete | anonymous: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-own-read | patient-own: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-own-create | patient-own: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-own-update | patient-own: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-own-delete | patient-own: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-other-read | patient-other: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-other-create | patient-other: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-other-update | patient-other: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-patient-other-delete | patient-other: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-staff-read | staff: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-staff-create | staff: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-staff-update | staff: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-staff-delete | staff: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-manager-read | manager: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-manager-create | manager: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-manager-update | manager: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-manager-delete | manager: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-revoked-read | revoked: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-revoked-create | revoked: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-revoked-update | revoked: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-revoked-delete | revoked: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-pending-read | pending: read passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-pending-create | pending: create passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-pending-update | pending: update passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-passwordResets-pending-delete | pending: delete passwordResets | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-anonymous-read | anonymous: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-anonymous-create | anonymous: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-anonymous-update | anonymous: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-anonymous-delete | anonymous: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-own-read | patient-own: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-own-create | patient-own: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-own-update | patient-own: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-own-delete | patient-own: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-other-read | patient-other: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-other-create | patient-other: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-other-update | patient-other: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-patient-other-delete | patient-other: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-staff-read | staff: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-staff-create | staff: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-staff-update | staff: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-staff-delete | staff: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-manager-read | manager: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-manager-create | manager: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-manager-update | manager: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-manager-delete | manager: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-revoked-read | revoked: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-revoked-create | revoked: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-revoked-update | revoked: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-revoked-delete | revoked: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-pending-read | pending: read loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-pending-create | pending: create loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-pending-update | pending: update loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-loginAttempts-pending-delete | pending: delete loginAttempts | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-appointmentSlots-anonymous-read | anonymous: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-anonymous-create | anonymous: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-anonymous-update | anonymous: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-anonymous-delete | anonymous: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-own-read | patient-own: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-own-create | patient-own: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-own-update | patient-own: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-own-delete | patient-own: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-other-read | patient-other: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-other-create | patient-other: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-other-update | patient-other: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-patient-other-delete | patient-other: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-staff-read | staff: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-staff-create | staff: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-staff-update | staff: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-staff-delete | staff: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-manager-read | manager: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-manager-create | manager: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-manager-update | manager: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-manager-delete | manager: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-revoked-read | revoked: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-revoked-create | revoked: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-revoked-update | revoked: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-revoked-delete | revoked: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-pending-read | pending: read appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-pending-create | pending: create appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-pending-update | pending: update appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-appointmentSlots-pending-delete | pending: delete appointmentSlots | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-anonymous-read | anonymous: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-anonymous-create | anonymous: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-anonymous-update | anonymous: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-anonymous-delete | anonymous: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-own-read | patient-own: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-own-create | patient-own: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-own-update | patient-own: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-own-delete | patient-own: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-other-read | patient-other: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-other-create | patient-other: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-other-update | patient-other: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-patient-other-delete | patient-other: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-staff-read | staff: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-staff-create | staff: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-staff-update | staff: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-staff-delete | staff: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-manager-read | manager: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-manager-create | manager: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-manager-update | manager: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-manager-delete | manager: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-revoked-read | revoked: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-revoked-create | revoked: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-revoked-update | revoked: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-revoked-delete | revoked: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-pending-read | pending: read invites | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-pending-create | pending: create invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-pending-update | pending: update invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-invites-pending-delete | pending: delete invites | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-anonymous-read | anonymous: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-anonymous-create | anonymous: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-anonymous-update | anonymous: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-anonymous-delete | anonymous: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-own-read | patient-own: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-own-create | patient-own: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-own-update | patient-own: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-own-delete | patient-own: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-other-read | patient-other: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-other-create | patient-other: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-other-update | patient-other: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-patient-other-delete | patient-other: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-staff-read | staff: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-staff-create | staff: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-staff-update | staff: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-staff-delete | staff: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-manager-read | manager: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-manager-create | manager: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-manager-update | manager: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-manager-delete | manager: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | Allowed | Allowed | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-revoked-read | revoked: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-revoked-create | revoked: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-revoked-update | revoked: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-revoked-delete | revoked: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-pending-read | pending: read patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-pending-create | pending: create patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-pending-update | pending: update patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-patientChatState-pending-delete | pending: delete patientChatState | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-attack-authorizedPatients-patient UID takeover | patient UID takeover | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-attack-appointments-appointment ownership takeover | appointment ownership takeover | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-attack-appointments-appointment clinical edit | appointment clinical edit | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-attack-chatThreads-thread ownership takeover | thread ownership takeover | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-attack-chatThreads-thread hidden from staff | thread hidden from staff | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-chat-staff-spoof | Patient cannot impersonate staff | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | PASS | PASS | Regression check passed. |
| RULE-archived-read | Archived patient cannot read clinical record | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-idle-expired | Expired admin session cannot read clinical records | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | FAIL | PASS | Owner/role checks, server-owned OTP sessions, immutable identity and changed-field allowlists. |
| RULE-pending-own | Patient without OTP cannot read their own record | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |
| RULE-password-provider | Password-only SDK sign-in cannot bypass the gateway | Seed fictional fixture; direct Firebase SDK request with role token. | PERMISSION_DENIED | permission-denied | Not in baseline | PASS | Additional verification after remediation. |

### 7. Encrypted transmission and headers

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| APK-TRANSPORT | Compiled manifest disables cleartext traffic and app backup | Inspect the signed release APK; optional read-only isolated emulator inspection | Both false | Both false | Not in baseline | PASS | Additional verification after remediation. |
| HTTPS-001 | HTTP redirects to HTTPS | Read-only request to https://ka-clinic-system-final.vercel.app | 301/302/307/308 with HTTPS location | 308 https://ka-clinic-system-final.vercel.app/ | PASS | PASS | Regression check passed. |
| HTTPS-002 | HTTPS available | Read-only request to https://ka-clinic-system-final.vercel.app | 200 | 200 | PASS | PASS | Regression check passed. |
| HEADER-strict-transport-security | strict-transport-security | Read-only request to https://ka-clinic-system-final.vercel.app | Present | max-age=31536000; includeSubDomains | PASS | PASS | Regression check passed. |
| HEADER-content-security-policy | content-security-policy | Read-only request to https://ka-clinic-system-final.vercel.app | Present | default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.cloudfunctions.net https://unpkg.com https://server.arcgisonline.com; frame-src https://*.firebaseapp.com https://maps.google.com https://www.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests | FAIL | PASS | Global HTTPS security headers in vercel.json. |
| HEADER-x-content-type-options | x-content-type-options | Read-only request to https://ka-clinic-system-final.vercel.app | Present | nosniff | FAIL | PASS | Global HTTPS security headers in vercel.json. |
| HEADER-x-frame-options | x-frame-options | Read-only request to https://ka-clinic-system-final.vercel.app | Present | DENY | FAIL | PASS | Global HTTPS security headers in vercel.json. |
| HEADER-referrer-policy | referrer-policy | Read-only request to https://ka-clinic-system-final.vercel.app | Present | strict-origin-when-cross-origin | FAIL | PASS | Global HTTPS security headers in vercel.json. |
| HEADER-permissions-policy | permissions-policy | Read-only request to https://ka-clinic-system-final.vercel.app | Present | camera=(), microphone=(), geolocation=() | FAIL | PASS | Global HTTPS security headers in vercel.json. |
| TLS-001 | Trusted and unexpired TLS certificate | Read-only request to https://ka-clinic-system-final.vercel.app | Trusted certificate, validity in future | Google Trust Services; expires Nov 27 19:48:08 2026 GMT | PASS | PASS | Regression check passed. |
| LIVE-LOGIN | Live login page renders | Read-only Chrome navigation; no login or record mutations | Login visible; no browser runtime errors | 0 runtime errors | Not in baseline | PASS | Additional verification after remediation. |
| LIVE-MIXED-CONTENT | No mixed-content requests on live login page | Capture browser network requests without signing in | Zero HTTP subresource requests | 0 HTTP requests | Not in baseline | PASS | Additional verification after remediation. |
| LIVE-CSP | CSP permits required login resources | Inspect browser console for CSP blocking | Zero CSP violations | 0 CSP violations | Not in baseline | PASS | Additional verification after remediation. |
| LIVE-ADMIN-PRECHECK | Deployed authentication function initializes and returns expected JSON | POST /api/admin-login; fictional precheck or missing token; no production account/data mutation | 200 JSON with success=true | 200, JSON, success=true | Not in baseline | PASS | Additional verification after remediation. |
| LIVE-ADMIN-GUARD | Deployed authentication function initializes and returns expected JSON | POST /api/devices; fictional precheck or missing token; no production account/data mutation | 401 JSON with success=false | 401, JSON, success=false | Not in baseline | PASS | Additional verification after remediation. |
| LIVE-PATIENT-GUARD | Deployed authentication function initializes and returns expected JSON | POST /api/send-otp; fictional precheck or missing token; no production account/data mutation | 401 JSON with success=false | 401, JSON, success=false | Not in baseline | PASS | Additional verification after remediation. |
| LIVE-ACCOUNTS-GUARD | Deployed authentication function initializes and returns expected JSON | POST /api/admin-invites; fictional precheck or missing token; no production account/data mutation | 401 JSON with success=false | 401, JSON, success=false | Not in baseline | PASS | Additional verification after remediation. |

### 8. API keys, secrets and dependencies

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-028 | Cron dose-sweep rejects missing/wrong CRON_SECRET | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| API-029 | Cron dose-sweep rejects missing/wrong CRON_SECRET | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| API-030 | Cron backup-cron rejects missing/wrong CRON_SECRET | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| API-031 | Cron backup-cron rejects missing/wrong CRON_SECRET | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| API-032 | Cron patient-archive-sweep rejects missing/wrong CRON_SECRET | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| API-033 | Cron patient-archive-sweep rejects missing/wrong CRON_SECRET | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| API-034 | Unset CRON_SECRET fails closed | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| APK-SIGNATURE | APK signature is valid and matches v1.0.2 | Inspect the signed release APK; optional read-only isolated emulator inspection | 4fef45c1eae069ede9b94c98567b94116f9765e778257a69ab729a3391b62bfe | 4fef45c1eae069ede9b94c98567b94116f9765e778257a69ab729a3391b62bfe | Not in baseline | PASS | Additional verification after remediation. |
| APK-VERSION | Release package and version allow an upgrade | Inspect the signed release APK; optional read-only isolated emulator inspection | com.anonymous.knarabiesmonitoring; 1.0.3; versionCode 4 | package: name='com.anonymous.knarabiesmonitoring' versionCode='4' versionName='1.0.3' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16' | Not in baseline | PASS | Additional verification after remediation. |
| APK-BUNDLE | Packaged bundle equals the final compiled output and includes remote revocation | Inspect the signed release APK; optional read-only isolated emulator inspection | Byte equality; revoke-device present | Byte equal; remote revocation included | Not in baseline | PASS | Additional verification after remediation. |
| APK-ABIS | Release includes all four Android architectures | Inspect the signed release APK; optional read-only isolated emulator inspection | arm64-v8a, armeabi-v7a, x86, x86_64 | arm64-v8a, armeabi-v7a, x86, x86_64 | Not in baseline | PASS | Additional verification after remediation. |
| DEPENDENCIES-server | server dependency audit | npm audit --json in . | Zero published advisories | 0 affected package entries; 0 root advisories | Not in baseline | PASS | Additional verification after remediation. |
| DEPENDENCIES-admin | admin dependency audit | npm audit --json in ka-clinic-admin | Zero published advisories | 5 affected package entries; 1 root advisories | Not in baseline | FAIL | Upstream braces/node-forge advisory remains; see limitations. |
| DEPENDENCIES-patient | patient dependency audit | npm audit --json in patient-app | Zero published advisories | 14 affected package entries; 2 root advisories | Not in baseline | FAIL | Upstream braces/node-forge advisory remains; see limitations. |
| RUNTIME-CJS-JWKS | Firebase Auth/App Check load and RSA JWKS verification without require(esm) | Child Node process disables require(esm); generated test key only; no environment files, credentials or network requests. | SDK imports succeed; valid RSA signature accepted; tampered payload rejected | Imports and signature checks passed | Not in baseline | PASS | Additional verification after remediation. |
| SECRET-HISTORY | No server secrets in Git history | Gitleaks redacted scan and exact-value search of built client files | Zero server-secret findings | 1 findings requiring review; values redacted | Not in baseline | FAIL | Rotate the historic Gemini key; history remains unchanged. |
| SECRET-SOURCE | No server secrets in current tracked and pending source | Gitleaks redacted scan and exact-value search of built client files | Zero server-secret findings | 0 findings requiring review; values redacted | Not in baseline | PASS | Additional verification after remediation. |
| SECRET-BUNDLE-ADMIN | Server-only values absent from client bundle | Gitleaks redacted scan and exact-value search of built client files | Zero matches | 62 files; 19 locally configured secret representations; 0 matches | Not in baseline | PASS | Additional verification after remediation. |
| SECRET-BUNDLE-PATIENT | Server-only values absent from client bundle | Gitleaks redacted scan and exact-value search of built client files | Zero matches | 1 files; 19 locally configured secret representations; 0 matches | Not in baseline | PASS | Additional verification after remediation. |

### 9. Unauthorized records and input rendering

| ID | Description | Steps | Expected | Actual | Before | PASS/FAIL | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-016 | Unauthorized report export/email | Direct handler request with real Firebase emulator token; simulated documents only. | 401 or 403 | 401 or 403 | PASS | PASS | Regression check passed. |
| API-017 | Unauthorized report export/email | Direct handler request with real Firebase emulator token; simulated documents only. | 401 or 403 | 401 or 403 | PASS | PASS | Regression check passed. |
| API-018 | Unauthorized report export/email | Direct handler request with real Firebase emulator token; simulated documents only. | 401 or 403 | 401 or 403 | PASS | PASS | Regression check passed. |
| API-019 | Unauthorized report export/email | Direct handler request with real Firebase emulator token; simulated documents only. | 401 or 403 | 401 or 403 | FAIL | PASS | Shared authenticated role/session guards and input ownership validation. |
| API-060 | Missing manager token rejected before mutation | Direct handler request with real Firebase emulator token; simulated documents only. | 401 | 401 | PASS | PASS | Regression check passed. |
| APK-EMULATOR-LAUNCH | Release app renders onboarding without native/JS crash | Inspect the signed release APK; optional read-only isolated emulator inspection | Onboarding visible; process alive; zero app error logs | Onboarding visible; process alive; zero app error logs | Not in baseline | PASS | Additional verification after remediation. |
| UI-XSS-NAME | Script markup in a simulated patient name remains text | Headless Chrome against local Vite and Firebase emulators. Browser clock advanced for idle checks. | Literal markup visible; no injected script executes | Literal markup visible; no injected script executes | Not in baseline | PASS | Additional verification after remediation. |

## Baseline failures preserved


### api-before.json

| ID | Expected | Actual |
| --- | --- | --- |
| API-019 | 401 or 403 | Expected rejection; received 200 |
| API-020 | 200 | Expected values to be strictly equal:  400 !== 200  |
| API-024 | 403; B owner unchanged | Expected rejection; received 200 |
| API-035 | 403; lock remains | Expected rejection; received 200 |
| API-036 | Five 401 responses; lock set for 15 minutes | Expected values to be strictly equal:  400 !== 401  |
| API-038 | 200 custom token | Expected values to be strictly equal:  400 !== 200  |
| API-039 | Identical status and error | Expected values to be strictly equal:  400 !== 401  |
| API-040 | Five 401 then 429, including correct password | Expected values to be strictly equal:  400 !== 401  |
| API-041 | Identical generic response | Expected values to be strictly deep-equal: + actual - expected    { +   expiresInMinutes: 10, +   maskedEmail: 'ap•••••••@example.test', +   success: true -   error: 'No clinic account registered with this email.', -   success: false   }  |
| API-042 | Identical generic response | Expected values to be strictly deep-equal: + actual - expected    { +   error: 'This patient record already has a registered account. Please sign in instead.', -   error: 'Patient record not found. Please register at the clinic first.',     success: false   }  |
| API-043 | SHA-256 codeHash, no code or otp field/API code | The input did not match the regular expression /^[a-f0-9]{64}$/. Input:  ''  |
| API-046 | Sixth attempt 429 | Expected values to be strictly equal:  400 !== 429  |
| API-047 | Exactly one 200 | Expected values to be strictly equal:  0 !== 1  |
| API-048 | SHA-256 codeHash, no code or otp field/API code | The input did not match the regular expression /^[a-f0-9]{64}$/. Input:  ''  |
| API-052 | Exactly one 200 | Expected values to be strictly equal:  0 !== 1  |
| API-053 | 403; no account created | Expected rejection; received 200 |
| API-055 | 401 without second factor/gateway | Expected rejection; received 200 |
| API-056 | 401 after expiry | Expected rejection; received 200 |
| API-057 | 200; cookie Max-Age=0; next API rejected | Expected values to be strictly equal:  400 !== 200  |
| API-058 | 200; session docs removed; old token rejected | Expected values to be strictly equal:  true !== false  |

### headers-before.json

| ID | Expected | Actual |
| --- | --- | --- |
| HEADER-content-security-policy | Present | Missing |
| HEADER-x-content-type-options | Present | Missing |
| HEADER-x-frame-options | Present | Missing |
| HEADER-referrer-policy | Present | Missing |
| HEADER-permissions-policy | Present | Missing |

### rules-before.json

| ID | Expected | Actual |
| --- | --- | --- |
| RULE-authorizedPatients-anonymous-read | PERMISSION_DENIED | Allowed |
| RULE-authorizedPatients-patient-own-update | PERMISSION_DENIED | Allowed |
| RULE-authorizedPatients-patient-other-read | PERMISSION_DENIED | Allowed |
| RULE-authorizedPatients-revoked-read | PERMISSION_DENIED | Allowed |
| RULE-authorizedPatients-pending-read | PERMISSION_DENIED | Allowed |
| RULE-admins-manager-update | PERMISSION_DENIED | Allowed |
| RULE-admins-manager-delete | PERMISSION_DENIED | Allowed |
| RULE-admins-revoked-read | PERMISSION_DENIED | Allowed |
| RULE-admins-revoked-create | PERMISSION_DENIED | Allowed |
| RULE-admins-revoked-update | PERMISSION_DENIED | Allowed |
| RULE-admins-revoked-delete | PERMISSION_DENIED | Allowed |
| RULE-settings-anonymous-read | PERMISSION_DENIED | Allowed |
| RULE-settings-patient-own-read | PERMISSION_DENIED | Allowed |
| RULE-settings-patient-other-read | PERMISSION_DENIED | Allowed |
| RULE-settings-revoked-read | PERMISSION_DENIED | Allowed |
| RULE-settings-pending-read | PERMISSION_DENIED | Allowed |
| RULE-attack-authorizedPatients-patient UID takeover | PERMISSION_DENIED | Allowed |
| RULE-attack-appointments-appointment ownership takeover | PERMISSION_DENIED | Allowed |
| RULE-attack-appointments-appointment clinical edit | PERMISSION_DENIED | Allowed |
| RULE-attack-chatThreads-thread ownership takeover | PERMISSION_DENIED | Allowed |
| RULE-archived-read | PERMISSION_DENIED | Allowed |
| RULE-idle-expired | PERMISSION_DENIED | Allowed |

## Release artifact

APK: kna-clinic-1.0.3.apk (103716703 bytes).

SHA-256: `20faf69cabcbc4a4e11f308d8d78e50481e885b75612456fb335ca9fddb8e469`.

Signing certificate SHA-256: `4fef45c1eae069ede9b94c98567b94116f9765e778257a69ab729a3391b62bfe`, matching the published v1.0.2 certificate. The original private keystore was retrieved from the already-authenticated Expo account and is excluded from Git/Vercel.

On the isolated emulator with a separate private data image, the original v1.0.2 APK was installed, then upgraded using `adb install -r` to v1.0.3. Both installs returned Success; the updated app displayed onboarding with no ReactNativeJS or AndroidRuntime error logs. No production login or clinical data operation was performed. The generated native launcher was updated from the installed Expo SDK template and Windows Ninja was updated to 1.13.2 to complete the native build.
