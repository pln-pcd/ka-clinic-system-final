// Inline form validation shared by the admin form modals.
//
// - Errors show as a short message under each field, never as a list.
// - A field is checked when it loses focus (once it has a value) and when
//   the form is submitted; empty fields are not nagged while the user is
//   still filling the form in.
// - Once a field shows an error it re-checks as the user types, so the
//   message clears the moment it is fixed.
// - Submit (validate) scrolls to and focuses the first invalid field.
// - The footer shows one line: "Fix 3 fields to continue".
//
//   const v = useFieldErrors({ fname: f => f.fname.trim() ? '' : 'Enter the first name' }, form, 'reg');
//   <input {...v.field('fname')} value={form.fname} onChange={...} />
//   <FieldError v={v} name="fname" />
//   if (!v.validate(['fname', 'lname'])) return;
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

export function useFieldErrors(rules, form, idPrefix) {
  const [shown, setShown] = useState({});
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const formRef = useRef(form);
  formRef.current = form;
  const check = useCallback((k, f) => (rulesRef.current[k] ? rulesRef.current[k](f) || '' : ''), []);

  // Fields already showing an error re-check live as the form changes.
  useEffect(() => {
    setShown(s => {
      let changed = false;
      const next = { ...s };
      Object.keys(s).forEach(k => {
        if (!s[k]) return;
        const m = check(k, form);
        if (m !== s[k]) { next[k] = m; changed = true; }
      });
      return changed ? next : s;
    });
  }, [form, check]);

  const idOf = (k) => `${idPrefix}-${k}`;

  const focusField = useCallback((k) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`${idPrefix}-${k}`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    });
  }, [idPrefix]);

  // Blur: check a field once it has a value (or already shows an error).
  const blur = useCallback((k) => {
    const v = formRef.current?.[k];
    const filled = v != null && String(v).trim() !== '';
    setShown(s => (filled || s[k] ? { ...s, [k]: check(k, formRef.current) } : s));
  }, [check]);

  // Submit: check every listed field, show all errors, focus the first.
  const validate = useCallback((keys, f = formRef.current) => {
    const next = {};
    keys.forEach(k => { next[k] = check(k, f); });
    setShown(s => ({ ...s, ...next }));
    const first = keys.find(k => next[k]);
    if (first) focusField(first);
    return !first;
  }, [check, focusField]);

  const error = (k) => shown[k] || '';
  const count = (keys) => (keys || Object.keys(shown)).filter(k => shown[k]).length;
  const clear = useCallback(() => setShown({}), []);

  // Props for the input: id, aria-invalid / aria-describedby and onBlur.
  const field = (k, { withBlur = true } = {}) => ({
    id: idOf(k),
    'aria-invalid': shown[k] ? true : undefined,
    'aria-describedby': shown[k] ? `${idOf(k)}-err` : undefined,
    ...(withBlur ? { onBlur: () => blur(k) } : {}),
  });

  return { error, blur, validate, count, clear, field, focusField, idOf };
}

export function FieldError({ v, name, message }) {
  const msg = message ?? v?.error(name);
  if (!msg) return null;
  return (
    <p id={v ? `${v.idOf(name)}-err` : undefined} className="kna-field-error mt-1 flex items-start gap-1 text-[11px] leading-4 font-medium text-rose-600" role="alert">
      <AlertCircle size={12} className="shrink-0 mt-[2px]" aria-hidden="true" />
      <span>{msg}</span>
    </p>
  );
}

// One line near the footer, e.g. "Fix 4 fields to continue".
export function FormErrorNote({ count, action = 'continue', className = '' }) {
  if (!count) return null;
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 ${className}`}>
      <AlertCircle size={13} aria-hidden="true" />
      Fix {count} field{count === 1 ? '' : 's'} to {action}
    </span>
  );
}
