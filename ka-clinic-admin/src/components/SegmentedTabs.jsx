// Segmented tabs (the Manage Admins style): a grey track, the active tab is
// a white pill with a soft shadow. Counts use one badge style; only tabs
// that need action get the accent when they have items. A mouse click does
// not leave a focus outline; keyboard focus shows a soft inset ring.
export default function SegmentedTabs({ tabs, value, onChange, label, fill = false, className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={`flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl ${className}`}>
      {tabs.map(t => {
        const on = t.key === value;
        const accent = t.action && t.count > 0;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onMouseDown={e => e.preventDefault()}
            onClick={() => onChange(t.key)}
            className={`kna-seg-tab inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${fill ? 'flex-1 min-w-0' : ''} ${
              on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <span className="truncate">{t.label}</span>
            {t.count !== undefined && (
              <span className={`min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                accent ? 'bg-[#3B50DF] text-white' : on ? 'bg-slate-100 text-slate-600' : 'bg-slate-300/60 text-slate-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
