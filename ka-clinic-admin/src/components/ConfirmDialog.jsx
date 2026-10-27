// The one confirmation popup for the whole admin app (delete, revoke, cancel
// invite, archive/restore/delete conversation, undo dose, sign out, ...).
//
// Layout: tinted header (icon, title, subtitle, close X), body, footer
// (Cancel on the far left, the action on the far right, same height).
// Backdrop click and Escape close it through <Modal>, except while `busy`.
//
// Body, top to bottom:
//   message  one short sentence, key words in <strong>
//   details  the subject as label/value rows in a light card,
//            e.g. [['Patient', 'Elmer V. Nieva'], ['MRN', '2025-008']]
//            (rows with an empty value are skipped)
//   children anything extra (a form, a reason picker)
//   note     a muted line with an icon (noteIcon, default Info)
//
// Variants: danger (red), warning (amber), neutral (indigo).
// size="compact" (opt-in, e.g. Archive → Restore record): 380px wide, 16px
// title, 32px icon box, 36px buttons sized to their text.
// Every other popup uses the default size. `boxClassName` replaces the
// width for a single popup that needs room for a form (Decline appointment).
import { AlertTriangle, HelpCircle, Info, Trash2, X } from 'lucide-react';
import Modal from './Modal';

const VARIANTS = {
  danger: {
    header: '#FFF1F2', border: '#FFE4E6', iconBg: '#FFE4E6', iconColor: '#E11D48',
    button: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300', Icon: Trash2,
  },
  warning: {
    header: '#FFFBEB', border: '#FEF3C7', iconBg: '#FEF3C7', iconColor: '#B45309',
    button: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-300', Icon: AlertTriangle,
  },
  neutral: {
    header: '#F5F7FF', border: '#E0E7FF', iconBg: '#E0E7FF', iconColor: '#3B50DF',
    button: 'bg-[#3B50DF] hover:bg-[#2F40B5] focus-visible:ring-indigo-300', Icon: HelpCircle,
  },
};

const SIZES = {
  default: {
    box: 'max-w-[420px] 2xl:max-w-[460px]',
    header: 'px-5 py-4', iconBox: 'w-10 h-10', iconSize: 18,
    titleWrap: 'pt-0.5', title: 'text-base 2xl:text-lg leading-6',
    close: 'w-9 h-9 -mr-1.5 -mt-1', closeIcon: 18,
    body: 'px-5 py-5', message: 'text-[15px] 2xl:text-base', note: 'text-[13px] mt-3', noteIcon: 14,
    details: 'text-[13px] mt-3', detailRow: 'px-3.5 py-2',
    footer: 'px-5 py-3.5 justify-between', btn: 'h-10 min-w-[108px] px-4',
  },
  compact: {
    box: 'max-w-[380px]',
    header: 'px-[18px] py-4', iconBox: 'w-8 h-8', iconSize: 16,
    titleWrap: 'pt-1', title: 'text-base leading-6',
    close: 'w-8 h-8 -mr-1.5', closeIcon: 16,
    body: 'px-[18px] py-4', message: 'text-sm', note: 'text-xs mt-2', noteIcon: 12,
    details: 'text-xs mt-3', detailRow: 'px-3 py-1.5',
    footer: 'px-[18px] py-3 justify-between', btn: 'h-9 px-4',
  },
};

export default function ConfirmDialog({
  variant = 'neutral',
  size = 'default',
  icon,
  title,
  subtitle,
  message,
  details,
  note,
  noteIcon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  busyLabel,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
  boxClassName,
}) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  const s = SIZES[size] || SIZES.default;
  const Icon = icon || v.Icon;
  const NoteIcon = noteIcon || Info;
  const rows = (details || []).filter(r => r && r[1] != null && r[1] !== '');
  const btn = `inline-flex items-center justify-center ${s.btn} rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed outline-none focus-visible:ring-4`;

  return (
    <Modal onClose={onCancel} dismissible={!busy} labelledBy="kna-confirm-title">
      <div role="alertdialog" aria-modal="true" aria-labelledby="kna-confirm-title"
        className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden border border-slate-200 ${boxClassName || s.box}`}>
        <div className={`${s.header} flex items-start gap-3`} style={{ background: v.header, borderBottom: `1px solid ${v.border}` }}>
          <div className={`${s.iconBox} rounded-xl flex items-center justify-center shrink-0`} style={{ background: v.iconBg, color: v.iconColor }}>
            <Icon size={s.iconSize} style={{ display: 'block' }} />
          </div>
          <div className={`min-w-0 flex-1 ${s.titleWrap}`}>
            <h3 id="kna-confirm-title" className={`${s.title} font-bold text-slate-900`}>{title}</h3>
            {subtitle && <div className="text-[13px] text-slate-500 mt-0.5 break-words leading-snug">{subtitle}</div>}
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close"
            className={`${s.close} inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 shrink-0`}
            style={{ lineHeight: 0 }}>
            <X size={s.closeIcon} style={{ display: 'block' }} />
          </button>
        </div>

        <div className={s.body}>
          {message && <div className={`${s.message} leading-relaxed text-slate-700 [&_strong]:font-semibold [&_strong]:text-slate-900`}>{message}</div>}
          {rows.length > 0 && (
            <dl className={`${s.details} rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100`}>
              {rows.map(([label, value]) => (
                <div key={label} className={`${s.detailRow} flex items-start justify-between gap-4`}>
                  <dt className="text-slate-500 shrink-0">{label}</dt>
                  <dd className="font-semibold text-slate-800 text-right min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
          {note && (
            <p className={`${s.note} leading-relaxed text-slate-500 flex items-start gap-1.5`}>
              <NoteIcon size={s.noteIcon} className="shrink-0 mt-[0.2em]" aria-hidden="true" />
              <span className="min-w-0">{note}</span>
            </p>
          )}
        </div>

        <div className={`${s.footer} border-t border-slate-100 bg-slate-50 flex items-center gap-3`}>
          <button type="button" onClick={onCancel} disabled={busy}
            className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-200`}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} className={`${btn} text-white ${v.button}`}>
            {busy ? (busyLabel || 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
