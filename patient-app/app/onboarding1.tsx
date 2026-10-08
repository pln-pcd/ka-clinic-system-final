import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import Tap from '../components/Tap';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const { width } = Dimensions.get('window');
const NAVY_BLUE = '#1E3A8A';

export default function Onboarding1() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const fadeAnim = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    fadeAnim.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, { duration: 800, easing: Easing.out(Easing.exp) });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ translateY: translateY.value }],
  }));

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
  }));

  // Guarantees button is safely elevated above Android 3-button nav / gesture bar
  const bottomPadding = Math.max(
    insets.bottom + (Platform.OS === 'android' ? 24 : verticalScale(16)),
    Platform.OS === 'android' ? 76 : verticalScale(36)
  );

  const topPadding = Math.max(
    insets.top + (Platform.OS === 'android' ? 10 : 8),
    Platform.OS === 'ios' ? verticalScale(52) : verticalScale(40)
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#F0F6FE', '#FFFFFF']} style={styles.background}>
        
        {/* HEADER: Centered Clinic Logo Badge */}
        <View style={[styles.header, { paddingTop: topPadding }]}>
          <View style={styles.headerBrand}>
            <Text style={styles.headerBrandText}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
            </Text>
          </View>
        </View>

        {/* ILLUSTRATION AREA - 54% SCREEN HEIGHT */}
        <View style={styles.illustrationWrapper}>
          <View style={styles.glassEffect} />
          <Animated.Image 
            source={require('../assets/onboarding1.png')} 
            style={[styles.image, imageAnimatedStyle]} 
            resizeMode="contain"
          />
        </View>

        {/* WHITE CARD - 46% SCREEN HEIGHT (BUTTON ELEVATED ABOVE NAV BAR) */}
        <Animated.View style={[styles.card, animatedStyle, { paddingBottom: bottomPadding }]}>
          <View style={styles.cardContent}>
            <View style={styles.indicatorContainer}>
              <View style={[styles.indicator, styles.activeIndicator]} />
              <View style={styles.indicator} />
              <View style={styles.indicator} />
              <View style={styles.indicator} />
            </View>

            <Text style={styles.tag}>PROTOCOL: DOSE TRACKING</Text>
            <Text style={styles.title}>Strict Dose{"\n"}Protocol</Text>
            
            <Text style={styles.description}>
              Your Day 0, 3, 7 and 28 doses are mapped out automatically from your exposure date. See what&apos;s done, what&apos;s next, and get a reminder before every visit so no dose is ever missed.
            </Text>
          </View>

          <Tap
            onPress={() => router.push('/onboarding2')} 
            activeOpacity={0.85}
            style={styles.buttonShadow}
          >
            <LinearGradient 
              colors={[NAVY_BLUE, '#172554']} 
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Next</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 8 }} />
            </LinearGradient>
          </Tap>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  background: { flex: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
    zIndex: 10,
  },
  headerBrand: {
    alignItems: 'center',
  },
  headerBrandText: {
    fontSize: moderateScale(13),
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: 2.5,
  },
  illustrationWrapper: { 
    flex: 0.54, 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'relative',
  },
  image: { 
    width: width * 0.70, 
    height: width * 0.70, 
    maxHeight: '85%',
    zIndex: 2 
  },
  glassEffect: {
    position: 'absolute',
    width: width * 0.60,
    height: width * 0.60,
    backgroundColor: 'rgba(30, 58, 138, 0.05)',
    borderRadius: scale(40),
    transform: [{ rotate: '12deg' }],
  },
  card: {
    flex: 0.46,
    backgroundColor: '#FFF',
    borderTopLeftRadius: scale(36),
    borderTopRightRadius: scale(36),
    paddingHorizontal: scale(26),
    paddingTop: verticalScale(22),
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 8,
    justifyContent: 'space-between',
  },
  cardContent: {
    flex: 1,
  },
  indicatorContainer: { flexDirection: 'row', marginBottom: verticalScale(12), alignItems: 'center' },
  indicator: { width: scale(7), height: scale(7), borderRadius: scale(3.5), backgroundColor: '#E2E8F0', marginRight: scale(8) },
  activeIndicator: { width: scale(24), height: scale(7), borderRadius: scale(3.5), backgroundColor: NAVY_BLUE },
  tag: { fontSize: moderateScale(12), fontWeight: '800', color: NAVY_BLUE, letterSpacing: 1.5, marginBottom: verticalScale(5), textTransform: 'uppercase' },
  title: { fontSize: moderateScale(30), fontWeight: '900', color: '#1E293B', lineHeight: moderateScale(36), marginBottom: verticalScale(10) },
  description: { fontSize: moderateScale(16), color: '#64748B', lineHeight: moderateScale(24), fontWeight: '400' },
  buttonShadow: {
    shadowColor: NAVY_BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: verticalScale(15),
    borderRadius: scale(17),
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: '#FFF',
    fontSize: moderateScale(16),
    fontWeight: '700',
    letterSpacing: 0.5
  },
});