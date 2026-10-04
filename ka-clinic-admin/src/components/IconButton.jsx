// Icon-only button used everywhere an action is just an icon (table actions,
// modal close X, toolbar zoom, calendar arrows, pagination arrows).
//
// The box is a fixed square with the icon centred by flexbox and rendered as
// a block, so there is no baseline gap nudging it off-centre. Hover, pressed
// and keyboard focus only change the background and a box-shadow ring —
// never the border width — so the button never grows or shifts when pressed.
// The label shows as a tooltip on hover and keyboard focus, and doubles as
// the aria-label.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TONES = {
  default: { base: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200', ring: 'rgba(59,80,223,.35)' },
  primary: { base: 'text-[#3B50DF] hover:bg-indigo-50 active:bg-indigo-100', ring: 'rgba(59,80,223,.35)' },
  danger: { base: 'text-rose-600 hover:bg-rose-50 active:bg-rose-100', ring: 'rgba(225,29,72,.35)' },
  // Destructive table action: neutral like its neighbours, red only on hover.
  dangerHover: { base: 'text-slate-600 hover:text-rose-600 hover:bg-rose-50 active:bg-rose-100', ring: 'rgba(225,29,72,.35)' },
};

export default function IconButton({
  icon: Icon,
  label,
  onClick,
  size = 36,
  iconSize = 18,
  tone = 'default',
  bordered = false,
  disabled = false,
  type = 'button',
  className = '',
  style,
  tooltip = true,
  ...rest
}) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const [focusRing, setFocusRing] = useState(false);
  const t = TONES[tone] || TONES.default;

  const showTip = () => {
    if (!tooltip || !label || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top });
  };

  return (
    <>
      <button
        ref={ref}
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`kna-icon-btn inline-flex items-center justify-center shrink-0 rounded-lg transition-colors cursor-pointer outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${t.base} ${className}`}
        style={{
          width: size,
          height: size,
          lineHeight: 0,
          padding: 0,
          border: `1px solid ${bordered ? '#E2E8F0' : 'transparent'}`,
          background: bordered ? '#FFFFFF' : undefined,
          boxShadow: focusRing ? `0 0 0 3px ${t.ring}` : 'none',
          ...style,
        }}
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(null)}
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) { setFocusRing(true); showTip(); } }}
        onBlur={() => { setFocusRing(false); setTip(null); }}
        {...rest}
      >
        {Icon && <Icon size={iconSize} style={{ display: 'block' }} aria-hidden="true" />}
      </button>
      {tip && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed', left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)',
            background: '#0F172A', color: '#FFFFFF', fontSize: 11, fontWeight: 600, lineHeight: 1.3,
            padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 40000,
            boxShadow: '0 4px 12px rgba(15,23,42,.18)',
          }}
        >
          {label}
        </span>,
        document.body
      )}
    </>
  );
}
