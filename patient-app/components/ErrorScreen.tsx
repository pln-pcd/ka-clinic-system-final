// Full-screen fallback when a screen crashes, instead of a red screen or a
// blank one. Expo Router renders it as the route's ErrorBoundary (exported
// from app/_layout.tsx and app/(tabs)/_layout.tsx). The real error goes to
// the console for debugging; the patient only sees plain text.
import { Ionicons } from '@expo/vector-icons';
import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const NAVY = '#1A3052';
const AMBER = '#D97706';

export default function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[ErrorScreen] screen crashed:', error);
    // A crash during start-up would otherwise leave the splash screen up.
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);

  return (
    <View style={s.root} accessibilityRole="alert">
      <View style={s.iconCircle}>
        <Ionicons name="alert-circle-outline" size={scale(40)} color={AMBER} />
      </View>
      <Text style={s.title}>Something went wrong</Text>
      <Text style={s.text}>{"This screen couldn't load. Please try again."}</Text>
      <TouchableOpacity style={s.btn} onPress={retry} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="refresh" size={16} color="#FFFFFF" />
        <Text style={s.btnText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(32) },
  iconCircle: {
    width: scale(84), height: scale(84), borderRadius: scale(42), backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center', marginBottom: verticalScale(20),
  },
  title: { fontSize: moderateScale(20), fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  text: { fontSize: moderateScale(13.5), color: '#64748B', textAlign: 'center', marginTop: verticalScale(8), lineHeight: moderateScale(20) },
  btn: {
    marginTop: verticalScale(28), flexDirection: 'row', alignItems: 'center', gap: scale(8),
    backgroundColor: NAVY, paddingHorizontal: scale(26), paddingVertical: verticalScale(13), borderRadius: scale(14),
  },
  btnText: { color: '#FFFFFF', fontSize: moderateScale(14.5), fontWeight: '700' },
});
