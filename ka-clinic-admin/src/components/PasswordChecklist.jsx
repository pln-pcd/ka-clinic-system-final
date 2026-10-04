// Live checklist for a new password, plus a match line for the confirm
// field. Each rule has a small 14px circle that turns into a green check when
// it passes. Pass `current` (the current password) to add the
// "different from your current password" rule.
import { Check, X } from 'lucide-react';
import { PASSWORD_RULES } from '../lib/passwordPolicy';

function Rule({ ok, children }) {
  return (
    <li className={`flex items-center gap-2 text-xs leading-4 ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
      <span
        aria-hidden="true"
        className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center shrink-0 border transition-colors ${ok ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}
        style={{ lineHeight: 0 }}
      >
        <Check size={9} strokeWidth={3.5} style={{ display: 'block' }} />
      </span>
      <span>{children}<span className="sr-only">{ok ? ' (done)' : ' (not yet)'}</span></span>
    </li>
  );
}

export default function PasswordChecklist({ password = '', current, id, className = '' }) {
  return (
    <ul id={id} className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ${className}`} aria-live="polite">
      {PASSWORD_RULES.map(r => <Rule key={r.key} ok={r.test(password)}>{r.label}</Rule>)}
      {current !== undefined && (
        <Rule ok={!!password && !!current && password !== current}>Different from your current password</Rule>
      )}
    </ul>
  );
}

export function PasswordMatch({ password = '', confirm = '', id, className = '' }) {
  const matches = !!confirm && confirm === password;
  return (
    <p id={id} aria-live="polite"
      className={`text-xs flex items-center gap-1.5 ${!confirm ? 'text-slate-400' : matches ? 'text-emerald-700' : 'text-rose-600'} ${className}`}>
      {!confirm ? 'Type the new password again.'
        : matches ? <><Check size={13} aria-hidden="true" /> Passwords match</>
        : <><X size={13} aria-hidden="true" /> Passwords do not match</>}
    </p>
  );
}
