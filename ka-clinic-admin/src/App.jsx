import { onAuthStateChanged, signOut } from "firebase/auth";
import React, { useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage.jsx";
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
        setView('landing');
        return;
      }
      try {
        const data = await authedPostJson('/api/devices', { action: 'check-session' });
        if (data?.success && data.authorized) {
          setView('dashboard');
        } else {
          await signOut(auth).catch(() => {});
          setView('landing');
        }
      } catch {
        await signOut(auth).catch(() => {});
        setView('landing');
      }
    });
    return () => unsub();
  }, []);

  return (
    <>
      {view === 'checking' && (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      )}

      {view === 'landing' && (
        <LandingPage onAdminClick={() => setView('login')} />
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
        <AdminLogin
          onBack={() => setView('landing')}
          onSuccess={() => setView('dashboard')}
        />
      )}

      {view === 'dashboard' && (
        <AdminDashboard onLogout={() => setView('login')} />
      )}
    </>
  );
}
