// app/index.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { resetTo } from '../utils/navigation';
import React, { useEffect, useRef } from 'react';
import { Dimensions, Image, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { moderateScale, scale, verticalScale } from '../constants/scale';
import { hasSeenOnboarding } from '../config/appPrefs';
import { usePatientAuth } from '../context/PatientAuthContext';

const { width, height } = Dimensions.get('window');
const NAVY_BLUE = '#1E3A8A';

// Long enough for the entrance animation to land, short enough not to feel like
// a loading screen. Returning patients spend this once per launch either way.
const SPLASH_MS = 2600;

export default function LuxuryEntrance() {
  const router = useRouter();
  const { user, loading: authLoading } = usePatientAuth();
  const navigated = useRef(false);

  // Animation values
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const textOpacity = useSharedValue(0);
  const bgMovement = useSharedValue(0);

  useEffect(() => {
    // 1. Logo Entrance
    logoOpacity.value = withTiming(1, { duration: 1500 });
    logoScale.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.exp),
    });

    // 2. Text Stagger
    textOpacity.value = withDelay(1000, withTiming(1, { duration: 1200 }));

    // 3. Background Animation
    bgMovement.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 8000, easing: Easing.bezier(0.445, 0.05, 0.55, 0.95) }),
        withTiming(0, { duration: 8000, easing: Easing.bezier(0.445, 0.05, 0.55, 0.95) })
      ),
      -1,
      true
    );

  }, []);

  // Route once the splash animation has played AND auth has resolved, so a
  // returning patient is never shown the intro carousel or a login screen they
  // do not need. Three outcomes:
  //   signed in            → straight to the app
  //   onboarding already seen → login
  //   genuinely new install   → the carousel
  useEffect(() => {
    if (authLoading || navigated.current) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const seen = await hasSeenOnboarding();
      if (cancelled || navigated.current) return;
      navigated.current = true;
      if (user) resetTo(router, '/(tabs)');
      else if (seen) resetTo(router, '/auth/login');
      else router.replace('/onboarding1');
    }, SPLASH_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [authLoading, user]);

  // Animated Styles
  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: interpolate(textOpacity.value, [0, 1], [30, 0]) }],
  }));

  const floatingLayerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(bgMovement.value, [0, 1], [-15, 15]) },
      { translateY: interpolate(bgMovement.value, [0, 1], [-10, 10]) },
      { rotate: `${interpolate(bgMovement.value, [0, 1], [-2, 2])}deg` },
    ],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFFFFF', '#F0F6FE', '#F8FAFC']}
        style={styles.background}
      >
        {/* ANIMATED DECORATIVE ELEMENTS */}
        <Animated.View style={[styles.floatingContainer, floatingLayerStyle]}>
          <View style={[styles.geometricShard, { top: height * 0.1, left: -scale(20), transform: [{ rotate: '15deg' }] }]} />
          <View style={[styles.geometricShard, { bottom: height * 0.2, right: -scale(40), width: scale(250), height: scale(250), opacity: 0.03 }]} />
          <View style={styles.centerGlow} />
        </Animated.View>

        {/* CONTENT LAYER */}
        <View style={styles.mainContent}>
          <Animated.View style={[styles.logoWrapper, animatedLogoStyle]}>
            <Image
              source={require('../assets/logo-white-nobg.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={[styles.textContainer, animatedTextStyle]}>
            <Text style={styles.title}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
            </Text>

            <View style={styles.dividerContainer}>
              <View style={styles.line} />
              <View style={styles.accentDot} />
              <View style={styles.line} />
            </View>

            <Text style={styles.subtext}>ANTI-RABIES CARE</Text>
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  floatingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  geometricShard: {
    position: 'absolute',
    width: scale(200),
    height: scale(200),
    backgroundColor: NAVY_BLUE,
    opacity: 0.05,
    borderRadius: scale(40),
  },
  centerGlow: {
    width: width * 0.8,
    height: width * 0.8,
    backgroundColor: NAVY_BLUE,
    opacity: 0.04,
    borderRadius: (width * 0.8) / 2,
  },
  mainContent: {
    alignItems: 'center',
    zIndex: 10,
  },
  logoWrapper: {
    width: width * 0.75,
    height: width * 0.75,
    shadowColor: NAVY_BLUE,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 35,
    elevation: 20,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    marginTop: verticalScale(40),
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  title: {
    fontSize: moderateScale(40),
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: 3,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(18),
  },
  line: {
    width: scale(50),
    height: 1.5,
    backgroundColor: '#E2E8F0',
  },
  accentDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: NAVY_BLUE,
    marginHorizontal: scale(15),
  },
  subtext: {
    fontSize: moderateScale(13),
    color: '#64748B',
    letterSpacing: 6,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});