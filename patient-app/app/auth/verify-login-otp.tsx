// app/auth/verify-login-otp.tsx
//
// Login second factor. Reached from login.tsx after the password succeeded but
// the server did not vouch for this device. The Firebase session already exists
// but PatientAuthContext keeps it "pending" (user === null) until
// completeSecondFactor() is called here, so nothing behind this screen is
// reachable. Backing out signs the pending session out entirely.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resetTo } from '../../utils/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
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
import { auth, sendLoginOTP, signOut, verifyLoginOTP } from '../../config/backend';
import { setKeepSignedIn } from '../../config/appPrefs';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../utils/scale';

const { height } = Dimensions.get('window');
const NAVY_BLUE = '#1E3A8A';
const SOFT_GRAY_BG = '#F8FAFC';
const BORDER_INACTIVE = '#E2E8F0';
const MAX_OTP_ATTEMPTS = 5;

export default function VerifyLoginOtp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ maskedEmail?: string; remember?: string }>();
  const { pendingUser, completeSecondFactor } = usePatientAuth();
  const rememberDevice = params.remember === '1';

  const [maskedEmail, setMaskedEmail] = useState(params.maskedEmail || 'your registered email');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(60);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // No pending session (e.g. deep link, or it was signed out) → nothing to
  // verify. Back to login rather than showing a dead form.
  useEffect(() => {
    if (!pendingUser && !auth.currentUser) router.replace('/auth/login');
  }, [pendingUser]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(p => (p <= 1 ? 0 : p - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const abandon = async () => {
    try {
      await setKeepSignedIn(false);
      await signOut(auth);
    } catch {}
    resetTo(router, '/auth/login');
  };

  // Android back must behave like the on-screen back button (swipe is
  // disabled for this route): drop the pending session and return to login,
  // instead of popping to whatever sat under this screen.
  const abandonRef = useRef(abandon);
  useEffect(() => { abandonRef.current = abandon; });
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      abandonRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleVerify = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const issuedMrn = await verifyLoginOTP(code, rememberDevice);
      completeSecondFactor(issuedMrn);
      resetTo(router, '/(tabs)');
    } catch (e: any) {
      const next = attempts + 1;
      setAttempts(next);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      if (next >= MAX_OTP_ATTEMPTS) {
        setError('Too many incorrect attempts. Please sign in again.');
        setTimeout(abandon, 1500);
      } else {
        setError(e?.message || 'Incorrect code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const { maskedEmail: masked } = await sendLoginOTP();
      setMaskedEmail(masked);
      setAttempts(0);
      setOtpDigits(['', '', '', '', '', '']);
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || 'Failed to resend the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    const digits = [...otpDigits];
    digits[index] = value.replace(/[^0-9]/g, '').slice(-1);
    setOtpDigits(digits);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#F0F6FE', '#F8FAFC']} style={styles.background}>
        <View style={styles.patternOverlay}>
          <Ionicons name="medical" size={120} color="#DBEAFE" style={styles.bgIcon1} />
          <Ionicons name="heart" size={90} color="#DBEAFE" style={styles.bgIcon2} />
          <Ionicons name="pulse" size={130} color="#DBEAFE" style={styles.bgIcon3} />
        </View>
      </LinearGradient>

      <View style={[styles.navHeader, { top: Math.max(insets.top + (Platform.OS === 'android' ? 12 : 8), verticalScale(42)) }]}>
        <Tap style={styles.backButton} onPress={abandon} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#1E293B" />
        </Tap>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top + verticalScale(35), verticalScale(90)),
              paddingBottom: Math.max(insets.bottom + (Platform.OS === 'android' ? 24 : 16), verticalScale(40)),
            },
          ]}
        >
          <Animated.View entering={FadeInUp.duration(800)} style={styles.header}>
            <View style={styles.logoCircleBadge}>
              <Image source={require('../../assets/logo-white-nobg.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.brandName}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
            </Text>
            <Text style={styles.brandSubtitle}>ANTI-RABIES CARE SYSTEM</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(700)} style={styles.formCard}>
            <View style={styles.otpIconWrapper}>
              <LinearGradient colors={['#DBEAFE', '#BFDBFE']} style={styles.otpIconBg}>
                <Ionicons name="shield-checkmark-outline" size={36} color={NAVY_BLUE} />
              </LinearGradient>
            </View>

            <Text style={styles.title}>Verify It&apos;s You</Text>
            <Text style={styles.subtitle}>
              This device isn&apos;t recognized yet. We sent a 6-digit sign-in code to{'\n'}
              <Text style={styles.highlight}>{maskedEmail}</Text>
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.otpRow}>
              {otpDigits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { otpRefs.current[i] = ref; }}
                  style={[
                    styles.otpBox,
                    digit ? styles.otpBoxFilled : null,
                    focusedField === `otp${i}` ? styles.otpBoxFocused : null,
                  ]}
                  value={digit}
                  onChangeText={(v) => handleOtpChange(v, i)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                  onFocus={() => setFocusedField(`otp${i}`)}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                  textAlignVertical="center"
                  selectionColor={NAVY_BLUE}
                  autoFocus={i === 0}
                />
              ))}
            </View>

            <Tap
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              activeOpacity={0.85}
              onPress={handleVerify}
              disabled={loading}
            >
              <LinearGradient colors={[NAVY_BLUE, '#172554']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryGradient}>
                <Text style={styles.primaryButtonText}>{loading ? 'Verifying...' : 'Verify & Sign In'}</Text>
              </LinearGradient>
            </Tap>

            <Tap
              style={[styles.resendButton, resendCooldown > 0 && styles.resendDisabled]}
              onPress={handleResend}
              disabled={resendCooldown > 0 || loading}
            >
              <Ionicons name="refresh-outline" size={15} color={resendCooldown > 0 ? '#94A3B8' : NAVY_BLUE} />
              <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </Text>
            </Tap>

            {/* Only when "Keep me signed in" was ticked at login. */}
            {rememberDevice && (
              <View style={styles.rememberNote}>
                <Ionicons name="phone-portrait-outline" size={14} color="#475569" />
                <Text style={styles.rememberNoteText}>
                  Remember this device for 30 days: you can skip this step next time.
                </Text>
              </View>
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: scale(24) },
  header: { alignItems: 'center', marginBottom: verticalScale(24) },
  logoCircleBadge: {
    width: scale(110), height: scale(110), borderRadius: scale(55),
    backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: NAVY_BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16,
    elevation: 6, borderWidth: 1, borderColor: '#DBEAFE',
  },
  logo: { width: scale(85), height: scale(85) },
  brandName: { fontSize: moderateScale(26), fontWeight: '900', color: '#1E293B', letterSpacing: 4, marginTop: verticalScale(12), fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium' },
  brandSubtitle: { fontSize: moderateScale(10.5), fontWeight: '800', color: NAVY_BLUE, letterSpacing: 2, marginTop: verticalScale(2) },
  formCard: {
    backgroundColor: '#FFF', borderRadius: scale(32), paddingHorizontal: scale(30), paddingTop: verticalScale(32), paddingBottom: verticalScale(34),
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20,
    elevation: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  title: { fontSize: moderateScale(25), fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: verticalScale(4) },
  subtitle: { fontSize: moderateScale(13), color: '#64748B', textAlign: 'center', marginBottom: verticalScale(22), marginTop: verticalScale(6), lineHeight: moderateScale(20) },
  highlight: { color: NAVY_BLUE, fontWeight: '800' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: scale(8),
    backgroundColor: '#FEE2E2', borderRadius: scale(14), padding: scale(12), marginTop: verticalScale(12), marginBottom: verticalScale(12),
  },
  errorText: { flex: 1, fontSize: moderateScale(12.5), color: '#B91C1C', lineHeight: moderateScale(18) },
  otpIconWrapper: { alignItems: 'center', marginBottom: verticalScale(14) },
  otpIconBg: { width: scale(72), height: scale(72), borderRadius: scale(36), justifyContent: 'center', alignItems: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(22), gap: scale(8) },
  otpBox: {
    flex: 1,
    height: verticalScale(62),
    minHeight: 52,
    maxHeight: 70,
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: BORDER_INACTIVE,
    backgroundColor: SOFT_GRAY_BG,
    fontSize: moderateScale(22),
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  otpBoxFocused: {
    borderColor: NAVY_BLUE,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    shadowColor: NAVY_BLUE,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: NAVY_BLUE,
    backgroundColor: '#F0F7FF',
    borderWidth: 1.8,
  },
  primaryButton: {
    borderRadius: scale(16), overflow: 'hidden', elevation: 5, marginTop: verticalScale(10),
    shadowColor: NAVY_BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10,
  },
  primaryGradient: { flexDirection: 'row', height: verticalScale(56), justifyContent: 'center', alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFF', fontSize: moderateScale(16.5), fontWeight: '700', letterSpacing: 0.3 },
  resendButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), marginTop: verticalScale(14), padding: scale(8) },
  resendDisabled: { opacity: 0.5 },
  resendText: { fontSize: moderateScale(13), fontWeight: '700', color: NAVY_BLUE },
  resendTextDisabled: { color: '#94A3B8' },
  rememberNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: scale(8),
    backgroundColor: '#F1F5F9', borderRadius: scale(12), padding: scale(12), marginTop: verticalScale(16),
  },
  rememberNoteText: { flex: 1, fontSize: moderateScale(11.5), color: '#475569', lineHeight: moderateScale(16) },
});
