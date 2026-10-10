# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Demo data (local Firebase Emulator)

Demo data lets you test and present the whole system without real patient data. It runs against the local Firebase Emulator only, never the live project.

### Requirements

Java 21 or newer and the Firebase CLI (`npx firebase` works).

### Start and seed

```bash
npm run emulators            # terminal 1: Auth and Firestore emulators, UI at http://127.0.0.1:4000
npm run seed:demo            # terminal 2: writes the demo data (safe to run again, no duplicates)
npm run test:archive-clock   # optional: checks the restore clock, login lock and 30 day conversation deletion
```

Then run the apps against the emulator:

```bash
cd ka-clinic-admin && npm run dev:emulator    # dashboard and its local /api
```

For the patient app, set these in `patient-app/.env` and start Expo as usual:

```
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=<your computer's LAN IP>   # 10.0.2.2 on the Android emulator
EXPO_PUBLIC_API_BASE_URL=http://<your computer's LAN IP>:5173
```

Emulator data is kept in memory and is gone when the emulators stop. Seed again after each start.

### Demo logins

Password for every demo account: `DemoPass2026`

| Where | Sign in with | Notes |
| --- | --- | --- |
| Patient app | MRN printed by the seed (Mara L. Villaflor) | Full dose history |
| Patient app | MRN printed by the seed (Noel Dizon) | No doses yet, several empty fields |
| Dashboard | demo.manager@example.com | Manager role |
| Dashboard | demo.staff@example.com | Staff role |

Sign-in codes are not emailed under the emulator. The server log shows `[mailer:emulator] not sent`, and the code itself is in the Emulator UI:

- Patient app: Firestore > `patientLoginOtps` > the patient's uid > `otp`
- Dashboard: Firestore > `otps` > the admin's uid > `code`

### What the seed writes

35 fictional patients (archived, restored, completed, ongoing, missed dose, newly registered), matching patient app accounts, incident map pins, inventory whose stock matches the doses given, appointments, and conversations. Every document has `isDemo: true` and `demoBatch`. Every demo account uid starts with `demo-`.

### Remove it

```bash
npm run seed:demo:clear
```

It lists everything it will delete and asks you to type DELETE. It removes only documents marked `isDemo`, messages in demo conversations, sign-in records of demo accounts, and Auth users whose uid starts with `demo-`.

The scripts refuse to run without an explicit `--project`, require a `demo-` project id with `--emulator`, and refuse the live `ka-clinic-system` project unless `--allow-production` is passed.

## Study mode & ethics

During the thesis study the system runs under the ethics rules in [docs/STUDY_MODE.md](docs/STUDY_MODE.md):

- **Chatbot (KAI):** general clinic information, office hours, contact details, appointment procedures and app navigation only. No medical advice of any kind, and no patient's own schedule details (navigation replies instead). A disclaimer is always visible. Test prompts only, no real patients. Test: `node scripts/test-chatbot-scope.mjs`.
- **Incident map:** simulated, non-identifiable records only (`isSimulated: true`), no addresses / barangays / coordinates, banner + "SIMULATED DATA" watermark, signed-in admins only. Seed: `node --env-file=.env scripts/seed-simulated-incidents.mjs`.
- **Chatbot study:** test prompts only, with one persistent medical disclaimer. The test-environment banner was removed in 1.0.4.
- **Flag** (on unless set to `false`): `VITE_MAP_STUDY_MODE` (hides "Pin Incident Map" on patient records).
- Seed data only; reports contain no incident locations.
# Security verification and release

The complete pass/fail evidence, fixes, limitations and reproduction commands
are in [SECURITY-TEST-REPORT.md](SECURITY-TEST-REPORT.md) and its PDF version.
Security scripts live in `scripts/security/`; results are in
`docs/security-results/`. Run destructive tests only against the fixed
`demo-ka-security` loopback emulators. Rules tests clear the emulator database;
run rules, API and browser suites serially. Never use production accounts.

Patient release 1.0.3 requires the server password gateway and OTP session gate.
Older APKs must be updated when the hardened production rules are released.
See the report for idle logout, trusted-device, booking and signup behavior.
