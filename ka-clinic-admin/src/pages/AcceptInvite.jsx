import { doc, getDoc } from 'firebase/firestore';
import {
  AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, Eye, EyeOff, FileText,
  Loader2, Lock, Mail, ShieldCheck, Syringe, User as UserIcon, XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';

function getTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function getInitials(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatExpiry(expiresAt) {
  const msLeft = expiresAt - Date.now();
  if (msLeft <= 0) return 'Expired';
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 1) return `Expires in ${Math.max(1, Math.floor(msLeft / 60_000))}m`;
  return `Expires in ${hours}h`;
}

const PERMISSIONS = [
  { icon: FileText, label: 'Patient Records' },
  { icon: Syringe, label: 'Dose Tracking' },
  { icon: AlertTriangle, label: 'Bite Incident Reports' },
];

export default function AcceptInvite({ onDone }) {
  const [token] = useState(getTokenFromUrl);
  const [status, setStatus] = useState('loading'); // loading | valid | invalid | success
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function validate() {
      if (!token) {
        setStatus('invalid');
        setError('This invite link is missing its token.');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'invites', token));
        if (!snap.exists()) {
          setStatus('invalid');
          setError('This invite link is invalid.');
          return;
        }
        const data = snap.data();
        if (data.used) {
          setStatus('invalid');
          setError('This invite link has already been used.');
          return;
        }
        if (Date.now() >= data.expiresAt) {
          setStatus('invalid');
          setError('This invite link has expired. Ask your manager to send a new one.');
          return;
        }
        setInvite(data);
        setStatus('valid');
      } catch {
        setStatus('invalid');
        setError('Could not validate this invite link. Please try again.');
      }
    }
    validate();
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setStatus('success');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  const reqLenOk = password.length >= 8;
  const reqMatchOk = confirmPassword.length > 0 && password === confirmPassword;
  const initials = getInitials(name);
  const displayName = name.trim() || 'Your Name';

  const rightCopy = {
    loading: {
      title: 'Verifying your invite',
      desc: "Hang tight while we confirm this link is still valid — this only takes a moment.",
    },
    invalid: {
      title: "This invite isn't available",
      desc: error || 'Ask your clinic manager to send you a fresh invite link.',
    },
    valid: {
      title: 'Welcome to the team',
      desc: "Fill in the form to activate your K&A Clinic staff account — your profile below updates as you go.",
    },
    success: {
      title: "You're all set",
      desc: 'Your account is active. Sign in anytime with your new password to get started.',
    },
  }[status];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-100 font-sans selection:bg-indigo-600 selection:text-white relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-5%] w-[45vw] h-[45vw] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[1180px] bg-white rounded-[36px] shadow-[0_30px_90px_rgba(15,23,42,0.15)] border border-slate-200/80 overflow-hidden flex flex-col md:flex-row relative z-10">

        {/* ── LEFT PANEL: Form ── */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 md:p-12 bg-white flex flex-col relative z-10 self-stretch">
          <div className="flex flex-col items-center text-center pt-1 mb-5">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-[0_10px_30px_rgba(59,80,223,0.16)] flex items-center justify-center p-2.5 mb-2.5">
              <img src="/assets/dashboard/logo-white-nobg.png" alt="K&A Clinic" className="w-full h-full object-contain" />
            </div>
            <div className="font-display font-extrabold text-2xl tracking-tight text-slate-900 leading-none">K&A Clinic</div>
            <div className="text-[10px] font-bold text-[#3B50DF] uppercase tracking-widest mt-1.5">Anti-Rabies &amp; Animal Bite Center</div>
          </div>

          {status === 'loading' && (
            <div className="my-auto flex flex-col items-center py-8 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm font-medium">Checking your invite…</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="my-auto text-center py-4 animate-in fade-in duration-500">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-3">
                <XCircle className="w-6 h-6 text-rose-600" />
              </div>
              <h1 className="font-display text-lg font-extrabold text-slate-900 mb-1.5">Invite link invalid</h1>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[280px] mx-auto">{error}</p>
            </div>
          )}

          {status === 'valid' && (
            <div className="my-auto animate-in fade-in duration-500">
              <div className="flex justify-center mb-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-[#3B50DF]" />
                </div>
              </div>
              <h1 className="font-display text-lg font-extrabold text-slate-900 mb-1.5 text-center">Complete your account</h1>
              <p className="text-sm text-slate-500 leading-relaxed mb-5 text-center">
                You've been invited to join the K&amp;A Clinic Admin Dashboard as staff.
              </p>

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 text-rose-600 text-xs p-3 rounded-xl border border-rose-100 mb-4 animate-in slide-in-from-top-2">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="font-semibold">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="invite-name" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-name"
                      autoFocus
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={e => { setName(e.target.value); setError(''); }}
                      disabled={submitting}
                      className="w-full bg-slate-100/80 border border-slate-200/70 pl-9 pr-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={invite?.email || ''}
                      readOnly
                      className="w-full bg-slate-100 border border-slate-200/70 pl-9 pr-3.5 py-2.5 rounded-lg text-sm text-slate-400 font-medium cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="invite-password" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    Set Password
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(''); }}
                      disabled={submitting}
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

                <div>
                  <label htmlFor="invite-confirm-password" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-confirm-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                      disabled={submitting}
                      className="w-full bg-slate-100/80 border border-slate-200/70 pl-9 pr-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-0.5">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${reqLenOk ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <CheckCircle2 className="w-3 h-3" strokeWidth={reqLenOk ? 2.5 : 2} /> 8+ characters
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${reqMatchOk ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <CheckCircle2 className="w-3 h-3" strokeWidth={reqMatchOk ? 2.5 : 2} /> Passwords match
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#E31837] hover:bg-[#C41228] text-white py-3 rounded-lg text-sm font-bold transition-all shadow-md shadow-red-600/20 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      Complete Signup
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {status === 'success' && (
            <div className="my-auto text-center py-4 animate-in fade-in duration-500">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h1 className="font-display text-lg font-extrabold text-slate-900 mb-1.5">Account activated</h1>
              <p className="text-sm text-slate-500 leading-relaxed mb-5">
                You can now log in with your email and password.
              </p>
              <button
                onClick={onDone}
                className="w-full bg-[#E31837] hover:bg-[#C41228] text-white py-3 rounded-lg text-sm font-bold transition-all shadow-md shadow-red-600/20 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                Go to Login
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: Live staff-profile preview ── */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 md:p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-[#0c1222] flex flex-col justify-between relative overflow-hidden border-l border-white/5 self-stretch">
          <div className="absolute -top-16 -right-10 w-72 h-72 bg-indigo-600/25 rounded-full blur-[90px] pointer-events-none animate-drift-slow" />
          <div className="absolute -bottom-24 -left-16 w-80 h-80 bg-blue-900/30 rounded-full blur-[100px] pointer-events-none animate-drift-slower" />
          <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-2">
            <div className="relative w-full max-w-[420px]">

              {status === 'loading' && (
                <div className="relative bg-white/95 rounded-3xl border border-white/60 shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-6 overflow-hidden animate-pulse">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-slate-200" />
                  <div className="flex items-center gap-1.5 mb-5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span className="ml-auto w-16 h-2.5 rounded-full bg-slate-200" />
                  </div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
                    <div className="space-y-2">
                      <div className="w-28 h-3 rounded-full bg-slate-200" />
                      <div className="w-20 h-2.5 rounded-full bg-slate-100" />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="h-9 rounded-xl bg-slate-100" />
                    <div className="h-9 rounded-xl bg-slate-100" />
                    <div className="h-9 rounded-xl bg-slate-100" />
                  </div>
                </div>
              )}

              {status === 'invalid' && (
                <div className="relative bg-white/90 rounded-3xl border border-white/50 shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-6 overflow-hidden opacity-90 animate-in fade-in duration-500">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-slate-400 via-slate-300 to-slate-400" />
                  <Lock className="absolute -right-5 -top-5 w-32 h-32 text-slate-100 rotate-12 pointer-events-none" strokeWidth={1.25} />

                  <div className="relative flex items-center gap-1.5 mb-5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <span className="ml-auto text-[10px] font-bold text-slate-400 tracking-wide">INVALID</span>
                  </div>

                  <div className="relative flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-500 leading-none">Invite Unavailable</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-1.5">No active session to preview</div>
                    </div>
                  </div>

                  <div className="relative pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Status</span>
                    <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Unavailable</span>
                  </div>
                </div>
              )}

              {(status === 'valid' || status === 'success') && (
                <>
                  <div className={`absolute -top-4 -right-3 z-20 bg-white border border-slate-200 rounded-full shadow-lg shadow-black/20 pl-2 pr-3.5 py-1.5 flex items-center gap-1.5 animate-float ${status === 'valid' ? 'animate-in fade-in slide-in-from-top-2 duration-500' : 'animate-in fade-in zoom-in-95 duration-300'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${status === 'success' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                      <BadgeCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">{status === 'success' ? 'Account Active' : 'Invite Verified'}</span>
                  </div>

                  <div className="relative bg-white rounded-3xl border border-white/60 shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-6 overflow-hidden transition-transform duration-500 hover:-translate-y-1.5">
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r transition-colors duration-500 ${status === 'success' ? 'from-emerald-500 via-emerald-400 to-emerald-600' : 'from-indigo-500 via-blue-400 to-indigo-600'}`} />
                    <UserIcon className="absolute -right-6 -top-5 w-32 h-32 text-indigo-50 rotate-12 pointer-events-none" strokeWidth={1.25} />

                    <div className="relative flex items-center gap-1.5 mb-5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-auto text-[10px] font-bold text-slate-400 tracking-wide">
                        {status === 'success' ? 'ACTIVE' : (invite ? formatExpiry(invite.expiresAt) : 'STAFF-ID')}
                      </span>
                    </div>

                    <div className="relative flex items-center gap-3 mb-5">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-600 to-[#3B50DF] text-white flex items-center justify-center font-extrabold text-sm ring-4 ring-indigo-50 transition-all">
                          {initials || <UserIcon className="w-4 h-4" />}
                        </div>
                        <span className={`absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full border-2 border-white transition-colors ${status === 'success' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-sm font-bold leading-none truncate ${name.trim() ? 'text-slate-800' : 'text-slate-300'}`}>{displayName}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-1.5 truncate">{invite?.email || ''} · Staff</div>
                      </div>
                    </div>

                    <div className="relative space-y-2.5">
                      {PERMISSIONS.map(row => (
                        <div key={row.label} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl pl-2.5 pr-3 py-2 gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50">
                              <row.icon className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{row.label}</span>
                          </div>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-50">Included</span>
                        </div>
                      ))}
                    </div>

                    <div className="relative mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Status</span>
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full transition-colors ${status === 'success' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-700 bg-amber-100'}`}>
                        {status === 'success' ? 'Active' : 'Setting Up'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div key={`copy-${status}`} className="relative z-10 pt-3 text-center md:text-left animate-in fade-in slide-in-from-bottom-1 duration-500">
            <h2 className="font-display text-2xl font-extrabold text-white mb-2 tracking-tight">
              {rightCopy.title}
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed font-medium max-w-md">
              {rightCopy.desc}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
