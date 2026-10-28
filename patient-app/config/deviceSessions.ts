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
  associatedDeviceIds?: string[];
  associatedDocIds?: string[];
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

/**
 * Deduplicates sessions belonging to the same device (e.g. repeated logins,
 * reinstalls, or updates on the same phone).
 * Keeps the newest session for each unique device, preserving "This device"
 * priority and consolidating all associated device IDs so revoking handles all of them.
 */
export function deduplicateDeviceSessions(
  sessions: DeviceSession[],
  currentDeviceId?: string | null,
): DeviceSession[] {
  const groups = new Map<string, DeviceSession[]>();

  for (const s of sessions) {
    const key = `${s.platform || ''}___${s.osVersion || ''}___${s.label || ''}`;
    const list = groups.get(key) || [];
    list.push(s);
    groups.set(key, list);
  }

  const result: DeviceSession[] = [];

  for (const group of groups.values()) {
    group.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));

    // If one of the sessions in the group is THIS device, keep it as primary
    const currentSession = currentDeviceId
      ? group.find(s => s.deviceId === currentDeviceId)
      : undefined;

    const primary = currentSession || group[0];
    const latestActive = Math.max(...group.map(s => s.lastActiveAt || 0));
    const allDeviceIds = Array.from(new Set(group.map(s => s.deviceId).filter(Boolean)));
    const allDocIds = Array.from(new Set(group.map(s => s.id).filter(Boolean)));

    result.push({
      ...primary,
      lastActiveAt: latestActive,
      associatedDeviceIds: allDeviceIds,
      associatedDocIds: allDocIds,
    });
  }

  // Sort: current device first, then newest lastActiveAt
  result.sort((a, b) => {
    if (currentDeviceId) {
      if (a.deviceId === currentDeviceId) return -1;
      if (b.deviceId === currentDeviceId) return 1;
    }
    return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
  });

  return result;
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

  // Clean up older stale session docs for this same user and device to prevent
  // accumulation of orphaned session records across app reinstalls or updates.
  try {
    const snap = await getDocs(query(collection(db, 'patientSessions'), where('uid', '==', uid)));
    const duplicates = snap.docs.filter(d => {
      const data = d.data() as any;
      return data.deviceId !== deviceId && data.label === info.label;
    });
    if (duplicates.length > 0) {
      await Promise.all(duplicates.map(d => deleteDoc(d.ref).catch(() => {})));
    }
  } catch (err) {
    console.warn('Session duplicate cleanup skipped:', err);
  }

  return deviceId;
}

/** Live list of this patient's devices, newest activity first, deduplicated by device. */
export function watchDeviceSessions(
  uid: string,
  onChange: (sessions: DeviceSession[]) => void,
  onError?: (e: unknown) => void,
  currentDeviceId?: string | null,
) {
  const q = query(collection(db, 'patientSessions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    snap => {
      const rows = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as DeviceSession))
        .filter(s => !s.revoked);
      const deduplicated = deduplicateDeviceSessions(rows, currentDeviceId);
      onChange(deduplicated);
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
      // Offline cache snapshots must never cause a logout. Only an authoritative
      // server snapshot confirms that the session was deleted or revoked.
      if (snap.metadata.fromCache) return;
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
  try {
    await deleteDoc(doc(db, 'patientSessions', sessionDocId(uid, deviceId)));
  } catch {}
  try {
    const { revokePatientDeviceSession } = await import('./backend');
    await revokePatientDeviceSession(deviceId);
  } catch {}
}

/** Removes this device's own record — called on an intentional sign-out. */
export async function clearThisDeviceSession(uid: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const info = describeThisDevice();
    await deleteDoc(doc(db, 'patientSessions', sessionDocId(uid, deviceId)));
    // Also clean up any other sessions for this device
    const snap = await getDocs(query(collection(db, 'patientSessions'), where('uid', '==', uid)));
    const duplicates = snap.docs.filter(d => {
      const data = d.data() as any;
      return data.label === info.label;
    });
    await Promise.all(duplicates.map(d => deleteDoc(d.ref).catch(() => {})));
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
