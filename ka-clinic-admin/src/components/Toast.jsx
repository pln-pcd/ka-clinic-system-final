import React from 'react';

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
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        minWidth: 380,
        maxWidth: 560,
        background: '#FFFFFF',
        borderRadius: 14,
        padding: '20px 22px 20px 0',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.08)',
        animation: 'toastIn .22s cubic-bezier(.16,1,.3,1)',
        overflow: 'hidden',
      }}
    >
      {/* accent bar */}
      <div
        style={{
          width: 6,
          alignSelf: 'stretch',
          margin: '4px 0 4px 14px',
          borderRadius: 3,
          background: v.accent,
          flexShrink: 0,
        }}
      />

      {/* circular icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: v.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width="22"
          height="22"
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
            fontSize: '1.0625rem',
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
            fontSize: '.9375rem',
            fontWeight: 500,
            color: '#94A3B8',
            lineHeight: 1.4,
            marginTop: 3,
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
