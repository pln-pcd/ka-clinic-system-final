// KNAPROTOTYPE/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ 
      headerShown: false,
      tabBarStyle: { display: 'none' },
    }}>
      <Tabs.Screen name="index" options={{ headerShown: false }} />
      <Tabs.Screen name="appt" options={{ headerShown: false }} />
      <Tabs.Screen name="chat" options={{ headerShown: false }} />
      <Tabs.Screen name="records" options={{ headerShown: false }} />
      <Tabs.Screen name="profile" options={{ headerShown: false }} />
      <Tabs.Screen name="login" options={{ headerShown: false }} />
    </Tabs>
  );
}