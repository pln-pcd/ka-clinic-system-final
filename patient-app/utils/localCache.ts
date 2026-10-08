// Last-known copies of small pieces of patient data (the MRN for a uid, the
// vaccination record), so a launch can show them at once while Firestore
// refreshes in the background.
//
// Firestore's own persistent cache needs IndexedDB, which React Native does
// not have, so the JS SDK only keeps data in memory for the session. This is
// the on-disk stand-in: values are JSON in AsyncStorage, and primeCache()
// loads them into memory during launch (while the splash screen is still up)
// so screens can read them synchronously with peekCache() on first render.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'kna.cache.v1:';
const memory = new Map<string, unknown>();

export const cacheKeys = {
  mrnForUid: (uid: string) => `mrn:${uid}`,
  vaccination: (mrn: string) => `vax:${mrn}`,
};

/** Loads the given keys from disk into memory. Never throws. */
export async function primeCache(keys: string[]): Promise<void> {
  try {
    const pairs = await AsyncStorage.multiGet(keys.map(k => PREFIX + k));
    pairs.forEach(([k, v]) => {
      if (v == null) return;
      try { memory.set(k.slice(PREFIX.length), JSON.parse(v)); } catch { /* corrupt entry: ignore */ }
    });
  } catch { /* no cache is fine */ }
}

/** Synchronous read of a primed (or written this session) value. */
export function peekCache<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  await primeCache([key]);
  return memory.get(key) as T | undefined;
}

/** Stores a value (null removes it). Best effort. */
export function writeCache(key: string, value: unknown): void {
  if (value == null) {
    memory.delete(key);
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
    return;
  }
  memory.set(key, value);
  try {
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
  } catch { /* unserialisable: keep the memory copy only */ }
}

/** Drops every cached value (sign-out), so the next account starts clean. */
export async function clearCache(): Promise<void> {
  memory.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* best effort */ }
}
