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
import { getKeepSignedIn } from '../config/appPrefs';
import { clearThisDeviceSession, registerThisDevice, watchOwnSession } from '../config/deviceSessions';

type PatientAuthState = {
  user: User | null;
  mrn: string | null;
  isGuest: boolean;
  loading: boolean;
  mrnLoading: boolean;
  deviceId: string | null;
  /** Firebase session that exists but has not passed the second factor yet. */
  pendingUser: User | null;
  /** Mark the current Firebase session as second-factor verified. */
  completeSecondFactor: () => void;
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

  // True once the first auth callback has been evaluated. The "keep me signed
  // in" check must only run against a session restored from storage at launch,
  // never against a session the patient just created by signing in.
  const launchHandled = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      // Firebase always persists to AsyncStorage on React Native, so opting out
      // of "keep me signed in" cannot be a persistence mode — it is enforced
      // here, by discarding a restored session before the app renders.
      if (!launchHandled.current) {
        launchHandled.current = true;
        if (fbUser && !fbUser.isAnonymous) {
          const keep = await getKeepSignedIn();
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
          // reinstall, offline) signs the restored session out.
          const trusted = await checkLoginTrust();
          if (!trusted) {
            try { await clearThisDeviceSession(fbUser.uid); } catch {}
            await signOut(auth);
            setAuthUser(null);
            setLoading(false);
            return;
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

  const completeSecondFactor = () => {
    const u = auth.currentUser;
    if (u) setVerifiedUid(u.uid);
  };

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setMrn(null);
      return;
    }
    let cancelled = false;
    setMrnLoading(true);
    resolveMRNForUser(user.uid, user.email)
      .then(record => { if (!cancelled) setMrn(record?.mrn ?? null); })
      .catch(() => { if (!cancelled) setMrn(null); })
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
      value={{ user, mrn, isGuest: !!user?.isAnonymous, loading, mrnLoading, deviceId, pendingUser, completeSecondFactor }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export const usePatientAuth = () => useContext(PatientAuthContext);
