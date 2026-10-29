import { addDoc, collection, doc, runTransaction } from 'firebase/firestore';
import Modal from '../../components/Modal';
import useDiscardGuard from '../../components/useDiscardGuard';
import Select from '../../components/Select';
import { AlertCircle, Check, Download, Edit3, Package, Plus, X, XCircle } from 'lucide-react';
import IconButton from '../../components/IconButton';
import EmptyState from '../../components/EmptyState';
import DatePicker from '../../components/DatePicker';
import { BTN, BTN_ICON } from '../../lib/buttons';
import { FieldError, useFieldErrors } from '../../components/FormValidation';

// Add / Edit item checks, shown inline under each field. `others` is the
// rest of the inventory (for the duplicate-name check).
const normName = v => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
const invRules = (others) => ({
  name: f => (!f.name.trim() ? 'Enter the item name'
    : others.some(i => normName(i.name) === normName(f.name)) ? 'An item with this name already exists' : ''),
  stock: f => (String(f.stock).trim() === '' ? 'Enter the vials in stock'
    : !/^\d+$/.test(String(f.stock).trim()) ? 'Use a whole number, 0 or more' : ''),
  category: f => (f.category ? '' : 'Choose a category'),
  unit: f => (f.unit ? '' : 'Choose a unit'),
  minStock: f => (!String(f.minStock || '').trim() ? 'Enter the low-stock threshold'
    : !/^[1-9]\d*$/.test(String(f.minStock).trim()) ? 'Use a whole number, 1 or more' : ''),
});
const INV_FIELDS = ['name', 'category', 'unit', 'stock', 'minStock'];
// A new item starts blank (grey placeholders); nothing is pre-chosen.
const EMPTY_ITEM = () => ({ name: '', category: '', unit: '', stock: '', minStock: '', expiry: '' });
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../lib/firebase';
import { diffFields, logActivity } from '../../lib/activityLog';
import { peekLiveCollection, useLiveCollection } from '../../lib/liveStore';
import Toast from '../../components/Toast';
import { deriveStockLabel, deriveStockStatus, fmtUnit, formatVials, isExpired, vialsOf } from '../../lib/inventoryStock';
import { lazyModal } from '../../components/LazyModal';
import { INVENTORY_CATEGORIES, inventoryCategoryLabel, inventoryCategoryOf } from '../../lib/inventoryCategories';
import Pager, { paginate, useTableReserve } from '../../components/Pager';
import { getTodayDateString } from '../../lib/formatters';

// An item counts as "expiring soon" when its expiry date is within this many
// days (already-expired items are included, they need attention most).
const EXPIRING_SOON_DAYS = 30;
const expiryOf = item => String(item.expiry || item.expiryDate || '').slice(0, 10);
const tsOf = v => (typeof v === 'number' ? v : v?.toMillis?.() ?? (v ? new Date(v).getTime() || 0 : 0));
// Last change to the item: stock moves and edits stamp updatedAt; older
// items only have createdAt.
const lastUpdatedOf = item => tsOf(item.updatedAt) || tsOf(item.createdAt);

const STOCK_FILTERS = [
  { key: 'all', label: 'All stock levels' },
  { key: 'in-stock', label: 'In stock' },
  { key: 'low-stock', label: 'Low stock' },
  { key: 'out-of-stock', label: 'Out of stock' },
];
const SORT_OPTIONS = [
  { key: 'name_asc', label: 'Name (A to Z)' },
  { key: 'stock_asc', label: 'Stock (lowest first)' },
  { key: 'stock_desc', label: 'Stock (highest first)' },
  { key: 'expiry_asc', label: 'Expiry date (soonest)' },
  { key: 'updated_desc', label: 'Last updated' },
];
// Row height of the inventory table, used to reserve a full page of rows.
const INV_ROW_H = 57;

const menuItemStyle = on => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: on ? '#EEF2FF' : 'transparent', color: on ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: on ? 700 : 500, cursor: 'pointer' });
const menuHeadStyle = { padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' };
const CheckMark = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;

// The export dialog carries the PDF and Excel libraries and the embedded logo,
// so its code is downloaded the first time someone opens it.
const ExportInventoryModal = lazyModal(() => import('./ExportInventoryModal'), 'ExportInventoryModal');

/* ─────────────────────────── CSS ─────────────────────────── */
const globalCSS = `
  :root {
    --primary-blue: #3B50DF;
    --blue-hover: #2F40B5;
    --bg-main: #F0F4FA;
    --bg-card: #FFFFFF;
    --text-main: #1C1C1E;
    --text-muted: #7A6E6E;
    --border: #E8E2E2;
    --radius-lg: 10px;
  }

  body { font-family: 'Roboto', system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text-main); }

  .btn-add {
    background: var(--primary-blue);
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.2s;
    border: none;
    cursor: pointer;
  }
  .btn-add:hover { background: var(--blue-hover); }

  .btn-export {
    background: white;
    color: #374151;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    border: 1px solid #E5E7EB;
    cursor: pointer;
  }
  .btn-export:hover { background: #F9FAFB; border-color: #D1D5DB; }

  .inventory-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .inventory-table th {
    background: #F4F1F1;
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    padding: 10px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .inventory-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 0.8125rem;
  }

  .filter-select {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-main);
    background: white;
    outline: none;
  }

  .badge-status {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .export-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    background: white;
    width: 100%;
    text-align: left;
  }
  .export-option:hover { border-color: #3B50DF; background: #F8FAFC; }
  .export-option-selected { border-color: #3B50DF !important; background: #EEF2FF !important; }
`;

/* ─────────────────────────── COMPONENT ─────────────────────────── */
export default function VaccineInventoryPage() {
  const [inventory, setInventory] = useState(() => peekLiveCollection('inventory').rows);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_ITEM());

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState(EMPTY_ITEM());
  const addV = useFieldErrors(invRules(inventory), formData, 'inv');
  const editV = useFieldErrors(invRules(inventory.filter(i => i.id !== selectedItem?.id)), editFormData, 'invedit');

  // Closing an add/edit/use-stock popup with unsaved entries asks first.
  const [requestCloseAdd, addDiscardDialog] = useDiscardGuard(formData,
    () => { setShowAddModal(false); setFormData(EMPTY_ITEM()); },
    { resetKey: showAddModal, enabled: showAddModal });
  const [requestCloseEdit, editDiscardDialog] = useDiscardGuard(editFormData,
    () => { setShowEditModal(false); setSelectedItem(null); },
    { resetKey: showEditModal && selectedItem?.id, enabled: showEditModal });

  // Shared live inventory (lib/liveStore.js).
  const invLive = useLiveCollection('inventory');
  useEffect(() => { setInventory(invLive.rows); }, [invLive]);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter (category, stock level, expiring soon) and Sort by, as on the
  // other dashboards. Any change goes back to the first page.
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [sortBy, setSortBy] = useState('name_asc');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [debouncedSearchQuery, categoryFilter, stockFilter, expiringOnly, sortBy]);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  useEffect(() => {
    const handler = e => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(inventory.map(i => inventoryCategoryLabel(i)))).sort(),
    [inventory]
  );
  const today = getTodayDateString();
  const soonCutoff = (() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + EXPIRING_SOON_DAYS);
    return getTodayDateString(d);
  })();
  const isExpiringSoon = item => { const e = expiryOf(item); return Boolean(e) && e <= soonCutoff; };
  const activeFilterCount = (categoryFilter !== 'all') + (stockFilter !== 'all') + expiringOnly;

  const filtered = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    const stockNum = item => parseInt(item.stock, 10) || 0;
    return inventory
      .filter(item => !q || (item.name || '').toLowerCase().includes(q))
      .filter(item => categoryFilter === 'all' || inventoryCategoryLabel(item) === categoryFilter)
      .filter(item => stockFilter === 'all' || deriveStockStatus(item) === stockFilter)
      .filter(item => !expiringOnly || isExpiringSoon(item))
      .sort((a, b) => {
        if (sortBy === 'stock_asc') return stockNum(a) - stockNum(b) || (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'stock_desc') return stockNum(b) - stockNum(a) || (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'expiry_asc') {
          // Items without an expiry date go last.
          const ea = expiryOf(a), eb = expiryOf(b);
          if (ea && eb) return ea.localeCompare(eb);
          return ea ? -1 : eb ? 1 : (a.name || '').localeCompare(b.name || '');
        }
        if (sortBy === 'updated_desc') return lastUpdatedOf(b) - lastUpdatedOf(a);
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [inventory, debouncedSearchQuery, categoryFilter, stockFilter, expiringOnly, sortBy, soonCutoff]);
  const { pages, page: safePage, rows: pageRows } = paginate(filtered, page);
  const [tableAreaRef, tableReserve] = useTableReserve(INV_ROW_H);

  /* ── Add Item ── */
  const handleSave = async () => {
    if (!addV.validate(INV_FIELDS)) return;
    setSaving(true);
    try {
      const stockNum = Number(formData.stock) || 0;
      const minStockNum = Number(formData.minStock) || 10;
      const selectedCapitalizedUnit = fmtUnit(formData.unit);
      const expirationDate = formData.expiry || '';

      const newItem = {
        name: formData.name.trim(),
        category: formData.category,
        stock: stockNum,
        minStock: minStockNum,
        unit: selectedCapitalizedUnit,
        expiry: expirationDate,
        expiryDate: expirationDate,
        status: deriveStockStatus({ stock: stockNum, minStock: minStockNum }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const created = await addDoc(collection(db, 'inventory'), newItem);
      logActivity({ action: 'inventory.create', collection: 'inventory', docId: created.id,
        summary: `Added ${newItem.name} (${newItem.stock} vials)`, changes: diffFields({}, newItem, ['name', 'category', 'stock', 'minStock', 'unit', 'expiry']) });
      setShowAddModal(false);
      setFormData(EMPTY_ITEM());
      showToast(`${newItem.name} added to inventory`, 'success');
    } catch (err) {
      console.error('Inventory add error:', err);
      showToast('Could not add the item. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Edit Item ── */
  // The form opens with the item's current values.
  const openEditModal = (item) => {
    const vials = vialsOf(item);
    setSelectedItem({ ...item, _openVials: vials });
    setEditFormData({
      name: item.name || '',
      category: inventoryCategoryOf(item),
      unit: item.unit || '',
      stock: String(vials),
      minStock: String(item.minStock ?? 10),
      expiry: item.expiry || item.expiryDate || '',
    });
    editV.clear();
    setShowEditModal(true);
  };

  // Saved in a transaction as a change from what the form opened with:
  // new vials = current vials + (typed − shown), so a dose given while the
  // form was open is not lost. Typing more vials is a stock-in.
  const handleEditSave = async () => {
    if (!selectedItem || !editV.validate(INV_FIELDS)) return;
    setSaving(true);
    const open = selectedItem;
    try {
      const updated = await runTransaction(db, async (tx) => {
        const ref = doc(db, 'inventory', open.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('This item no longer exists.');
        const before = vialsOf(snap.data());
        const after = before + ((parseInt(editFormData.stock, 10) || 0) - open._openVials);
        if (after < 0) {
          const err = new Error(`That leaves ${after} vials. Stock can't go below 0.`);
          err.code = 'negative';
          throw err;
        }
        const minStockNum = parseInt(editFormData.minStock, 10) || 10;
        const data = {
          name: editFormData.name.trim(),
          category: editFormData.category,
          unit: fmtUnit(editFormData.unit),
          stock: after,
          minStock: minStockNum,
          expiry: editFormData.expiry || '',
          expiryDate: editFormData.expiry || '',
          status: deriveStockStatus({ stock: after, minStock: minStockNum }),
          updatedAt: Date.now(),
        };
        tx.update(ref, data);
        return { ...data, before, prev: snap.data() };
      });
      logActivity({ action: 'inventory.update', collection: 'inventory', docId: open.id,
        summary: `Updated ${updated.name}: stock ${updated.before} → ${updated.stock} vials`,
        changes: diffFields(updated.prev, updated, ['name', 'category', 'unit', 'stock', 'minStock', 'expiry']) });
      setShowEditModal(false);
      setSelectedItem(null);
      showToast(`${updated.name} updated. Stock: ${updated.before} → ${updated.stock} vials.`, 'success');
    } catch (err) {
      if (err?.code === 'negative') showToast(err.message, 'error');
      else { console.error('Inventory edit error:', err); showToast('Could not save the changes. Nothing was changed. Please try again.', 'error'); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <style>{globalCSS}</style>

      {/* Stats Row */}
      {(() => {
        const stats = [
          { label: 'Total Items', value: inventory.length, sub: 'Active inventory items', icon: Package },
          // Same rule as each row's Status badge (stock vs that item's own
          // minimum), so the counts match what the table shows.
          { label: 'Low Stock', value: inventory.filter(i => deriveStockStatus(i) === 'low-stock').length, sub: 'Reorder recommended', icon: AlertCircle },
          { label: 'Out of Stock', value: inventory.filter(i => deriveStockStatus(i) === 'out-of-stock').length, sub: 'Still listed, needs restocking', icon: XCircle },
        ];
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {stats.map((s, i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-xl py-2.5 px-4 sm:py-3 sm:px-4.5 flex items-center gap-3.5 shadow-2xs hover:shadow-xs transition-all">
                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                  <s.icon size={16} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold text-slate-900 leading-none tabular-nums">{s.value}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-1 truncate">{s.label}</p>
                  <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Main Clean Table Card Container ── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', position: 'relative', zIndex: 10 }}>

        {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 280 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '22rem', minWidth: '16rem' }}>
              <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: .4, pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="text"
                placeholder="Search inventory items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '.8125rem', border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', outline: 'none' }}
              />
            </div>

            {/* Filter: category, stock level, expiring soon */}
            <div ref={filterMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setFilterMenuOpen(o => !o)}
                aria-expanded={filterMenuOpen}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                  fontSize: '.78125rem', fontWeight: 600,
                  border: activeFilterCount ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                  borderRadius: '.5rem',
                  background: activeFilterCount ? '#EEF2FF' : '#FFFFFF',
                  color: activeFilterCount ? '#3B50DF' : '#0F172A',
                  cursor: 'pointer'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                {activeFilterCount ? `Filter · ${activeFilterCount}` : 'Filter'}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>

              {filterMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 215, maxHeight: '400px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                  <div style={menuHeadStyle}>Category</div>
                  {[{ key: 'all', label: 'All categories' }, ...categories.map(c => ({ key: c, label: c }))].map(opt => (
                    <button key={opt.key} type="button" onClick={() => setCategoryFilter(opt.key)} style={menuItemStyle(categoryFilter === opt.key)}>
                      {opt.label}
                      {categoryFilter === opt.key && <CheckMark />}
                    </button>
                  ))}

                  <div style={{ margin: '4px 0', borderTop: '1px solid #F1F5F9' }} />
                  <div style={menuHeadStyle}>Stock status</div>
                  {STOCK_FILTERS.map(opt => (
                    <button key={opt.key} type="button" onClick={() => setStockFilter(opt.key)} style={menuItemStyle(stockFilter === opt.key)}>
                      {opt.label}
                      {stockFilter === opt.key && <CheckMark />}
                    </button>
                  ))}

                  <div style={{ margin: '4px 0', borderTop: '1px solid #F1F5F9' }} />
                  <div style={menuHeadStyle}>Expiry</div>
                  <button type="button" onClick={() => setExpiringOnly(v => !v)} style={menuItemStyle(expiringOnly)} aria-pressed={expiringOnly}>
                    Expiring within {EXPIRING_SOON_DAYS} days
                    {expiringOnly && <CheckMark />}
                  </button>

                  {activeFilterCount > 0 && (
                    <>
                      <div style={{ margin: '4px 0', borderTop: '1px solid #F1F5F9' }} />
                      <button type="button"
                        onClick={() => { setCategoryFilter('all'); setStockFilter('all'); setExpiringOnly(false); setFilterMenuOpen(false); }}
                        style={{ ...menuItemStyle(false), color: '#64748B', fontWeight: 600 }}
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Sort by */}
            <div ref={sortMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSortMenuOpen(o => !o)}
                aria-expanded={sortMenuOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '.78125rem', fontWeight: 600, border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
                Sort by
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>

              {sortMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 200, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.key} type="button"
                      onClick={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                      style={{ ...menuItemStyle(false), padding: '7px 8px', fontWeight: sortBy === opt.key ? 700 : 500 }}
                    >
                      {opt.label}
                      {sortBy === opt.key && <CheckMark />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.78125rem', fontWeight: 600, padding: '7px 12px', border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
            >
              <Download size={13} />
              Export Report
            </button>

            <button
              type="button"
              onClick={() => { setFormData(EMPTY_ITEM()); addV.clear(); setShowAddModal(true); }}
              style={{
                background: '#6366F1', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '.5rem',
                fontWeight: 700, fontSize: '.78125rem', display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 4px rgba(99,102,241,0.2)', cursor: 'pointer'
              }}
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>
        </div>

        {/* ── Table Area ── */}
        <div ref={tableAreaRef} style={{ overflowX: 'auto', minHeight: filtered.length ? tableReserve : undefined }}>
          <table className="kna-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>
                <th style={{ padding: '16px 12px 16px 20px', width: '33%', fontWeight: 600, color: '#64748B' }}>Item Name</th>
                <th style={{ padding: '16px 12px', width: '16%', fontWeight: 600, color: '#64748B' }}>Category</th>
                <th style={{ padding: '16px 12px', width: '14%', fontWeight: 600, color: '#64748B' }}>Stock</th>
                <th style={{ padding: '16px 12px', width: '15%', fontWeight: 600, color: '#64748B' }}>Expiry</th>
                <th style={{ padding: '16px 12px', width: '14%', fontWeight: 600, color: '#64748B' }}>Status</th>
                <th style={{ padding: '16px 20px 16px 12px', width: '96px', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(item => (
                <tr
                  key={item.id}
                  style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', transition: 'background .12s ease', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                >
                  <td style={{ padding: '16px 12px 16px 20px', fontWeight: 600, color: '#0F172A', fontSize: '.8125rem' }}>
                    {item.name}
                  </td>
                  <td style={{ padding: '16px 12px', color: '#475569', fontWeight: 500 }}>
                    {inventoryCategoryLabel(item, { short: true })}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ fontWeight: 500, color: deriveStockStatus(item) === 'out-of-stock' ? '#DC2626' : '#0F172A', fontSize: '.875rem' }}>
                      {formatVials(item)}
                    </span>
                  </td>
                  <td style={{ padding: '16px 12px', color: '#64748B', fontWeight: 400 }}>
                    {item.expiry || '—'}
                    {isExpired(item, today) ? (
                      <span style={{ display: 'block', fontSize: '.6875rem', fontWeight: 600, color: '#DC2626', marginTop: 2 }}>
                        Expired
                      </span>
                    ) : isExpiringSoon(item) ? (
                      <span style={{ display: 'block', fontSize: '.6875rem', fontWeight: 600, color: '#D97706', marginTop: 2 }}>
                        Expiring soon
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    {(() => {
                      const st = deriveStockStatus(item);
                      // Expired stock cannot be used, so it reads like out of stock.
                      const expired = isExpired(item, today);
                      const isOut = expired || st === 'out-of-stock';
                      const isLow = st === 'low-stock';
                      const bg = isOut ? '#FEF2F2' : isLow ? '#FFFBEB' : '#ECFDF5';
                      const color = isOut ? '#DC2626' : isLow ? '#D97706' : '#059669';
                      const border = isOut ? '1px solid #FCA5A5' : isLow ? '1px solid #FDE68A' : '1px solid #A7F3D0';
                      return (
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600, whiteSpace: 'nowrap',
                          background: bg,
                          color: color,
                          border: border
                        }}>
                          {expired ? 'Expired' : deriveStockLabel(item)}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '16px 20px 16px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      <IconButton icon={Edit3} label={`Edit ${item.name || 'item'}`} bordered onClick={() => openEditModal(item)} />
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <EmptyState icon={Package} title="No items found" text="Try a different search or filter, or add a new item." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' }}>
          <Pager page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
        </div>
      </div>

      {/* ── Add Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showAddModal && (
        <Modal onClose={requestCloseAdd}>
          {addDiscardDialog}
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Add Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Fill in the details for the new vaccine or supply item</p>
              </div>
              <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={requestCloseAdd} />
            </div>

            {/* Form Body */}
            <div className="kna-form-body">
              <div>
                <label htmlFor="inv-name" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  {...addV.field('name')}
                  placeholder="e.g. BCG Vaccine"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none transition-all"
                />
                <FieldError v={addV} name="name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="inv-category" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category <span className="text-red-500">*</span></label>
                  <Select
                    {...addV.field('category', { withBlur: false })}
                    value={formData.category}
                    onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="">Select category</option>
                    {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                  <FieldError v={addV} name="category" />
                </div>
                <div>
                  <label htmlFor="inv-unit" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit <span className="text-red-500">*</span></label>
                  <Select
                    {...addV.field('unit', { withBlur: false })}
                    value={formData.unit}
                    onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="">Select unit</option>
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </Select>
                  <FieldError v={addV} name="unit" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inv-stock" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Vials in stock <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    {...addV.field('stock')}
                    min="0"
                    placeholder="0"
                    value={formData.stock}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                  <FieldError v={addV} name="stock" />
                </div>
                <div>
                  <label htmlFor="inv-minStock" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Min Threshold <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    {...addV.field('minStock')}
                    min="1"
                    placeholder="e.g. 10"
                    value={formData.minStock || ''}
                    onChange={e => setFormData(f => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                  <FieldError v={addV} name="minStock" />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Expiry Date</label>
                  <DatePicker
                    value={formData.expiry}
                    onChange={e => setFormData(f => ({ ...f, expiry: e.target.value }))}
                    clearable
                    aria-label="Expiry date"
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="kna-form-footer bg-white flex items-center gap-3 border-t border-slate-100">
              <button
                onClick={requestCloseAdd}
                disabled={saving}
                className={`${BTN.outline} flex-1`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`${BTN.primary} flex-1`}
              >
                <Plus size={BTN_ICON} /> {saving ? 'Saving Item…' : 'Save Item'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showEditModal && selectedItem && (
        <Modal onClose={requestCloseEdit}>
          {editDiscardDialog}
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Edit Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Update details for <span className="font-bold text-slate-700">{selectedItem.name}</span></p>
              </div>
              
              <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={requestCloseEdit} />
            </div>

            {/* Form Body */}
            <div className="kna-form-body">
              <div>
                <label htmlFor="invedit-name" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  {...editV.field('name')}
                  placeholder="e.g. BCG Vaccine"
                  value={editFormData.name}
                  onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none transition-all"
                />
                <FieldError v={editV} name="name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="invedit-category" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category <span className="text-red-500">*</span></label>
                  <Select
                    {...editV.field('category', { withBlur: false })}
                    value={editFormData.category}
                    onChange={e => setEditFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="">Select category</option>
                    {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                  <FieldError v={editV} name="category" />
                </div>
                <div>
                  <label htmlFor="invedit-unit" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit <span className="text-red-500">*</span></label>
                  <Select
                    {...editV.field('unit', { withBlur: false })}
                    value={editFormData.unit}
                    onChange={e => setEditFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="">Select unit</option>
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </Select>
                  <FieldError v={editV} name="unit" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="invedit-stock" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Vials in stock <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    {...editV.field('stock')}
                    min="0"
                    placeholder="0"
                    value={editFormData.stock}
                    onChange={e => setEditFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                  <FieldError v={editV} name="stock" />
                </div>
                <div>
                  <label htmlFor="invedit-minStock" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Min Threshold <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    {...editV.field('minStock')}
                    min="1"
                    value={editFormData.minStock || ''}
                    onChange={e => setEditFormData(f => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                  <FieldError v={editV} name="minStock" />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Expiry Date</label>
                  <DatePicker
                    value={editFormData.expiry}
                    onChange={e => setEditFormData(f => ({ ...f, expiry: e.target.value }))}
                    clearable
                    aria-label="Expiry date"
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="kna-form-footer bg-white flex items-center gap-3 border-t border-slate-100">
              <button
                onClick={requestCloseEdit}
                className={`${BTN.outline} flex-1`}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                className={`${BTN.primary} flex-1`}
              >
                <Check size={BTN_ICON} /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Export Report Modal ── */}
      {showExportModal && (
        <ExportInventoryModal
          inventory={inventory}
          onClose={() => setShowExportModal(false)}
          onToast={showToast}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    </div>
  );
}
