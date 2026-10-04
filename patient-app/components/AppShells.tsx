// The two top-level layouts app/_layout.tsx chooses between: the real patient
// app (Expo Router's Stack, with the sign-in redirect) and the placeholder
// shown on desktop web.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePatientAuth } from '../context/PatientAuthContext';
import BrandLoader from './BrandLoader';
import { setupNotificationChannelAsync } from '../config/notifications';
import { resetTo } from '../utils/navigation';

// ══════════════════════════════════════════════════════════════════════════
// Mobile app (native, and inside the phone frame on web)
// ══════════════════════════════════════════════════════════════════════════
// The actual patient app: file-based routes under app/, driven by Expo Router's
// Stack. Rendered as-is on native, and inside the phone frame on web.

const PUBLIC_ROUTES = ['auth', 'onboarding', 'onboarding1', 'onboarding2', 'onboarding3', 'onboarding4'];

export function MobileApp() {
  const { user, loading } = usePatientAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    setupNotificationChannelAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const segs = segments as string[];
    if (segs.length === 0) return;

    const currentSegment = segs[0];
    const isPublicRoute = PUBLIC_ROUTES.includes(currentSegment);

    if (!user && !isPublicRoute) {
      // Not logged in → go to login
      resetTo(router, '/auth/login');
    } else if (user && currentSegment === 'index') {
      // Logged in and on root index → go to main app
      resetTo(router, '/(tabs)');
    }
  }, [user, loading, segments]);

  // Branded loader while the saved sign-in is checked at launch.
  if (loading) return <BrandLoader label="Restoring your session…" />;

  // Explicit provider so useSafeAreaInsets() measures THIS subtree. On web the
  // app renders inside a fixed phone frame, and the router's implicit root
  // provider sits outside it — which would report the browser window's insets
  // instead of the frame's.
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Root of the signed-in app: nothing behind it to swipe back to. */}
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="auth/forgot-password" />
        {/* Leaving OTP must sign the pending session out — the on-screen back
            button (and Android back, handled in the screen) does that. */}
        <Stack.Screen name="auth/verify-login-otp" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="onboarding1" />
        <Stack.Screen name="onboarding2" />
        <Stack.Screen name="onboarding3" />
        <Stack.Screen name="onboarding4" />
      </Stack>
    </SafeAreaProvider>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Desktop web placeholder
// ══════════════════════════════════════════════════════════════════════════
// Placeholder desktop layout for the web build. The patient app has no
// dedicated desktop experience yet — this stands in until one is designed.

export function DesktopApp() {
  return (
    <View style={desktopStyles.container}>
      <Text style={desktopStyles.title}>K&A Rabies Monitoring</Text>
      <Text style={desktopStyles.subtitle}>Desktop view is not built yet.</Text>
      <Text style={desktopStyles.hint}>Append ?view=mobile to the URL, or press Alt+M, to preview the mobile app.</Text>
    </View>
  );
}

const desktopStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    color: '#888',
  },
});
