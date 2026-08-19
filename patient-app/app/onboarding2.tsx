import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { markOnboardingSeen } from '../config/appPrefs';
import { moderateScale, scale, verticalScale } from '../constants/scale';

const { width } = Dimensions.get('window');
const MEDICAL_RED = '#E31837';

export default function Onboarding2() {
  const router = useRouter();

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

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding1');
    }
  };

  // Finishing the carousel is what marks this install as onboarded — from here
  // on, launches go straight to login (or the app, if a session is kept).
  const handleFinish = async () => {
    await markOnboardingSeen();
    router.replace('/auth/login');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#FDF2F3', '#FFFFFF']} style={styles.background}>
        
        {/* TOP NAVIGATION HEADER */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#1E293B" />
          </TouchableOpacity>

          <View style={styles.headerBrand}>
            <Text style={styles.headerBrandText}>
              <Text style={{ color: MEDICAL_RED }}>K&A</Text> CLINIC
            </Text>
          </View>

          <View style={{ width: scale(44) }} />
        </View>

        {/* ILLUSTRATION AREA - 63% SCREEN HEIGHT */}
        <View style={styles.illustrationWrapper}>
          <View style={styles.glassEffect} />
          <Animated.Image 
            source={require('../assets/onboarding2.png')} 
            style={[styles.image, imageAnimatedStyle]}
            resizeMode="contain"
          />
        </View>

        {/* WHITE CARD - 37% SCREEN HEIGHT */}
        <Animated.View style={[styles.card, animatedStyle]}>
          <View style={styles.cardContent}>
            <View style={styles.indicatorContainer}>
              <View style={styles.indicator} />
              <View style={[styles.indicator, styles.activeIndicator]} />
            </View>

            <Text style={styles.tag}>SUPPORT: FIRST-LINE TRIAGE</Text>
            <Text style={styles.title}>Guided Assistance</Text>
            
            <Text style={styles.description}>
              Our integrated AI assistant handles routine health questions, guides you through wound care procedures, and instantly connects you with clinic staff for urgent care.
            </Text>
          </View>

          <TouchableOpacity 
            onPress={handleFinish} 
            activeOpacity={0.85}
            style={styles.buttonShadow}
          >
            <LinearGradient 
              colors={[MEDICAL_RED, '#C2152E']} 
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Get Started</Text>
              <Ionicons name="rocket-sharp" size={18} color="#FFF" style={{ marginLeft: 8 }} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
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
    paddingTop: Platform.OS === 'ios' ? verticalScale(52) : verticalScale(40),
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
    flex: 0.63,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    width: width * 0.78,
    height: width * 0.78,
    zIndex: 2
  },
  glassEffect: {
    position: 'absolute',
    width: width * 0.68,
    height: width * 0.68,
    backgroundColor: 'rgba(227, 24, 55, 0.04)',
    borderRadius: scale(40),
    transform: [{ rotate: '12deg' }],
  },
  card: {
    flex: 0.37,
    backgroundColor: '#FFF',
    borderTopLeftRadius: scale(36),
    borderTopRightRadius: scale(36),
    paddingHorizontal: scale(26),
    paddingTop: verticalScale(20),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(44) : verticalScale(34),
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
  activeIndicator: { width: scale(24), height: scale(7), borderRadius: scale(3.5), backgroundColor: MEDICAL_RED },
  tag: { fontSize: moderateScale(11), fontWeight: '800', color: MEDICAL_RED, letterSpacing: 1.5, marginBottom: verticalScale(5), textTransform: 'uppercase' },
  title: { fontSize: moderateScale(29), fontWeight: '900', color: '#1E293B', lineHeight: moderateScale(34), marginBottom: verticalScale(8) },
  description: { fontSize: moderateScale(15), color: '#64748B', lineHeight: moderateScale(22), fontWeight: '400' },
  buttonShadow: {
    shadowColor: MEDICAL_RED,
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