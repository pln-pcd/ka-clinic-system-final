// The admin app's dropdown, used in place of the native <select>.
//
// A native select lets the browser decide whether its list opens up or down;
// this one always opens downward and scrolls inside its own list when the
// space below is short (the page first scrolls the field up if there is
// almost no room). The list is portalled to <body>, so it is never clipped
// by a modal or a scrolling card.
//
// It is a drop-in replacement: keep the <option>/<optgroup> children and the
// `onChange={e => ... e.target.value}` handler. Also supported: disabled
// options, `placeholder`, `required` (validated like a native field),
// `searchable` (on by default for lists longer than 10), keyboard use
// (arrows, Home/End, Enter, Escape, type-ahead) and closing on an outside
// click or Escape.
//
// Placeholder: an empty-value option ("Select type", "— Select brand —") is
// only the grey text of the closed field and is never listed as a choice.
// The one exception is an empty value that is a real choice, written as
// "All …" (e.g. "All years" in a filter), which stays in the list.
//
// Searchable lists are a combobox: the field itself is the search box. Typing
// filters the open list below it, arrows and Enter pick, and the chevron
// opens the full list.
import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// "— Select brand —" → "Select brand"
const cleanPlaceholder = (t) => String(t || '').replace(/^[\s—–-]+|[\s—–-]+$/g, '');

// An empty-value option is a placeholder unless it reads "All …".
const isPlaceholderRow = (r) => r.kind === 'option' && r.value === '' && !/^all\b/i.test(String(r.text || '').trim());

const DEFAULT_TRIGGER = 'w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] focus:ring-2 focus:ring-[#3B50DF]/15 bg-white font-medium text-slate-800 text-xs';
const MENU_MAX = 288;
const MENU_MIN = 150;

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props.children);
  return '';
};

// Flattens <option>, <optgroup> and fragments into rows for the list.
function collect(children, out = [], group = null) {
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) { collect(child.props.children, out, group); return; }
    if (child.type === 'optgroup') {
      out.push({ kind: 'group', label: child.props.label, key: `g:${child.props.label}:${out.length}` });
      collect(child.props.children, out, child.props.label);
      return;
    }
    if (child.type === 'option') {
      const label = child.props.children;
      const value = child.props.value !== undefined ? String(child.props.value) : textOf(label);
      out.push({ kind: 'option', value, label, text: textOf(label), disabled: !!child.props.disabled, group, key: `o:${value}:${out.length}`,
        badge: child.props['data-badge'] || '', badgeTone: child.props['data-badge-tone'] || '' });
    }
  });
  return out;
}

export default function Select({
  value,
  onChange,
  children,
  options,
  className,
  style,
  disabled = false,
  name,
  id,
  required = false,
  placeholder,
  searchable,
  title,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}) {
  const rows = useMemo(() => (
    options
      ? options.map((o, i) => (typeof o === 'object'
        ? { kind: 'option', value: String(o.value), label: o.label ?? String(o.value), text: textOf(o.label ?? o.value), disabled: !!o.disabled, key: `o:${o.value}:${i}` }
        : { kind: 'option', value: String(o), label: String(o), text: String(o), disabled: false, key: `o:${o}:${i}` }))
      : collect(children)
  ), [options, children]);
  // The placeholder row is taken out of the list itself (see the header).
  const emptyRow = rows.find(isPlaceholderRow);
  const listRows = useMemo(() => rows.filter(r => !isPlaceholderRow(r)), [rows]);
  const optionRows = listRows.filter(r => r.kind === 'option');
  const current = value == null ? '' : String(value);
  // An empty value shows a grey placeholder in the closed field (the prop,
  // else the empty option's text without dashes).
  const placeholderText = placeholder || (emptyRow ? cleanPlaceholder(emptyRow.text) : '') || 'Select…';
  const selected = optionRows.find(o => o.value === current) || null;
  const canSearch = searchable ?? optionRows.length > 10;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const typeahead = useRef({ text: '', at: 0 });
  const listId = useId();

  const visible = useMemo(() => {
    if (!canSearch || !query.trim()) return listRows;
    const q = query.trim().toLowerCase();
    // Matches at the start of the text (or of a word) come first.
    const hits = listRows.filter(r => r.kind === 'option' && r.text.toLowerCase().includes(q));
    const starts = r => r.text.toLowerCase().startsWith(q) || r.text.toLowerCase().includes(` ${q}`);
    return [...hits.filter(starts), ...hits.filter(r => !starts(r))];
  }, [listRows, query, canSearch]);
  const visibleOptions = visible.filter(r => r.kind === 'option');

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    setPos({
      top: r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
      width: Math.max(r.width, 180),
      maxHeight: Math.max(Math.min(MENU_MAX, below), 96),
    });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    const el = triggerRef.current;
    // Too little room below: bring the field up first rather than open upward.
    if (el && window.innerHeight - el.getBoundingClientRect().bottom < MENU_MIN) {
      el.scrollIntoView({ block: 'center' });
    }
    place();
    setQuery('');
    const idx = optionRows.findIndex(o => o.value === current && !o.disabled);
    setActive(idx >= 0 ? idx : optionRows.findIndex(o => !o.disabled));
    setOpen(true);
  }, [disabled, place, optionRows, current]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = (opt) => {
    if (!opt || opt.disabled) return;
    if (opt.value !== current) {
      const target = { value: opt.value, name, id };
      onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} });
    }
    close();
  };

  // Keep the list attached to the field while the page or a modal scrolls.
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = (e) => { if (menuRef.current && menuRef.current.contains(e.target)) return; place(); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // A plain list takes focus when it opens; the combobox keeps it in the field.
  useEffect(() => {
    if (!open || canSearch) return;
    requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
  }, [open, canSearch]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open || active < 0) return;
    const opt = visibleOptions[active];
    if (!opt) return;
    listRef.current?.querySelector(`[data-key="${CSS.escape(opt.key)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, visibleOptions]);

  // Search results change: highlight the first enabled match.
  useEffect(() => {
    if (!open || !canSearch) return;
    setActive(visibleOptions.findIndex(o => !o.disabled));
  }, [query]);

  const move = (dir) => {
    if (!visibleOptions.length) return;
    let i = active;
    for (let n = 0; n < visibleOptions.length; n++) {
      i = (i + dir + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[i].disabled) { setActive(i); return; }
    }
  };
  const edge = (end) => {
    const list = end ? [...visibleOptions].reverse() : visibleOptions;
    const hit = list.find(o => !o.disabled);
    if (hit) setActive(visibleOptions.indexOf(hit));
  };

  const jumpTo = (ch) => {
    const now = Date.now();
    const t = typeahead.current;
    t.text = now - t.at < 700 ? t.text + ch.toLowerCase() : ch.toLowerCase();
    t.at = now;
    const i = optionRows.findIndex(o => !o.disabled && o.text.toLowerCase().startsWith(t.text));
    return i;
  };

  const onMenuKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); edge(false); }
    else if (e.key === 'End') { e.preventDefault(); edge(true); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(visibleOptions[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { close(false); }
    else if (!canSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = jumpTo(e.key);
      if (i >= 0) setActive(i);
    }
  };

  const onTriggerKey = (e) => {
    if (disabled) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openMenu();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (canSearch) {
        e.preventDefault();
        openMenu();
        setQuery(e.key);
      } else {
        // Closed type-ahead picks the match directly, like a native select.
        const i = jumpTo(e.key);
        if (i >= 0) choose(optionRows[i]);
      }
    }
  };

  const triggerCls = `${className || DEFAULT_TRIGGER} kna-select${disabled ? ' opacity-60 cursor-not-allowed' : ' cursor-pointer'}`;

  // Combobox keys, on the text field itself.
  const onComboKey = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(visibleOptions[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { close(false); }
  };

  const hiddenRequired = required && (
    // Lets the browser's form validation treat this like a required field.
    <input
      tabIndex={-1}
      aria-hidden="true"
      required
      name={name}
      value={current}
      onChange={() => {}}
      onFocus={() => (canSearch ? searchRef : triggerRef).current?.focus()}
      style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
    />
  );

  const combo = canSearch && (
    <div
      ref={triggerRef}
      className={`${triggerCls} kna-select-combo`}
      data-invalid={ariaInvalid ? 'true' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', ...style }}
      onMouseDown={e => {
        // A click on the field's padding focuses the text box, like a click on it.
        if (disabled || e.target === searchRef.current) return;
        e.preventDefault();
        searchRef.current?.focus();
        if (!open) openMenu();
      }}
    >
      <input
        ref={searchRef}
        id={id}
        title={title}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        // Open: the text is the search. Closed: the chosen option.
        value={open ? query : (selected ? selected.text : '')}
        placeholder={open ? (selected ? selected.text : 'Type to search…') : placeholderText}
        onChange={e => {
          if (!open) openMenu();
          setQuery(e.target.value);
        }}
        onClick={() => { if (!open) openMenu(); }}
        onKeyDown={onComboKey}
        onBlur={e => {
          // Focus moving into the list (its scrollbar) is not leaving the field.
          if (menuRef.current?.contains(e.relatedTarget)) return;
          if (open) close(false);
          onBlur?.(e);
        }}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 && visibleOptions[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={`kna-select-input flex-1 min-w-0 w-full truncate placeholder:text-slate-400 ${disabled ? 'cursor-not-allowed' : 'cursor-text'}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={open ? 'Close list' : 'Show all options'}
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
        onClick={() => {
          if (open) { close(false); return; }
          searchRef.current?.focus({ preventScroll: true });
          openMenu();
        }}
        className="shrink-0 -mr-1 p-0.5 rounded text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
        style={{ lineHeight: 0 }}
      >
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      {combo || <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        className={triggerCls}
        style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', ...style }}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        onBlur={onBlur}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      >
        <span className={`flex-1 min-w-0 truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholderText}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>}
      {hiddenRequired}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          data-kna-select-menu=""
          className="bg-white border border-slate-200 rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.16)] overflow-hidden flex flex-col"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 30000, animation: 'kna-modal-fade .1s ease both' }}
          onKeyDown={canSearch ? undefined : onMenuKey}
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={active >= 0 && visibleOptions[active] ? `${listId}-${active}` : undefined}
            className="overflow-y-auto py-1 outline-none"
          >
            {visibleOptions.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-slate-400">No matches</div>
            )}
            {visible.map(row => {
              if (row.kind === 'group') {
                return <div key={row.key} className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{row.label}</div>;
              }
              const i = visibleOptions.indexOf(row);
              const isSel = row.value === current;
              const isActive = i === active;
              return (
                <div
                  key={row.key}
                  id={`${listId}-${i}`}
                  data-key={row.key}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={row.disabled || undefined}
                  onMouseEnter={() => !row.disabled && setActive(i)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(row)}
                  className={`mx-1 px-2.5 py-2 rounded-lg flex items-center gap-2 text-xs select-none ${
                    row.disabled
                      ? 'text-slate-400 cursor-not-allowed'
                      : `cursor-pointer ${isActive ? 'bg-indigo-50 text-[#0a1d47]' : 'text-slate-700'} ${isSel ? 'font-semibold' : 'font-medium'}`
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">{row.label}</span>
                  {row.badge && (
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${row.badgeTone === 'red' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {row.badge}
                    </span>
                  )}
                  {isSel && <Check size={14} className="shrink-0 text-[#3B50DF]" strokeWidth={2.6} />}
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
