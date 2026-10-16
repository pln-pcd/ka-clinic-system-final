// Startup / sign-in timing marks, logged once each ("[perf] name 1234ms",
// milliseconds since the JS bundle started). Read with
// `adb logcat -s ReactNativeJS | grep perf` to measure app opening, sign-in
// and sign-up on a real device. No data leaves the phone.
const start = Date.now();
const seen = new Set<string>();

export function perfMark(name: string, since?: number) {
  if (seen.has(name)) return;
  seen.add(name);
  console.log(`[perf] ${name} ${Date.now() - (since ?? start)}ms`);
}

export const perfNow = () => Date.now();
