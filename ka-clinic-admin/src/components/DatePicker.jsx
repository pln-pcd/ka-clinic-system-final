// The admin app's date field, used in place of <input type="date">.
//
// The browser's own calendar decides where it opens (often above or beside
// the field) and looks different in every browser. This one always opens
// BELOW the field, aligned to its left edge, portalled to <body> so modals
// never clip it (the page first scrolls the field up if there is no room
// below, like Select). It matches the appointments calendar.
//
// Drop-in: value is 'YYYY-MM-DD' (or ''), and onChange gets
// `{ target: { value, name, id } }`. Also supported: typing the date
// (MM/DD/YYYY, or paste YYYY-MM-DD), month and year navigation, `min`/`max`,
// `isDateDisabled(dateStr)` (with `disabledHint` for the tooltip), keyboard use
// (arrows, PageUp/PageDown, Home/End, Enter, Escape), and optional
// `clearable` / `showToday` footer buttons (off by default).
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_INPUT = 'w-full py-2.5 pl-3 pr-9 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] focus:ring-2 focus:ring-[#3B50DF]/15 bg-white font-medium text-slate-800 text-xs';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const POP_W = 296;
const POP_H = 340;

const pad = n => String(n).padStart(2, '0');
const toStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = s => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const weekday = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay();
const addDays = (s, n) => { const { y, m, d } = parts(s); const t = new Date(Date.UTC(y, m, d + n)); return toStr(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
const addMonths = (s, n) => { const { y, m, d } = parts(s); const t = new Date(Date.UTC(y, m + n, 1)); const ty = t.getUTCFullYear(); const tm = t.getUTCMonth(); return toStr(ty, tm, Math.min(d, daysIn(ty, tm))); };
const todayStr = () => { const t = new Date(); return toStr(t.getFullYear(), t.getMonth(), t.getDate()); };
const display = s => { if (!isIso(s)) return ''; const { y, m, d } = parts(s); return `${pad(m + 1)}/${pad(d)}/${y}`; };

// "MM/DD/YYYY" (or M/D/YYYY, or ISO) → 'YYYY-MM-DD', or '' when not a real date.
function parseTyped(text) {
  const t = (text || '').trim();
  let y, m, d;
  let hit = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
  else if ((hit = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { m = +hit[1]; d = +hit[2]; y = +hit[3]; }
  else return '';
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m - 1) || y < 1900 || y > 2200) return '';
  return toStr(y, m - 1, d);
}

// Digits typed are shaped into MM/DD/YYYY as the user goes.
function mask(raw) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return display(raw.trim());
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits + (raw.endsWith('/') && digits.length === 2 ? '/' : '');
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const DatePicker = forwardRef(function DatePicker({
  value = '',
  onChange,
  onBlur,
  min,
  max,
  isDateDisabled,
  disabledHint = 'Not available',
  clearable = false,
  showToday = false,
  placeholder = 'MM/DD/YYYY',
  className,
  style,
  id,
  name,
  disabled = false,
  required = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
}, ref) {
  const inputRef = useRef(null);
  const popRef = useRef(null);
  const gridRef = useRef(null);
  const popId = useId();
  const [text, setText] = useState(display(value));
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('days'); // 'days' | 'months'
  const [cursor, setCursor] = useState(isIso(value) ? value : todayStr()); // focused day
  const [pos, setPos] = useState(null);
  useImperativeHandle(ref, () => inputRef.current);

  // Outside value changes (reset, auto-fill) show in the box.
  useEffect(() => { setText(display(value)); }, [value]);

  const allowed = useCallback((s) => {
    if (!isIso(s)) return false;
    if (min && s < min) return false;
    if (max && s > max) return false;
    return !(isDateDisabled && isDateDisabled(s));
  }, [min, max, isDateDisabled]);

  const emit = useCallback((v) => {
    if (v === value) return;
    const target = { value: v, name, id };
    onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} });
  }, [value, name, id, onChange]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const room = window.innerHeight - r.bottom - 12;
    // Short on room below (e.g. a field low in a fixed modal): a compact
    // calendar, still below the field; it scrolls inside as a last resort.
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8)), dense: room < POP_H, maxHeight: Math.max(room, 180) });
  }, []);

  const openPop = useCallback(() => {
    if (disabled) return;
    const el = inputRef.current;
    // Too little room below: bring the field up first; never open upward.
    if (el && window.innerHeight - el.getBoundingClientRect().bottom < POP_H + 12) el.scrollIntoView({ block: 'center' });
    setCursor(isIso(value) ? value : (min && todayStr() < min ? min : max && todayStr() > max ? max : todayStr()));
    setView('days');
    place();
    setOpen(true);
  }, [disabled, value, min, max, place]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) inputRef.current?.focus({ preventScroll: true });
  }, []);

  const pick = (s) => {
    if (!allowed(s)) return;
    emit(s);
    setText(display(s));
    close();
  };

  // Stay attached while the page or a modal scrolls.
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = (e) => { if (popRef.current?.contains(e.target)) return; place(); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', place); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (inputRef.current?.parentElement?.contains(e.target) || popRef.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Keyboard focus follows the cursor day while the grid has focus.
  useEffect(() => {
    if (!open || view !== 'days') return;
    const btn = gridRef.current?.querySelector(`[data-date="${cursor}"]`);
    if (btn && popRef.current?.contains(document.activeElement)) btn.focus({ preventScroll: true });
  }, [cursor, open, view]);

  const commitTyped = () => {
    const t = text.trim();
    if (!t) { emit(''); return; }
    const v = parseTyped(t);
    if (v && allowed(v)) { emit(v); setText(display(v)); }
    else setText(display(value)); // not a usable date: back to the last good one
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !text.trim())) { e.preventDefault(); openPop(); requestAnimationFrame(() => gridRef.current?.querySelector('[tabindex="0"]')?.focus()); }
    else if (e.key === 'Enter') { e.preventDefault(); commitTyped(); close(false); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
  };

  const onGridKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); setCursor(c => addDays(c, step)); return; }
    if (e.key === 'PageUp') { e.preventDefault(); setCursor(c => addMonths(c, e.shiftKey ? -12 : -1)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setCursor(c => addMonths(c, e.shiftKey ? 12 : 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setCursor(c => { const { y, m, d } = parts(c); return addDays(c, -weekday(y, m, d)); }); }
    else if (e.key === 'End') { e.preventDefault(); setCursor(c => { const { y, m, d } = parts(c); return addDays(c, 6 - weekday(y, m, d)); }); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(cursor); }
  };
  const onPopKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };

  const { y: cy, m: cm } = parts(cursor);
  const totalDays = daysIn(cy, cm);
  const monthStart = toStr(cy, cm, 1);
  const monthEnd = toStr(cy, cm, totalDays);
  const lead = weekday(cy, cm, 1);
  const rowCount = Math.ceil((lead + totalDays) / 7);
  const totalCells = rowCount * 7;

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < totalCells; i++) {
      const s = addDays(monthStart, i - lead);
      const isNextMonth = s > monthEnd;
      const isPrevMonth = s < monthStart;
      out.push({
        s,
        day: parts(s).d,
        other: isPrevMonth || isNextMonth,
        isNextMonth,
        isPrevMonth,
      });
    }
    return out;
  }, [cy, cm, monthStart, monthEnd, lead, totalCells]);

  const canPrev = !min || addDays(monthStart, -1) >= min.slice(0, 8) + '01';
  const canNext = !max || addDays(monthEnd, 1) <= max;
  const today = todayStr();
  const navBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#3B50DF]/40';

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        className={`${className || DEFAULT_INPUT} kna-date`}
        style={{ ...style, paddingRight: 36 }}
        onChange={e => {
          const next = mask(e.target.value);
          setText(next);
          const v = parseTyped(next);
          if (v && allowed(v)) { emit(v); setCursor(v); }
        }}
        onBlur={e => { if (popRef.current?.contains(e.relatedTarget)) return; commitTyped(); onBlur?.(e); }}
        onKeyDown={onInputKey}
        onClick={() => { if (!open) openPop(); }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Open calendar"
        onMouseDown={e => e.preventDefault()}
        onClick={() => (open ? close() : (openPop(), inputRef.current?.focus({ preventScroll: true })))}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-[#3B50DF] hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
      >
        <Calendar size={15} aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-label="Choose a date"
          data-kna-date-pop=""
          onKeyDown={onPopKey}
          className={`bg-white border border-slate-200 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.16)] overflow-y-auto ${pos.dense ? 'p-2' : 'p-3'}`}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POP_W, maxHeight: pos.maxHeight, zIndex: 30000, animation: 'kna-modal-fade .1s ease both' }}
        >
          <div className={`flex items-center justify-between gap-2 ${pos.dense ? 'mb-0.5' : 'mb-2'}`}>
            <button type="button" className={navBtn} aria-label={view === 'days' ? 'Previous month' : 'Previous year'}
              disabled={view === 'days' ? !canPrev : (min && cy - 1 < +min.slice(0, 4))}
              onClick={() => setCursor(c => addMonths(c, view === 'days' ? -1 : -12))}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setView(v => (v === 'days' ? 'months' : 'days'))}
              aria-label={view === 'days' ? 'Choose month and year' : 'Back to days'}
              className="px-2.5 h-8 rounded-lg text-[13px] font-bold text-slate-900 hover:bg-slate-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#3B50DF]/40">
              {view === 'days' ? `${MONTHS[cm]} ${cy}` : cy}
            </button>
            <button type="button" className={navBtn} aria-label={view === 'days' ? 'Next month' : 'Next year'}
              disabled={view === 'days' ? !canNext : (max && cy + 1 > +max.slice(0, 4))}
              onClick={() => setCursor(c => addMonths(c, view === 'days' ? 1 : 12))}>
              <ChevronRight size={16} />
            </button>
          </div>

          {view === 'months' ? (
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((mn, i) => {
                const first = toStr(cy, i, 1);
                const last = toStr(cy, i, daysIn(cy, i));
                const off = (min && last < min) || (max && first > max);
                const on = i === cm;
                return (
                  <button key={mn} type="button" disabled={off}
                    onClick={() => { setCursor(toStr(cy, i, Math.min(parts(cursor).d, daysIn(cy, i)))); setView('days'); }}
                    className={`h-10 rounded-[10px] text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-[#3B50DF]/40 ${on ? 'bg-[#EEF2FF] text-[#3B50DF] shadow-[inset_0_0_0_2px_#6366F1]' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {mn.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-7 gap-1 ${pos.dense ? '' : 'mb-1'}`}>
                {DAYS.map(d => <div key={d} className={`text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-400 ${pos.dense ? 'py-0.5' : 'py-1'}`}>{d}</div>)}
              </div>
              <div ref={gridRef} role="grid" aria-label={`${MONTHS[cm]} ${cy}`} className={`grid grid-cols-7 ${pos.dense ? 'gap-0.5' : 'gap-1'}`} onKeyDown={onGridKey}>
                {cells.map(c => {
                  if (c.isNextMonth) {
                    return <div key={c.s} aria-hidden="true" className={pos.dense ? 'h-7' : 'h-9'} />;
                  }
                  const ok = allowed(c.s) && !c.other;
                  const sel = c.s === value;
                  const isToday = c.s === today;
                  const hintText = c.other ? '' : (typeof disabledHint === 'function' ? disabledHint(c.s) : disabledHint);
                  return (
                    <button
                      key={c.s}
                      type="button"
                      role="gridcell"
                      data-date={c.s}
                      disabled={!ok}
                      tabIndex={c.s === cursor && ok ? 0 : -1}
                      aria-selected={sel}
                      aria-disabled={!ok || undefined}
                      aria-label={`${MONTHS[parts(c.s).m]} ${c.day}, ${parts(c.s).y}${ok ? '' : hintText ? ` (${hintText})` : ''}`}
                      title={ok ? undefined : hintText || undefined}
                      onClick={ok ? () => pick(c.s) : undefined}
                      className={`relative ${pos.dense ? 'h-7' : 'h-9'} rounded-[10px] text-[13px] font-semibold outline-none transition-colors
                        ${sel ? 'bg-[#EEF2FF] text-[#3B50DF] shadow-[inset_0_0_0_2px_#6366F1]'
                          : !ok ? 'text-slate-300 cursor-not-allowed select-none'
                          : `${c.other ? 'text-slate-400' : 'text-slate-800'} hover:bg-slate-100 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3B50DF]/50`}`}
                    >
                      {c.day}
                      {isToday && <span aria-hidden="true" className={`absolute left-1/2 -translate-x-1/2 bottom-1 w-1 h-1 rounded-full ${ok || sel ? 'bg-[#3B50DF]' : 'bg-slate-300'}`} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {(clearable || showToday) && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
              {clearable ? <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md hover:bg-slate-100 cursor-pointer" onClick={() => { emit(''); setText(''); close(); }}>Clear</button> : <span />}
              {showToday && <button type="button" disabled={!allowed(today)} className="text-xs font-semibold text-[#3B50DF] px-2 py-1 rounded-md hover:bg-indigo-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => pick(today)}>Today</button>}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
});

export default DatePicker;
