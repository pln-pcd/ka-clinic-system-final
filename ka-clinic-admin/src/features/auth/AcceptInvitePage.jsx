import { doc, getDoc } from 'firebase/firestore';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, FileText,
  Loader2, Lock, Mail, Syringe, User as UserIcon, XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import PasswordChecklist, { PasswordMatch } from '../../components/PasswordChecklist';
import { meetsPasswordPolicy, passwordPolicyError } from '../../lib/passwordPolicy';

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
    const policyError = passwordPolicyError(password);
    if (policyError) { setError(policyError); return; }
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

  const reqLenOk = meetsPasswordPolicy(password);
  const reqMatchOk = confirmPassword.length > 0 && password === confirmPassword;
  const initials = getInitials(name);
  const displayName = name.trim() || 'Your Name';
  // A stable, human-readable badge number derived from the invite token, so
  // the credential shows a real identifier rather than a decorative one.
  const credentialNo = token
    ? `KA-${token.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`
    : 'KA-------';
  // The stamp lands when the form is genuinely complete — it reports state,
  // it is not an entrance effect.
  const stampVisible = status === 'success' || (status === 'valid' && !!name.trim() && reqLenOk && reqMatchOk);

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
          {/* Brand lockup — logo sits beside the wordmark, both flush left */}
          <div className="flex items-center gap-3 mb-9">
            <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 shadow-[0_6px_18px_rgba(10,29,71,0.12)] flex items-center justify-center p-[2.5px] shrink-0">
              <img src="/assets/dashboard/logo-white-nobg.png" alt="" className="w-full h-full object-contain" />
            </div>
            <div className="font-display font-extrabold text-[19px] tracking-tight text-slate-900 leading-tight">
              K&amp;A Animal Bite Center
            </div>
          </div>

          {status === 'loading' && (
            <div className="my-auto flex flex-col items-center py-8 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm font-medium">Checking your invite…</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="my-auto py-4 animate-in fade-in duration-500">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-rose-600" />
              </div>
              <h1 className="font-display text-xl font-extrabold text-slate-900 mb-2">Invite link invalid</h1>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[320px]">{error}</p>
            </div>
          )}

          {status === 'valid' && (
            <div className="my-auto animate-in fade-in duration-500">
              <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
                Complete your account
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed mb-7 max-w-[380px]">
                You've been invited to join the K&amp;A Clinic Admin Dashboard as staff. Set a password to activate your credential.
              </p>

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 text-rose-600 text-xs p-3 rounded-xl border border-rose-100 mb-5 animate-in slide-in-from-top-2">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="font-semibold">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="invite-name" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-name"
                      autoFocus
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={e => { setName(e.target.value); setError(''); }}
                      disabled={submitting}
                      className="w-full bg-slate-50 border border-slate-200 pl-11 pr-4 py-3.5 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#0e2a6d]/10 focus:border-[#0e2a6d] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={invite?.email || ''}
                      readOnly
                      className="w-full bg-slate-100 border border-slate-200 pl-11 pr-4 py-3.5 rounded-xl text-sm text-slate-500 font-medium cursor-not-allowed"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      Locked
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="invite-password" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Set Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={password}
                      aria-describedby="invite-pw-rules"
                      onChange={e => { setPassword(e.target.value); setError(''); }}
                      disabled={submitting}
                      className="w-full bg-slate-50 border border-slate-200 pl-11 pr-12 py-3.5 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#0e2a6d]/10 focus:border-[#0e2a6d] transition-all disabled:opacity-50 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordChecklist id="invite-pw-rules" className="mt-2.5" password={password} />
                </div>

                <div>
                  <label htmlFor="invite-confirm-password" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-confirm-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      aria-describedby="invite-pw-match"
                      onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                      disabled={submitting}
                      className="w-full bg-slate-50 border border-slate-200 pl-11 pr-4 py-3.5 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#0e2a6d]/10 focus:border-[#0e2a6d] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                  <PasswordMatch id="invite-pw-match" className="mt-2" password={password} confirm={confirmPassword} />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:shadow-[0_10px_25px_rgba(14,42,109,0.3)]"
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
            <div className="my-auto py-4 animate-in fade-in duration-500">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h1 className="font-display text-xl font-extrabold text-slate-900 mb-2">Account activated</h1>
              <p className="text-sm text-slate-500 leading-relaxed mb-7 max-w-[340px]">
                You can now log in with your email and password.
              </p>
              <button
                onClick={onDone}
                className="w-full bg-gradient-to-r from-[#0a1d47] via-[#0e2a6d] to-[#1d4ed8] hover:from-[#071533] hover:via-[#0a2054] hover:to-[#173fa8] text-white py-3.5 rounded-full text-sm font-bold tracking-wide transition-shadow duration-200 shadow-[0_10px_25px_rgba(14,42,109,0.3)] hover:shadow-[0_15px_30px_rgba(14,42,109,0.45)] flex items-center justify-center gap-2"
              >
                Go to Login
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: the staff credential this invite issues ──
            Not an abstract preview card: the thing being created here is a
            clinic ID badge, so it is drawn as one — hanging from its lanyard,
            filling in as the form is completed, and stamped once it is valid. */}
        <div className="w-full md:w-1/2 px-8 sm:px-10 md:px-12 pt-14 pb-10 bg-gradient-to-br from-[#0a1d47] via-[#091b42] to-[#060e24] flex flex-col justify-between relative overflow-hidden border-l border-white/5 self-stretch">
          <div className="absolute -top-16 -right-10 w-72 h-72 bg-[#1d4ed8]/25 rounded-full blur-[90px] pointer-events-none animate-drift-slow" />
          <div className="absolute -bottom-24 -left-16 w-80 h-80 bg-[#0e2a6d]/40 rounded-full blur-[100px] pointer-events-none animate-drift-slower" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:26px_26px] pointer-events-none" />

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
            {/* Lanyard: two straps meeting at the clip the badge hangs from */}
            <div className="relative w-full max-w-[380px] flex flex-col items-center" aria-hidden="true">
              <div className="relative h-16 w-28">
                <div className="absolute left-1/2 top-0 h-16 w-[7px] -translate-x-1/2 origin-top rotate-[19deg] rounded-full bg-gradient-to-b from-[#1d4ed8]/70 to-[#0e2a6d]/80" />
                <div className="absolute left-1/2 top-0 h-16 w-[7px] -translate-x-1/2 origin-top -rotate-[19deg] rounded-full bg-gradient-to-b from-[#1d4ed8]/70 to-[#0e2a6d]/80" />
              </div>
              <div className="-mt-1 h-4 w-11 rounded-md bg-gradient-to-b from-slate-200 to-slate-400 shadow-[0_2px_6px_rgba(0,0,0,0.45)] ring-1 ring-white/40" />
            </div>

            <div className="relative w-full max-w-[380px] -mt-2 animate-badge-sway">
              {/* Badge body */}
              <div className="relative rounded-[26px] bg-white shadow-[0_34px_80px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/50 overflow-hidden">
                {/* Punch slot */}
                <div className="absolute left-1/2 top-3.5 h-2 w-14 -translate-x-1/2 rounded-full bg-slate-900/12 ring-1 ring-slate-900/5" />

                {/* Credential header */}
                <div className="pt-9 pb-4 px-6 bg-gradient-to-br from-[#0a1d47] to-[#0e2a6d]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white/95 flex items-center justify-center p-1 shrink-0">
                      <img src="/assets/dashboard/logo-white-nobg.png" alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-extrabold text-white leading-tight tracking-tight truncate">
                        K&amp;A Animal Bite Center
                      </div>
                      <div className="text-[9px] font-semibold text-blue-200/90 tracking-[0.18em] uppercase mt-0.5">
                        Staff Credential
                      </div>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-blue-100/80 tracking-wide shrink-0">
                      {status === 'success' ? 'ACTIVE' : (invite ? formatExpiry(invite.expiresAt) : '—')}
                    </span>
                  </div>
                </div>

                {/* Holder */}
                <div className="px-6 pt-5 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-base transition-colors duration-300 ${
                        name.trim()
                          ? 'bg-gradient-to-br from-[#0e2a6d] to-[#1d4ed8] text-white'
                          : 'bg-slate-100 text-slate-300 border border-dashed border-slate-300'
                      }`}>
                        {initials || <UserIcon className="w-5 h-5" />}
                      </div>
                      <span className={`absolute -right-1 -bottom-1 w-4 h-4 rounded-full border-2 border-white transition-colors ${status === 'success' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em]">Name</div>
                      <div className={`font-display text-base font-extrabold leading-tight truncate transition-colors ${name.trim() ? 'text-slate-900' : 'text-slate-300'}`}>
                        {displayName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{invite?.email || ''}</div>
                    </div>
                  </div>

                  {/* Credential data block */}
                  <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 pt-4 border-t border-slate-100">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em]">Role</div>
                      <div className="text-xs font-bold text-slate-800 mt-1">Clinic Staff</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em]">Credential No.</div>
                      <div className="text-xs font-bold text-slate-800 mt-1 font-mono tabular-nums">{credentialNo}</div>
                    </div>
                  </div>

                  {/* Access lines */}
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em] mb-2.5">Grants Access To</div>
                    <div className="space-y-1.5">
                      {PERMISSIONS.map(row => (
                        <div key={row.label} className="flex items-center gap-2.5">
                          <row.icon className="w-3.5 h-3.5 text-[#1d4ed8] shrink-0" strokeWidth={2.2} />
                          <span className="text-[11.5px] font-semibold text-slate-700">{row.label}</span>
                          <span className="ml-auto h-px flex-1 bg-slate-100" />
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2.4} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Signature strip */}
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em]">Authorized by K&amp;A Clinic</span>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full transition-colors ${
                    status === 'success' ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'
                  }`}>
                    {status === 'success' ? 'ISSUED' : 'PENDING'}
                  </span>
                </div>

                {/* Approval stamp — the one authored moment, landing only once
                    the form is genuinely complete or the account is live. */}
                {stampVisible && (
                  <div className="animate-stamp absolute right-5 bottom-16 pointer-events-none select-none">
                    <div className={`px-3.5 py-1.5 rounded-md border-[2.5px] -rotate-[11deg] ${
                      status === 'success' ? 'border-emerald-600/70 text-emerald-700' : 'border-[#1d4ed8]/60 text-[#1d4ed8]'
                    }`}>
                      <div className="text-[11px] font-black tracking-[0.16em]">
                        {status === 'success' ? 'ISSUED' : 'VERIFIED'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Invalid invite: the badge is voided rather than replaced */}
              {status === 'invalid' && (
                <div className="absolute inset-0 rounded-[26px] bg-slate-900/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-center px-8">
                  <Lock className="w-6 h-6 text-slate-200" />
                  <div className="text-sm font-extrabold text-white">Credential unavailable</div>
                  <div className="text-[11.5px] text-slate-300 leading-relaxed">This invite can no longer issue a staff badge.</div>
                </div>
              )}
            </div>
          </div>

          <div key={`copy-${status}`} className="relative z-10 pt-8 animate-in fade-in slide-in-from-bottom-1 duration-500">
            <h2 className="font-display text-2xl font-extrabold text-white mb-2 tracking-tight">
              {rightCopy.title}
            </h2>
            <p className="text-blue-100/80 text-sm leading-relaxed font-medium max-w-md">
              {rightCopy.desc}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
