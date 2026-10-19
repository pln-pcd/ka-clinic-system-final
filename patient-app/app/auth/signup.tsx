// app/auth/signup.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOr, resetTo } from '../../utils/navigation';
import { useRef, useState } from 'react';
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
import {
  AuthorizedPatient,
  completeEmailSignup,
  getAuthErrorMessage,
  sendEmailOTP,
  signInAsGuest,
  verifyEmailOTP,
} from '../../config/backend';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moderateScale, scale, verticalScale } from '../../utils/scale';
import CustomAlertModal from '../../components/CustomAlertModal';
import { meetsPasswordPolicy, passwordPolicyError } from '../../utils/passwordPolicy';
import PasswordStrength, { PasswordMatch } from '../../components/PasswordChecklist';

const { height } = Dimensions.get('window');
const NAVY_BLUE = '#1E3A8A';
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
  const insets = useSafeAreaInsets();
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
  // "Contact Us" opens the app's own popup, not the native alert.
  const [showSupport, setShowSupport] = useState(false);
  // Complete Registration is enabled only once both fields are valid.
  const passwordReady = meetsPasswordPolicy(password) && password === confirmPassword;

  // ── STEP 1: Look up MRN, refuse if already registered, verify email uniqueness,
  // then send a real email OTP (via /api/send-otp → Gmail SMTP) to the email on file ──
  const handleSendOTP = async () => {
    setError('');
    if (!mrnInput.trim()) {
      setError('Please enter your Medical Record Number (MRN).');
      return;
    }

    setLoading(true);
    try {
      // One round trip: /api/send-otp already validates the MRN, refuses
      // registered records, and checks email uniqueness with the same error
      // messages, so the two client-side Firestore pre-checks that used to
      // run first only added latency.
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
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
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
      // Account created. The patient signs in next; on this phone that first
      // sign-in skips the second code (the sign-up code already proved the
      // email address).
      await completeEmailSignup(record, password);
      resetTo(router, { pathname: '/auth/login', params: { mrn: record.mrn, created: '1' } } as any);
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
      resetTo(router, '/(tabs)');
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
        <Tap
          style={styles.backButton}
          onPress={() => {
            if (step === 'password') setStep('otp');
            else if (step === 'otp') setStep('mrn');
            else goBackOr(router, '/auth/login');
          }}
          activeOpacity={0.7}
        >
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
          {/* The password step uses a smaller header so the whole form fits
              on a normal phone without scrolling. */}
          <Animated.View entering={FadeInUp.duration(800)} style={[styles.header, step === 'password' && styles.headerCompact]}>
            <View style={[styles.logoCircleBadge, step === 'password' && styles.logoCircleBadgeCompact]}>
              <Image source={require('../../assets/logo-white-nobg.png')} style={step === 'password' ? styles.logoCompact : styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.brandName}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
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
                  <Ionicons name="card-outline" size={20} color={focusedField === 'mrn' ? NAVY_BLUE : '#94A3B8'} />
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

              <Tap
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleSendOTP}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[NAVY_BLUE, '#172554']} 
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Finding Patient Record...' : 'Send OTP'}
                  </Text>
                  <Ionicons name="paper-plane-outline" size={18} color="#FFF" style={{ marginLeft: scale(6) }} />
                </LinearGradient>
              </Tap>

              <View style={styles.secondaryLinkRow}>
                <Text style={styles.secondaryLinkText}>Already have an account? </Text>
                <Tap onPress={() => router.push('/auth/login')}>
                  <Text style={styles.linkBold}>Sign In</Text>
                </Tap>
              </View>

              {/* DIVIDER & GUEST OPTION */}
              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.orText}>Don&apos;t have an (MRN) Yet</Text>
                <View style={styles.line} />
              </View>

              <Tap
                style={[styles.guestButton, guestLoading && styles.buttonDisabled]}
                activeOpacity={0.8}
                onPress={handleGuestLogin}
                disabled={guestLoading}
              >
                <Text style={styles.guestButtonText}>{guestLoading ? 'Signing in...' : 'Continue as a Guest'}</Text>
                {!guestLoading && <Ionicons name="arrow-forward" size={16} color={NAVY_BLUE} />}
              </Tap>

              <Tap
                onPress={() => setShowSupport(true)}
                style={styles.troubleLink}
              >
                <Text style={styles.troubleText}>
                  Having trouble? <Text style={styles.troubleBold}>Contact Us</Text>
                </Text>
              </Tap>
            </Animated.View>
          )}

          {/* ── STEP 2: Verification Code (OTP) ── */}
          {step === 'otp' && (
            <Animated.View entering={FadeInDown.delay(100).duration(700)} style={styles.formCard}>
              <View style={styles.otpIconWrapper}>
                <LinearGradient colors={['#DBEAFE', '#BFDBFE']} style={styles.otpIconBg}>
                  <Ionicons name="mail-outline" size={36} color={NAVY_BLUE} />
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
                    textAlignVertical="center"
                    selectionColor={NAVY_BLUE}
                  />
                ))}
              </View>

              <Tap
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleVerifyOTP}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[NAVY_BLUE, '#172554']} 
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Verifying OTP...' : 'Verify OTP'}
                  </Text>
                </LinearGradient>
              </Tap>

              <Tap
                style={[styles.resendButton, resendCooldown > 0 && styles.resendDisabled]}
                onPress={handleResendOTP}
                disabled={resendCooldown > 0 || loading}
              >
                <Ionicons name="refresh-outline" size={15} color={resendCooldown > 0 ? '#94A3B8' : NAVY_BLUE} />
                <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </Text>
              </Tap>
            </Animated.View>
          )}

          {/* ── STEP 3: Set Password ── */}
          {step === 'password' && (
            <Animated.View entering={FadeInDown.delay(100).duration(700)} style={[styles.formCard, styles.formCardCompact]}>
              <Text style={styles.title}>Create Your Password</Text>
              <Text style={[styles.subtitle, styles.subtitleCompact]}>
                Set a secure password for account <Text style={styles.phoneHighlight}>{record?.name}</Text>
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.inputWrapperCompact}>
                <Text style={styles.inputLabel}>Create Password</Text>
                <View style={[styles.inputBox, styles.inputBoxCompact, focusedField === 'pass' && styles.inputBoxFocused]}>
                  <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'pass' ? NAVY_BLUE : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    autoComplete="new-password"
                  />
                  <Tap onPress={() => setShowPassword(!showPassword)} style={{ padding: scale(4) }} hitSlop={8}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </Tap>
                </View>
                <PasswordStrength password={password} />
              </View>

              <View style={styles.inputWrapperCompact}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={[styles.inputBox, styles.inputBoxCompact, focusedField === 'cpass' && styles.inputBoxFocused]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={focusedField === 'cpass' ? NAVY_BLUE : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('cpass')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={() => { if (passwordReady && !loading) handleCompleteRegistration(); }}
                  />
                  <Tap onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ padding: scale(4) }} hitSlop={8}
                    accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}>
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </Tap>
                </View>
                <PasswordMatch password={password} confirm={confirmPassword} />
              </View>

              <Tap
                style={[styles.primaryButton, (loading || !passwordReady) && styles.buttonDisabled]}
                activeOpacity={0.85}
                onPress={handleCompleteRegistration}
                disabled={loading || !passwordReady}
                accessibilityState={{ disabled: loading || !passwordReady }}
              >
                <LinearGradient 
                  colors={[NAVY_BLUE, '#172554']} 
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Creating Account...' : 'Complete Registration'}
                  </Text>
                </LinearGradient>
              </Tap>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <CustomAlertModal
        config={{
          visible: showSupport,
          type: 'info',
          icon: 'call-outline',
          title: 'Contact the clinic',
          message: 'Contact the K&A Clinic front desk at support@kaclinic.ph or call (02) 8888-5622.',
          primaryButtonText: 'OK',
        }}
        onClose={() => setShowSupport(false)}
      />
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
  // flexGrow + justifyContent centers the logo/brand/card block vertically when
  // the content is shorter than the screen, while still scrolling normally once
  // it grows past it (the OTP and password steps are taller than the MRN step).
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: scale(24),
  },
  header: { alignItems: 'center', marginBottom: verticalScale(16) },
  headerCompact: { marginBottom: verticalScale(10) },
  logoCircleBadgeCompact: { width: scale(64), height: scale(64), borderRadius: scale(32) },
  logoCompact: { width: scale(48), height: scale(48) },
  formCardCompact: { paddingHorizontal: scale(22), paddingTop: verticalScale(20), paddingBottom: verticalScale(20) },
  subtitleCompact: { marginBottom: verticalScale(8) },
  inputWrapperCompact: { marginTop: verticalScale(10) },
  inputBoxCompact: { height: verticalScale(50) },
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
  inputBoxFocused: { borderColor: NAVY_BLUE, backgroundColor: '#FFF', borderWidth: 1.5 },
  textInput: { flex: 1, marginLeft: scale(12), fontSize: moderateScale(15.5), color: '#1E293B' },
  instructionSubtext: {
    fontSize: moderateScale(12.5), color: '#0284C7', lineHeight: moderateScale(19),
    marginVertical: verticalScale(16), textAlign: 'center', fontWeight: '500',
  },
  primaryButton: {
    borderRadius: scale(16), overflow: 'hidden', elevation: 5, marginTop: verticalScale(10),
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
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: verticalScale(24) },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  orText: { marginHorizontal: scale(12), color: '#64748B', fontSize: moderateScale(11.5), fontWeight: '700' },
  guestButton: {
    flexDirection: 'row', height: verticalScale(54), borderRadius: scale(16),
    borderWidth: 1.5, borderColor: '#BFDBFE',
    justifyContent: 'center', alignItems: 'center',
    gap: scale(8), backgroundColor: '#EFF6FF',
  },
  guestButtonText: { color: NAVY_BLUE, fontSize: moderateScale(14.5), fontWeight: '800' },
  troubleLink: { marginTop: verticalScale(22), alignItems: 'center' },
  troubleText: { fontSize: moderateScale(13), color: '#64748B' },
  troubleBold: { color: NAVY_BLUE, fontWeight: '700' },
  otpIconWrapper: { alignItems: 'center', marginBottom: verticalScale(14) },
  otpIconBg: { width: scale(72), height: scale(72), borderRadius: scale(36), justifyContent: 'center', alignItems: 'center' },
  phoneHighlight: { color: NAVY_BLUE, fontWeight: '800' },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(22),
    gap: scale(8),
  },
  otpBox: {
    flex: 1,
    minWidth: 0,
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
  resendButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: scale(6), marginTop: verticalScale(14), padding: scale(8),
  },
  resendDisabled: { opacity: 0.5 },
  resendText: { fontSize: moderateScale(13), fontWeight: '700', color: NAVY_BLUE },
  resendTextDisabled: { color: '#94A3B8' },
});
