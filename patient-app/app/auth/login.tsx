// app/auth/login.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOr, resetTo } from '../../utils/navigation';
import { useEffect, useState } from 'react';
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
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, checkLoginTrust, getAuthErrorMessage, sendLoginOTP, signInAsGuest, signInWithMRN, signOut, warmAuthApi } from '../../config/backend';
import { markOnboardingSeen, setKeepSignedIn } from '../../config/appPrefs';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../utils/scale';
import CustomAlertModal from '../../components/CustomAlertModal';
import { perfMark, perfNow } from '../../utils/perf';

const { height } = Dimensions.get('window');
// Short, gentle rise shared by both blocks. A new builder per block:
// Reanimated's builders are mutable, so one shared instance would share delay.
const enter = (delay: number) => FadeInDown.delay(delay).duration(420).easing(Easing.out(Easing.cubic)).withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] });
const NAVY_BLUE = '#1E3A8A';
const SOFT_GRAY_BG = '#F8FAFC';
const BORDER_INACTIVE = '#E2E8F0';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [focusedField, setFocusedField] = useState<string | null>(null);
  // Arriving from sign-up: MRN filled in and a short confirmation shown.
  const params = useLocalSearchParams<{ mrn?: string; created?: string }>();
  const justCreated = params.created === '1';
  const [mrnInput, setMrnInput] = useState(params.mrn || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // "Contact Us" opens the app's own popup, not the native alert.
  const [showSupport, setShowSupport] = useState(false);
  // Defaults off: this is a medical record, and the phone may be shared.
  const [keepSignedIn, setKeepSignedInState] = useState(false);
  const { completeSecondFactor } = usePatientAuth();

  // Wake the sign-in server while the patient types, so pressing Sign In
  // does not also pay for a cold start.
  useEffect(() => { warmAuthApi(); }, []);

  const handleLogin = async () => {
    setError('');

    if (!mrnInput.trim() || !password.trim()) {
      setError('Please enter your Medical Record Number (MRN) and password.');
      return;
    }

    setLoading(true);
    const t = perfNow();
    try {
      const cleanMRN = mrnInput.trim().toUpperCase();
      // Recorded before sign-in so the auth listener sees the correct choice on
      // the very first callback rather than a stale one.
      // The pref write overlaps the sign-in round trip. It is awaited together
      // with sign-in, so it is on disk before anything reads it.
      await Promise.all([setKeepSignedIn(keepSignedIn), signInWithMRN(cleanMRN, password)]);
      // Anyone who can sign in is by definition not a first-time user. Not
      // awaited: nothing after this depends on it.
      markOnboardingSeen().catch(() => {});

      // Second factor. The password alone never opens the app: the session is
      // held as "pending" by PatientAuthContext until either the server vouches
      // for THIS device (trust token from an earlier OTP + "keep me signed in")
      // or the patient enters the emailed code.
      const { trusted, mrn } = await checkLoginTrust(20000, keepSignedIn);
      if (trusted) {
        perfMark('sign-in-trusted', t);
        completeSecondFactor(mrn);
        resetTo(router, '/(tabs)');
        return;
      }
      const { maskedEmail } = await sendLoginOTP();
      perfMark('sign-in-code-sent', t);
      router.replace({
        pathname: '/auth/verify-login-otp',
        params: { maskedEmail, remember: keepSignedIn ? '1' : '0' },
      });
    } catch (e: any) {
      // The password step may have succeeded before the server refused the
      // second factor (for example an archived record). Drop that pending
      // session so the patient is fully signed out, not stuck half-in.
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        await signOut(auth).catch(() => {});
      }
      setError(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // Password reset lives on its own screen (app/auth/forgot-password.tsx) so
  // the patient gets a real form plus a confirmation state, rather than having
  // to type the MRN here first and read the result in an alert. Any MRN already
  // typed is carried over so it doesn't have to be entered twice.
  const goToForgotPassword = () => {
    router.push({
      pathname: '/auth/forgot-password',
      params: mrnInput.trim() ? { mrn: mrnInput.trim() } : undefined,
    });
  };

  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuestLogin = async () => {
    setError('');
    setGuestLoading(true);
    try {
      // A guest session is deliberately not kept across launches — there is no
      // account to return to, and the next person on this phone starts clean.
      await setKeepSignedIn(false);
      await AsyncStorage.removeItem('kna:avatar:global').catch(() => {});
      await AsyncStorage.removeItem('kna:avatar:guest').catch(() => {});
      await AsyncStorage.removeItem('kna:personalData:guest').catch(() => {});
      await signInAsGuest();
      await markOnboardingSeen();
      resetTo(router, '/(tabs)');
    } catch (e: any) {
      setError(getAuthErrorMessage(e));
    } finally {
      setGuestLoading(false);
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
        <Tap style={styles.backButton} onPress={() => goBackOr(router, '/onboarding4')} activeOpacity={0.7}>
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
          {/* One entrance, top to bottom: the background is there from the
              first frame, then the brand, then the card with everything in
              it. Each block fades as one flattened layer
              (renderToHardwareTextureAndroid), so Android cannot draw the
              button's or card's elevation shadow before the block itself. */}
          <Animated.View entering={enter(0)} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing style={styles.header}>
            <View style={styles.logoCircleBadge}>
              <Image source={require('../../assets/logo-white-nobg.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.brandName}>
              <Text style={{ color: NAVY_BLUE }}>K&A</Text> CLINIC
            </Text>
            <Text style={styles.brandSubtitle}>ANTI-RABIES CARE SYSTEM</Text>
          </Animated.View>

          {/* LOGIN CARD */}
          <Animated.View entering={enter(90)} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing style={styles.formCard}>
            <Text style={styles.title}>Sign in to Your Account</Text>
            <Text style={styles.subtitle}>Enter your details below to access your medical records.</Text>

            {justCreated && !error ? (
              <View style={styles.createdBanner}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#047857" />
                <Text style={styles.createdText}>Account created. Sign in with your password to continue.</Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputContainer}>
              
              {/* Medical Record Number (MRN) Field */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Medical Record Number (MRN)</Text>
                <View style={[styles.inputBox, focusedField === 'mrn' && styles.inputBoxFocused]}>
                  <Ionicons name="card-outline" size={20} color={focusedField === 'mrn' ? NAVY_BLUE : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Medical Record Number (MRN)"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                    value={mrnInput}
                    onChangeText={setMrnInput}
                    onFocus={() => setFocusedField('mrn')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Password Field */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={[styles.inputBox, focusedField === 'pass' && styles.inputBoxFocused]}>
                  <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'pass' ? NAVY_BLUE : '#94A3B8'} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <Tap onPress={() => setShowPassword(!showPassword)} style={{ padding: scale(4) }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </Tap>
                </View>
              </View>

            </View>

            <View style={styles.optionsRow}>
              <Tap
                onPress={() => setKeepSignedInState(v => !v)}
                style={styles.keepSignedInBtn}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: keepSignedIn }}
                accessibilityLabel="Keep me signed in"
              >
                <View style={[styles.checkbox, keepSignedIn && styles.checkboxChecked]}>
                  {keepSignedIn && <Ionicons name="checkmark" size={13} color="#FFF" />}
                </View>
                <Text style={styles.keepSignedInText}>Keep me signed in</Text>
              </Tap>

              <Tap onPress={goToForgotPassword}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Tap>
            </View>

            {keepSignedIn && (
              <View style={styles.keepSignedInNote}>
                <Ionicons name="information-circle-outline" size={13} color="#64748B" />
                <Text style={styles.keepSignedInNoteText}>
                  Only use this on a personal device — your medical record stays accessible until you sign out.
                </Text>
              </View>
            )}

            <Tap
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient 
                colors={[NAVY_BLUE, '#172554']} 
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginGradient}
              >
                <Text style={styles.loginText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
                <Ionicons name="log-in-outline" size={20} color="#FFF" style={{ marginLeft: scale(6) }} />
              </LinearGradient>
            </Tap>

            <View style={styles.secondaryLinkRow}>
              <Text style={styles.secondaryLinkText}>New Patient? </Text>
              <Tap onPress={() => router.push('/auth/signup')}>
                <Text style={styles.linkBold}>Sign up</Text>
              </Tap>
            </View>

            {/* DIVIDER & GUEST ACCESS */}
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
  logo: { width: scale(72), height: scale(72) },
  brandName: { fontSize: moderateScale(23), fontWeight: '900', color: '#1E293B', letterSpacing: 3.5, marginTop: verticalScale(8), fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium' },
  brandSubtitle: { fontSize: moderateScale(10), fontWeight: '800', color: NAVY_BLUE, letterSpacing: 2, marginTop: verticalScale(2) },
  formCard: {
    backgroundColor: '#FFF', borderRadius: scale(28), paddingHorizontal: scale(26), paddingTop: verticalScale(24), paddingBottom: verticalScale(26),
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20,
    elevation: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  title: { fontSize: moderateScale(22), fontWeight: '900', color: '#1E293B', textAlign: 'center' },
  subtitle: { fontSize: moderateScale(12.5), color: '#64748B', textAlign: 'center', marginTop: verticalScale(4), marginBottom: verticalScale(14), lineHeight: moderateScale(18) },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: scale(8),
    backgroundColor: '#FEE2E2', borderRadius: scale(14), padding: scale(12), marginBottom: verticalScale(14),
  },
  errorText: { flex: 1, fontSize: moderateScale(12.5), color: '#B91C1C', lineHeight: moderateScale(18) },
  createdBanner: {
    flexDirection: 'row', alignItems: 'center', gap: scale(8),
    backgroundColor: '#ECFDF5', borderRadius: scale(14), padding: scale(12), marginBottom: verticalScale(14),
  },
  createdText: { flex: 1, fontSize: moderateScale(12.5), color: '#047857', lineHeight: moderateScale(18) },
  inputContainer: { gap: scale(2) },
  inputWrapper: { marginBottom: verticalScale(14) },
  inputLabel: { fontSize: moderateScale(13), fontWeight: '700', color: '#334155', marginBottom: verticalScale(6), marginLeft: scale(2) },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: SOFT_GRAY_BG, borderWidth: 1.5,
    borderColor: BORDER_INACTIVE, borderRadius: scale(16),
    paddingHorizontal: scale(16), height: verticalScale(58),
  },
  inputBoxFocused: { borderColor: NAVY_BLUE, backgroundColor: '#FFF', borderWidth: 1.5 },
  textInput: { flex: 1, marginLeft: scale(12), fontSize: moderateScale(15.5), color: '#1E293B' },
  optionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: verticalScale(6), marginBottom: verticalScale(18), gap: scale(12),
  },
  // 44pt tall via padding so the checkbox meets the iOS touch minimum without
  // drawing a box that large.
  keepSignedInBtn: { flexDirection: 'row', alignItems: 'center', gap: scale(9), paddingVertical: verticalScale(12), flexShrink: 1 },
  checkbox: {
    width: scale(20), height: scale(20), borderRadius: scale(6), borderWidth: 1.5, borderColor: '#CBD5E1',
    backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: NAVY_BLUE, borderColor: NAVY_BLUE },
  keepSignedInText: { fontSize: moderateScale(13.5), fontWeight: '600', color: '#334155' },
  keepSignedInNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: scale(6),
    backgroundColor: '#F1F5F9', borderRadius: scale(10), padding: scale(10), marginTop: verticalScale(-8), marginBottom: verticalScale(16),
  },
  keepSignedInNoteText: { flex: 1, fontSize: moderateScale(11.5), color: '#475569', lineHeight: moderateScale(16) },
  forgotText: { fontSize: moderateScale(13), fontWeight: '700', color: '#0369A1' },
  loginButton: {
    borderRadius: scale(16), overflow: 'hidden', elevation: 5,
    shadowColor: NAVY_BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10,
  },
  loginGradient: {
    flexDirection: 'row', height: verticalScale(56), justifyContent: 'center', alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  loginText: { color: '#FFF', fontSize: moderateScale(16.5), fontWeight: '700', letterSpacing: 0.3 },
  secondaryLinkRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(20),
  },
  secondaryLinkText: { fontSize: moderateScale(13.5), color: '#64748B' },
  linkBold: { color: NAVY_BLUE, fontWeight: '800', fontSize: moderateScale(14) },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: verticalScale(20) },
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
});