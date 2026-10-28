import {
  browserLocalPersistence,
  browserSessionPersistence,
  verifyPasswordResetCode,
  setPersistence,
  signInWithCustomToken,
} from 'firebase/auth';
import BrandLoader from '../../components/BrandLoader';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { getClientDeviceKey, postJson } from '../../lib/adminSession';
import PasswordChecklist, { PasswordMatch } from '../../components/PasswordChecklist';
import { meetsPasswordPolicy, passwordPolicyError } from '../../lib/passwordPolicy';
import {
  ArrowRight,
  ShieldCheck,
  Mail,
  Lock,
  Key,
  Eye,
  EyeOff,
  Info,
  Check,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Sparkles,
} from 'lucide-react';

const SLIDES = [
  {
    tag: 'Clinical Intelligence',
    headline: 'Protect Smarter. Care Faster. Heal Anywhere.',
    desc: 'From immediate bite triage to digital PEP dose schedules, our powerful clinical portal coordinates patient care seamlessly.',
  },
  {
    tag: 'PEP Dose Protocol',
    headline: 'Never Miss A Dose. Precision Tracking.',
    desc: 'Automatic Day 0, 3, 7, and 14 schedule tracking keeps every anti-rabies patient strictly on protocol.',
  },
  {
    tag: 'Triage & Incident Map',
    headline: 'Rapid Bite Response. Digital Records.',
    desc: 'Log, assess category severity, and track vaccination inventory in real time across the entire clinic.',
  },
];

// Background slideshow: pets, vets and clinic scenes under the navy wash.
// One timer drives everything — each headline above spans
// IMAGES_PER_HEADLINE consecutive photos, so the dots, the copy and the
// backdrop can never drift apart.
const LOGIN_SLIDES = [1, 2, 3, 4, 5, 6].map(n => `/assets/dashboard/login/${n}.jpg`);
const IMAGES_PER_HEADLINE = LOGIN_SLIDES.length / SLIDES.length;
const SLIDE_MS = 6000;

export default function AdminLogin({ onSuccess, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(() => {
    try {
      const reason = sessionStorage.getItem('kna_admin_logout_reason');
      if (reason) {
        sessionStorage.removeItem('kna_admin_logout_reason');
        return reason;
      }
    } catch {}
    return '';
  });
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  // Every photo stays mounted and stacked; switching is a pure opacity
  // crossfade. The first frame is preloaded from index.html so it paints
  // immediately, and the rest are fetched + decoded up front.
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = Math.floor(slideIndex / IMAGES_PER_HEADLINE);
  const [slideReady, setSlideReady] = useState(() => LOGIN_SLIDES.map((_, i) => i === 0));
  useEffect(() => {
    let cancelled = false;
    LOGIN_SLIDES.forEach((src, i) => {
      const img = new Image();
      img.src = src;
      // A failed decode still counts as "ready" so one bad file can't stall
      // the rotation — that slide just shows the navy base underneath.
      (img.decode ? img.decode() : Promise.resolve())
        .catch(() => {})
        .then(() => {
          if (cancelled) return;
          setSlideReady(prev => (prev[i] ? prev : prev.map((v, j) => (j === i ? true : v))));
        });
    });
    return () => { cancelled = true; };
  }, []);
  // Advance only once the incoming photo is decoded, so it never pops in
  // late. Re-armed on every change, so clicking a dot restarts the clock.
  const nextSlideIndex = (slideIndex + 1) % LOGIN_SLIDES.length;
  const nextSlideReady = slideReady[nextSlideIndex];
  useEffect(() => {
    if (!nextSlideReady) return;
    const t = setTimeout(() => setSlideIndex(nextSlideIndex), SLIDE_MS);
    return () => clearTimeout(t);
  }, [slideIndex, nextSlideIndex, nextSlideReady]);

  // Forgot password & Set New Password
  const [forgotStep, setForgotStep] = useState('request'); // 'request' | 'new-password' | 'success'
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [resetMaskedEmail, setResetMaskedEmail] = useState('');
  const [oobCode, setOobCode] = useState('');
  const [verifyingLink, setVerifyingLink] = useState(false);
  const [linkValid, setLinkValid] = useState(true);

  // Email-OTP second factor (Batch 3), skippable on a trusted device (Batch 4)
  const [otpStep, setOtpStep] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loginCooldown, setLoginCooldown] = useState(0);

  const emailRef = useRef();
  const otpRef = useRef();

  const REMEMBER_KEY = 'ka_admin_remembered_email';

  useEffect(() => {
    // The last remembered email is prefilled, but "Remember me" always
    // starts unticked: trusting this device is a choice made each sign-in,
    // and the code screen only mentions it when it was ticked.
    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (remembered) setEmail(remembered);
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const id = setTimeout(() => setLoginCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [loginCooldown]);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const id = setTimeout(() => setForgotCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [forgotCooldown]);

  // Check URL query parameters for password reset link action code (e.g. ?mode=resetPassword&oobCode=XYZ)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('oobCode');
      const mode = params.get('mode');
      const emailParam = params.get('email');
      if (emailParam) {
        setEmail(emailParam);
        setResetMaskedEmail(emailParam);
      }
      if (code && (mode === 'resetPassword' || !mode)) {
        setOobCode(code);
        setShowForgot(true);
        setForgotStep('new-password');
        setVerifyingLink(true);
        setLinkValid(true);
        verifyPasswordResetCode(auth, code)
          .then(userEmail => {
            if (userEmail) {
              setEmail(userEmail);
              setResetMaskedEmail(userEmail);
            }
          })
          .catch(err => {
            console.warn('verifyPasswordResetCode note:', err?.message);
            // Keep linkValid as true; backend handles custom tokens and fallback verification
          })
          .finally(() => {
            setVerifyingLink(false);
          });
      }
    } catch {}
  }, []);

  function friendlyError(code) {
    switch (code) {
      case 'auth/invalid-email': return 'Invalid email address.';
      case 'auth/user-not-found': return 'Invalid credentials or account unavailable.';
      case 'auth/wrong-password': return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential': return 'Invalid credentials. Check your email and password.';
      case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
      case 'auth/network-request-failed': return 'Network error. Check your connection.';
      default: return 'Sign-in failed. Please verify your credentials.';
    }
  }

  function lockedMessage(minutes) {
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }

  async function applyPersistence() {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
  }

  async function verifyAdminAccess(uid) {
    const snap = await getDoc(doc(db, 'admins', uid));
    if (!snap.exists() || snap.data().status !== 'active') {
      await auth.signOut();
      throw new Error('NOT_AUTHORIZED');
    }
  }

  function completeLogin() {
    setShowSuccess(true);
    setTimeout(() => { if (onSuccess) onSuccess(); }, 2200);
  }

  function initiateOtpStep(masked) {
    setOtpValue('');
    setOtpError('');
    setMaskedEmail(masked || '');
    setOtpStep(true);
    setResendCooldown(30);
    setTimeout(() => otpRef.current?.focus(), 100);
  }

  async function requestOtpOrSkip() {
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/send-admin-otp', {}, { Authorization: `Bearer ${idToken}` });
      if (!data?.success) {
        const remaining = Number(data?.retryAfter) || (data?.error ? Number(data.error.match(/(\d+)\s*second/i)?.[1]) : 30);
        if (remaining > 0) {
          setLoginCooldown(remaining);
        }
        setError(data?.error || `Please wait before requesting another code. Try again in 30 seconds.`);
        await auth.signOut();
        return;
      }
      if (data.trusted) {
        completeLogin();
        return;
      }
      initiateOtpStep(data.maskedEmail);
    } catch {
      setError('Network error. Please check your connection and try again.');
      await auth.signOut();
    }
  }

  async function handleEmailLogin(e) {
    if (e) e.preventDefault();
    if (loginCooldown > 0) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await applyPersistence();
      const data = await postJson('/api/admin-login', { action: 'login', email: trimmedEmail, password });
      if (!data?.success) { setError(data?.error || 'Invalid credentials or account unavailable.'); return; }
      const cred = await signInWithCustomToken(auth, data.customToken);

      await verifyAdminAccess(cred.user.uid);

      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, trimmedEmail);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      await requestOtpOrSkip();
    } catch (err) {
      setError(err.message === 'NOT_AUTHORIZED'
        ? 'This account is not an authorized admin. Contact your clinic admin.'
        : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(codeOverride) {
    const code = (codeOverride ?? otpValue).trim();
    if (code.length !== 6) { setOtpError('Enter the 6-digit code.'); return; }
    setOtpLoading(true);
    setOtpError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/verify-admin-otp', { code, rememberDevice: rememberMe, clientDeviceKey: getClientDeviceKey() }, { Authorization: `Bearer ${idToken}` });
      if (!data?.success) {
        setOtpError(data?.error || 'Invalid or expired code.');
        setOtpValue('');
        setTimeout(() => otpRef.current?.focus(), 50);
        return;
      }
      setOtpStep(false);
      completeLogin();
    } catch {
      setOtpError('Network error. Please check your connection and try again.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || otpLoading) return;
    setOtpError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/send-admin-otp', {}, { Authorization: `Bearer ${idToken}` });
      if (!data?.success) {
        setOtpError(data?.error || 'Could not resend the code. Please try again.');
        return;
      }
      if (data.trusted) { setOtpStep(false); completeLogin(); return; }
      setOtpValue('');
      setResendCooldown(30);
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch {
      setOtpError('Network error. Please check your connection and try again.');
    }
  }

  async function handleOtpBack() {
    setOtpStep(false);
    setOtpValue('');
    setOtpError('');
    setError('');
    setResendCooldown(0);
    try { await auth.signOut(); } catch {}
    setTimeout(() => emailRef.current?.focus(), 100);
  }

  async function handleRequestResetCode(e) {
    if (e) e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setForgotError('Please enter your authorized clinic email.');
      return;
    }
    setForgotError('');
    setForgotSending(true);
    try {
      const data = await postJson('/api/admin-forgot-password', { email: trimmedEmail });
      if (!data?.success) {
        setForgotError(data?.error || 'Failed to send reset code. Please try again.');
        if (data?.retryAfter) setForgotCooldown(Number(data.retryAfter));
        return;
      }
      setResetMaskedEmail(data.maskedEmail || trimmedEmail);
      setForgotStep('sent');
      setForgotCooldown(30);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setForgotError('Network error. Please check your connection and try again.');
    } finally {
      setForgotSending(false);
    }
  }

  async function handleResendResetCode() {
    if (forgotCooldown > 0 || forgotSending) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setForgotError('');
    setForgotSending(true);
    try {
      const data = await postJson('/api/admin-forgot-password', { email: trimmedEmail });
      if (!data?.success) {
        setForgotError(data?.error || 'Could not resend the code. Please try again.');
        if (data?.retryAfter) setForgotCooldown(Number(data.retryAfter));
        return;
      }
      setForgotCooldown(30);
    } catch {
      setForgotError('Network error. Please check your connection.');
    } finally {
      setForgotSending(false);
    }
  }

  async function handleSetNewPassword(e) {
    if (e) e.preventDefault();
    const trimmedEmail = email.trim();

    if (!oobCode) {
      setForgotError('Password reset link is missing or invalid. Please request a new reset link.');
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setForgotError(policyError);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    setForgotError('');
    setForgotSending(true);

    if (oobCode) {
      // Backend reset via custom token or Firebase Admin SDK
      try {
        const data = await postJson('/api/admin-reset-password', {
          email: trimmedEmail,
          oobCode,
          newPassword,
        });
        if (!data?.success) {
          setForgotError(data?.error || 'Failed to update password. Please request a new link.');
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        setForgotStep('success');
        setPassword(newPassword);
      } catch {
        setForgotError('Network error. Please check your connection.');
      } finally {
        setForgotSending(false);
      }
      return;
    }
  }

  function handleResetSuccessDone() {
    window.history.replaceState({}, document.title, window.location.pathname);
    setShowForgot(false);
    setForgotStep('request');
    setForgotCode('');
    setOobCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setForgotError('');
    setError('');
  }

  const busy = loading;

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[#060e24] font-sans selection:bg-blue-900 selection:text-white">

      {/* ── BACKGROUND: Photo slideshow with Blue-Navy Atmosphere ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Base dark navy backdrop */}
        <div className="absolute inset-0 bg-[#060e24]" />

        {/* Slideshow layer: every slide is mounted and stacked; only the active
            one is opaque. The slow drift (.login-bg-slide, index.css) runs
            continuously on every frame and is never toggled, so nothing
            resets or snaps at the swap point — only opacity changes. */}
        {LOGIN_SLIDES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchpriority={i === 0 ? 'high' : 'low'}
            className={`login-bg-slide absolute inset-0 w-full h-full object-cover transition-opacity duration-[1800ms] ease-in-out ${
              i === slideIndex ? 'opacity-80' : 'opacity-0'
            }`}
            style={{ animationDelay: `${-i * 5}s` }}
          />
        ))}

        {/* Ambient Navy & Blue Atmospheric Glows */}
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] bg-blue-600/25 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 left-1/3 w-[550px] h-[550px] bg-indigo-700/20 rounded-full blur-[160px]" />
        <div className="absolute top-1/4 right-10 w-[500px] h-[500px] bg-sky-500/15 rounded-full blur-[130px]" />

        {/* Geometric Grid Texture Accent in Navy / Cyan Hue */}
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#60a5fa_1px,transparent_1px),linear-gradient(to_bottom,#60a5fa_1px,transparent_1px)] [background-size:48px_48px]" />

        {/* Deep Navy Vignette & Readability Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#060e24]/90 via-[#091b42]/60 to-[#071333]/85 backdrop-blur-[0.5px]" />
      </div>

      {/* ── TOP HEADER / NAV BAR ── */}
      <header className="relative z-20 w-full px-6 sm:px-10 md:px-14 pt-6 sm:pt-8 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-[3px] shadow-md border border-blue-100/90">
            <img src="/assets/dashboard/logo-white-nobg.png" alt="K&A Anti-Rabies Vaccine Clinic" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-white font-extrabold text-base sm:text-lg tracking-tight leading-none block">
              K&amp;A Anti-Rabies Vaccine Clinic
            </span>
          </div>
        </div>

        {/* Back to Website Link */}
        {onBack && (
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#0a1e4a]/60 hover:bg-[#123275]/80 backdrop-blur-md border border-blue-400/30 text-xs font-semibold text-blue-100 hover:text-white transition-colors shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Website</span>
          </button>
        )}
      </header>

      {/* ── MAIN CONTENT AREA (Split Layout: Left Copy + Right Floating Card) ── */}
      <main className="relative z-20 w-full max-w-7xl mx-auto px-6 sm:px-10 md:px-14 py-8 md:py-12 flex-1 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-16">

        {/* ── LEFT HERO COPY SECTION (Over Slideshow) ── */}
        <div className="w-full md:w-1/2 flex flex-col justify-center text-left max-w-xl">
          {/* Blue Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-950/70 backdrop-blur-md border border-blue-400/30 text-sky-300 text-xs font-bold tracking-wide w-fit mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>{SLIDES[slide].tag}</span>
          </div>

          {/* Headline */}
          <h1 key={`title-${slide}`} className="text-3xl sm:text-4xl md:text-5xl lg:text-[52px] font-extrabold text-white tracking-tight leading-[1.12] mb-4 drop-shadow-sm animate-in fade-in slide-in-from-bottom-3 duration-500 font-display">
            {SLIDES[slide].headline}
          </h1>

          {/* Subtitle */}
          <p key={`desc-${slide}`} className="text-blue-100/80 text-sm sm:text-base font-normal leading-relaxed mb-8 max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
            {SLIDES[slide].desc}
          </p>

          {/* Interactive Carousel Pagination Indicator */}
          <div className="flex items-center gap-2.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.tag}
                type="button"
                onClick={() => setSlideIndex(i * IMAGES_PER_HEADLINE)}
                aria-label={`Slide ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  slide === i
                    ? 'w-10 bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.8)]'
                    : 'w-2.5 bg-blue-300/30 hover:bg-blue-300/60'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT SECTION: Floating Modern Card ── */}
        <div className="w-full md:w-auto md:min-w-[420px] lg:min-w-[460px] max-w-[460px]">
          <div className="bg-white rounded-[28px] sm:rounded-[36px] shadow-[0_30px_90px_rgba(3,10,32,0.6)] border border-blue-100/90 p-8 sm:p-10 md:p-11 relative backdrop-blur-sm animate-in fade-in zoom-in-95 duration-400">

            {/* OTP Step View */}
            {otpStep ? (
              <div className="animate-in fade-in duration-300">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 text-[#0e2a6d]">
                  <Key className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-1 font-display">
                  Verification Code
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed mb-6 font-medium">
                  We sent a 6-digit code to <span className="font-semibold text-[#0a1b3f]">{maskedEmail || 'your email'}</span>.
                </p>

                {otpError && (
                  <div className="flex items-start gap-2 bg-rose-50 text-rose-600 text-xs p-3 rounded-xl border border-rose-100 mb-4 animate-in slide-in-from-top-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="font-semibold">{otpError}</p>
                  </div>
                )}

                <div className="mb-4">
                  <input
                    ref={otpRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={otpValue}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtpValue(v);
                      setOtpError('');
                      if (v.length === 6) setTimeout(() => handleVerifyOtp(v), 150);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') handleVerifyOtp(); }}
                    disabled={otpLoading}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl text-center font-mono text-2xl font-bold tracking-[0.35em] text-[#0a1b3f] placeholder:text-slate-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50"
                  />
                </div>

                {rememberMe && (
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Keep me signed in on this device for 30 days.
                  </p>
                )}

                <button
                  onClick={() => handleVerifyOtp()}
                  disabled={otpLoading || otpValue.trim().length !== 6}
                  className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {otpLoading ? <Loader2 className="w-4 h-4 my-0.5 animate-spin" /> : (
                    <>
                      Verify &amp; Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between mt-4">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0}
                    className="text-xs font-semibold text-[#1d4ed8] hover:text-[#0a1d47] disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>

                  <button
                    onClick={handleOtpBack}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#0a1d47] font-semibold transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to login
                  </button>
                </div>
              </div>
            ) : showForgot ? (
              /* ── Forgot Password / Set New Password View ── */
              <div className="animate-in fade-in duration-300">
                {forgotStep === 'request' && (
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 text-[#0e2a6d]">
                      <Key className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-1 font-display">
                      Reset Password
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed mb-6 font-medium">
                      Enter your authorized clinic email to receive a secure password reset link.
                    </p>

                    {forgotError && (
                      <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="font-semibold">{forgotError}</p>
                      </div>
                    )}

                    <form onSubmit={handleRequestResetCode}>
                      <div className="mb-5">
                        <label htmlFor="forgot-email" className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                          Clinic Email
                        </label>
                        <input
                          id="forgot-email"
                          type="email"
                          autoComplete="email"
                          placeholder="Input your email"
                          value={email}
                          onChange={e => { setEmail(e.target.value); setForgotError(''); }}
                          disabled={forgotSending}
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50 font-medium"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={forgotSending || !email.trim()}
                        className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] flex items-center justify-center gap-2 disabled:opacity-50 mb-3"
                      >
                        {forgotSending ? <Loader2 className="w-4 h-4 my-0.5 animate-spin" /> : 'Send Reset Link'}
                      </button>

                      <div className="flex items-center justify-start pt-2">
                        <button
                          type="button"
                          onClick={() => { setShowForgot(false); setForgotError(''); setError(''); }}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0a1d47] font-semibold transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Back to Login
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {forgotStep === 'sent' && (
                  <div className="text-center py-2 animate-in fade-in duration-300">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1d4ed8] border border-blue-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <Mail className="w-7 h-7" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-2 font-display">
                      Check Your Inbox
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium max-w-sm mx-auto">
                      We sent a secure password reset link to <strong className="text-[#0a1b3f]">{resetMaskedEmail || email.trim()}</strong>.
                      Open the email and click <strong>Reset Password Now</strong> to choose your new password directly in the portal.
                    </p>

                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleResendResetCode}
                        disabled={forgotCooldown > 0 || forgotSending}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-[#0a1b3f] py-3 rounded-full text-xs font-bold transition-all disabled:opacity-50"
                      >
                        {forgotCooldown > 0 ? `Resend link in ${forgotCooldown}s` : 'Resend reset link'}
                      </button>

                      <button
                        type="button"
                        onClick={() => { setShowForgot(false); setForgotStep('request'); setForgotError(''); }}
                        className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-[#0a1d47] font-semibold mx-auto transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Back to Login
                      </button>
                    </div>
                  </div>
                )}

                {forgotStep === 'new-password' && (
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4 text-[#0e2a6d] shadow-sm">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-1 font-display">
                      {oobCode ? 'Choose New Password' : 'Set New Password'}
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4 font-medium">
                      {oobCode
                        ? 'Create a new secure password for your clinic staff account.'
                        : <>We sent a 6-digit verification code to <span className="font-bold text-[#0a1b3f]">{resetMaskedEmail || email.trim() || 'your email'}</span>.</>}
                    </p>

                    {/* Account Identity Badge */}
                    {(resetMaskedEmail || email.trim()) && (
                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50/80 border border-blue-200/80 text-[#0e2a6d] text-xs font-semibold mb-4">
                        <ShieldCheck className="w-4 h-4 text-[#1d4ed8] shrink-0" />
                        <span className="truncate">Authorized account: <strong className="text-[#0a1b3f]">{resetMaskedEmail || email.trim()}</strong></span>
                      </div>
                    )}

                    {verifyingLink && (
                      <div className="flex items-center justify-center gap-2.5 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 mb-4 animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-[#1d4ed8]" />
                        <span className="font-semibold">Verifying secure password reset link…</span>
                      </div>
                    )}

                    {forgotError && (
                      <div className="flex items-start gap-2.5 bg-red-50 text-red-600 text-xs p-3.5 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="font-semibold leading-relaxed">{forgotError}</p>
                          {!linkValid && (
                            <button
                              type="button"
                              onClick={() => {
                                setOobCode('');
                                setForgotStep('request');
                                setForgotError('');
                                window.history.replaceState({}, document.title, window.location.pathname);
                              }}
                              className="text-xs text-[#1d4ed8] hover:underline font-bold block pt-1"
                            >
                              Request a new reset link &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {linkValid && !verifyingLink && (
                      <form onSubmit={handleSetNewPassword} className="space-y-4">

                        <div>
                          <label className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                            New Password
                          </label>
                          <div className="relative">
                            <input
                              type={showNewPass ? 'text' : 'password'}
                              autoComplete="new-password"
                              placeholder="Create strong password"
                              value={newPassword}
                              onChange={e => { setNewPassword(e.target.value); setForgotError(''); }}
                              disabled={forgotSending}
                              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 pr-11 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50 font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPass(!showNewPass)}
                              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-[#1d4ed8]"
                            >
                              {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Live checklist: the same rules the server enforces. */}
                          <PasswordChecklist id="reset-pw-rules" className="mt-2.5" password={newPassword} />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                            Confirm New Password
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmPass ? 'text' : 'password'}
                              autoComplete="new-password"
                              placeholder="Re-enter your new password"
                              value={confirmNewPassword}
                              onChange={e => { setConfirmNewPassword(e.target.value); setForgotError(''); }}
                              disabled={forgotSending}
                              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 pr-11 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50 font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPass(!showConfirmPass)}
                              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-[#1d4ed8]"
                            >
                              {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <PasswordMatch id="reset-pw-match" className="mt-1.5" password={newPassword} confirm={confirmNewPassword} />
                        </div>

                        <button
                          type="submit"
                          disabled={
                            forgotSending ||
                            !oobCode ||
                            !meetsPasswordPolicy(newPassword) ||
                            newPassword !== confirmNewPassword
                          }
                          className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                        >
                          {forgotSending ? <Loader2 className="w-4 h-4 my-0.5 animate-spin" /> : 'Save New Password'}
                        </button>

                        <div className="flex items-center justify-start pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              window.history.replaceState({}, document.title, window.location.pathname);
                              setShowForgot(false);
                              setForgotStep('request');
                              setForgotError('');
                            }}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0a1d47] font-semibold transition-colors"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Back to Login
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {forgotStep === 'success' && (
                  <div className="text-center py-4 animate-in zoom-in-95 duration-300">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-2 font-display">
                      Password Updated!
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium max-w-xs mx-auto">
                      Your new password has been securely saved. You can now sign in to the clinic administration portal.
                    </p>
                    <button
                      type="button"
                      onClick={handleResetSuccessDone}
                      className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)]"
                    >
                      Sign In with New Password
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Standard Login Form (Blue & Navy Blue Theme) ── */
              <div className="animate-in fade-in duration-300">
                {/* Header Titles */}
                <h2 className="text-3xl font-extrabold text-[#0a1b3f] tracking-tight mb-1 font-display">
                  Welcome Back!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mb-6">
                  Log in to access your clinic portal and records.
                </p>

                {loginCooldown > 0 ? (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="font-semibold">
                      Please wait before requesting another code. Try again in {loginCooldown} second{loginCooldown === 1 ? '' : 's'}.
                    </p>
                  </div>
                ) : error ? (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="font-semibold">{error}</p>
                  </div>
                ) : null}

                <form onSubmit={handleEmailLogin} className="space-y-4">
                  {/* Email Input */}
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                      Email
                    </label>
                    <input
                      ref={emailRef}
                      id="login-email"
                      type="text"
                      autoComplete="email"
                      placeholder="Input your email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') document.getElementById('login-password')?.focus(); }}
                      disabled={busy}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>

                  {/* Password Input */}
                  <div>
                    <label htmlFor="login-password" className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPass ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Input your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={busy}
                        className="w-full bg-slate-50 border border-slate-200 pl-4 pr-11 py-3 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50 font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-[#1d4ed8] transition-colors"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me & Forgot Password Row */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={rememberMe}
                        onChange={e => {
                          setRememberMe(e.target.checked);
                          if (!e.target.checked) localStorage.removeItem(REMEMBER_KEY);
                        }}
                      />
                      <div className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors border ${rememberMe ? 'bg-[#0e2a6d] border-[#0e2a6d] text-white' : 'border-slate-300 bg-white'}`}>
                        {rememberMe && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                      <span className="text-xs font-semibold text-slate-600">Keep me signed in</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotStep('request'); setForgotError(''); setError(''); }}
                      className="text-xs font-semibold text-[#1d4ed8] hover:text-[#0a1d47] transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* Login CTA Button with Navy Blue / Royal Blue Gradient */}
                  <button
                    type="submit"
                    disabled={busy || loginCooldown > 0}
                    className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 px-6 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.35)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] flex items-center justify-center gap-2 disabled:opacity-50 mt-3"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 my-0.5 animate-spin" />
                    ) : loginCooldown > 0 ? (
                      `Wait ${loginCooldown}s`
                    ) : (
                      <>Login</>
                    )}
                  </button>

                  {/* Divider / Secondary Notice */}
                  <div className="relative my-4 flex items-center justify-center">
                    <div className="border-t border-slate-100 w-full" />
                    <span className="bg-blue-50/70 border border-blue-100/80 px-3 py-0.5 rounded-full text-[11px] text-[#1e40af] font-bold tracking-wide shrink-0">
                      Clinic Staff Portal
                    </span>
                    <div className="border-t border-slate-100 w-full" />
                  </div>

                </form>
              </div>
            )}

          </div>
        </div>

      </main>

      {/* ── FOOTER BAR ── */}
      <footer className="relative z-20 w-full px-6 sm:px-10 md:px-14 pb-6 sm:pb-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-blue-200/60 gap-2">
        <span>&copy; {new Date().getFullYear()} K&amp;A Anti-Rabies Vaccine Clinic. All rights reserved.</span>
        <div className="flex items-center gap-4 text-blue-200/70 font-medium">
          <span>Authorized Access Only</span>
        </div>
      </footer>

      {/* ── SIGN-IN HAND-OFF ──
          This is a two-second wait on the way to the dashboard, so it says
          what is happening and nothing more. The previous overlay announced
          "Authenticated" with a badge and a second spinning ring, which is a
          lot of ceremony for a step the user never chose to look at. */}
      {showSuccess && (
        <BrandLoader label="Opening your dashboard…" className="fixed inset-0 z-50 animate-in fade-in duration-200" />
      )}


    </div>
  );
}
