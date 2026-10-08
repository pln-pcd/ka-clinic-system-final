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
- `node --no-experimental-require-module scripts/security/api.mjs`: 63/63
  simulated authentication/API tests pass against loopback emulators.
- Server `npm audit`: zero advisories with the scoped override.
- `node scripts/security/live.mjs`: includes deployed admin precheck and
  unauthenticated admin, patient and account guards, requiring expected JSON
  statuses rather than accepting a rendered static page as backend evidence.

The patient APK calls these server functions; this server dependency fix does
not require a replacement APK or another Firestore deployment.

Upstream reference: [JWKS CommonJS/JOSE ESM issue](https://github.com/auth0/node-jwks-rsa/issues/507).
