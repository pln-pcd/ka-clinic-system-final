// "Discard changes?" for add/edit popups.
//
//   const [requestClose, discardDialog] = useDiscardGuard(form, onClose);
//   <Modal onClose={requestClose}> … <button onClick={requestClose}>Cancel</button> … {discardDialog}
//
// `form` is the popup's state. Its value at the first render is the baseline;
// once anything differs, closing the popup (X, Cancel, backdrop, Escape) asks
// first, and a browser refresh or tab close shows the browser's own warning.
// Nothing changed: it closes straight away. Pass `{ dirty }` to decide
// dirtiness yourself instead (e.g. a popup with several pieces of state).
// When the form state lives in the page and the popup only opens and closes,
// pass `resetKey` (e.g. the open flag plus the item id): the baseline is
// taken again whenever it changes, i.e. from the form as the popup opened.
//
// Call `onClose` itself, not requestClose, after a successful save.
import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

const snapshot = (v) => {
  try {
    return JSON.stringify(v, (_k, x) => (x instanceof File ? `file:${x.name}:${x.size}` : x));
  } catch {
    return String(v);
  }
};

export default function useDiscardGuard(form, onClose, { dirty: dirtyOverride, enabled = true, resetKey } = {}) {
  const baseline = useRef(null);
  const baselineKey = useRef(resetKey);
  if (baseline.current === null || baselineKey.current !== resetKey) {
    baseline.current = snapshot(form);
    baselineKey.current = resetKey;
  }
  const dirty = enabled && (dirtyOverride ?? snapshot(form) !== baseline.current);

  const [asking, setAsking] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) setAsking(true);
    else onCloseRef.current?.();
  }, []);

  const dialog = asking ? (
    <ConfirmDialog
      variant="warning"
      size="compact"
      title="Discard changes?"
      message="Your entries in this form won't be saved."
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      onCancel={() => setAsking(false)}
      onConfirm={() => { setAsking(false); onCloseRef.current?.(); }}
    />
  ) : null;

  return [requestClose, dialog, dirty];
}
