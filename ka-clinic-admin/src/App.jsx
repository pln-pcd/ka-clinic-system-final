import { onAuthStateChanged, signOut } from "firebase/auth";
import { lazy, Suspense, useEffect, useState } from "react";
import { auth } from "./lib/firebase";
import { authedPostJson } from "./lib/adminSession";
import { PageErrorBoundary } from "./components/ErrorPages";
import BrandLoader from "./components/BrandLoader";

const isAcceptInvitePath = window.location.pathname === '/accept-invite';
const urlParams = new URLSearchParams(window.location.search);
const isResetPassPath = urlParams.get('mode') === 'resetPassword' || Boolean(urlParams.get('oobCode')) || window.location.pathname === '/reset-password';
// Any other path is not a page: signed in it shows the 404 page inside the
// dashboard, signed out it goes to the login screen at "/".
const KNOWN_PATHS = ['/', '/index.html', '/accept-invite', '/reset-password'];
const isUnknownPath = !KNOWN_PATHS.includes(window.location.pathname.replace(/\/+$/, '') || '/');

// Each screen is its own download. The login and dashboard code start
// downloading right away, alongside the session check, so neither screen
// normally waits on its code when the check finishes.
const loadLogin = () => import("./features/auth/LoginPage.jsx");
const loadDashboard = () => import("./features/dashboard/AdminDashboard.jsx");
const AdminLogin = lazy(loadLogin);
const AdminDashboard = lazy(loadDashboard);
const AcceptInvite = lazy(() => import("./features/auth/AcceptInvitePage.jsx"));
if (!isAcceptInvitePath) {
  loadLogin().catch(() => {});
  loadDashboard().catch(() => {});
}

function ScreenLoading() {
  // Usually follows the session check, so the logo is already drawn.
  return <BrandLoader label="Loading…" intro={false} />;
}

export default function App() {
  // Firebase's own persisted session (browserLocalPersistence, set when
  // "Remember me" is checked at login) has no built-in expiry, so on its
  // own it would keep a device signed in forever. "checking" holds the UI
  // briefly while we ask the server whether this restored session still
  // belongs to a trusted, non-expired device (/api/devices check-session) — only
  // then do we skip straight to the dashboard. An untrusted/expired result
  // falls back to a full password + OTP login, same as a first-time visit.
  const [view, setView] = useState(() => (isAcceptInvitePath ? 'accept-invite' : isResetPassPath ? 'login' : 'checking'));

  useEffect(() => {
    if (isAcceptInvitePath) return;

    if (isResetPassPath) {
      // When opening a reset link, ensure user lands directly on reset view
      setView('login');
      return;
    }

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

  // Last line of defence: a crash outside a dashboard page (the shell, the
  // login screen) still shows the reload card rather than a blank screen.
  useEffect(() => {
    if (view === 'login' && isUnknownPath && !isResetPassPath) window.history.replaceState({}, '', '/');
  }, [view]);

  return (
    <PageErrorBoundary resetKey={view}>
    <Suspense fallback={<ScreenLoading />}>
      {view === 'checking' && <BrandLoader label="Restoring your session…" />}

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
        <AdminDashboard onLogout={() => setView('login')} notFound={isUnknownPath} />
      )}
    </Suspense>
    </PageErrorBoundary>
  );
}
