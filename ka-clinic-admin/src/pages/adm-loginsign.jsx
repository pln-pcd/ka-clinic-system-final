import {
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
  ArrowRight, ShieldCheck, Mail, Lock, Key, Eye, EyeOff, Info, Check, CheckCircle2, ChevronLeft, Loader2, HelpCircle, Syringe, Heart, Sparkles
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

async function postJson(url, body, extraHeaders) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function AdminLogin({ onSuccess, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [slide, setSlide] = useState(0);
  const [videoError, setVideoError] = useState(false);

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
  const videoRef = useRef();

  const REMEMBER_KEY = 'ka_admin_remembered_email';

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const id = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), 5500);
    return () => clearInterval(id);
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
      if (code && (mode === 'resetPassword' || !mode)) {
        setOobCode(code);
        setShowForgot(true);
        setForgotStep('new-password');
      }
    } catch {}
  }, []);

  function friendlyError(code) {
    switch (code) {
      case 'auth/invalid-email': return 'Invalid email address.';
      case 'auth/user-not-found': return 'No account found with this email.';
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
      const pre = await postJson('/api/admin-login', { action: 'precheck', email: trimmedEmail }).catch(() => null);
      if (pre?.locked) {
        setError(lockedMessage(pre.minutesRemaining));
        return;
      }

      await applyPersistence();

      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } catch (err) {
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          const fail = await postJson('/api/admin-login', { action: 'failure', email: trimmedEmail }).catch(() => null);
          if (fail?.locked) {
            setError('Too many attempts. This account is locked for 15 minutes.');
          } else if (fail?.attemptsRemaining != null) {
            setError(`Incorrect password. ${fail.attemptsRemaining} attempt${fail.attemptsRemaining === 1 ? '' : 's'} remaining.`);
          } else {
            setError(friendlyError(err.code));
          }
        } else {
          setError(friendlyError(err.code));
        }
        return;
      }

      await verifyAdminAccess(cred.user.uid);

      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, trimmedEmail);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      await requestOtpOrSkip();
    } catch (err) {
      setError(err.message === 'NOT_AUTHORIZED'
        ? 'This account is not an authorized admin. Contact your clinic manager.'
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
      const data = await postJson('/api/verify-admin-otp', { code, rememberDevice: rememberMe }, { Authorization: `Bearer ${idToken}` });
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
      setForgotStep('new-password');
      setForgotCooldown(30);
      setForgotCode('');
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
    const trimmedCode = forgotCode.trim();

    if (!oobCode && trimmedCode.length !== 6) {
      setForgotError('Please enter the complete 6-digit verification code.');
      return;
    }
    if (newPassword.length < 8) {
      setForgotError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    setForgotError('');
    setForgotSending(true);

    if (oobCode) {
      try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        setForgotStep('success');
        setPassword(newPassword);
      } catch (err) {
        setForgotError(friendlyError(err.code) || 'Invalid or expired reset link. Please request a new code.');
      } finally {
        setForgotSending(false);
      }
      return;
    }

    try {
      const data = await postJson('/api/admin-reset-password', {
        email: trimmedEmail,
        code: trimmedCode,
        newPassword,
      });
      if (!data?.success) {
        setForgotError(data?.error || 'Failed to update password. Please check your code.');
        return;
      }
      setForgotStep('success');
      setPassword(newPassword);
    } catch {
      setForgotError('Network error. Please check your connection.');
    } finally {
      setForgotSending(false);
    }
  }

  function handleResetSuccessDone() {
    setShowForgot(false);
    setForgotStep('request');
    setForgotCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setForgotError('');
    setError('');
  }

  const busy = loading;

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[#060e24] font-sans selection:bg-blue-900 selection:text-white">

      {/* ── BACKGROUND: Video Background with Natural Proportion & Blue-Navy Atmosphere ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Base dark navy backdrop */}
        <div className="absolute inset-0 bg-[#060e24]" />

        {/* Dynamic Video Layer.
            The poster is the first frame, so the backdrop is on screen from the
            first paint instead of showing bare navy while 25 seconds of video
            buffers. The clip itself is a 720p re-encode (412KB, down from a
            1080p 5.8MB original) written with the moov atom first, so playback
            starts on the opening bytes rather than after the whole download. */}
        {!videoError && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              poster="/assets/dashboard/login-poster.jpg"
              onError={() => setVideoError(true)}
              className="min-w-full min-h-full w-auto h-auto max-w-none object-cover opacity-80"
            >
              <source src="/assets/dashboard/login-bg.mp4" type="video/mp4" />
              <source src="/assets/dashboard/login.mp4" type="video/mp4" />
              <source src="/login.mp4" type="video/mp4" />
            </video>
          </div>
        )}

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
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-md border border-blue-100/90">
            <img src="/assets/dashboard/logo-white-nobg.png" alt="K&A Clinic" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-white font-extrabold text-lg sm:text-xl tracking-tight leading-none block">
              K&amp;A Clinic
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-white block mt-0.5">
              Rabies &amp; Bite Center
            </span>
          </div>
        </div>

        {/* Back to Website Link */}
        {onBack && (
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#0a1e4a]/60 hover:bg-[#123275]/80 backdrop-blur-md border border-blue-400/30 text-xs font-semibold text-blue-100 hover:text-white transition-all shadow-sm active:scale-95"
          >
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Website</span>
          </button>
        )}
      </header>

      {/* ── MAIN CONTENT AREA (Split Layout: Left Copy + Right Floating Card) ── */}
      <main className="relative z-20 w-full max-w-7xl mx-auto px-6 sm:px-10 md:px-14 py-8 md:py-12 flex-1 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-16">

        {/* ── LEFT HERO COPY SECTION (Over Video) ── */}
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
                onClick={() => setSlide(i)}
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
                    Remember this device for 30 days.
                  </p>
                )}

                <button
                  onClick={() => handleVerifyOtp()}
                  disabled={otpLoading || otpValue.trim().length !== 6}
                  className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-all shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
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
                      Enter your authorized clinic email to receive a 6-digit verification code.
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
                        className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-all shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 mb-3"
                      >
                        {forgotSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Verification Code'}
                      </button>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => { setShowForgot(false); setForgotError(''); setError(''); }}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0a1d47] font-semibold transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Back to Login
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForgotStep('new-password'); setForgotError(''); }}
                          className="text-xs font-semibold text-[#1d4ed8] hover:text-[#0a1d47] transition-colors"
                        >
                          Already have a code?
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {forgotStep === 'new-password' && (
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 text-[#0e2a6d]">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-1 font-display">
                      Set New Password
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed mb-5 font-medium">
                      {oobCode
                        ? 'Create a new secure password for your account.'
                        : <>We sent a 6-digit verification code to <span className="font-bold text-[#0a1b3f]">{resetMaskedEmail || email.trim() || 'your email'}</span>.</>}
                    </p>

                    {forgotError && (
                      <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="font-semibold">{forgotError}</p>
                      </div>
                    )}

                    <form onSubmit={handleSetNewPassword} className="space-y-4">
                      {!oobCode && (
                        <div>
                          <label className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                            6-Digit Verification Code
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                            value={forgotCode}
                            onChange={e => {
                              setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                              setForgotError('');
                            }}
                            disabled={forgotSending}
                            className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-center font-mono text-xl font-bold tracking-[0.3em] text-[#0a1b3f] placeholder:text-slate-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/15 focus:border-[#1d4ed8] transition-all disabled:opacity-50"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPass ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
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
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${newPassword.length >= 8 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                          <span className={newPassword.length >= 8 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                            At least 8 characters
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0a1b3f] mb-1.5">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPass ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Re-enter new password"
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
                        {confirmNewPassword && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
                            {newPassword === confirmNewPassword ? (
                              <>
                                <div className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                                <span className="text-emerald-700 font-semibold">Passwords match</span>
                              </>
                            ) : (
                              <span className="text-rose-600 font-semibold">Passwords do not match</span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={forgotSending || (!oobCode && forgotCode.length !== 6) || newPassword.length < 8 || newPassword !== confirmNewPassword}
                        className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-all shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                      >
                        {forgotSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save New Password'}
                      </button>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => { setShowForgot(false); setForgotStep('request'); setForgotError(''); }}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0a1d47] font-semibold transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Back to Login
                        </button>
                        {!oobCode && (
                          <button
                            type="button"
                            onClick={handleResendResetCode}
                            disabled={forgotCooldown > 0 || forgotSending}
                            className="text-xs font-semibold text-[#1d4ed8] hover:text-[#0a1d47] disabled:text-slate-400 transition-colors"
                          >
                            {forgotCooldown > 0 ? `Resend in ${forgotCooldown}s` : 'Resend code'}
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                )}

                {forgotStep === 'success' && (
                  <div className="text-center py-3 animate-in zoom-in-95 duration-300">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-sm">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-[#0a1b3f] tracking-tight mb-2 font-display">
                      Password Updated!
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium max-w-xs mx-auto">
                      Your new password has been securely saved. You can now log in to the staff dashboard.
                    </p>
                    <button
                      type="button"
                      onClick={handleResetSuccessDone}
                      className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-all shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] active:scale-[0.99]"
                    >
                      Log In with New Password
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

                  {/* Remember Me & Forgot Password Row */}
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
                      <span className="text-xs font-semibold text-slate-600">Remember Me</span>
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
                    className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 px-6 rounded-full text-sm font-bold tracking-wide transition-all shadow-[0_10px_25px_rgba(14,42,109,0.35)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0 mt-3"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
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

                  {/* Bottom Prompt: Need Access / Help */}
                  <div className="text-center pt-1">
                    <p className="text-xs text-slate-500 font-medium">
                      Don't have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setShowHelp(v => !v)}
                        className="font-bold text-[#1d4ed8] hover:text-[#0a1d47] hover:underline cursor-pointer transition-colors"
                      >
                        Contact Manager
                      </button>
                    </p>

                    {showHelp && (
                      <p className="mt-2.5 text-[11px] leading-relaxed text-[#0e2a6d] bg-blue-50/90 border border-blue-200/80 rounded-xl p-3 text-center animate-in fade-in duration-200">
                        Admin accounts are invitation-only. Contact your clinic director or supervisor to receive an invitation link.
                      </p>
                    )}
                  </div>

                </form>
              </div>
            )}

          </div>
        </div>

      </main>

      {/* ── FOOTER BAR ── */}
      <footer className="relative z-20 w-full px-6 sm:px-10 md:px-14 pb-6 sm:pb-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-blue-200/60 gap-2">
        <span>&copy; {new Date().getFullYear()} K&amp;A Animal Bite Center. All rights reserved.</span>
        <div className="flex items-center gap-4 text-blue-200/70 font-medium">
          <span>HIPAA &amp; DOH Compliant</span>
          <span>&bull;</span>
          <span>Authorized Access Only</span>
        </div>
      </footer>

      {/* ── SIGN-IN HAND-OFF ──
          This is a two-second wait on the way to the dashboard, so it says
          what is happening and nothing more. The previous overlay announced
          "Authenticated" with a badge and a second spinning ring, which is a
          lot of ceremony for a step the user never chose to look at. */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 bg-[#060e24] flex flex-col items-center justify-center gap-4 text-white animate-in fade-in duration-200">
          <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/80 animate-spin" />
          <p className="text-sm font-semibold text-blue-100/80">Opening your dashboard…</p>
        </div>
      )}

    </div>
  );
}
