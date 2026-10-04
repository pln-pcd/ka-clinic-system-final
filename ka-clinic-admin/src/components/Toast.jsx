
/* ─────────────────────────────────────────────
   Shared toast / notification banner.

   White card, colored accent bar on the left, filled circular
   icon, bold title with a lighter description line, and a
   dismiss button on the right.

   Usage:
     <Toast msg="Vaccination record for Jane removed" type="success" onClose={...} />
     <Toast title="Uh oh, something went wrong" msg="There was a problem with your request." type="error" />

   If only `msg` is given, a default title for the type is used
   and `msg` becomes the description line.
───────────────────────────────────────────── */

const VARIANTS = {
  success: {
    accent: '#22A565',
    title: 'Success',
    icon: (
      <polyline points="20 6 9 17 4 12" />
    ),
  },
  error: {
    accent: '#E4483B',
    title: 'Uh oh, something went wrong',
    icon: (
      <>
        <line x1="12" y1="7" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  warning: {
    accent: '#F0A82B',
    title: 'Heads up',
    icon: (
      <>
        <line x1="12" y1="7" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  info: {
    accent: '#1476C6',
    title: 'Did you know?',
    icon: (
      <>
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="12" y1="7" x2="12.01" y2="7" />
      </>
    ),
  },
};

export default function Toast({ msg, message, title, type = 'info', onClose }) {
  const text = msg ?? message;
  if (!text) return null;

  const v = VARIANTS[type] || VARIANTS.info;
  const heading = title || v.title;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        gap: 15,
        minWidth: 320,
        maxWidth: 470,
        background: '#FFFFFF',
        borderRadius: 12,
        padding: '16px 18px 16px 0',
        boxShadow: '0 10px 26px rgba(15, 23, 42, 0.15), 0 2px 6px rgba(15, 23, 42, 0.07)',
        animation: 'toastIn .22s cubic-bezier(.16,1,.3,1)',
        overflow: 'hidden',
      }}
    >
      {/* accent bar */}
      <div
        style={{
          width: 5,
          alignSelf: 'stretch',
          margin: '4px 0 4px 12px',
          borderRadius: 3,
          background: v.accent,
          flexShrink: 0,
        }}
      />

      {/* circular icon */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: v.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {v.icon}
        </svg>
      </div>

      {/* text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '.9375rem',
            fontWeight: 700,
            color: '#1F2937',
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
          }}
        >
          {heading}
        </div>
        <div
          style={{
            fontSize: '.84375rem',
            fontWeight: 500,
            color: '#94A3B8',
            lineHeight: 1.4,
            marginTop: 2,
          }}
        >
          {text}
        </div>
      </div>

      {/* dismiss */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: '#9CA3AF',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(14px) scale(.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
