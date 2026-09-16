// config/notifications.ts
//
// Push notification and local notification services for K&A Clinic Patient App.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE_URL } from './apiBase';
import { auth } from './firebase';

export const ANDROID_CHANNEL_ID = 'clinic_notifications_v2';
export const EAS_PROJECT_ID = '62297c13-8ceb-4918-9d9e-a9113cbf5acf';

// Foreground notifications handler: ensures banners and sound trigger when app is open or backgrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

/**
 * Creates the Android notification channel with high priority, sound, and vibration.
 * Safe to call repeatedly; Android updates existing channel attributes if compatible.
 */
export async function setupNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Delete legacy channel if present so everything routes through v2
    await Notifications.deleteNotificationChannelAsync('appointments').catch(() => {});

    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'K&A Clinic Alerts & Reminders',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      enableLights: true,
      lightColor: '#C8102E',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  } catch (e) {
    console.warn('Failed to setup notification channel:', e);
  }
}

/**
 * Ensures notification permission is granted and Android channel is configured.
 * Does not permanently memoize failure so users enabling permission later can retry.
 */
export async function ensureNotificationPermission(force = false): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    await setupNotificationChannelAsync();

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    if (force || existing === 'undetermined') {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    }

    return false;
  } catch (e) {
    console.warn('Notification permission check failed:', e);
    return false;
  }
}

// The Profile "Push Notifications" switch. Stored per account; anything but an
// explicit 'false' counts as on, so a new sign-in defaults to receiving.
const pushPrefKey = (uid: string) => `kna:pushNotifs:${uid}`;

export async function isPushEnabledByUser(uid?: string | null): Promise<boolean> {
  const id = uid ?? auth.currentUser?.uid;
  if (!id) return false;
  const v = await AsyncStorage.getItem(pushPrefKey(id)).catch(() => null);
  return v !== 'false';
}

export async function setPushEnabledByUser(uid: string, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(pushPrefKey(uid), enabled ? 'true' : 'false').catch(() => {});
}

/** OS-level permission only — never shows a prompt. */
export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Notifications.getPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/**
 * True when the OS will no longer show the permission dialog (patient chose
 * "Don't allow" and Android/iOS stopped asking). Only Settings can fix it then.
 */
export async function isNotificationPermissionBlocked(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.status !== 'granted' && p.canAskAgain === false;
  } catch {
    return false;
  }
}

export function openNotificationSettings(): void {
  Linking.openSettings().catch(() => {});
}

/**
 * Fires an immediate local notification to the device tray.
 * Silent no-op when the OS permission is missing or the patient switched push
 * off — it never raises the permission prompt by itself.
 */
export async function presentLocalNotification(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  if (auth.currentUser && !(await isPushEnabledByUser())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null),
      },
      trigger: null, // deliver immediately
    });
  } catch (e) {
    console.warn('Could not present notification:', e);
  }
}

/**
 * Schedules a local dose reminder on the morning (8:00 AM) of a scheduled vaccine date.
 */
export async function scheduleDoseReminder(doseLabel: string, dueDateStr: string): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted || !dueDateStr) return;
  try {
    const doseDate = new Date(`${dueDateStr}T08:00:00`);
    if (doseDate.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Vaccination Dose Reminder 💉',
          body: `Reminder: Your ${doseLabel} is scheduled for today (${dueDateStr}). Please visit K&A Clinic on time.`,
          sound: 'default',
          data: { type: 'dose-reminder', dueDate: dueDateStr },
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: doseDate,
        },
      });
    }
  } catch (e) {
    console.warn('Could not schedule dose reminder:', e);
  }
}

// Keyed by account + MRN: signing out and into a different patient in the same
// app session must register again, not return the previous patient's result.
let cachedRegistration: { key: string; token: string } | null = null;
let registrationInProgress: Promise<string | null> | null = null;

/**
 * Obtains this device's Expo push token and registers it with the clinic server.
 * Retries cleanly if previously unauthenticated or permissions were not yet granted.
 */
export async function registerForPushNotifications(
  mrn?: string | null,
  force = false,
): Promise<string | null> {
  const key = `${auth.currentUser?.uid || ''}:${mrn || ''}`;
  if (cachedRegistration?.key === key && !force) return cachedRegistration.token;
  if (registrationInProgress && !force) return registrationInProgress;

  registrationInProgress = (async () => {
    try {
      if (Platform.OS === 'web') return null;
      // Switched off in Profile: don't hand the clinic a token to push to.
      if (!force && !(await isPushEnabledByUser())) return null;
      if (!API_BASE_URL) {
        console.warn('Push registration skipped: API_BASE_URL is not set.');
        return null;
      }

      const granted = await ensureNotificationPermission(force);
      if (!granted) {
        console.warn('Push registration skipped: permissions not granted.');
        return null;
      }

      const token = await getDevicePushToken();
      if (!token) {
        console.warn('Push registration failed: no push token returned.');
        return null;
      }

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        console.warn('Push registration postponed: no auth session available.');
        return null;
      }

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
        console.warn('Push token registration rejected by server:', json?.error);
        return null;
      }

      cachedRegistration = { key, token };
      return token;
    } catch (e) {
      console.warn('Push registration error:', e);
      return null;
    } finally {
      registrationInProgress = null;
    }
  })();

  return registrationInProgress;
}

async function getDevicePushToken(projectId?: string): Promise<string | null> {
  const id =
    projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId ??
    EAS_PROJECT_ID;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return data || null;
}

/**
 * Detaches this phone's push token from the signed-in patient's record, so the
 * clinic stops pushing to it. Call BEFORE signOut — it needs the session.
 * Best effort: a failure must never block signing out.
 */
export async function unregisterPushNotifications(): Promise<void> {
  cachedRegistration = null;
  try {
    if (Platform.OS === 'web' || !API_BASE_URL) return;
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    // getExpoPushTokenAsync needs the permission; without it this phone could
    // not display pushes anyway, and the server prunes the token later.
    if (!(await hasNotificationPermission())) return;
    const token = await getDevicePushToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'unregister-token', pushToken: token }),
    });
  } catch (e) {
    console.warn('Push unregistration error:', e);
  }
}

/**
 * Tells the clinic the patient saw a notification.
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
