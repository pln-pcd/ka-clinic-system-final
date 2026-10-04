import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Opt-in local Firebase Emulator (npm run dev:emulator, see .env.emulator).
// Off unless VITE_USE_FIREBASE_EMULATOR is exactly "true".
const USE_EMULATOR = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
const EMULATOR_HOST = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyCcjj9YoRJ-DSICbZp9v9JflPcha1kdseo",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "ka-clinic-system.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "ka-clinic-system",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "ka-clinic-system.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1073780714968",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:1073780714968:web:84c73168989e685181d6ad"
};

if (USE_EMULATOR) firebaseConfig.projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-ka-clinic';

const app = initializeApp(firebaseConfig);
// Offline cache shared by every open tab: data shows from the cache at once
// on reload / page switch and then updates live from the server.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);

if (USE_EMULATOR) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  console.info('[firebase] using the local emulator, project', firebaseConfig.projectId);
}
// ── Live listeners that can't crash a page ─────────────────────────────────
// Use listen() instead of onSnapshot() (same arguments, same return value).
//
// If the Firestore SDK hits an internal error (e.g. the multi-tab
// "INTERNAL ASSERTION FAILED: Unexpected state" bug fixed in firebase 12.13),
// its operation queue is marked failed and EVERY later onSnapshot() call and
// every unsubscribe() throws synchronously. Unwrapped, that throw lands in a
// React effect or effect cleanup, so simply leaving a page with listeners
// (Settings) crashed the next page. Here a failed subscribe reports through
// the listener's own error callback, and a failed unsubscribe is logged and
// ignored.
let firestoreFailureLogged = false;
function reportListenerFailure(err) {
  if (firestoreFailureLogged) return;
  firestoreFailureLogged = true;
  console.error('[firestore] live listener failed; live updates may have stopped until the page is reloaded:', err);
}

export function listen(ref, ...args) {
  let unsub;
  try {
    unsub = onSnapshot(ref, ...args);
  } catch (err) {
    reportListenerFailure(err);
    // onSnapshot(ref, [options,] next, error) or onSnapshot(ref, [options,] observer)
    const rest = args[0] && typeof args[0] === 'object' && !('next' in args[0]) ? args.slice(1) : args;
    const onError = typeof rest[0] === 'function' ? rest[1] : rest[0]?.error;
    if (typeof onError === 'function') {
      try { onError(err); } catch (e) { console.error(e); }
    }
    return () => {};
  }
  return () => {
    try { unsub(); } catch (err) { reportListenerFailure(err); }
  };
}
