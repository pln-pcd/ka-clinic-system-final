// app/auth/forgot-password.tsx
// Dedicated password-reset screen: patient types their MRN, we look up the
// email the clinic has on file for that record and hand it to Firebase Auth's
// own reset-email flow. The email itself is never shown in full — only masked.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOr } from '../../utils/navigation';
import { useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../components/Tap';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountNotRegisteredError, getAuthErrorMessage, maskEmail, requestPasswordReset } from '../../config/backend';
import { moderateScale, scale, verticalScale } from '../../utils/scale';

const { height } = Dimensions.get('window');
const NAVY_BLUE = '#1E3A8A';
const SOFT_GRAY_BG = '#F8FAFC';
const BORDER_INACTIVE = '#E2E8F0';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Login passes along whatever MRN was already typed there.
  const { mrn: mrnParam } = useLocalSearchParams<{ mrn?: string }>();

  const [mrnInput, setMrnInput] = useState(mrnParam ?? '');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Set when the MRN is valid but has no app account yet — the fix is signing
  // up, not resetting, so the error banner offers that route instead.
  const [needsSignup, setNeedsSignup] = useState(false);
  // Holds the masked email once the reset mail is away — flips the card over to
  // the confirmation state so the patient knows where to look.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSendResetLink = async () => {
    setError('');
    setNeedsSignup(false);
    if (!mrnInput.trim()) {
      setError('Please enter your Medical Record Number (MRN).');
      return;
    }
    setLoading(true);
    try {
      const email = await requestPasswordReset(mrnInput);
      setSentTo(maskEmail(email));
    } catch (e: any) {
      if (e instanceof AccountNotRegisteredError) {
        setNeedsSignup(true);
      }
      setError(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const navTop = Math.max(insets.top + (Platform.OS === 'android' ? 12 : 8), verticalScale(42));
  const contentTopPadding = navTop + scale(44) + verticalScale(16);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#F0F6FE', '#F8FAFC']} style={styles.background}>
        <View style={styles.patternOverlay}>
          <Ionicons name="medical" size={120} color="#DBEAFE" style={styles.bgIcon1} />
          <Ionicons name="heart" size={90} color="#DBEAFE" style={styles.bgIcon2} />
          <Ionicons name="pulse" size={130} color="#DBEAFE" style={styles.bgIcon3} />
        </View>
      </LinearGradient>

      {/* TOP NAVIGATION */}
      <View style={[styles.navHeader, { top: navTop }]}>
        <Tap style={styles.backButton} onPress={() => goBackOr(router, '/auth/login')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#1E293B" />
        </Tap>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: contentTopPadding,
              paddingBottom: Math.max(insets.bottom + (Platform.OS === 'android' ? 24 : 16), verticalScale(32)),
            },
          ]}
        >

          {/* BRANDING HEADER */}
          <Animated.View entering={FadeInUp.duration(800)} style={styles.header}>
            <View style={styles.logoCircleBadge}>
              <Image source={require('../../assets/logo-white-nobg.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.brandName}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
            </Text>
            <Text style={styles.brandSubtitle}>ANTI-RABIES CARE SYSTEM</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(800)} style={styles.formCard}>
            {sentTo ? (
              /* ── CONFIRMATION STATE ── */
              <>
                <View style={styles.successIconWrap}>
                  <View style={styles.successIconBg}>
                    <Ionicons name="mail-open-outline" size={scale(38)} color={NAVY_BLUE} />
                  </View>
                </View>
                <Text style={styles.title}>Check Your Email</Text>
                <Text style={styles.subtitle}>
                  We sent a password reset link to{' '}
                  <Text style={styles.emailHighlight}>{sentTo}</Text>. Open it to choose a new password.
                </Text>

                <View style={styles.noticeBox}>
                  <Ionicons name="information-circle-outline" size={scale(20)} color="#0284C7" />
                  <Text style={styles.noticeText}>
                    The link can take a few minutes to arrive. If it isn&apos;t in your inbox, check your
                    spam or junk folder.
                  </Text>
                </View>

                <Tap
                  style={styles.primaryButton}
                  onPress={() => router.replace('/auth/login')}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[NAVY_BLUE, '#172554']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryButtonText}>Back to Sign In</Text>
                  </LinearGradient>
                </Tap>

                <Tap
                  style={styles.resendRow}
                  onPress={() => { setSentTo(null); setError(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendText}>
                    Didn&apos;t get it? <Text style={styles.linkBold}>Try again</Text>
                  </Text>
                </Tap>
              </>
            ) : (
              /* ── MRN ENTRY STATE ── */
              <>
                <Text style={styles.title}>Forgot Password</Text>
                <Text style={styles.subtitle}>
                  Enter your Medical Record Number and we&apos;ll email a reset link to the address on
                  file for your record.
                </Text>

                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {needsSignup && (
                  <Tap
                    style={styles.signupInsteadBtn}
                    onPress={() => router.replace({
                      pathname: '/auth/signup',
                      params: mrnInput.trim() ? { mrn: mrnInput.trim() } : undefined,
                    })}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="person-add-outline" size={scale(19)} color={NAVY_BLUE} />
                    <Text style={styles.signupInsteadText}>Sign Up Instead</Text>
                    <Ionicons name="arrow-forward" size={scale(17)} color={NAVY_BLUE} />
                  </Tap>
                )}

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Medical Record Number (MRN)</Text>
                  <View style={[styles.inputBox, focused && styles.inputBoxFocused]}>
                    <Ionicons name="card-outline" size={20} color={focused ? NAVY_BLUE : '#94A3B8'} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Medical Record Number (MRN)"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      value={mrnInput}
                      onChangeText={setMrnInput}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      onSubmitEditing={handleSendResetLink}
                      returnKeyType="send"
                      editable={!loading}
                    />
                  </View>
                </View>

                <Tap
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleSendResetLink}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[NAVY_BLUE, '#172554']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryButtonText}>
                      {loading ? 'Sending...' : 'Send Reset Link'}
                    </Text>
                    {!loading && (
                      <Ionicons name="paper-plane-outline" size={18} color="#FFF" style={{ marginLeft: scale(8) }} />
                    )}
                  </LinearGradient>
                </Tap>

                <Tap
                  style={styles.secondaryLinkRow}
                  onPress={() => router.replace('/auth/login')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryLinkText}>
                    Remembered it? <Text style={styles.linkBold}>Sign In</Text>
                  </Text>
                </Tap>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  background: { ...StyleSheet.absoluteFill },
  patternOverlay: { ...StyleSheet.absoluteFill, opacity: 0.5 },
  bgIcon1: { position: 'absolute', top: verticalScale(30), left: -scale(25), transform: [{ rotate: '15deg' }] },
  bgIcon2: { position: 'absolute', top: height * 0.45, right: -scale(30), transform: [{ rotate: '-15deg' }] },
  bgIcon3: { position: 'absolute', bottom: verticalScale(30), left: scale(10), transform: [{ rotate: '10deg' }] },
  navHeader: { position: 'absolute', top: Platform.OS === 'ios' ? verticalScale(56) : verticalScale(42), left: scale(24), zIndex: 10 },
  backButton: {
    width: scale(44), height: scale(44), borderRadius: scale(22),
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
    elevation: 4,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: scale(24),
  },
  header: { alignItems: 'center', marginBottom: verticalScale(16) },
  logoCircleBadge: {
    width: scale(96),
    height: scale(96),
    borderRadius: scale(48),
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: NAVY_BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  // No tint: the clinic mark is red by design.
  logo: { width: scale(72), height: scale(72) },
  brandName: { fontSize: moderateScale(23), fontWeight: '900', color: '#1E293B', letterSpacing: 3.5, marginTop: verticalScale(8), fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium' },
  brandSubtitle: { fontSize: moderateScale(10), fontWeight: '800', color: NAVY_BLUE, letterSpacing: 2, marginTop: verticalScale(2) },
  formCard: {
    backgroundColor: '#FFF', borderRadius: scale(28), paddingHorizontal: scale(26), paddingTop: verticalScale(24), paddingBottom: verticalScale(26),
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20,
    elevation: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  title: { fontSize: moderateScale(25), fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: verticalScale(4) },
  subtitle: { fontSize: moderateScale(13), color: '#64748B', textAlign: 'center', marginTop: verticalScale(6), marginBottom: verticalScale(22), lineHeight: moderateScale(20) },
  emailHighlight: { color: '#1E293B', fontWeight: '800' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: scale(8),
    backgroundColor: '#FEE2E2', borderRadius: scale(14), padding: scale(12), marginBottom: verticalScale(14),
  },
  errorText: { flex: 1, fontSize: moderateScale(12.5), color: '#B91C1C', lineHeight: moderateScale(18) },
  signupInsteadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: scale(8), height: verticalScale(52), borderRadius: scale(16),
    borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF',
    marginBottom: verticalScale(18),
  },
  signupInsteadText: { color: NAVY_BLUE, fontSize: moderateScale(14.5), fontWeight: '800' },
  inputWrapper: { marginBottom: verticalScale(18) },
  inputLabel: { fontSize: moderateScale(13), fontWeight: '700', color: '#334155', marginBottom: verticalScale(6), marginLeft: scale(2) },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: SOFT_GRAY_BG, borderWidth: 1.5,
    borderColor: BORDER_INACTIVE, borderRadius: scale(16),
    paddingHorizontal: scale(16), height: verticalScale(58),
  },
  inputBoxFocused: { borderColor: NAVY_BLUE, backgroundColor: '#FFF', borderWidth: 1.5 },
  textInput: {
    flex: 1, marginLeft: scale(12), fontSize: moderateScale(15.5), color: '#1E293B',
    paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false,
  },
  primaryButton: {
    borderRadius: scale(16), overflow: 'hidden', elevation: 5, marginTop: verticalScale(4),
    shadowColor: NAVY_BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10,
  },
  primaryGradient: {
    flexDirection: 'row', height: verticalScale(56), justifyContent: 'center', alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFF', fontSize: moderateScale(16.5), fontWeight: '700', letterSpacing: 0.3 },
  secondaryLinkRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(20),
  },
  secondaryLinkText: { fontSize: moderateScale(13.5), color: '#64748B', textAlign: 'center' },
  linkBold: { color: NAVY_BLUE, fontWeight: '800', fontSize: moderateScale(14) },
  successIconWrap: { alignItems: 'center', marginBottom: verticalScale(16) },
  successIconBg: {
    width: scale(76), height: scale(76), borderRadius: scale(38),
    backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  noticeBox: {
    flexDirection: 'row', gap: scale(10), alignItems: 'flex-start',
    backgroundColor: '#F0F9FF', borderRadius: scale(14), padding: scale(14),
    borderWidth: 1, borderColor: '#BAE6FD', marginBottom: verticalScale(20),
  },
  noticeText: { flex: 1, fontSize: moderateScale(12.5), color: '#0369A1', lineHeight: moderateScale(18), fontWeight: '500' },
  resendRow: { alignItems: 'center', marginTop: verticalScale(18) },
  resendText: { fontSize: moderateScale(13.5), color: '#64748B' },
});
