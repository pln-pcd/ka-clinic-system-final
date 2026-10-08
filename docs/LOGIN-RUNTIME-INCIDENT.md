# Authentication runtime incident — 8 October 2026

The released website loaded, but its admin login API crashed during Firebase
SDK initialization. Vercel logs showed `ERR_REQUIRE_ESM` from
`jwks-rsa@4.1.0` synchronously requiring the ESM-only `jose@6.2.12`.
The same dependency loaded under local Node 24 because native `require(esm)`
was enabled there. The deployed function loader did not support that path.
The browser attempted to parse the platform's non-JSON error response and
displayed “Something went wrong. Please try again.”

The release checks covered static page loading and emulator authentication,
but missed deployed authentication function startup. Four added live API
checks all failed before remediation, while the three static browser checks
passed. These requests used a fictional precheck email or no token and did
not read/write accounts, guess passwords, send mail or access clinic records.

The root package now scopes a `jose@5.10.0` override to `jwks-rsa`, retaining
Firebase Admin 14.5 and JWKS 4.1 while using a CommonJS-compatible JOSE export.
No authentication checks or Firestore protections were relaxed. The override
is locked in `package-lock.json`. Remove it when the upstream package or
deployment loader supports this module combination, after running the tests.

Verification:

- `node scripts/security/runtime.mjs`: SDK Auth/App Check imports and generated
  RSA JWKS verification pass with `--no-experimental-require-module`; a tampered
  payload is rejected. The test uses no credentials or network.
- `node --no-experimental-require-module scripts/security/api.mjs`: 65/65
  simulated authentication/API tests pass against loopback emulators.
- Server `npm audit`: zero advisories with the scoped override.
- `node scripts/security/live.mjs`: includes deployed admin precheck and
  unauthenticated admin, patient and account guards, requiring expected JSON
  statuses rather than accepting a rendered static page as backend evidence.
  All 7/7 checks passed after production deployment
  `dpl_AAnZZRidXQfghrNhbqrcUGFB3YSp` was aliased to the public website.

The patient APK calls these server functions; this server dependency fix does
not require a replacement APK or another Firestore deployment.

A read-only check of the reported account identified a second compatibility
issue: the existing active manager document stored a capitalized email, while
the gateway queried a lowercase email with Firestore's exact equality. The
account was enabled and neither login bucket nor account lock was active.
The shared admin lookup now falls back to Firebase Auth's email lookup and
then reads `admins/{verifiedAuthUid}`, requiring normalized stored email equality.
It neither scans the directory nor trusts a caller-supplied UID. Two added
emulator regressions verify mixed-case/whitespace compatibility and rejection
when the stored admin email belongs to another identity. No production account
fields or password were changed.

Upstream reference: [JWKS CommonJS/JOSE ESM issue](https://github.com/auth0/node-jwks-rsa/issues/507).
