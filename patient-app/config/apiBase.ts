import Constants from 'expo-constants';

// Base URL for the serverless functions in /api at the repo root (deployed
// alongside ka-clinic-admin on Vercel). A mobile app has no "same origin" to
// fall back on the way the web dashboard does with a relative fetch, so the
// address has to be carried in the build itself.
//
// EXPO_PUBLIC_* values are inlined by EAS at build time, so a binary produced
// from a profile that is missing the env var ships with no server address at
// all — every /api call then fails with "the clinic server address is not
// configured". The app.json `extra.apiBaseUrl` value travels with the manifest
// instead, so it is always present and acts as the fallback.
export const API_BASE_URL: string = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ||
  ''
).replace(/\/+$/, '');
