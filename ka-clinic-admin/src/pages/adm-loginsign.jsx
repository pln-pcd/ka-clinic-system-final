import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
  ArrowRight, ShieldCheck, Mail, Lock, Key, Eye, EyeOff, Info, Check, CheckCircle2, ChevronLeft, Loader2, Clock, BadgeCheck, HelpCircle, AlertTriangle, MapPin, Syringe, Dog, Heart
} from 'lucide-react';

const SLIDES = [
  {
    title: 'High-Quality Clinical Record System',
    desc: 'Comprehensive anti-rabies prophylaxis, dose tracking, and digital healthcare records management.',
  },
  {
    title: 'Never Miss a PEP Dose',
    desc: 'Automatic Day 0 / 3 / 7 / 14 schedule tracking keeps every patient on protocol.',
  },
  {
    title: 'Rapid Bite Incident Response',
    desc: 'Log, triage, and coordinate animal bite cases the moment a patient walks in.',
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
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [rememberMe,  setRememberMe]  = useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showForgot,  setShowForgot]  = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);
  const [slide,       setSlide]       = useState(0);

  // Forgot password
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent,    setForgotSent]    = useState(false);

  // Email-OTP second factor (Batch 3), skippable on a trusted device (Batch 4)
  const [otpStep,        setOtpStep]        = useState(false);
  const [otpValue,       setOtpValue]       = useState('');
  const [otpError,       setOtpError]       = useState('');
  const [otpLoading,     setOtpLoading]     = useState(false);
  const [maskedEmail,    setMaskedEmail]    = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const emailRef = useRef();
  const otpRef = useRef();

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
    const id = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), 4500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  function friendlyError(code) {
    switch (code) {
      case 'auth/invalid-email':            return 'Invalid email address.';
      case 'auth/user-not-found':           return 'No account found with this email.';
      case 'auth/wrong-password':           return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential':       return 'Invalid credentials. Check your email and password.';
      case 'auth/too-many-requests':        return 'Too many attempts. Please try again later.';
      case 'auth/network-request-failed':   return 'Network error. Check your connection.';
      default:                              return 'Sign-in failed. Please verify your credentials.';
    }
  }

  function lockedMessage(minutes) {
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }

  async function applyPersistence() {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
  }

  // Firebase Auth alone isn't enough to grant dashboard access — role and
  // status live in Firestore (admins/{uid}), never hardcoded here. An
  // authenticated user with no doc, or a revoked/invited one, gets signed
  // back out immediately.
  async function verifyAdminAccess(uid) {
    const snap = await getDoc(doc(db, 'admins', uid));
    if (!snap.exists() || snap.data().status !== 'active') {
      await auth.signOut();
      throw new Error('NOT_AUTHORIZED');
    }
  }

  function completeLogin() {
    setShowSuccess(true);
    setTimeout(() => { if (onSuccess) onSuccess(); }, 2500);
  }

  function initiateOtpStep(masked) {
    setOtpValue('');
    setOtpError('');
    setMaskedEmail(masked || '');
    setOtpStep(true);
    setResendCooldown(30);
    setTimeout(() => otpRef.current?.focus(), 100);
  }

  // Called right after a verified password sign-in. The server checks the
  // request's trusted-device cookie first — if it matches, no email goes
  // out and login completes immediately (Batch 4); otherwise it sends the
  // OTP and we show the code-entry step (Batch 3).
  async function requestOtpOrSkip() {
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/send-admin-otp', {}, { Authorization: `Bearer ${idToken}` });
      if (!data?.success) {
        setError(data?.error || 'Could not send a verification code. Please try again.');
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
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Block even a correct password while locked out — check BEFORE
      // attempting sign-in at all, not after.
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
      // The device-trust decision was already made via "Remember me" on the
      // login screen (Batch 4) — no separate checkbox at this step.
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

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError('Please enter your email first.'); return; }
    setError('');
    setForgotSending(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setForgotSent(true);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setForgotSending(false);
    }
  }

  const busy = loading;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-100 font-sans selection:bg-red-600 selection:text-white relative overflow-hidden">

      {/* Light Dominant Background Aura Glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[45vw] h-[45vw] bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── LANDSCAPE EXPANDED MODAL CARD (Larger Landscape Layout) ── */}
      <div className="w-full max-w-[1180px] bg-white rounded-[36px] shadow-[0_30px_90px_rgba(15,23,42,0.15)] border border-slate-200/80 overflow-hidden flex flex-col md:flex-row relative z-10 h-auto md:h-[640px]">

        {/* ── LEFT PANEL: Form Section (Dominant Light White Theme) ── */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 md:p-12 bg-white flex flex-col relative z-10 h-full">

          {/* Top Logo / Brand Header — bigger mark, centered */}
          <div className="relative mb-5">
            {onBack && (
              <button
                onClick={onBack}
                className="absolute top-0 right-0 text-xs font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Website
              </button>
            )}

            <div className="flex flex-col items-center text-center pt-1">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-[0_10px_30px_rgba(227,24,55,0.16)] flex items-center justify-center p-2.5 mb-2.5">
                <img src="/assets/dashboard/logo-white-nobg.png" alt="K&A Clinic" className="w-full h-full object-contain" />
              </div>
              <div className="font-display font-extrabold text-2xl tracking-tight text-slate-900 leading-none">K&A Clinic</div>
              <div className="text-[10px] font-bold text-red-600 uppercase tracking-widest mt-1.5">Anti-Rabies &amp; Animal Bite Center</div>
            </div>
          </div>

          {otpStep ? (
            /* ── Email-OTP Verification Step (Batch 3) ── */
            <div className="my-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-xs font-bold text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                <Key className="w-4 h-4" /> — Verification
              </div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 mb-1.5">Enter Verification Code</h2>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                We sent a 6-digit code to {maskedEmail || 'your email'}. It expires in 5 minutes.
              </p>

              {otpError && (
                <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="font-semibold">{otpError}</p>
                </div>
              )}

              <div className="relative mb-4">
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
                  className="w-full bg-slate-100/90 border border-slate-200/80 px-4 py-3.5 rounded-xl text-center font-mono text-xl font-bold tracking-[0.4em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all disabled:opacity-50"
                />
              </div>

              {rememberMe && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  This device will be remembered for 30 days — no code needed next time.
                </p>
              )}

              <button
                onClick={() => handleVerifyOtp()}
                disabled={otpLoading || otpValue.trim().length !== 6}
                className="w-full bg-[#E31837] hover:bg-[#C41228] text-white py-3.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-red-600/25 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md"
              >
                {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    Verify &amp; Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="mt-4 w-full text-center text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>

              <button
                onClick={handleOtpBack}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-semibold transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back to login
              </button>
            </div>
          ) : (

          <div className="my-auto animate-in fade-in duration-500">

            {!showForgot && (
              <p className="text-center text-sm text-slate-500 font-medium leading-relaxed mb-6 max-w-[300px] mx-auto">
                Access patient records, dose schedules, and clinic operations in one secure place.
              </p>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="font-semibold">{error}</p>
              </div>
            )}

            {showForgot ? (
              /* ── Forgot Password View ── */
              <div className="animate-in fade-in duration-300">
                <div className="flex justify-center mb-3">
                  <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
                    <Key className="w-5 h-5 text-red-600" />
                  </div>
                </div>
                <h2 className="font-display text-lg font-extrabold text-slate-900 mb-1.5 text-center">
                  Reset your password
                </h2>

                {forgotSent ? (
                  <>
                    <p className="text-sm text-slate-500 leading-relaxed mb-5 text-center">
                      Check <span className="font-semibold text-slate-700">{email.trim()}</span> for a link to reset your password.
                    </p>
                    <button
                      onClick={() => { setShowForgot(false); setForgotSent(false); setError(''); }}
                      className="w-full bg-[#E31837] hover:bg-[#C41228] text-white py-3 rounded-lg text-sm font-bold transition-all shadow-md shadow-red-600/20 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99]"
                    >
                      Back to Login
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-500 leading-relaxed mb-5 text-center">
                      Enter your registered email and we'll send you a reset link.
                    </p>
                    <div className="mb-4">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Email</label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          autoComplete="email"
                          placeholder="Enter your email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          disabled={forgotSending}
                          className="w-full bg-slate-100/80 border border-slate-200/70 pl-9 pr-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all disabled:opacity-50 font-medium"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleForgotPassword}
                      disabled={forgotSending || !email.trim()}
                      className="w-full bg-[#E31837] hover:bg-[#C41228] text-white py-3 rounded-lg text-sm font-bold transition-all shadow-md shadow-red-600/20 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 mb-3"
                    >
                      {forgotSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
                    </button>
                    <button
                      onClick={() => { setShowForgot(false); setError(''); }}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-semibold"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Back to Login
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* ── Primary Login Form (email + password) ── */
              <form onSubmit={handleEmailLogin} className="space-y-3.5">

                {/* Field: Email */}
                <div>
                  <label htmlFor="login-id" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={emailRef}
                      id="login-id"
                      type="text"
                      autoComplete="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') document.getElementById('pass')?.focus(); }}
                      disabled={busy}
                      className="w-full bg-slate-100/80 border border-slate-200/70 pl-9 pr-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                {/* Field: Password with Forgot password ? right-aligned */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="pass" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotSent(false); setError(''); }}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 transition-colors"
                    >
                      Forgot password ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="pass"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={busy}
                      className="w-full bg-slate-100/80 border border-slate-200/70 pl-9 pr-10 py-2.5 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all disabled:opacity-50 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox */}
                <div className="flex items-center pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer group" title="Skips the email code on your next sign-in from this device for 30 days">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={rememberMe}
                      onChange={e => {
                        setRememberMe(e.target.checked);
                        if (!e.target.checked) localStorage.removeItem(REMEMBER_KEY);
                      }}
                    />
                    <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors border bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-red-500 peer-focus-visible:ring-offset-1 ${rememberMe ? 'border-red-600' : 'border-slate-300 group-hover:border-red-400'}`}>
                      {rememberMe && <Check className="w-3 h-3 text-red-600" strokeWidth={3} />}
                    </div>
                    <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-800 transition-colors">Remember me</span>
                  </label>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#E31837] hover:bg-[#C41228] text-white py-3 rounded-lg text-sm font-bold tracking-tight transition-all shadow-md shadow-red-600/20 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      Log In
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Need help affordance */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowHelp(v => !v)}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 font-semibold transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5" /> Need help signing in?
                  </button>
                  {showHelp && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center animate-in fade-in slide-in-from-top-1 duration-200">
                      Only invited team members can sign in. Contact your clinic manager for access.
                    </p>
                  )}
                </div>

              </form>
            )}
          </div>
          )}

        </div>

        {/* ── RIGHT PANEL: Dose-Schedule Dashboard Illustration (dark) ── */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 md:p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-[#1a0509] flex flex-col justify-between relative overflow-hidden border-l border-white/5 h-full">

          {/* Ambient glow + texture */}
          <div className="absolute -top-16 -right-10 w-72 h-72 bg-red-600/25 rounded-full blur-[90px] pointer-events-none animate-drift-slow" />
          <div className="absolute -bottom-24 -left-16 w-80 h-80 bg-red-900/30 rounded-full blur-[100px] pointer-events-none animate-drift-slower" />
          <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          {/* Illustration: changes with the active slide below */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-2">
            <div key={slide} className="relative w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-500">

              {slide === 0 && (
                <>
                  {/* Floating chip */}
                  <div className="absolute -top-4 -right-3 z-20 bg-white border border-slate-200 rounded-full shadow-lg shadow-black/20 pl-2 pr-3.5 py-1.5 flex items-center gap-1.5 animate-float">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <BadgeCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">Records Synced</span>
                  </div>

                  <div className="relative bg-white rounded-3xl border border-white/60 shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-6 overflow-hidden transition-transform duration-500 hover:-translate-y-1.5">
                    <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-500 via-rose-400 to-red-600" />
                    <Heart className="absolute -right-6 -top-5 w-32 h-32 text-red-50 rotate-12 pointer-events-none" fill="currentColor" strokeWidth={0} />

                    <div className="relative flex items-center gap-1.5 mb-5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-auto text-[10px] font-bold text-slate-400 tracking-wide">MRN-00214</span>
                    </div>

                    <div className="relative flex items-center gap-3 mb-5">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center font-extrabold text-sm ring-4 ring-red-50">
                          JD
                        </div>
                        <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 leading-none">Juan Dela Cruz</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-1.5">Active Patient · 3 Visits</div>
                      </div>
                    </div>

                    <div className="relative space-y-2.5">
                      {[
                        { icon: ShieldCheck, label: 'Vaccination History', chip: 'Up to date', chipTone: 'emerald', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
                        { icon: Clock,       label: 'Next Appointment',   chip: 'Aug 3',       chipTone: 'slate',   iconBg: 'bg-slate-100', iconColor: 'text-slate-500' },
                        { icon: BadgeCheck,  label: 'Bite Incident',      chip: 'Resolved',    chipTone: 'emerald', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl pl-2.5 pr-3 py-2 gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${row.iconBg}`}>
                              <row.icon className={`w-3.5 h-3.5 ${row.iconColor}`} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{row.label}</span>
                          </div>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${row.chipTone === 'emerald' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-700 bg-slate-200'}`}>
                            {row.chip}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {slide === 1 && (
                <>
                  <div className="absolute -top-4 -right-3 z-20 bg-white border border-slate-200 rounded-full shadow-lg shadow-black/20 pl-2 pr-3.5 py-1.5 flex items-center gap-1.5 animate-float">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <BadgeCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">Protocol Verified</span>
                  </div>

                  <div className="relative bg-white rounded-3xl border border-white/60 shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-6 overflow-hidden transition-transform duration-500 hover:-translate-y-1.5">
                    <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-500 via-rose-400 to-red-600" />
                    <Syringe className="absolute -right-4 -bottom-6 w-32 h-32 text-red-50 -rotate-12 pointer-events-none" strokeWidth={1.25} />

                    <div className="relative flex items-center gap-1.5 mb-5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-auto text-[10px] font-bold text-slate-400 tracking-wide">MRN-00214</span>
                    </div>

                    <div className="relative text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">
                      Post-Exposure Prophylaxis Schedule
                    </div>

                    <div className="relative flex items-center justify-between mb-1 px-1">
                      <div className="absolute left-0 right-0 top-[13px] h-0.5 bg-slate-200" />
                      <div className="absolute left-0 top-[13px] h-0.5 bg-gradient-to-r from-red-600 to-red-400" style={{ width: '78%' }} />
                      {[
                        { label: 'Day 0', done: true },
                        { label: 'Day 3', done: true },
                        { label: 'Day 7', done: true },
                        { label: 'Day 14', done: false },
                      ].map((step) => (
                        <div key={step.label} className="relative z-10 flex flex-col items-center gap-2">
                          {!step.done && (
                            <span className="absolute top-0 w-7 h-7 rounded-full bg-red-400/60 animate-ping" />
                          )}
                          <div className={`relative w-7 h-7 rounded-full flex items-center justify-center border-2 ${step.done ? 'bg-red-500 border-red-500' : 'bg-white border-red-500'}`}>
                            {step.done
                              ? <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                              : <Clock className="w-3.5 h-3.5 text-red-500" />}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            {step.label}
                            {!step.done && (
                              <span className="text-[8px] font-extrabold text-red-600 bg-red-50 px-1 py-0.5 rounded leading-none">DUE</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="relative mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                          <Syringe className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 leading-none">Rabies Vaccine</div>
                          <div className="text-[10px] text-slate-400 font-medium mt-1">IM · Deltoid</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">On Schedule</span>
                    </div>
                  </div>
                </>
              )}

              {slide === 2 && (
                <>
                  <div className="absolute -top-4 -right-3 z-20 bg-white border border-slate-200 rounded-full shadow-lg shadow-black/20 pl-2 pr-3.5 py-1.5 flex items-center gap-1.5 animate-float">
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">2 min ago</span>
                  </div>

                  <div className="relative bg-white rounded-3xl border border-white/60 shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-6 overflow-hidden transition-transform duration-500 hover:-translate-y-1.5">
                    <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-500 via-rose-400 to-red-600" />
                    <AlertTriangle className="absolute -right-5 -top-5 w-32 h-32 text-red-50 rotate-12 pointer-events-none" fill="currentColor" strokeWidth={0} />

                    <div className="relative flex items-center gap-1.5 mb-5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-auto text-[10px] font-bold text-slate-400 tracking-wide">INC-00532</span>
                    </div>

                    <div className="relative flex items-center gap-3 mb-5">
                      <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 leading-none">New Bite Incident</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-1.5">Logged by Front Desk</div>
                      </div>
                    </div>

                    <div className="relative space-y-2.5 mb-4">
                      <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl pl-2.5 pr-3 py-2 gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                            <Dog className="w-3.5 h-3.5 text-amber-600" />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">Animal</span>
                        </div>
                        <span className="text-xs font-bold text-slate-800">Domestic Dog</span>
                      </div>

                      {/* Bite-site body map */}
                      <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                        <div className="shrink-0 bg-white rounded-lg border border-slate-100 p-1.5">
                          <svg viewBox="0 0 60 100" className="w-8 h-14" fill="none">
                            <circle cx="30" cy="10" r="7" stroke="#CBD5E1" strokeWidth="3" />
                            <path d="M18,24 Q30,19 42,24 L44,58 Q30,65 16,58 Z" stroke="#CBD5E1" strokeWidth="3" strokeLinejoin="round" />
                            <path d="M18,26 L8,48 L6,62" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
                            <path d="M42,26 L52,48 L54,62" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
                            <path d="M24,60 L21,96" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
                            <path d="M36,60 L39,96" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
                            <circle cx="7" cy="55" r="7" fill="#EF4444" fillOpacity="0.25" className="animate-ping" style={{ transformOrigin: '7px 55px' }} />
                            <circle cx="7" cy="55" r="4" fill="#DC2626" stroke="white" strokeWidth="1.5" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                            <MapPin className="w-3 h-3" /> Bite Site
                          </div>
                          <div className="text-xs font-bold text-slate-800">Left Forearm</div>
                        </div>
                        <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full self-start shrink-0">Category II</span>
                      </div>
                    </div>

                    <div className="relative pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Status</span>
                      <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">PEP Initiated</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bottom Headline, Description, & Carousel Pills */}
          <div key={`copy-${slide}`} className="relative z-10 pt-3 text-center md:text-left animate-in fade-in slide-in-from-bottom-1 duration-500">
            <h2 className="font-display text-2xl font-extrabold text-white mb-2 tracking-tight">
              {SLIDES[slide].title}
            </h2>
            <p className="text-rose-100/60 text-sm leading-relaxed mb-6 font-medium max-w-md">
              {SLIDES[slide].desc}
            </p>

            {/* Carousel Pills */}
            <div className="flex items-center justify-center md:justify-start gap-2">
              {SLIDES.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => setSlide(i)}
                  aria-label={`Show slide ${i + 1}: ${s.title}`}
                  aria-current={slide === i}
                  className={`h-2 rounded-full transition-all duration-300 ${slide === i ? 'w-9 bg-red-500' : 'w-6 bg-white/15 hover:bg-white/30'}`}
                />
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Success Overlay — animated verification moment */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
          <div className="relative w-32 h-32 mb-5">
            {/* continuous processing ring */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-red-200 animate-spin-slow" />

            {/* center success badge */}
            <div className="absolute inset-3 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 animate-pop-in">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>

            {/* orbiting sticker icons, staggered pop-in + gentle float */}
            <div className="absolute -top-1 -right-2 animate-pop-in" style={{ animationDelay: '180ms' }}>
              <div className="w-9 h-9 bg-white rounded-xl shadow-lg shadow-slate-900/10 border border-slate-100 flex items-center justify-center animate-float">
                <ShieldCheck className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <div className="absolute bottom-0 -left-3 animate-pop-in" style={{ animationDelay: '340ms' }}>
              <div className="w-9 h-9 bg-white rounded-xl shadow-lg shadow-slate-900/10 border border-slate-100 flex items-center justify-center animate-float">
                <Syringe className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <div className="absolute top-8 -left-5 animate-pop-in" style={{ animationDelay: '500ms' }}>
              <div className="w-7 h-7 bg-white rounded-full shadow-lg shadow-slate-900/10 border border-slate-100 flex items-center justify-center animate-float">
                <Heart className="w-3.5 h-3.5 text-red-500" fill="currentColor" strokeWidth={0} />
              </div>
            </div>
          </div>

          <h2 className="font-display text-2xl font-extrabold text-slate-900 mb-1">Verified</h2>
          <p className="text-slate-500 text-sm font-semibold flex items-center gap-1.5">
            Preparing your dashboard
            <span className="inline-flex items-end gap-0.5 pb-0.5">
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-dot-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-dot-pulse" style={{ animationDelay: '160ms' }} />
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-dot-pulse" style={{ animationDelay: '320ms' }} />
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
