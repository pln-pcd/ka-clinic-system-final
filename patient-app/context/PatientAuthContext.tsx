// Resolves the real, persisted Firebase Auth session into the clinic
// identity (MRN) the rest of the app keys its Firestore reads on, so every
// screen shares one auth listener + one MRN lookup instead of duplicating both.
//
// Also owns three session-lifetime concerns that must run before any screen
// renders: enforcing the "keep me signed in" choice, gating every non-guest
// session behind the login second factor (OTP, or a server-verified trusted
// device), and registering/watching this device so a sign-out issued
// elsewhere takes effect here.
//
// Second-factor gate: `user` exposed to the app is null until `verified` is
// true for the current Firebase session. A password-only sign-in therefore
// never reaches the tabs. Verification is granted only by
//   • completeSecondFactor() — called by the OTP screen after a code passes,
//     or by login after checkLoginTrust() returned true; or
//   • the launch path below, where a restored session is re-checked against
//     the server and signed out if this device is not trusted.
import type { User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { withTimeout } from '../utils/timeout';
import { perfMark } from '../utils/perf';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, checkLoginTrust, firebaseConfig, onAuthStateChanged, resolveMRNForUser, signOut } from '../config/backend';
import { getKeepSignedIn, getTrustToken, hasSeenOnboarding } from '../config/appPrefs';
import { clearThisDeviceSession, registerThisDevice, watchOwnSession } from '../config/deviceSessions';
import { cacheKeys, clearCache, peekCache, primeCache, readCache, writeCache } from '../utils/localCache';

type PatientAuthState = {
  user: User | null;
  mrn: string | null;
  isGuest: boolean;
  loading: boolean;
  mrnLoading: boolean;
  deviceId: string | null;
  /** Firebase session that exists but has not passed the second factor yet. */
  pendingUser: User | null;
  /** Mark the current Firebase session as second-factor verified, with the
   *  one MRN the server issued that session for. */
  completeSecondFactor: (mrn?: string | null) => void;
  /** Read once at launch, so routing never waits on storage. */
  seenOnboarding: boolean;
  /** Set when the account resolves to no single MRN (shown on Home). */
  mrnError: string | null;
  /** Bumped when a background trust check re-grants the server session, so
   *  live listeners that started before it can subscribe again. */
  sessionKey: number;
};

const PatientAuthContext = createContext<PatientAuthState>({
  user: null,
  mrn: null,
  isGuest: false,
  loading: true,
  mrnLoading: false,
  deviceId: null,
  pendingUser: null,
  completeSecondFactor: () => {},
  seenOnboarding: true,
  mrnError: null,
  sessionKey: 0,
});

export function PatientAuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  // uid of the session that passed the second factor. Compared against the
  // live Firebase uid so a new sign-in never inherits an older verification.
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null);
  const verifiedUidRef = useRef<string | null>(null);
  useEffect(() => { verifiedUidRef.current = verifiedUid; }, [verifiedUid]);
  const [loading, setLoading] = useState(true);
  const [mrn, setMrn] = useState<string | null>(null);
  const [mrnLoading, setMrnLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [seenOnboarding, setSeenOnboarding] = useState(true);
  const [mrnError, setMrnError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  // MRN the server issued with the second factor, keyed by uid.
  const serverMrn = useRef<{ uid: string; mrn: string } | null>(null);

  // True once the first auth callback has been evaluated. The "keep me signed
  // in" check must only run against a session restored from storage at launch,
  // never against a session the patient just created by signing in.
  const launchHandled = useRef(false);

  // Launch: the restored session is resolved with the native splash screen
  // still up (components/AppShells.tsx hides it when `loading` turns false).
  // The server trust check is the one network call that has to finish first:
  // it is the second factor for a restored session. Everything else the first
  // screen needs (the MRN for this uid, the last-known vaccination record) is
  // read from the on-disk cache at the same time, so Home renders with data
  // the moment the check passes and Firestore refreshes it in the background.
  // A session opened offline (trust token present, server unreachable). It
  // is re-checked as soon as the app is active and online again; an explicit
  // "not trusted" then signs it out.
  const offlineSession = useRef(false);

  const endRestoredSession = async (uid: string) => {
    try { await withTimeout(clearThisDeviceSession(uid), 4000, 'Session clear'); } catch {}
    try { await signOut(auth); } catch {}
    setAuthUser(null);
  };

  // Fast first screen: Firebase restores the saved session only after a
  // network round trip (it reloads the user from the server), about a second
  // on a phone. The saved session itself is on disk, so it is read directly
  // and the first screen shows at once: a guest straight away; a patient when
  // "Keep me signed in", a trust token and a cached record are all on this
  // device. The full checks below (Firebase restore, keep-signed-in, server
  // trust check) still run and sign out anything that does not hold up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`;
        const raw = await withTimeout(AsyncStorage.getItem(key), 1500, 'Saved session', null);
        if (cancelled || launchHandled.current || !raw) return;
        const saved = JSON.parse(raw);
        if (!saved?.uid) return;
        const early = { uid: saved.uid, isAnonymous: !!saved.isAnonymous, email: saved.email ?? null, displayName: saved.displayName ?? null } as unknown as User;
        if (!saved.isAnonymous) {
          const [keep, token] = await Promise.all([
            withTimeout(getKeepSignedIn(), 1500, 'Prefs', false),
            withTimeout(getTrustToken(), 1500, 'Keystore', null).catch(() => null),
            withTimeout(primeLaunchCache(saved.uid), 1500, 'Cache', undefined).catch(() => {}),
          ]);
          let cachedMrn = peekCache<string>(cacheKeys.mrnForUid(saved.uid));
          if (!cachedMrn) {
            try {
              const fallback = await AsyncStorage.getItem(`kna:last_mrn:${saved.uid}`);
              if (fallback) cachedMrn = fallback;
            } catch {}
          }
          if (cancelled || launchHandled.current || !keep) return;
          if (cachedMrn) setMrn(cachedMrn);
          setVerifiedUid(saved.uid);
        }
        setSeenOnboarding(true);
        setAuthUser(prev => prev ?? early);
        perfMark('auth-ready-fast');
        setLoading(false);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Last resort: whatever happens below, the splash never stays up longer
    // than this; the app opens on sign-in (or Home from cache) instead.
    const failSafe = setTimeout(() => setLoading(false), 15000);
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      // Signed out (or nobody signed in): drop the previous patient's cache.
      if (!fbUser) {
        clearCache();
        setVerifiedUid(null);
        serverMrn.current = null;
        offlineSession.current = false;
      }
      try {
        // Firebase always persists to AsyncStorage on React Native, so opting
        // out of "keep me signed in" cannot be a persistence mode — it is
        // enforced here, by discarding a restored session before the app renders.
        if (!launchHandled.current) {
          launchHandled.current = true;
          // Local reads at once, each bounded; the onboarding flag lets the
          // first screen be chosen without another wait.
          const restored = !!fbUser && !fbUser.isAnonymous;
          const [seen, keep] = await Promise.all([
            withTimeout(hasSeenOnboarding(), 3000, 'Prefs', true),
            restored ? withTimeout(getKeepSignedIn(), 3000, 'Prefs', false) : Promise.resolve(false),
          ]);
          setSeenOnboarding(seen);
          if (fbUser && !fbUser.isAnonymous) {
            if (!keep) {
              await endRestoredSession(fbUser.uid);
              return;
            }
            // "Keep me signed in" was ticked, but that alone is not enough:
            // the server must confirm THIS install still holds a valid trust
            // token. When this device has a token and a cached record, Home
            // opens at once from the cache and the check runs in the
            // background: a "no" (revoked, expired, reinstall) then signs the
            // session out and returns to sign-in; no answer (offline) keeps
            // Home and re-checks when the app is next active. Without a token
            // or cache, the check (8 s at most) runs before anything shows.
            const [token] = await Promise.all([
              withTimeout(getTrustToken(), 3000, 'Keystore', null).catch(() => null),
              withTimeout(primeLaunchCache(fbUser.uid), 3000, 'Cache', undefined).catch(() => {}),
            ]);
            let cachedMrn = peekCache<string>(cacheKeys.mrnForUid(fbUser.uid));
            if (!cachedMrn) {
              cachedMrn = (await readCache<string>(cacheKeys.mrnForUid(fbUser.uid)).catch(() => null)) || undefined;
            }
            if (!cachedMrn) {
              try {
                const fallback = await AsyncStorage.getItem(`kna:last_mrn:${fbUser.uid}`);
                if (fallback) cachedMrn = fallback;
              } catch {}
            }
            const applyTrust = (trust: { trusted: boolean; mrn: string | null; offline?: boolean }) => {
              offlineSession.current = !trust.trusted;
              if (trust.mrn) {
                serverMrn.current = { uid: fbUser.uid, mrn: trust.mrn };
                setMrn(trust.mrn);
                writeCache(cacheKeys.mrnForUid(fbUser.uid), trust.mrn);
                AsyncStorage.setItem(`kna:last_mrn:${fbUser.uid}`, trust.mrn).catch(() => {});
              }
            };
            if (token && cachedMrn) {
              setMrn(cachedMrn);
              offlineSession.current = true; // until the server answers
              setVerifiedUid(fbUser.uid);
              checkLoginTrust(8000).then(async trust => {
                if (trust.trusted) { applyTrust(trust); setSessionKey(k => k + 1); }
                else if (!trust.offline) { offlineSession.current = false; await endRestoredSession(fbUser.uid); }
              }).catch(() => {});
            } else {
              const trust = await checkLoginTrust(8000);
              if (trust.trusted) {
                applyTrust(trust);
                if (!trust.mrn && cachedMrn) setMrn(cachedMrn);
                setVerifiedUid(fbUser.uid);
              } else if (trust.offline) {
                // Device is offline and "keep me signed in" is enabled: DO NOT sign out!
                // Home renders safely from cached data and session re-verifies on next connection.
                offlineSession.current = true;
                if (cachedMrn) setMrn(cachedMrn);
                setVerifiedUid(fbUser.uid);
              } else {
                // Server explicitly responded and rejected the token
                await endRestoredSession(fbUser.uid);
                return;
              }
            }
          }
        }
        setAuthUser(fbUser);
      } catch (e) {
        console.warn('Launch session check failed:', e);
        const keep = await getKeepSignedIn().catch(() => false);
        if (fbUser && !fbUser.isAnonymous && !verifiedUidRef.current && !keep) {
          await endRestoredSession(fbUser.uid);
        } else {
          setAuthUser(fbUser);
        }
      } finally {
        clearTimeout(failSafe);
        perfMark('auth-ready');
        setLoading(false);
      }
    });
    return () => { clearTimeout(failSafe); unsub(); };
  }, []);

  // Offline-opened session: re-check with the server whenever the app comes
  // to the foreground, until it gets a real answer.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state !== 'active' || !offlineSession.current || !auth.currentUser) return;
      const trust = await checkLoginTrust(8000);
      if (trust.offline) return;
      offlineSession.current = false;
      if (!trust.trusted) await endRestoredSession(auth.currentUser.uid);
      else if (trust.mrn) {
        serverMrn.current = { uid: auth.currentUser.uid, mrn: trust.mrn };
        setMrn(trust.mrn);
      }
    });
    return () => sub.remove();
  }, []);

  // Guests have no second factor; everyone else must have passed it for the
  // exact uid currently signed in.
  const user: User | null =
    authUser && (authUser.isAnonymous || verifiedUid === authUser.uid) ? authUser : null;
  const pendingUser: User | null = authUser && !user ? authUser : null;

  const completeSecondFactor = (issued?: string | null) => {
    const u = auth.currentUser;
    if (!u) return;
    if (issued) {
      serverMrn.current = { uid: u.uid, mrn: issued };
      setMrn(issued);
      writeCache(cacheKeys.mrnForUid(u.uid), issued);
      AsyncStorage.setItem(`kna:last_mrn:${u.uid}`, issued).catch(() => {});
    }
    setVerifiedUid(u.uid);
  };

  // Exactly one MRN per signed-in patient. The server issues it with the
  // second factor (the same MRN its security session — and so firestore.rules
  // — allow); the client lookup below only runs when that is missing.
  useEffect(() => {
    setMrnError(null);
    if (!user || user.isAnonymous) {
      setMrn(null);
      return;
    }
    if (serverMrn.current?.uid === user.uid) {
      setMrn(serverMrn.current.mrn);
      setMrnLoading(false);
      return;
    }
    let cancelled = false;
    let cached = peekCache<string>(cacheKeys.mrnForUid(user.uid));
    if (cached) setMrn(cached);
    else {
      setMrnLoading(true);
      AsyncStorage.getItem(`kna:last_mrn:${user.uid}`).then(fb => {
        if (!cancelled && fb && !cached) {
          cached = fb;
          setMrn(fb);
        }
      }).catch(() => {});
    }
    resolveMRNForUser(user.uid, user.email)
      .then(record => {
        if (cancelled) return;
        const next = record?.mrn ?? null;
        setMrn(next);
        writeCache(cacheKeys.mrnForUid(user.uid), next);
        if (next) AsyncStorage.setItem(`kna:last_mrn:${user.uid}`, next).catch(() => {});
      })
      .catch((e: any) => {
        if (cancelled) return;
        if (e?.name === 'AmbiguousPatientError') { setMrn(null); setMrnError(e.message); writeCache(cacheKeys.mrnForUid(user.uid), null); }
        else if (!cached) setMrn(null);
      })
      .finally(() => { if (!cancelled) setMrnLoading(false); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Register this device, then watch its own session doc. If that doc is
  // deleted from another device's "Logged-in devices" screen, sign out here.
  useEffect(() => {
    if (!user || user.isAnonymous) { setDeviceId(null); return; }
    let cancelled = false;
    let unsubOwn: (() => void) | undefined;

    registerThisDevice(user.uid)
      .then(id => {
        if (cancelled) return;
        setDeviceId(id);
        unsubOwn = watchOwnSession(user.uid, id, () => {
          // Revoked elsewhere — drop the local session.
          signOut(auth).catch(() => {});
        });
      })
      .catch(e => console.error('Device registration failed:', e));

    return () => { cancelled = true; unsubOwn?.(); };
  }, [user?.uid]);

  return (
    <PatientAuthContext.Provider
      value={{ user, mrn, isGuest: !!user?.isAnonymous, loading, mrnLoading, deviceId, pendingUser, completeSecondFactor, seenOnboarding, mrnError, sessionKey }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export const usePatientAuth = () => useContext(PatientAuthContext);

// Loads this uid's cached MRN, then that MRN's cached vaccination record, into
// memory so Home's first render already has them.
async function primeLaunchCache(uid: string): Promise<void> {
  await primeCache([cacheKeys.mrnForUid(uid)]);
  const mrn = peekCache<string>(cacheKeys.mrnForUid(uid));
  if (mrn) await primeCache([cacheKeys.vaccination(mrn)]);
}
