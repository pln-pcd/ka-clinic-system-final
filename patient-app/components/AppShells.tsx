// The two top-level layouts app/_layout.tsx chooses between: the real patient
// app (Expo Router's Stack, with the sign-in redirect) and the placeholder
// shown on desktop web.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, InteractionManager, View, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePatientAuth } from '../context/PatientAuthContext';
import { setupNotificationChannelAsync } from '../config/notifications';
import { resetTo } from '../utils/navigation';

// ══════════════════════════════════════════════════════════════════════════
// Mobile app (native, and inside the phone frame on web)
// ══════════════════════════════════════════════════════════════════════════
// The actual patient app: file-based routes under app/, driven by Expo Router's
// Stack. Rendered as-is on native, and inside the phone frame on web.

const PUBLIC_ROUTES = ['auth', 'onboarding', 'onboarding1', 'onboarding2', 'onboarding3', 'onboarding4'];

export function MobileApp() {
  const { user, loading, seenOnboarding } = usePatientAuth();
  const router = useRouter();
  const segments = useSegments();

  // Notification channel setup is not needed for the first screen: run it
  // once the UI has settled.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setupNotificationChannelAsync().catch(() => {});
    });
    return () => task.cancel();
  }, []);

  // The native splash stays up while the saved sign-in is resolved (see
  // PatientAuthContext). A returning patient then goes straight to Home or
  // sign-in; only a first install sees the animated intro (app/index.tsx).
  // The splash is hidden a frame after that screen is chosen, so the first
  // thing on screen is the real screen, never the intro flashing past.
  const launched = useRef(false);
  useEffect(() => {
    if (loading || launched.current) return;
    launched.current = true;
    const segs = segments as string[];
    const atRoot = segs.length === 0 || segs[0] === 'index';
    // Returning users are redirected by app/index.tsx; give that one frame,
    // then hide. This shell never unmounts, so the timer always fires (in
    // 1.0.5/1.0.6 the hide lived in index.tsx, whose own redirect unmounted
    // it and cancelled the timer: the app stayed on the logo).
    const delay = atRoot && (user || seenOnboarding) ? 150 : 0;
    setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, delay);
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const segs = segments as string[];
    if (segs.length === 0) return;

    const currentSegment = segs[0];
    const isPublicRoute =
      PUBLIC_ROUTES.includes(currentSegment) ||
      (typeof window !== 'undefined' && window.location.search.includes('preview=1'));

    if (!user && !isPublicRoute) {
      // Not logged in → go to login
      resetTo(router, '/auth/login');
    } else if (user && currentSegment === 'index') {
      // Logged in and on root index → go to main app
      resetTo(router, '/(tabs)');
    }
  }, [user, loading, segments]);

  // Onboarding pages: the native eased slide with a slight parallax of the
  // page underneath (smoother than the plain linear slide), the same for
  // Next, Back and swipe-back; just a quick fade when "reduce motion" is on.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  const onboardingTransition = {
    animation: reduceMotion ? 'fade' : 'ios_from_right',
    animationDuration: reduceMotion ? 150 : 320,
    contentStyle: { backgroundColor: '#FFFFFF' },
  } as const;

  // Still behind the native splash screen.
  if (loading) return null;

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
        <Stack.Screen name="onboarding1" options={onboardingTransition} />
        <Stack.Screen name="onboarding2" options={onboardingTransition} />
        <Stack.Screen name="onboarding3" options={onboardingTransition} />
        <Stack.Screen name="onboarding4" options={onboardingTransition} />
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
