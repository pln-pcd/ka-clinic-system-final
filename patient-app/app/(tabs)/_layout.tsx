// KNAPROTOTYPE/app/(tabs)/_layout.tsx
import * as Notifications from 'expo-notifications';
import { Tabs, useRouter } from 'expo-router';
import { AppState } from 'react-native';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';
import { db } from '../../config/firebase';
import {
  acknowledgeNotification,
  registerForPushNotifications,
  setupNotificationChannelAsync,
} from '../../config/notifications';
import { usePatientAuth } from '../../context/PatientAuthContext';

export default function TabsLayout() {
  const { user, mrn } = usePatientAuth();
  const router = useRouter();
  const [alertConfig, setAlertConfig] = useState<CustomAlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const seenNotifIds = useRef<Set<string> | null>(null);

  // Ensure notification channel is initialized and register device push token
  useEffect(() => {
    setupNotificationChannelAsync().catch(() => {});
    if (user && mrn) {
      registerForPushNotifications(mrn).catch(() => {});
    }
  }, [user, mrn]);

  // A patient who first tapped "Don't allow" and later enabled notifications
  // in phone Settings comes back through here — register then, without
  // waiting for the next sign-in.
  useEffect(() => {
    if (!user || !mrn) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') registerForPushNotifications(mrn).catch(() => {});
    });
    return () => sub.remove();
  }, [user, mrn]);

  // Tapping a notification in the tray opens the screen it is about. Also
  // covers a tap that cold-started the app from a killed state.
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const data: any = response?.notification.request.content.data || {};
      if (data.screen === 'appt' || data.appointmentId) router.navigate('/appt');
      else router.navigate('/');
    };
    Notifications.getLastNotificationResponseAsync().then(r => { if (r) open(r); }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  // Real-time listener for patient notifications across all tabs
  useEffect(() => {
    if (!mrn) {
      seenNotifIds.current = null;
      return;
    }

    const q = query(
      collection(db, 'patientNotifications'),
      where('patientId', '==', mrn),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Initial snapshot: record existing IDs so we only alert on truly new incoming items
        if (seenNotifIds.current === null) {
          seenNotifIds.current = new Set(docs.map(d => d.id));
          return;
        }

        // Detect newly created notifications
        const incoming = docs.filter(d => !seenNotifIds.current!.has(d.id));
        if (incoming.length > 0) {
          incoming.forEach((n: any) => {
            seenNotifIds.current!.add(n.id);

            const title = n.title || 'Follow-up Reminder';
            const message = n.message || 'You have a new reminder from K&A Clinic.';

            // Tray banner comes from the server's Expo push (shown in the
            // foreground by setNotificationHandler); presenting a local one
            // here too made every reminder appear twice. The in-app card is
            // the part only this listener can do.
            setAlertConfig({
              visible: true,
              type: 'info',
              title,
              message,
              primaryButtonText: 'I Understand',
              onPrimaryPress: () => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                acknowledgeNotification(n.id).catch(() => {});
              },
            });
          });
        }
      },
      (err) => {
        console.warn('patientNotifications listener error in TabsLayout:', err);
      },
    );

    return () => unsubscribe();
  }, [mrn]);

  return (
    <>
      <Tabs
        // Android back walks the tabs the patient actually visited (Records →
        // Home), then exits from Home — it never unwinds into auth/onboarding.
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ headerShown: false }} />
        <Tabs.Screen name="appt" options={{ headerShown: false }} />
        <Tabs.Screen name="chat" options={{ headerShown: false }} />
        <Tabs.Screen name="records" options={{ headerShown: false }} />
        <Tabs.Screen name="profile" options={{ headerShown: false }} />
        <Tabs.Screen name="login" options={{ headerShown: false }} />
      </Tabs>

      <CustomAlertModal
        config={alertConfig}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </>
  );
}