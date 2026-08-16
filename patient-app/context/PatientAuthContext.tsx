// Resolves the real, persisted Firebase Auth session into the clinic
// identity (MRN) the rest of the app keys its Firestore reads on, so every
// screen shares one auth listener + one MRN lookup instead of duplicating both.
//
// Also owns two session-lifetime concerns that must run before any screen
// renders: enforcing the "keep me signed in" choice, and registering/watching
// this device so a sign-out issued elsewhere takes effect here.
import type { User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { auth, onAuthStateChanged, resolveMRNForUser, signOut } from '../config/firebase';
import { getKeepSignedIn } from '../config/appPrefs';
import { clearThisDeviceSession, registerThisDevice, watchOwnSession } from '../config/deviceSessions';

type PatientAuthState = {
  user: User | null;
  mrn: string | null;
  isGuest: boolean;
  loading: boolean;
  mrnLoading: boolean;
  deviceId: string | null;
};

const PatientAuthContext = createContext<PatientAuthState>({
  user: null,
  mrn: null,
  isGuest: false,
  loading: true,
  mrnLoading: false,
  deviceId: null,
});

export function PatientAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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
            setUser(null);
            setLoading(false);
            return;
          }
        }
      }
      setUser(fbUser);
      setLoading(false);
    });
    return unsub;
  }, []);

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
      value={{ user, mrn, isGuest: !!user?.isAnonymous, loading, mrnLoading, deviceId }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export const usePatientAuth = () => useContext(PatientAuthContext);
