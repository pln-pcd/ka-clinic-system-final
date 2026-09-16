// KNAPROTOTYPE/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';
import { db } from '../../config/firebase';
import {
  acknowledgeNotification,
  presentLocalNotification,
  registerForPushNotifications,
  setupNotificationChannelAsync,
} from '../../config/notifications';
import { usePatientAuth } from '../../context/PatientAuthContext';

export default function TabsLayout() {
  const { user, mrn } = usePatientAuth();
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

            // 1. Deliver OS system heads-up notification banner with sound & vibration
            presentLocalNotification(title, message, {
              notificationId: n.id,
              type: 'followup',
            });

            // 2. Pop up high-visibility in-app alert card
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