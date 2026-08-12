// Batch 5 — role comes from Firestore (admins/{uid}), live, never
// hardcoded. This is the one place the rest of the admin app should ask
// "who is this and what can they do" — the sidebar's Manage Admins item,
// its render guard, and the forced-signout-on-revoke effect all read
// from here instead of re-deriving role themselves.
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';

export function useAuth() {
  const [user, setUser] = useState(auth.currentUser);
  const [role, setRole] = useState(null);
  const [status, setStatus] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, fbUser => {
      setUser(fbUser);
      if (!fbUser) {
        setRole(null);
        setStatus(null);
        setRoleLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setRoleLoading(true);
    const unsubDoc = onSnapshot(doc(db, 'admins', user.uid), snap => {
      if (snap.exists()) {
        setRole(snap.data().role || null);
        setStatus(snap.data().status || null);
      } else {
        setRole(null);
        setStatus(null);
      }
      setRoleLoading(false);
    }, () => {
      setRole(null);
      setStatus(null);
      setRoleLoading(false);
    });
    return () => unsubDoc();
  }, [user]);

  return { user, role, status, roleLoading };
}
