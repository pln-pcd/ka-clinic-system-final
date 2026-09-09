import { onAuthStateChanged, signOut } from "firebase/auth";
import React, { useEffect, useState } from "react";
import AdminLogin from "./pages/adm-loginsign.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import { auth } from "./lib/firebase";
import { authedPostJson } from "./lib/apiClient";

const isAcceptInvitePath = window.location.pathname === '/accept-invite';

export default function App() {
  // Firebase's own persisted session (browserLocalPersistence, set when
  // "Remember me" is checked at login) has no built-in expiry, so on its
  // own it would keep a device signed in forever. "checking" holds the UI
  // briefly while we ask the server whether this restored session still
  // belongs to a trusted, non-expired device (/api/devices check-session) — only
  // then do we skip straight to the dashboard. An untrusted/expired result
  // falls back to a full password + OTP login, same as a first-time visit.
  const [view, setView] = useState(() => (isAcceptInvitePath ? 'accept-invite' : 'checking'));

  useEffect(() => {
    if (isAcceptInvitePath) return;

    // onAuthStateChanged fires on EVERY auth transition, not just page load
    // — including the moment signInWithEmailAndPassword succeeds inside
    // AdminLogin, mid-way through a fresh login that hasn't done OTP yet.
    // Without this guard, that second firing would see "not a trusted
    // device" and sign the user back out right in the middle of logging
    // in. This effect must only ever act on the FIRST resolution (the
    // page-load bootstrap); every later transition is already owned by
    // AdminLogin's onSuccess / AdminDashboard's onLogout callbacks.
    let initialCheckDone = false;

    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (initialCheckDone) return;
      initialCheckDone = true;

      if (!fbUser) {
        setView('login');
        return;
      }
      try {
        const data = await authedPostJson('/api/devices', { action: 'check-session' });
        if (data?.success && data.authorized) {
          setView('dashboard');
        } else {
          await signOut(auth).catch(() => {});
          setView('login');
        }
      } catch {
        await signOut(auth).catch(() => {});
        setView('login');
      }
    });
    return () => unsub();
  }, []);

  return (
    <>
      {view === 'checking' && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#060e24] text-white">
          <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/80 animate-spin" />
          <p className="text-sm font-semibold text-blue-100/80">Checking your session…</p>
        </div>
      )}

      {view === 'accept-invite' && (
        <AcceptInvite
          onDone={() => {
            window.history.replaceState({}, '', '/');
            setView('login');
          }}
        />
      )}

      {view === 'login' && (
        <AdminLogin onSuccess={() => setView('dashboard')} />
      )}

      {view === 'dashboard' && (
        <AdminDashboard onLogout={() => setView('login')} />
      )}
    </>
  );
}
