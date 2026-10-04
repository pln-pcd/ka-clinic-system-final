// The one overlay every admin popup renders through. It is portalled to
// <body> and covers the whole viewport (sidebar and header included) with a
// dimmed, blurred backdrop, and it behaves the same everywhere:
//   - clicking the backdrop closes it,
//   - Escape closes it (only the topmost one when popups are stacked),
//   - the page behind it does not scroll while it is open.
// Pass the dialog panel as children. `onClose` may be omitted (or the popup
// made non-dismissible with dismissible={false}) while something is saving.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const Z_BASE = 10000;
const stack = [];
let lockCount = 0;
let savedOverflow = '';

function lockScroll() {
  if (lockCount++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}
function unlockScroll() {
  if (--lockCount === 0) document.body.style.overflow = savedOverflow;
}

export default function Modal({
  onClose,
  dismissible = true,
  children,
  className = '',
  style,
  align = 'center',
  backdrop = 'rgba(15,23,42,0.55)',
  labelledBy,
}) {
  const id = useId();
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  // Stack order decides who gets Escape; later popups also sit later in
  // <body>, so they paint above earlier ones.
  const depth = Math.max(stack.indexOf(id), 0);

  useEffect(() => {
    if (!stack.includes(id)) stack.push(id);
    lockScroll();
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return;
      if (!dismissibleRef.current || !onCloseRef.current) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      unlockScroll();
    };
  }, [id]);

  const onBackdrop = (e) => {
    if (e.target !== e.currentTarget) return;
    if (dismissible && onClose) onClose();
  };

  return createPortal(
    <div
      className={`kna-modal-overlay ${className}`}
      role="presentation"
      aria-labelledby={labelledBy}
      onMouseDown={e => { e.currentTarget.dataset.downOnBackdrop = e.target === e.currentTarget ? '1' : ''; }}
      onClick={e => { if (e.currentTarget.dataset.downOnBackdrop === '1') onBackdrop(e); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_BASE + depth,
        display: 'flex',
        alignItems: align === 'top' ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
        background: backdrop,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'kna-modal-fade .16s ease both',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
