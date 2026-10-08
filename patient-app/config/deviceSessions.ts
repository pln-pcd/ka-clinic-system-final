// config/deviceSessions.ts
//
// Tracks which devices a patient is signed in on, under
// `patientSessions/{uid}_{deviceId}`. Firebase Auth has no client-callable
// "list my sessions" or "revoke that session" API — revoking another device's
// refresh token needs the Admin SDK — so this is a cooperative registry: each
// device registers itself, watches its own doc, and signs itself out when that
// doc is marked revoked or deleted.
//
// The honest limit: a device that is offline or has the app killed stays signed
// in until it next runs. This is a convenience control, not a security
// guarantee. For a lost phone, the clinic must reset the password.
import { Platform } from 'react-native';
import { deleteDoc, doc, getDocs, onSnapshot, collection, query, setDoc, where } from 'firebase/firestore';
import { db } from './backend';
import { getDeviceId } from './appPrefs';

export type DeviceSession = {
  id: string;
  uid: string;
  deviceId: string;
  label: string;
  platform: string;
  osVersion: string;
  lastActiveAt: number;
  createdAt: number;
  revoked?: boolean;
};

const sessionDocId = (uid: string, deviceId: string) => `${uid}_${deviceId}`;

// Human-readable name for this device, e.g. "iPhone · iOS 18.2". Expo Go does
// not expose a marketing model name without expo-device, so platform plus OS
// version is the most specific label available without another dependency.
function describeThisDevice(): { label: string; platform: string; osVersion: string } {
  const platform = Platform.OS;
  const osVersion = String(Platform.Version ?? '');
  const base =
    platform === 'ios'     ? 'iPhone / iPad' :
    platform === 'android' ? 'Android device' :
    platform === 'web'     ? 'Web browser' : 'Unknown device';
  return {
    label: osVersion ? `${base} · ${platform === 'web' ? 'browser' : platform} ${osVersion}` : base,
    platform,
    osVersion,
  };
}

/** Records (or refreshes) this device in the patient's session list. */
export async function registerThisDevice(uid: string): Promise<string> {
  const deviceId = await getDeviceId();
  const info = describeThisDevice();
  const now = Date.now();
  await setDoc(
    doc(db, 'patientSessions', sessionDocId(uid, deviceId)),
    {
      uid,
      deviceId,
      label:        info.label,
      platform:     info.platform,
      osVersion:    info.osVersion,
      lastActiveAt: now,
      createdAt:    now,
      // Registering clears any stale revoked flag from a previous session on
      // this same device — the patient has just proven they hold the password.
      revoked:      false,
    },
    { merge: true },
  );
  return deviceId;
}

/** Live list of this patient's devices, newest activity first. */
export function watchDeviceSessions(
  uid: string,
  onChange: (sessions: DeviceSession[]) => void,
  onError?: (e: unknown) => void,
) {
  const q = query(collection(db, 'patientSessions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    snap => {
      const rows = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as DeviceSession))
        .filter(s => !s.revoked)
        .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
      onChange(rows);
    },
    e => { console.error('Device session listener error:', e); onError?.(e); },
  );
}

/**
 * Watches THIS device's own session doc. Invokes onRevoked if the doc is
 * deleted or flagged revoked, which is how a sign-out initiated on another
 * device reaches this one.
 */
export function watchOwnSession(uid: string, deviceId: string, onRevoked: () => void) {
  return onSnapshot(
    doc(db, 'patientSessions', sessionDocId(uid, deviceId)),
    snap => {
      if (!snap.exists() || (snap.data() as any)?.revoked === true) onRevoked();
    },
    e => {
      // Never sign the patient out because a listener failed — a dropped
      // connection is not a revocation.
      console.error('Own session listener error:', e);
    },
  );
}

/** Signs a different device out. Deleting the doc is what that device sees. */
export async function revokeDeviceSession(uid: string, deviceId: string): Promise<void> {
  const { revokePatientDeviceSession } = await import('./backend');
  await revokePatientDeviceSession(deviceId);
}

/** Removes this device's own record — called on an intentional sign-out. */
export async function clearThisDeviceSession(uid: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await deleteDoc(doc(db, 'patientSessions', sessionDocId(uid, deviceId)));
  } catch (e) {
    console.error('Could not clear device session:', e);
  }
}

/** Signs out every device except this one. */
export async function revokeAllOtherSessions(uid: string, keepDeviceId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'patientSessions'), where('uid', '==', uid)));
  const others = snap.docs.filter(d => (d.data() as any).deviceId !== keepDeviceId);
  await Promise.all(others.map(d => deleteDoc(d.ref)));
  const { logoutAllPatientDevices } = await import('./backend');
  await logoutAllPatientDevices();
  return others.length;
}
