// Dialogs whose code downloads the first time they open (the export dialogs
// carry the PDF and Excel libraries and the embedded logo). While that
// download runs, a dimmed spinner stands in for the dialog.
import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';

// Shown while a lazily loaded dialog's code downloads (usually a moment).
// Portalled to <body> like every popup, so the blur covers the sidebar and
// header too, not just the page it was opened from.
export function ModalLoading() {
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" role="status" aria-label="Loading"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
      <div className="w-7 h-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
    </div>,
    document.body
  );
}

// Wraps a named export of a lazily imported module as a component that
// renders it inside <Suspense>, with the spinner above as the fallback.
// The code is also fetched in the background once the browser is idle, so
// the dialog normally opens instantly without the spinner.
export function lazyModal(load, exportName) {
  const Lazy = lazy(() => load().then(m => ({ default: m[exportName] })));
  if (typeof window !== 'undefined') {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
    idle(() => load().catch(() => {}), { timeout: 8000 });
  }
  function LazyModal(props) {
    return (
      <Suspense fallback={<ModalLoading />}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return LazyModal;
}
