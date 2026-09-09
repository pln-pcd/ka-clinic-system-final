// config/notifications.ts
//
// Thin wrapper over expo-notifications for the one thing the app currently
// needs: telling a patient the clinic accepted their appointment request.
//
// These are LOCAL notifications only — there is no push server or Expo push
// token registration. The app watches the `appointments` collection itself
// (see app/(tabs)/index.tsx) and fires a banner the moment a doc it is
// already subscribed to flips to confirmed/accepted, so delivery depends on
// the app being open or backgrounded with the listener still attached.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'appointments';

// Foreground notifications are suppressed by default on both platforms;
// without this the banner only ever appears when the app is backgrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionPromise: Promise<boolean> | null = null;

/**
 * Asks for notification permission once per app session and creates the
 * Android channel. Safe to call repeatedly — the result is memoised, so the
 * OS prompt is only ever raised on the first call.
 *
 * Resolves false (rather than throwing) when permission is denied or the
 * platform has no notification support, so callers can just no-op.
 */
export function ensureNotificationPermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise;

  permissionPromise = (async () => {
    try {
      if (Platform.OS === 'web') return false;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Appointment updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1E3A8A',
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') return true;

      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      // Expo Go on some platforms, or a user who revoked permission mid-session —
      // the in-app notification centre still shows the update either way.
      console.warn('Notification permission check failed:', e);
      return false;
    }
  })();

  return permissionPromise;
}

/**
 * Fires an immediate local notification. Silently does nothing when
 * permission was refused — the caller should not have to branch on it.
 */
export async function presentLocalNotification(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null),
      },
      trigger: null, // deliver now
    });
  } catch (e) {
    console.warn('Could not present notification:', e);
  }
}

// ── Expo push registration ──────────────────────────────────────────────────
//
// The local-notification helpers above only fire while the app is running with
// a Firestore listener attached. Clinic follow-ups have to reach the patient
// when the app is closed, so the device also registers an Expo push token with
// the clinic server (api/notifications.js, action `register-token`), which
// stores it against the patient's vaccination record.
import Constants from 'expo-constants';
import { API_BASE_URL } from './apiBase';
import { auth } from './firebase';


let registrationPromise: Promise<string | null> | null = null;

/**
 * Obtains this device's Expo push token and registers it with the clinic
 * server. Memoised per app session — repeated calls resolve the same token
 * without re-hitting the server.
 *
 * Resolves null (never throws) whenever push is unavailable: web, a simulator
 * with no push support, denied permission, a missing projectId in a bare Expo
 * Go session, or an unconfigured API base URL. Callers can fire and forget;
 * the in-app notification centre and email still work regardless.
 */
export function registerForPushNotifications(mrn?: string | null): Promise<string | null> {
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    try {
      if (Platform.OS === 'web') return null;
      if (!API_BASE_URL) return null;

      const granted = await ensureNotificationPermission();
      if (!granted) return null;

      // EAS builds carry the projectId in extra.eas; without it Expo cannot
      // mint a push token, which is the normal case in a plain Expo Go run.
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as any).easConfig?.projectId;
      if (!projectId) {
        console.warn('No EAS projectId configured — skipping push registration.');
        return null;
      }

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!token) return null;

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return null;

      const res = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: 'register-token', pushToken: token, mrn: mrn || '' }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.success) {
        console.warn('Push token registration rejected:', json?.error);
        return null;
      }
      return token;
    } catch (e) {
      console.warn('Push registration failed:', e);
      return null;
    }
  })();

  return registrationPromise;
}

/**
 * Tells the clinic the patient saw a notification — the app-side counterpart
 * of the "I received this notification" button in the follow-up email.
 * Resolves false on any failure so the caller can leave the button enabled.
 */
export async function acknowledgeNotification(notificationId: string): Promise<boolean> {
  try {
    if (!API_BASE_URL || !notificationId) return false;
    const res = await fetch(`${API_BASE_URL}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ack', id: notificationId }),
    });
    const json = await res.json().catch(() => null);
    return !!json?.success;
  } catch (e) {
    console.warn('Could not acknowledge notification:', e);
    return false;
  }
}
