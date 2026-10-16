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
import { auth, checkLoginTrust, onAuthStateChanged, resolveMRNForUser, signOut } from '../config/backend';
import { getKeepSignedIn, hasSeenOnboarding } from '../config/appPrefs';
import { clearThisDeviceSession, registerThisDevice, watchOwnSession } from '../config/deviceSessions';
import { cacheKeys, clearCache, peekCache, primeCache, writeCache } from '../utils/localCache';

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
});

export function PatientAuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  // uid of the session that passed the second factor. Compared against the
  // live Firebase uid so a new sign-in never inherits an older verification.
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mrn, setMrn] = useState<string | null>(null);
  const [mrnLoading, setMrnLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [seenOnboarding, setSeenOnboarding] = useState(true);
  const [mrnError, setMrnError] = useState<string | null>(null);
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
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      // Signed out (or nobody signed in): drop the previous patient's cache.
      if (!fbUser) {
        clearCache();
        setVerifiedUid(null);
        serverMrn.current = null;
      }
      // Firebase always persists to AsyncStorage on React Native, so opting out
      // of "keep me signed in" cannot be a persistence mode — it is enforced
      // here, by discarding a restored session before the app renders.
      if (!launchHandled.current) {
        launchHandled.current = true;
        // Both local reads at once; the onboarding flag lets the first
        // screen be chosen without another wait.
        const restored = !!fbUser && !fbUser.isAnonymous;
        const [seen, keep] = await Promise.all([hasSeenOnboarding(), restored ? getKeepSignedIn() : Promise.resolve(false)]);
        setSeenOnboarding(seen);
        if (fbUser && !fbUser.isAnonymous) {
          if (!keep) {
            try { await clearThisDeviceSession(fbUser.uid); } catch {}
            await signOut(auth);
            setAuthUser(null);
            setLoading(false);
            return;
          }
          // "Keep me signed in" was ticked, but that alone is not enough: the
          // server must confirm THIS install still holds a valid trust token.
          // Anything short of an explicit yes (no token, expired, revoked,
          // reinstall, offline) signs the restored session out. The cache is
          // read in parallel with it.
          const [{ trusted, mrn: issued }] = await Promise.all([checkLoginTrust(), primeLaunchCache(fbUser.uid)]);
          if (!trusted) {
            try { await clearThisDeviceSession(fbUser.uid); } catch {}
            await signOut(auth);
            setAuthUser(null);
            setLoading(false);
            return;
          }
          if (issued) {
            serverMrn.current = { uid: fbUser.uid, mrn: issued };
            setMrn(issued);
            writeCache(cacheKeys.mrnForUid(fbUser.uid), issued);
          } else {
            const cachedMrn = peekCache<string>(cacheKeys.mrnForUid(fbUser.uid));
            if (cachedMrn) setMrn(cachedMrn);
          }
          setVerifiedUid(fbUser.uid);
        }
      }
      setAuthUser(fbUser);
      setLoading(false);
    });
    return unsub;
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
    const cached = peekCache<string>(cacheKeys.mrnForUid(user.uid));
    if (cached) setMrn(cached);
    else setMrnLoading(true);
    resolveMRNForUser(user.uid, user.email)
      .then(record => {
        if (cancelled) return;
        const next = record?.mrn ?? null;
        setMrn(next);
        writeCache(cacheKeys.mrnForUid(user.uid), next);
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
      value={{ user, mrn, isGuest: !!user?.isAnonymous, loading, mrnLoading, deviceId, pendingUser, completeSecondFactor, seenOnboarding, mrnError }}
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
