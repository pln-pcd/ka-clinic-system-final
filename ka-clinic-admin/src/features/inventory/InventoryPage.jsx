import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import { AlertCircle, Check, Download, Edit3, Minus, Package, Plus, X, XCircle } from 'lucide-react';
import IconButton from '../../components/IconButton';
import EmptyState from '../../components/EmptyState';
import DatePicker from '../../components/DatePicker';
import { BTN, BTN_ICON } from '../../lib/buttons';
import { FieldError, useFieldErrors } from '../../components/FormValidation';

// Add / Edit item checks, shown inline under each field.
const INV_RULES = {
  name: f => (f.name.trim() ? '' : 'Enter the item name'),
  stock: f => (String(f.stock).trim() === '' ? 'Enter the stock on hand'
    : !/^\d+$/.test(String(f.stock).trim()) ? 'Use a whole number, 0 or more' : ''),
  category: f => (f.category ? '' : 'Choose a category'),
  unit: f => (f.unit ? '' : 'Choose a unit'),
  minStock: f => (!String(f.minStock || '').trim() ? 'Enter the low-stock threshold'
    : !/^[1-9]\d*$/.test(String(f.minStock).trim()) ? 'Use a whole number, 1 or more' : ''),
};
const INV_FIELDS = ['name', 'category', 'unit', 'stock', 'minStock'];
// A new item starts blank (grey placeholders); nothing is pre-chosen.
const EMPTY_ITEM = () => ({ name: '', category: '', unit: '', stock: '', minStock: '', expiry: '' });
const INV_EDIT_FIELDS = ['name', 'stock'];
import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { peekLiveCollection, useLiveCollection } from '../../lib/liveStore';
import Toast from '../../components/Toast';
import { deriveStockLabel, deriveStockStatus, fmtUnit } from '../../lib/inventoryStock';
import { lazyModal } from '../../components/LazyModal';

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
  const addV = useFieldErrors(INV_RULES, formData, 'inv');
  const editV = useFieldErrors(INV_RULES, editFormData, 'invedit');

  // Use stock modal state
  const [showUseStockModal, setShowUseStockModal] = useState(false);
  const [useStockQty, setUseStockQty] = useState(1);

  // Shared live inventory (lib/liveStore.js).
  const invLive = useLiveCollection('inventory');
  useEffect(() => { setInventory(invLive.rows); }, [invLive]);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filtered = inventory.filter(item => {
    return (item.name || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());
  });

  /* ── Add Item ── */
  const handleSave = async () => {
    if (!addV.validate(INV_FIELDS)) return;
    setSaving(true);
    try {
      const stockNum = Number(formData.stock) || 0;
      const minStockNum = Number(formData.minStock);
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
        status: stockNum <= 0 ? 'critical' : stockNum <= minStockNum ? 'warning' : 'in-stock',
        createdAt: Date.now()
      };
      await addDoc(collection(db, 'inventory'), newItem);
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
  const openEditModal = (item) => {
    setSelectedItem(item);
    setEditFormData({
      name: item.name || '',
      category: item.category || 'Vaccine',
      unit: item.unit || 'Vials',
      stock: String(item.stock ?? ''),
      minStock: String(item.minStock ?? 10),
      expiry: item.expiry || item.expiryDate || ''
    });
    editV.clear();
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedItem || !editV.validate(INV_EDIT_FIELDS)) return;
    setSaving(true);
    try {
      const stockNum = Number(editFormData.stock) || 0;
      const minStockNum = Number(editFormData.minStock) || 10;
      const selectedCapitalizedUnit = fmtUnit(editFormData.unit || 'Vials');
      const expirationDate = editFormData.expiry || '';

      const updated = {
        name: editFormData.name.trim(),
        category: editFormData.category,
        unit: selectedCapitalizedUnit,
        stock: stockNum,
        minStock: minStockNum,
        expiry: expirationDate,
        expiryDate: expirationDate,
        status: stockNum <= 0 ? 'critical' : stockNum <= minStockNum ? 'warning' : 'in-stock',
      };
      await updateDoc(doc(db, 'inventory', selectedItem.id), updated);
      setShowEditModal(false);
      setSelectedItem(null);
      showToast(`${updated.name} updated`, 'success');
    } catch (err) {
      console.error('Inventory edit error:', err);
      showToast('Could not save the changes. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Use Stock (reduce) ── */
  const openUseStockModal = (item) => {
    setSelectedItem(item);
    setUseStockQty(1);
    setShowUseStockModal(true);
  };

  const handleUseStock = () => {
    if (!selectedItem) return;
    const currentStock = parseInt(selectedItem.stock) || 0;
    const qty = parseInt(useStockQty) || 0;
    if (qty <= 0 || qty > currentStock) return;
    const newStock = currentStock - qty;
    const minStock = parseInt(selectedItem.minStock, 10) || 10;
    const name = selectedItem.name;
    setShowUseStockModal(false);
    setSelectedItem(null);
    updateDoc(doc(db, 'inventory', selectedItem.id), {
      stock: newStock,
      status: newStock <= 0 ? 'critical' : newStock <= minStock ? 'warning' : 'in-stock',
    })
      .then(() => showToast(`${name} stock updated to ${newStock}`, 'success'))
      .catch(err => {
        console.error('Use stock error:', err);
        showToast('Could not update the stock. Please try again.', 'error');
      });
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
        <div style={{ overflowX: 'auto', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <table className="kna-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                <th style={{ padding: '16px 12px 16px 20px', width: '25%', fontWeight: 600, color: '#64748B' }}>Item Name</th>
                <th style={{ padding: '16px 12px', width: '18%', fontWeight: 600, color: '#64748B' }}>Category</th>
                <th style={{ padding: '16px 12px', width: '18%', fontWeight: 600, color: '#64748B' }}>Stock</th>
                <th style={{ padding: '16px 12px', width: '17%', fontWeight: 600, color: '#64748B' }}>Expiry</th>
                <th style={{ padding: '16px 12px', width: '12%', fontWeight: 600, color: '#64748B' }}>Status</th>
                <th style={{ padding: '16px 20px 16px 12px', width: '120px', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
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
                    {item.category}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    {/* An item at zero stays listed; the red count and the
                        Out of Stock badge mark it for restocking. */}
                    <span style={{ fontWeight: 700, color: deriveStockStatus(item) === 'out-of-stock' ? '#DC2626' : '#0F172A' }}>{parseInt(item.stock, 10) || 0}</span>
                    <span style={{ fontSize: '.6875rem', color: '#64748B', fontWeight: 600, marginLeft: 4 }}>{fmtUnit(item.unit)}</span>
                  </td>
                  <td style={{ padding: '16px 12px', color: '#64748B', fontWeight: 400 }}>
                    {item.expiry || '—'}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    {(() => {
                      const st = deriveStockStatus(item);
                      const isOut = st === 'out-of-stock';
                      const isLow = st === 'low-stock';
                      const bg = isOut ? '#FEF2F2' : isLow ? '#FFFBEB' : '#ECFDF5';
                      const color = isOut ? '#DC2626' : isLow ? '#D97706' : '#059669';
                      const border = isOut ? '1px solid #FCA5A5' : isLow ? '1px solid #FDE68A' : '1px solid #A7F3D0';
                      return (
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600,
                          background: bg,
                          color: color,
                          border: border
                        }}>
                          {deriveStockLabel(item)}
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
      </div>

      {/* ── Add Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showAddModal && (
        <Modal onClose={() => { setShowAddModal(false); setFormData(EMPTY_ITEM()); }}>
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Add Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Fill in the details for the new vaccine or supply item</p>
              </div>
              <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={() => { setShowAddModal(false); setFormData(EMPTY_ITEM()); }} />
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
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
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
                  <label htmlFor="inv-stock" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Stock <span className="text-red-500">*</span></label>
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
                onClick={() => { setShowAddModal(false); setFormData(EMPTY_ITEM()); }}
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
        <Modal onClose={() => { setShowEditModal(false); setSelectedItem(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Edit Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Update details for <span className="font-bold text-slate-700">{selectedItem.name}</span></p>
              </div>
              
              <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={() => { setShowEditModal(false); setSelectedItem(null); }} />
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
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category</label>
                  <Select
                    value={editFormData.category}
                    onChange={e => setEditFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </Select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit</label>
                  <Select
                    value={editFormData.unit}
                    onChange={e => setEditFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="invedit-stock" className="text-[13px] font-semibold text-slate-600 block mb-1.5">Stock Quantity <span className="text-red-500">*</span></label>
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
                onClick={() => { setShowEditModal(false); setSelectedItem(null); }}
                className={`${BTN.outline} flex-1`}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                className={`${BTN.primary} flex-1`}
              >
                <Check size={BTN_ICON} /> Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Use Stock Modal (Portaled to body) ── */}
      {showUseStockModal && selectedItem && (
        <Modal onClose={() => { setShowUseStockModal(false); setSelectedItem(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Minus size={24} />
                </div>
                <h2 className="text-base font-bold text-gray-900">Use Stock</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Reduce stock for <span className="font-bold text-gray-600">{selectedItem.name}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Current stock: <span className="font-black text-gray-700">{selectedItem.stock}</span> {fmtUnit(selectedItem.unit)}
                </p>
              </div>
              <div className="mb-4">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Quantity to Use <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  max={selectedItem.stock}
                  value={useStockQty}
                  onChange={e => setUseStockQty(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-center focus:ring-1 focus:ring-amber-500 outline-none"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Remaining after use: <span className="font-bold text-gray-600">{Math.max(0, (parseInt(selectedItem.stock) || 0) - (parseInt(useStockQty) || 0))}</span> {fmtUnit(selectedItem.unit)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowUseStockModal(false); setSelectedItem(null); }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUseStock}
                  disabled={(parseInt(useStockQty) || 0) <= 0 || (parseInt(useStockQty) || 0) > (parseInt(selectedItem.stock) || 0)}
                  className="flex-1 py-2.5 text-white rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#F59E0B' }}
                >
                  <Minus size={13} /> Confirm
                </button>
              </div>
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
