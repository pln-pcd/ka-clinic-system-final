// config/appPrefs.ts
//
// Small AsyncStorage-backed preferences that must outlive a Firebase Auth
// session: whether this install has already shown onboarding, and whether the
// patient asked to stay signed in. Both are device-local by design — they are
// properties of this phone, not of the clinic record.
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_SEEN_KEY = 'kna.onboardingSeen.v1';
const KEEP_SIGNED_IN_KEY  = 'kna.keepSignedIn.v1';
const DEVICE_ID_KEY       = 'kna.deviceId.v1';

// ── Onboarding ───────────────────────────────────────────────────────
// Set once the patient reaches the end of the intro carousel (or signs in,
// which proves they are not a first-time user). Read on launch to decide
// between the carousel and going straight to login/home.
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === '1';
  } catch {
    // A storage failure should not trap someone in onboarding forever; treating
    // it as "seen" is the less annoying wrong answer of the two.
    return true;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
  } catch {
    // Non-fatal: worst case the carousel shows again next launch.
  }
}

// ── "Keep me signed in" ──────────────────────────────────────────────
// Firebase persists sessions to AsyncStorage unconditionally, so opting OUT
// cannot be expressed as a Firebase persistence mode on React Native. Instead
// the preference is recorded here and enforced at launch: a session found
// without this flag set is signed out before the app renders.
export async function getKeepSignedIn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEEP_SIGNED_IN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setKeepSignedIn(value: boolean): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, '1');
    else await AsyncStorage.removeItem(KEEP_SIGNED_IN_KEY);
  } catch {
    // Non-fatal — defaults to the safer "do not keep signed in".
  }
}

// ── Stable per-install device id ─────────────────────────────────────
// Identifies this installation in the patient's device list. Regenerated if
// the app is reinstalled, which is correct: that is a new session store.
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // Ephemeral fallback: the device still appears in the list for this run.
    return `dev_ephemeral_${Math.random().toString(36).slice(2, 10)}`;
  }
}
