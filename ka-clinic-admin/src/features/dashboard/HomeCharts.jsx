// Home graphs: patients by exposure category, open cases per barangay and
// vaccine stock. Plain SVG/CSS from the shared live records, nothing stored.
// Hover or focus a mark to read its details; click one to open the matching page.
import { useEffect, useMemo, useState } from 'react';
import { serviceKey } from '../../lib/serviceFields';
import { knownBarangay, recordBarangay } from '../../lib/libonGeo';
import { deriveStockStatus, vialsOf } from '../../lib/inventoryStock';

const isDoneDose = d => d?.done === true || ['done', 'completed'].includes(String(d?.s || d?.status || '').toLowerCase());
// Same rule as the Incident Map: PEP, not archived, not completed.
const isOpenCase = r => serviceKey(r.service) === 'PEP' && !r.isArchived && r.status !== 'completed'
  && !(Array.isArray(r.doses) && r.doses.length > 0 && r.doses.every(isDoneDose));

const CAT_COLORS = { 'Category II': '#EA7A0C', 'Category III': '#D81B25', Other: '#94A3B8' };
const STOCK_COLORS = { 'in-stock': '#16A34A', 'low-stock': '#F59E0B', 'out-of-stock': '#DC2626' };
const STOCK_LABELS = { 'in-stock': 'In stock', 'low-stock': 'Low stock', 'out-of-stock': 'Out of stock / expired' };

const CHART_CSS = `
  @keyframes kna-bar-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .kna-bar-fill { transform-origin: left center; animation: kna-bar-grow .6s cubic-bezier(0.22,1,0.36,1) both; }
  .kna-donut-seg { transition: stroke-width .18s ease, opacity .18s ease; cursor: pointer; outline: none; }
  .kna-chart-row { transition: background-color .15s ease; }
  @media (prefers-reduced-motion: reduce) { .kna-bar-fill { animation: none; } .kna-donut-seg, .kna-chart-row { transition: none; } }
`;

function Card({ title, subtitle, actionLabel, onAction, children, delay = '0s' }) {
  return (
    <div className="rounded-3xl border bg-white border-blue-100/80 shadow-2xs hover:shadow-xs transition-shadow p-5 sm:p-6 flex flex-col min-w-0"
      style={{ animation: `kna-card-in 0.42s cubic-bezier(0.22,1,0.36,1) ${delay} both` }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#0a1d47]">{title}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        {onAction && (
          <button type="button" onClick={onAction}
            className="shrink-0 text-[11px] font-semibold text-[#1D4ED8] hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8] rounded">
            {actionLabel}
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

const Empty = ({ text }) => <p className="text-xs text-slate-400 text-center py-8">{text}</p>;

function Donut({ slices, onSelect }) {
  const [active, setActive] = useState(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  const shown = slices.find(s => s.label === active);
  let offset = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap justify-center">
      <svg width="148" height="148" viewBox="0 0 140 140" role="img" aria-label="Patients by category">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#EFF3FA" strokeWidth="18" />
        {slices.filter(s => s.value > 0).map(s => {
          const len = (s.value / total) * C;
          const el = (
            <circle key={s.label} className="kna-donut-seg" cx="70" cy="70" r={R} fill="none" stroke={s.color}
              strokeWidth={active === s.label ? 22 : 18} opacity={active && active !== s.label ? 0.35 : 1}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"
              tabIndex={0} role="button" aria-label={`${s.label}: ${s.value} patients`}
              onMouseEnter={() => setActive(s.label)} onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.label)} onBlur={() => setActive(null)}
              onClick={onSelect} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }} />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0a1d47">{shown ? shown.value : total}</text>
        <text x="70" y="84" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#94A3B8">{shown ? shown.label.toUpperCase() : 'PATIENTS'}</text>
      </svg>
      <ul className="space-y-1">
        {slices.map(s => (
          <li key={s.label}>
            <button type="button" onClick={onSelect}
              onMouseEnter={() => setActive(s.label)} onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.label)} onBlur={() => setActive(null)}
              className={`kna-chart-row w-full flex items-center gap-2 text-xs text-slate-600 rounded-lg px-2 py-1 cursor-pointer ${active === s.label ? 'bg-blue-50/70' : ''}`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="font-semibold text-[#0a1d47] tabular-nums w-6 text-right">{s.value}</span>
              <span>{s.label}</span>
              {total > 0 && <span className="text-slate-400">({Math.round((s.value / total) * 100)}%)</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One horizontal bar per row. `detail(row)` is the line shown on hover/focus.
function Bars({ rows, max, detail, onSelect }) {
  const [active, setActive] = useState(null);
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.label}>
          <button type="button" onClick={onSelect}
            onMouseEnter={() => setActive(r.label)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(r.label)} onBlur={() => setActive(null)}
            aria-label={`${r.label}: ${detail(r)}`}
            className={`kna-chart-row w-full flex items-center gap-3 text-xs rounded-lg px-2 py-1.5 cursor-pointer ${active === r.label ? 'bg-blue-50/70' : ''}`}>
            <span className="w-24 sm:w-28 truncate text-left text-slate-600 font-medium">{r.label}</span>
            <div className="relative flex-1 h-2.5 rounded-full bg-slate-100">
              <div className="kna-bar-fill h-full rounded-full" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color, animationDelay: `${i * 50}ms`, opacity: active && active !== r.label ? 0.45 : 1 }} />
              {r.marker != null && r.marker <= max && (
                <span className="absolute w-0.5 bg-slate-500/70" style={{ left: `${(r.marker / max) * 100}%`, top: -4, height: 18 }} />
              )}
            </div>
            <span className="w-14 text-right font-semibold text-[#0a1d47] tabular-nums">{r.value}</span>
          </button>
        </li>
      ))}
      <li className="text-[11px] text-slate-500 px-2 pt-2 min-h-[22px]" aria-live="polite">
        {active ? `${active}: ${detail(rows.find(r => r.label === active))}` : 'Hover or select a bar for details.'}
      </li>
    </ul>
  );
}

export default function HomeCharts({ patients = [], inventory = [], onNavigate = () => {} }) {
  // The CSS is injected once, like the incident map's.
  useEffect(() => {
    if (document.getElementById('kna-home-charts-css')) return;
    const el = document.createElement('style');
    el.id = 'kna-home-charts-css';
    el.textContent = CHART_CSS;
    document.head.appendChild(el);
  }, []);

  const categories = useMemo(() => {
    const counts = { 'Category II': 0, 'Category III': 0, Other: 0 };
    patients.filter(p => !p.isArchived).forEach(p => {
      const c = String(p.cat || '').replace('Category ', '').trim();
      if (c === 'II') counts['Category II'] += 1;
      else if (c === 'III') counts['Category III'] += 1;
      else counts.Other += 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label: label === 'Other' ? 'No category' : label, value, color: CAT_COLORS[label] }));
  }, [patients]);

  const barangays = useMemo(() => {
    const counts = {};
    patients.filter(isOpenCase).forEach(r => {
      const b = knownBarangay(recordBarangay(r));
      if (b) counts[b] = (counts[b] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return { total, rows: sorted.slice(0, 8).map(([label, value]) => ({ label, value, share: Math.round((value / total) * 100), color: '#1D4ED8' })) };
  }, [patients]);

  const stock = useMemo(() => inventory
    .map(i => ({ label: i.name || 'Item', value: vialsOf(i), marker: parseInt(i.minStock, 10) || 10, status: deriveStockStatus(i) }))
    .sort((a, b) => a.value - b.value).slice(0, 8)
    .map(i => ({ ...i, color: STOCK_COLORS[i.status] })), [inventory]);
  const stockMax = Math.max(10, ...stock.map(s => Math.max(s.value, s.marker)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      <Card title="Patients by Category" subtitle="Exposure category of active patients" actionLabel="View patients" onAction={() => onNavigate('patients')} delay="0.06s">
        {categories.every(c => c.value === 0) ? <Empty text="No patients yet." /> : <Donut slices={categories} onSelect={() => onNavigate('patients')} />}
      </Card>
      <Card title="Open Cases by Barangay" subtitle="Top barangays with ongoing PEP cases" actionLabel="Open map" onAction={() => onNavigate('incidents')} delay="0.1s">
        {barangays.rows.length === 0 ? <Empty text="No open cases right now." /> : (
          <Bars rows={barangays.rows} max={Math.max(...barangays.rows.map(b => b.value))} onSelect={() => onNavigate('incidents')}
            detail={r => `${r.value} open case${r.value === 1 ? '' : 's'} (${r.share}% of ${barangays.total})`} />
        )}
      </Card>
      <Card title="Vaccine Stock" subtitle="Vials on hand, lowest first (| marks the minimum level)" actionLabel="View inventory" onAction={() => onNavigate('inventory')} delay="0.14s">
        {stock.length === 0 ? <Empty text="No inventory items yet." /> : (
          <>
            <Bars rows={stock} max={stockMax} onSelect={() => onNavigate('inventory')}
              detail={r => `${r.value} vial${r.value === 1 ? '' : 's'}, minimum ${r.marker} (${STOCK_LABELS[r.status]})`} />
            <div className="flex gap-4 mt-2 px-2 flex-wrap">
              {Object.keys(STOCK_COLORS).map(k => (
                <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="w-2 h-2 rounded-full" style={{ background: STOCK_COLORS[k] }} />{STOCK_LABELS[k]}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
