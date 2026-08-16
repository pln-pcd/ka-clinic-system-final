// The actual patient app: file-based routes under app/, driven by Expo Router's
// Stack. Rendered as-is on native, and inside the phone frame on web.
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePatientAuth } from '../context/PatientAuthContext';

const PUBLIC_ROUTES = ['auth', 'onboarding', 'onboarding1', 'onboarding2', 'onboarding3', 'onboarding4'];

export default function MobileApp() {
  const { user, loading } = usePatientAuth();
  const router = useRouter();
  const segments = useSegments();

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
      router.replace('/auth/login');
    } else if (user && currentSegment === 'index') {
      // Logged in and on root index → go to main app
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  // Show spinner while checking auth
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#E31837" />
      </View>
    );
  }

  // Explicit provider so useSafeAreaInsets() measures THIS subtree. On web the
  // app renders inside a fixed phone frame, and the router's implicit root
  // provider sits outside it — which would report the browser window's insets
  // instead of the frame's.
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="auth/forgot-password" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="onboarding1" />
        <Stack.Screen name="onboarding2" />
        <Stack.Screen name="onboarding3" />
        <Stack.Screen name="onboarding4" />
      </Stack>
    </SafeAreaProvider>
  );
}
