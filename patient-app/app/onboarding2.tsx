import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Dimensions, Image, Platform, StyleSheet, Text, View } from 'react-native';
import Tap from '../components/Tap';
import { EnterIllustration, EnterText, OnboardingDots } from '../components/OnboardingMotion';
import { preloadOnboarding } from '../utils/preloadOnboarding';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const { width } = Dimensions.get('window');
const NAVY_BLUE = '#1E3A8A';

export default function Onboarding2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(preloadOnboarding, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding1');
    }
  };

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
        
        {/* TOP NAVIGATION HEADER */}
        <View style={[styles.header, { paddingTop: topPadding }]}>
          <Tap
            style={styles.backButton} 
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#1E293B" />
          </Tap>

          <View style={styles.headerBrand}>
            <Text style={styles.headerBrandText}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
            </Text>
          </View>

          <View style={{ width: scale(44) }} />
        </View>

        {/* ILLUSTRATION AREA - 54% SCREEN HEIGHT */}
        <View style={styles.illustrationWrapper}>
          <View style={styles.glassEffect} />
          <EnterIllustration>
            <Image
              source={require('../assets/onboarding2.png')}
              style={styles.image}
              resizeMode="contain"
            />
          </EnterIllustration>
        </View>

        {/* WHITE CARD - 46% SCREEN HEIGHT (BUTTON ELEVATED ABOVE NAV BAR) */}
        <View style={[styles.card, { paddingBottom: bottomPadding }]}>
          <View style={styles.cardContent}>
            <OnboardingDots active={1} />

            <EnterText delay={60}><Text style={styles.tag}>SUPPORT: FIRST-LINE TRIAGE</Text></EnterText>
            <EnterText delay={110}><Text style={styles.title}>Guided Assistance</Text></EnterText>
            
            <EnterText delay={160}><Text style={styles.description}>
              Ask KAI about clinic hours, booking, pricing, and using the app — any time. For anything medical, one tap connects you to K&A Clinic staff who reply directly in the Chat tab.
            </Text></EnterText>
          </View>

          <Tap
            onPress={() => router.push('/onboarding3')} 
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
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  background: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(24),
    zIndex: 10,
  },
  backButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
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
