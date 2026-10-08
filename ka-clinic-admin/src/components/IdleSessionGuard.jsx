import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { authedPostJson } from '../lib/adminSession';

export const IDLE_MS = 30 * 60 * 1000;
export const WARNING_MS = 60 * 1000;
export function idleState(lastActivity, now = Date.now()) {
  const remaining = Math.max(0, IDLE_MS - (now - lastActivity));
  return { expired: remaining === 0, warning: remaining <= WARNING_MS, remaining };
}
export default function IdleSessionGuard({ onLogout, children }) {
  const lastActivity = useRef(Date.now());
  const lastHeartbeat = useRef(Date.now());
  const leaving = useRef(false);
  const [seconds, setSeconds] = useState(null);
  useEffect(() => {
    const activity = () => {
      // Warning requires an explicit decision; incidental mouse movement must
      // not keep an unattended clinical dashboard signed in.
      if (!idleState(lastActivity.current).warning) lastActivity.current = Date.now();
    };
    const exit = async () => {
      if (leaving.current) return;
      leaving.current = true;
      const revocation = authedPostJson('/api/devices', { action: 'logout' }).catch(() => {});
      window.history.replaceState({}, '', '/');
      onLogout();
      await signOut(auth).catch(() => {});
      await revocation;
    };
    const tick = async () => {
      const state = idleState(lastActivity.current);
      if (state.expired) return exit();
      setSeconds(state.warning ? Math.ceil(state.remaining / 1000) : null);
      if (lastActivity.current > lastHeartbeat.current && Date.now() - lastHeartbeat.current >= 60000) {
        lastHeartbeat.current = Date.now();
        try {
          const data = await authedPostJson('/api/devices', { action: 'heartbeat' });
          if (!data?.success) await exit();
        } catch { await exit(); }
      }
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    const timer = setInterval(tick, 1000);
    window.addEventListener('pageshow', tick);
    return () => { clearInterval(timer); events.forEach(event => window.removeEventListener(event, activity)); window.removeEventListener('pageshow', tick); };
  }, [onLogout]);
  const stay = async () => {
    const data = await authedPostJson('/api/devices', { action: 'heartbeat' }).catch(() => null);
    if (!data?.success) { await signOut(auth).catch(() => {}); onLogout(); return; }
    lastActivity.current = Date.now(); lastHeartbeat.current = Date.now(); setSeconds(null);
  };
  return <>{children}{seconds !== null && <div className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-center justify-center p-4">
    <div role="alertdialog" aria-modal="true" aria-labelledby="idle-title" className="bg-white rounded-2xl p-6 max-w-md shadow-xl">
      <h2 id="idle-title" className="text-lg font-bold text-slate-900">Session ending soon</h2>
      <p className="mt-2 text-slate-600">You will be signed out in {seconds} seconds because of inactivity.</p>
      <button autoFocus onClick={stay} className="mt-5 rounded-xl bg-blue-900 text-white px-4 py-2">Keep working</button>
    </div>
  </div>}</>;
}
