import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { authedPostJson, getAdminLastActivity, recordAdminActivity, ADMIN_LAST_ACTIVITY_KEY } from '../lib/adminSession';

export const IDLE_MS = 30 * 60 * 1000;
export const WARNING_MS = 60 * 1000;
export const LOGOUT_EVENT_KEY = 'kna_admin_logout_event';
export const RETURN_PAGE_KEY = 'kna_admin_return_page';
export const LOGOUT_REASON_KEY = 'kna_admin_logout_reason';

export function idleState(lastActivity, now = Date.now()) {
  const remaining = Math.max(0, IDLE_MS - (now - lastActivity));
  return { expired: remaining === 0, warning: remaining <= WARNING_MS, remaining };
}

export default function IdleSessionGuard({ onLogout, children }) {
  const lastActivity = useRef(getAdminLastActivity());
  const lastHeartbeat = useRef(Date.now());
  const leaving = useRef(false);
  const [seconds, setSeconds] = useState(null);

  useEffect(() => {
    // Initialize current tab with latest activity from storage or now
    const initialActivity = Math.max(lastActivity.current, getAdminLastActivity());
    lastActivity.current = initialActivity;
    recordAdminActivity(initialActivity);

    const onUserActivity = () => {
      // While warning modal is shown, incidental mouse moves should not dismiss warning.
      // An explicit decision (clicking 'Keep working') is required.
      const currentStored = getAdminLastActivity();
      const st = idleState(currentStored);
      if (!st.warning) {
        const now = Date.now();
        lastActivity.current = now;
        recordAdminActivity(now);
      }
    };

    const exit = async (reason = '') => {
      if (leaving.current) return;
      leaving.current = true;

      // Broadcast logout to other tabs
      try {
        localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));
      } catch {}

      if (reason) {
        try {
          sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
          const currentPage = sessionStorage.getItem('kna_admin_current_page');
          if (currentPage && currentPage !== 'dashboard' && currentPage !== 'not-found') {
            sessionStorage.setItem(RETURN_PAGE_KEY, currentPage);
          } else {
            const currentUrl = window.location.pathname + window.location.search;
            if (currentUrl && currentUrl !== '/' && currentUrl !== '/index.html') {
              sessionStorage.setItem(RETURN_PAGE_KEY, currentUrl);
            }
          }
        } catch {}
      }

      const revocation = authedPostJson('/api/devices', { action: 'logout' }).catch(() => {});
      window.history.replaceState({}, '', '/');
      onLogout();
      await signOut(auth).catch(() => {});
      await revocation;
    };

    const checkStateAndHeartbeat = async () => {
      if (leaving.current) return;
      const latestActivity = Math.max(lastActivity.current, getAdminLastActivity());
      lastActivity.current = latestActivity;
      const state = idleState(latestActivity);

      if (state.expired) {
        return exit('Your session expired due to inactivity. Please sign in again.');
      }

      setSeconds(state.warning ? Math.ceil(state.remaining / 1000) : null);

      // Send periodic heartbeat to keep server session active while user is not idle
      const now = Date.now();
      if (!state.warning && now - lastHeartbeat.current >= 60000) {
        lastHeartbeat.current = now;
        try {
          const data = await authedPostJson('/api/devices', { action: 'heartbeat' });
          if (data && data.success === false && data.unauthorized) {
            await exit('Your session was revoked or expired on the server.');
          }
        } catch (err) {
          // Do not log out immediately on transient network error in background tab
          console.warn('Heartbeat attempt failed (retaining session):', err?.message || err);
        }
      }
    };

    // Cross-tab synchronization
    const onStorageChange = (e) => {
      if (e.key === ADMIN_LAST_ACTIVITY_KEY && e.newValue) {
        const remoteTime = Number(e.newValue);
        if (remoteTime > lastActivity.current) {
          lastActivity.current = remoteTime;
          const st = idleState(remoteTime);
          if (!st.warning) setSeconds(null);
        }
      } else if (e.key === LOGOUT_EVENT_KEY) {
        // Another tab signed out; sign out here too
        if (!leaving.current) {
          leaving.current = true;
          onLogout();
          signOut(auth).catch(() => {});
        }
      }
    };

    // Tab visibility handling: compare saved last activity to current time immediately upon return
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkStateAndHeartbeat();
      }
    };

    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, onUserActivity, { passive: true }));
    window.addEventListener('storage', onStorageChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', checkStateAndHeartbeat);

    const timer = setInterval(checkStateAndHeartbeat, 1000);

    return () => {
      clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, onUserActivity));
      window.removeEventListener('storage', onStorageChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', checkStateAndHeartbeat);
    };
  }, [onLogout]);

  const stay = async () => {
    const data = await authedPostJson('/api/devices', { action: 'heartbeat' }).catch(() => null);
    if (data && data.success === false && data.unauthorized) {
      await signOut(auth).catch(() => {});
      onLogout();
      return;
    }
    const now = Date.now();
    lastActivity.current = now;
    lastHeartbeat.current = now;
    recordAdminActivity(now);
    setSeconds(null);
  };

  return (
    <>
      {children}
      {seconds !== null && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="idle-title" className="bg-white rounded-2xl p-6 max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <h2 id="idle-title" className="text-lg font-bold text-slate-900">Session ending soon</h2>
            <p className="mt-2 text-slate-600">You will be signed out in {seconds} seconds because of inactivity.</p>
            <button autoFocus onClick={stay} className="mt-5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white px-5 py-2.5 font-semibold transition-colors cursor-pointer">Keep working</button>
          </div>
        </div>
      )}
    </>
  );
}
