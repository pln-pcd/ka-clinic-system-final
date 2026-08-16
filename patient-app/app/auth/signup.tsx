// app/auth/signup.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  AuthorizedPatient,
  completeEmailSignup,
  getAuthErrorMessage,
  lookupAuthorizedPatient,
  sendEmailOTP,
  signInAsGuest,
  verifyEmailOTP,
} from '../../config/firebase';
import { moderateScale, scale, verticalScale } from '../../constants/scale';

const { height } = Dimensions.get('window');
const MEDICAL_RED = '#E31837';
const SOFT_GRAY_BG = '#F8FAFC';
const BORDER_INACTIVE = '#E2E8F0';

// A patient gets locked out of this signup attempt after this many wrong
// codes, forcing a restart from the MRN step (the /api/verify-otp backend
// enforces its own, stricter 5-attempt lockout on top of this — this is
// just client-side UX pacing).
const MAX_OTP_ATTEMPTS = 5;

type SignupStep = 'mrn' | 'otp' | 'password';

export default function PatientSignupScreen() {
  const router = useRouter();
  // forgot-password sends patients here with their MRN when the record exists
  // but was never registered in the app, so they don't retype it.
  const { mrn: mrnParam } = useLocalSearchParams<{ mrn?: string }>();
  const [step, setStep] = useState<SignupStep>('mrn');

  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Step 1 State
  const [mrnInput, setMrnInput] = useState(mrnParam ?? '');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [record, setRecord] = useState<AuthorizedPatient | null>(null);

  // Step 2 State (OTP) — verification state lives server-side in
  // /otpVerifications, keyed by MRN; this client only tracks UX pacing.
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Step 3 State (Password)
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── STEP 1: Look up MRN, refuse if already registered, then send a real
  // email OTP (via /api/send-otp → Gmail SMTP) to the email on file ───────
  const handleSendOTP = async () => {
    setError('');
    if (!mrnInput.trim()) {
      setError('Please enter your Medical Record Number (MRN).');
      return;
    }

    setLoading(true);
    try {
      const patientRecord = await lookupAuthorizedPatient(mrnInput);
      if (!patientRecord || !patientRecord.authorized) {
        throw new Error('MRN not found. Please register at the K&A Clinic front desk first.');
      }
      if (patientRecord.registered) {
        throw new Error('This MRN already has an account. Please sign in instead.');
      }

      const { maskedEmail: masked } = await sendEmailOTP(mrnInput);
      setMaskedEmail(masked);
      setOtpAttempts(0);
      setOtpDigits(['', '', '', '', '', '']);
      startResendCooldown();
      setStep('otp');
    } catch (e: any) {
      setError(e?.message || getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // ── STEP 2: Verify the real email OTP against /api/verify-otp ────────────
  const handleVerifyOTP = async () => {
    const entered = otpDigits.join('');
    if (entered.length < 6) {
      setError('Please enter the full 6-digit OTP code.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const patient = await verifyEmailOTP(mrnInput, entered);
      setRecord(patient);
      setStep('password');
    } catch (e: any) {
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();

      const attempts = otpAttempts + 1;
      setOtpAttempts(attempts);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        setError('Too many incorrect attempts. Please start over.');
        setStep('mrn');
      } else {
        setError(e?.message || 'Invalid verification code.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── STEP 3: Create the real Firebase Auth account for the verified patient ──
  const handleCompleteRegistration = async () => {
    setError('');
    if (!password.trim()) {
      setError('Please enter a password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    if (!record) {
      setError('Something went wrong. Please restart sign up.');
      return;
    }

    setLoading(true);
    try {
      await completeEmailSignup(record, password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      await signInAsGuest();
      router.replace('/(tabs)');
    } catch (e: any) {
      setGuestLoading(false);
      setError(getAuthErrorMessage(e));
      return;
    }
    setGuestLoading(false);
  };

  // ── OTP Handlers & Cooldown ──────────────────────────────────────────────
  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0 || !mrnInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { maskedEmail: masked } = await sendEmailOTP(mrnInput);
      setMaskedEmail(masked);
      setOtpAttempts(0);
      setOtpDigits(['', '', '', '', '', '']);
      startResendCooldown();
    } catch (e: any) {
      setError(e?.message || 'Failed to resend verification code. Please try again.');
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
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#FFF1F2', '#F8FAFC']} style={styles.background}>
        <View style={styles.patternOverlay}>
          <Ionicons name="medical" size={120} color="#FEE2E2" style={styles.bgIcon1} />
          <Ionicons name="heart" size={90} color="#FEE2E2" style={styles.bgIcon2} />
          <Ionicons name="pulse" size={130} color="#FEE2E2" style={styles.bgIcon3} />
        </View>
      </LinearGradient>

      {/* TOP NAVIGATION */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (step === 'password') setStep('otp');
            else if (step === 'otp') setStep('mrn');
            else router.back();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* BRANDING HEADER */}
          <Animated.View entering={FadeInUp.duration(800)} style={styles.header}>
            <View style={styles.logoCircleBadge}>
              <Image source={require('../../assets/logo-white-nobg.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.brandName}>
              <Text style={{ color: MEDICAL_RED }}>K&A</Text> CLINIC
            </Text>
            <Text style={styles.brandSubtitle}>ANTI-RABIES CARE SYSTEM</Text>
          </Animated.View>

          {/* ── STEP 1: Medical Record Number (MRN) ── */}
          {step === 'mrn' && (
            <Animated.View entering={FadeInDown.delay(150).duration(800)} style={styles.formCard}>
              <Text style={styles.title}>Sign Up to Patient App</Text>
              
              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Medical Record Number (MRN)</Text>
                <View style={[styles.inputBox, focusedField === 'mrn' && styles.inputBoxFocused]}>
                  <Ionicons name="card-outline" size={20} color={focusedField === 'mrn' ? MEDICAL_RED : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Medical Record Number (MRN)"
                    placeholderTextColor="#94A3B8"
                    value={mrnInput}
                    onChangeText={setMrnInput}
                    onFocus={() => setFocusedField('mrn')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <Text style={styles.instructionSubtext}>
                Enter your Medical Record Number (MRN) and a verification code will be sent to your registered email address!
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleSendOTP}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[MEDICAL_RED, '#C2152E']} 
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Finding Patient Record...' : 'Send OTP'}
                  </Text>
                  <Ionicons name="paper-plane-outline" size={18} color="#FFF" style={{ marginLeft: scale(6) }} />
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.secondaryLinkRow}>
                <Text style={styles.secondaryLinkText}>or you can Sign in if you have an existing account </Text>
                <TouchableOpacity onPress={() => router.push('/auth/login')}>
                  <Text style={styles.linkBold}>Sign In</Text>
                </TouchableOpacity>
              </View>

              {/* DIVIDER & GUEST OPTION */}
              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.orText}>Don&apos;t have an (MRN) Yet</Text>
                <View style={styles.line} />
              </View>

              <TouchableOpacity
                style={[styles.guestButton, guestLoading && styles.buttonDisabled]}
                activeOpacity={0.8}
                onPress={handleGuestLogin}
                disabled={guestLoading}
              >
                <Text style={styles.guestButtonText}>{guestLoading ? 'Signing in...' : 'Continue as a Guest'}</Text>
                {!guestLoading && <Ionicons name="arrow-forward" size={16} color={MEDICAL_RED} />}
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => Alert.alert('Support Helpline', 'Contact K&A Clinic Frontdesk at support@kaclinic.ph or call (02) 8888-5622.')}
                style={styles.troubleLink}
              >
                <Text style={styles.troubleText}>
                  Having trouble? <Text style={styles.troubleBold}>Contact Us</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 2: Verification Code (OTP) ── */}
          {step === 'otp' && (
            <Animated.View entering={FadeInDown.delay(100).duration(700)} style={styles.formCard}>
              <View style={styles.otpIconWrapper}>
                <LinearGradient colors={['#FEE2E2', '#FECACA']} style={styles.otpIconBg}>
                  <Ionicons name="mail-outline" size={36} color={MEDICAL_RED} />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Enter Verification Code</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit verification code to your registered email{'\n'}
                <Text style={styles.phoneHighlight}>{maskedEmail}</Text>
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
                    selectionColor={MEDICAL_RED}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleVerifyOTP}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[MEDICAL_RED, '#C2152E']} 
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Verifying OTP...' : 'Verify OTP'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resendButton, resendCooldown > 0 && styles.resendDisabled]}
                onPress={handleResendOTP}
                disabled={resendCooldown > 0 || loading}
              >
                <Ionicons name="refresh-outline" size={15} color={resendCooldown > 0 ? '#94A3B8' : MEDICAL_RED} />
                <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 3: Set Password ── */}
          {step === 'password' && (
            <Animated.View entering={FadeInDown.delay(100).duration(700)} style={styles.formCard}>
              <View style={styles.otpIconWrapper}>
                <LinearGradient colors={['#FEE2E2', '#FECACA']} style={styles.otpIconBg}>
                  <Ionicons name="lock-closed-outline" size={36} color={MEDICAL_RED} />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Create Your Password</Text>
              <Text style={styles.subtitle}>
                Set a secure password for account <Text style={styles.phoneHighlight}>{record?.name}</Text>
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Create Password</Text>
                <View style={[styles.inputBox, focusedField === 'pass' && styles.inputBoxFocused]}>
                  <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'pass' ? MEDICAL_RED : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: scale(4) }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={[styles.inputBox, focusedField === 'cpass' && styles.inputBoxFocused]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={focusedField === 'cpass' ? MEDICAL_RED : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('cpass')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ padding: scale(4) }}>
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleCompleteRegistration}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[MEDICAL_RED, '#C2152E']} 
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Creating Account...' : 'Complete Registration'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  background: { ...StyleSheet.absoluteFillObject },
  patternOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
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
  // flexGrow + justifyContent centers the logo/brand/card block vertically when
  // the content is shorter than the screen, while still scrolling normally once
  // it grows past it (the OTP and password steps are taller than the MRN step).
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(90),
    paddingBottom: verticalScale(40),
  },
  header: { alignItems: 'center', marginBottom: verticalScale(24) },
  logoCircleBadge: {
    width: scale(110),
    height: scale(110),
    borderRadius: scale(55),
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: MEDICAL_RED,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logo: { width: scale(85), height: scale(85), tintColor: MEDICAL_RED },
  brandName: { fontSize: moderateScale(26), fontWeight: '900', color: '#1E293B', letterSpacing: 4, marginTop: verticalScale(12), fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium' },
  brandSubtitle: { fontSize: moderateScale(10.5), fontWeight: '800', color: MEDICAL_RED, letterSpacing: 2, marginTop: verticalScale(2) },
  formCard: {
    backgroundColor: '#FFF', borderRadius: scale(32), paddingHorizontal: scale(30), paddingTop: verticalScale(32), paddingBottom: verticalScale(34),
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20,
    elevation: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  title: { fontSize: moderateScale(25), fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: verticalScale(4) },
  subtitle: { fontSize: moderateScale(13), color: '#64748B', textAlign: 'center', marginBottom: verticalScale(22), marginTop: verticalScale(6), lineHeight: moderateScale(20) },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: scale(8),
    backgroundColor: '#FEE2E2', borderRadius: scale(14), padding: scale(12), marginTop: verticalScale(12), marginBottom: verticalScale(12),
  },
  errorText: { flex: 1, fontSize: moderateScale(12.5), color: '#B91C1C', lineHeight: moderateScale(18) },
  inputWrapper: { marginTop: verticalScale(14), marginBottom: verticalScale(12) },
  inputLabel: { fontSize: moderateScale(13), fontWeight: '700', color: '#334155', marginBottom: verticalScale(6), marginLeft: scale(2) },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: SOFT_GRAY_BG, borderWidth: 1.5,
    borderColor: BORDER_INACTIVE, borderRadius: scale(16),
    paddingHorizontal: scale(16), height: verticalScale(58),
  },
  inputBoxFocused: { borderColor: MEDICAL_RED, backgroundColor: '#FFF', borderWidth: 1.5 },
  textInput: { flex: 1, marginLeft: scale(12), fontSize: moderateScale(15.5), color: '#1E293B' },
  instructionSubtext: {
    fontSize: moderateScale(12.5), color: '#0284C7', lineHeight: moderateScale(19),
    marginVertical: verticalScale(16), textAlign: 'center', fontWeight: '500',
  },
  primaryButton: {
    borderRadius: scale(16), overflow: 'hidden', elevation: 5, marginTop: verticalScale(10),
    shadowColor: MEDICAL_RED, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10,
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
  linkBold: { color: MEDICAL_RED, fontWeight: '800', fontSize: moderateScale(14) },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: verticalScale(24) },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  orText: { marginHorizontal: scale(12), color: '#64748B', fontSize: moderateScale(11.5), fontWeight: '700' },
  guestButton: {
    flexDirection: 'row', height: verticalScale(54), borderRadius: scale(16),
    borderWidth: 1.5, borderColor: '#FECDD3',
    justifyContent: 'center', alignItems: 'center',
    gap: scale(8), backgroundColor: '#FFF1F3',
  },
  guestButtonText: { color: MEDICAL_RED, fontSize: moderateScale(14.5), fontWeight: '800' },
  troubleLink: { marginTop: verticalScale(22), alignItems: 'center' },
  troubleText: { fontSize: moderateScale(13), color: '#64748B' },
  troubleBold: { color: MEDICAL_RED, fontWeight: '700' },
  otpIconWrapper: { alignItems: 'center', marginBottom: verticalScale(14) },
  otpIconBg: { width: scale(72), height: scale(72), borderRadius: scale(36), justifyContent: 'center', alignItems: 'center' },
  phoneHighlight: { color: MEDICAL_RED, fontWeight: '800' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: verticalScale(20), gap: scale(8) },
  otpBox: {
    flex: 1, height: verticalScale(56), borderRadius: scale(14),
    borderWidth: 1.5, borderColor: BORDER_INACTIVE,
    backgroundColor: SOFT_GRAY_BG,
    fontSize: moderateScale(22), fontWeight: '800', color: '#1E293B', textAlign: 'center',
  },
  otpBoxFocused: { borderColor: MEDICAL_RED, backgroundColor: '#FFF' },
  otpBoxFilled: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  resendButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: scale(6), marginTop: verticalScale(14), padding: scale(8),
  },
  resendDisabled: { opacity: 0.5 },
  resendText: { fontSize: moderateScale(13), fontWeight: '700', color: MEDICAL_RED },
  resendTextDisabled: { color: '#94A3B8' },
});