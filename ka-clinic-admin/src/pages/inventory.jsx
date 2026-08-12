// kna-admin/src/inventory.jsx
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { AlertCircle, Check, Download, Edit3, FileText, Minus, Package, Plus, Search, Trash2, X, XCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { db } from '../lib/firebase';

/* ─────────────────────────── CSS ─────────────────────────── */
const globalCSS = `
  :root {
    --primary-red: #C8151A;
    --red-hover: #A81015;
    --bg-main: #FAF9F9;
    --bg-card: #FFFFFF;
    --text-main: #1C1C1E;
    --text-muted: #7A6E6E;
    --border: #E8E2E2;
    --radius-lg: 10px;
  }

  body { font-family: 'Roboto', system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text-main); }

  .btn-add {
    background: var(--primary-red);
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
  .btn-add:hover { background: var(--red-hover); }

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
  .export-option:hover { border-color: #C8151A; background: #FFF8F8; }
  .export-option-selected { border-color: #C8151A !important; background: #FFF0F0 !important; }
`;

/* ─────────────────────────── HELPERS ─────────────────────────── */
const liveStatus = item => (parseInt(item.stock) || 0) <= 0 ? 'out-of-stock' : 'in-stock';

const today = () => new Date().toISOString().slice(0, 10);

const fmtUnit = (u) => u ? u.charAt(0).toUpperCase() + u.slice(1) : '';

const exportCSV = (rows, filename) => {
  const headers = ['Item Name', 'Category', 'Stock', 'Unit', 'Expiry', 'Status'];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.name}"`,
      `"${r.category}"`,
      r.stock,
      `"${fmtUnit(r.unit)}"`,
      `"${r.expiry || ''}"`,
      liveStatus(r) === 'in-stock' ? 'In Stock' : 'Out of Stock',
    ].join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportXLS = (rows, filename) => {
  const headers = ['Item Name', 'Category', 'Stock', 'Unit', 'Expiry', 'Status'];
  const tableRows = rows.map(r => `<tr>
    <td>${r.name}</td><td>${r.category}</td><td>${r.stock}</td><td>${fmtUnit(r.unit)}</td>
    <td>${r.expiry || ''}</td><td>${liveStatus(r) === 'in-stock' ? 'In Stock' : 'Out of Stock'}</td>
  </tr>`).join('');
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportPDF = (rows) => {
  const w = window.open('', '_blank');
  const tableRows = rows.map((r, i) => `<tr>
    <td>${i + 1}</td><td>${r.name}</td><td>${r.category}</td><td>${r.stock} ${fmtUnit(r.unit)}</td>
    <td>${r.expiry || '—'}</td><td>${liveStatus(r) === 'in-stock' ? 'In Stock' : 'Out of Stock'}</td>
  </tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Inventory Stock Report</title>
  <style>
    body{font-family:'Roboto',sans-serif;color:#0F172A;padding:24px;margin:0;}
    h1{font-size:18px;margin:0 0 4px;color:#0F172A;}
    .sub{font-size:11px;color:#64748B;margin-bottom:20px;}
    table{width:100%;border-collapse:collapse;font-size:11px;}
    th{background:#FAFAFA;border:1px solid #E2E8F0;padding:8px 10px;text-align:left;color:#64748B;font-size:9.5px;text-transform:uppercase;}
    td{border:1px solid #E2E8F0;padding:8px 10px;}
    tr:nth-child(even) td{background:#FAFAFA;}
  </style></head><body>
  <h1>K&A Clinic — Inventory Stock Report</h1>
  <div class="sub">Generated: ${new Date().toLocaleString()} | Total Items: ${rows.length}</div>
  <table><thead><tr><th>#</th><th>Item Name</th><th>Category</th><th>Stock</th><th>Expiry</th><th>Status</th></tr></thead>
  <tbody>${tableRows}</tbody></table></body></html>`);
  w.document.close();
  w.print();
};

/* ─────────────────────────── COMPONENT ─────────────────────────── */
export default function VaccineInventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPeriod, setExportPeriod] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv'); // 'csv' | 'xls' | 'pdf'
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Use stock modal state
  const [showUseStockModal, setShowUseStockModal] = useState(false);
  const [useStockQty, setUseStockQty] = useState(1);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'), limit(20));
    return onSnapshot(q, snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const catMenuRef = useRef(null);
  useEffect(() => {
    const handler = e => {
      if (catMenuRef.current && !catMenuRef.current.contains(e.target)) setCatMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  /* ── Add Item ── */
  const handleSave = async () => {
    if (!formData.name || !formData.stock) return;
    setSaving(true);
    try {
      const stockNum = Number(formData.stock) || 0;
      const minStockNum = Number(formData.minStock) || 10;
      const selectedCapitalizedUnit = fmtUnit(formData.unit || 'Vials');
      const expirationDate = formData.expiry || '';

      const newItem = {
        name: formData.name.trim(),
        category: formData.category || 'Vaccine',
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
      setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });
    } catch (err) {
      console.error('Inventory add error:', err);
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
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedItem || !editFormData.name || editFormData.stock === '') return;
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
    } catch (err) {
      console.error('Inventory edit error:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete Item ── */
  const handleDelete = () => {
    if (!deleteConfirm) return;
    const itemId = deleteConfirm.id;
    setDeleteConfirm(null);
    deleteDoc(doc(db, 'inventory', itemId)).catch(err => {
      console.error('Inventory delete error:', err);
    });
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
    setShowUseStockModal(false);
    setSelectedItem(null);
    updateDoc(doc(db, 'inventory', selectedItem.id), { stock: newStock }).catch(err => {
      console.error('Use stock error:', err);
    });
  };

  /* ── Export helpers ── */
  const periods = [
    { key: 'daily', label: 'Daily Report', sub: 'Items added today' },
    { key: 'weekly', label: 'Weekly Report', sub: 'Items added this week' },
    { key: 'monthly', label: 'Monthly Report', sub: 'Items added this month' },
    { key: 'yearly', label: 'Yearly Report', sub: 'Items added this year' },
    { key: 'all', label: 'Full Report', sub: 'All inventory items' },
  ];

  const getExportRows = () => {
    const now = new Date();
    const cutoff = {
      all: null,
      daily: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
      weekly: (() => { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d.getTime(); })(),
      monthly: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      yearly: new Date(now.getFullYear(), 0, 1).getTime(),
    }[exportPeriod];
    return cutoff ? inventory.filter(i => (i.createdAt || 0) >= cutoff) : inventory;
  };

  const handleExport = () => {
    const rows = getExportRows();
    const label = periods.find(p => p.key === exportPeriod)?.label.replace(' ', '-') || exportPeriod;
    if (exportFormat === 'csv') {
      exportCSV(rows, `inventory-${label}-${today()}.csv`);
    } else if (exportFormat === 'xls') {
      exportXLS(rows, `inventory-${label}-${today()}.xls`);
    } else if (exportFormat === 'pdf') {
      exportPDF(rows);
    }
    setShowExportModal(false);
  };

  const exportRowCount = getExportRows().length;

  return (
    <div className="p-4">
      <style>{globalCSS}</style>

      {/* Stats Row */}
      {(() => {
        const stats = [
          { label: 'Total Items', value: inventory.length, icon: Package },
          { label: 'Low Stock', value: inventory.filter(i => i.stock < 10 && i.stock > 0).length, icon: AlertCircle },
          { label: 'Out of Stock', value: inventory.filter(i => i.stock <= 0).length, icon: XCircle },
        ];
        return (
          <div className="grid grid-cols-3 gap-4 mb-4">
            {stats.map((s, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50 border border-slate-200">
                    <s.icon size={18} strokeWidth={2} color="#475569" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{s.value}</p>
                    <p className="text-xs font-medium text-gray-500 mt-1">{s.label}</p>
                  </div>
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

          {/* Category Filter & Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            
            {/* Custom Category Dropdown (styled identically to Patients / Vaccination Filter) */}
            <div ref={catMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCatMenuOpen(o => !o)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '.78125rem', fontWeight: 600, border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                {categoryFilter === 'All' ? 'All Categories' : categoryFilter}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>

              {catMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 180, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 6, zIndex: 99 }}>
                  {[
                    { key: 'All', label: 'All Categories' },
                    { key: 'Vaccine', label: 'Vaccines' },
                    { key: 'Medicine', label: 'Medicines' },
                    { key: 'Supply', label: 'Supplies' },
                  ].map(opt => (
                    <button key={opt.key} type="button"
                      onClick={() => { setCategoryFilter(opt.key); setCatMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#334155', fontSize: '.78125rem', fontWeight: categoryFilter === opt.key ? 700 : 500, cursor: 'pointer' }}
                    >
                      {opt.label}
                      {categoryFilter === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
              onClick={() => setShowAddModal(true)}
              style={{
                background: '#E31837', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '.5rem',
                fontWeight: 700, fontSize: '.78125rem', display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 4px rgba(227,24,55,0.2)', cursor: 'pointer'
              }}
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>
        </div>

        {/* ── Table Area ── */}
        <div style={{ overflowX: 'auto', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
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
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.stock}</span>
                    <span style={{ fontSize: '.6875rem', color: '#64748B', fontWeight: 600, marginLeft: 4 }}>{fmtUnit(item.unit)}</span>
                  </td>
                  <td style={{ padding: '16px 12px', color: '#64748B', fontWeight: 400 }}>
                    {item.expiry || '—'}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600,
                      background: liveStatus(item) === 'in-stock' ? '#ECFDF5' : '#FEF2F2',
                      color: liveStatus(item) === 'in-stock' ? '#059669' : '#DC2626',
                      border: liveStatus(item) === 'in-stock' ? '1px solid #A7F3D0' : '1px solid #FCA5A5'
                    }}>
                      {liveStatus(item) === 'in-stock' ? 'In Stock' : 'Empty'}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px 16px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit Item"
                        onClick={() => openEditModal(item)}
                        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Delete Item"
                        onClick={() => setDeleteConfirm(item)}
                        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>No items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Item Modal (Bigger 580px card + Dark Navy Header Banner + Simple X Icon) ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Dark Navy Header Banner */}
            <div style={{ background: '#1E293B', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white margin-0 leading-tight">Add Inventory Item</h2>
                  <p className="text-[11px] text-slate-300 font-medium mt-0.5">Fill in the details for the new vaccine or supply item</p>
                </div>
              </div>
              {/* Simple X Icon (No background circle) */}
              <button onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }} className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer" title="Close">
                <X size={20} />
              </button>
            </div>

            {/* Form Body (Smaller text) */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. BCG Vaccine"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  >
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Stock <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stock}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Min Threshold</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={formData.minStock || ''}
                    onChange={e => setFormData(f => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiry}
                    onChange={e => setFormData(f => ({ ...f, expiry: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 bg-white flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }}
                disabled={saving}
                className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name || !formData.stock}
                className="px-5 py-2 text-white bg-[#C8151A] hover:bg-red-700 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              >
                <Plus size={14} /> {saving ? 'Saving Item…' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Item Modal (Bigger 580px card + Dark Navy Header Banner + Simple X Icon) ── */}
      {showEditModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowEditModal(false); setSelectedItem(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Dark Navy Header Banner */}
            <div style={{ background: '#1E293B', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white margin-0 leading-tight">Edit Inventory Item</h2>
                  <p className="text-[11px] text-slate-300 font-medium mt-0.5">Update details for <span className="font-bold text-white">{selectedItem.name}</span></p>
                </div>
              </div>
              {/* Simple X Icon (No background circle) */}
              <button onClick={() => { setShowEditModal(false); setSelectedItem(null); }} className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer" title="Close">
                <X size={20} />
              </button>
            </div>

            {/* Form Body (Smaller text) */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. BCG Vaccine"
                  value={editFormData.name}
                  onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Category</label>
                  <select
                    value={editFormData.category}
                    onChange={e => setEditFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Unit</label>
                  <select
                    value={editFormData.unit}
                    onChange={e => setEditFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  >
                    <option value="Vials">Vials</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Pcs">Pcs</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Stock Quantity <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.stock}
                    onChange={e => setEditFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={editFormData.expiry}
                    onChange={e => setEditFormData(f => ({ ...f, expiry: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer — No border divider line */}
            <div className="px-6 pb-6 pt-2 bg-white flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowEditModal(false); setSelectedItem(null); }}
                className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editFormData.name || !editFormData.stock}
                className="px-5 py-2 text-white bg-[#C8151A] hover:bg-red-700 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Check size={14} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ border: '1.5px solid #FECACA' }}>
                <Trash2 size={24} color="#DC2626" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Delete Item?</h2>
              <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-gray-600">"{deleteConfirm.name}"</span>? This action cannot be undone.
              </p>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Use Stock Modal ── */}
      {showUseStockModal && selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl">
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
        </div>
      )}

      {/* ── Export Report Modal (Landscape Pop-up Card with Dark Header) ── */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 700, boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            
            {/* Dark Navy Header Bar */}
            <div style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>Export Inventory Report</h3>
                <p style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.65)', margin: '3px 0 0' }}>Generate and download inventory stock reports</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'rgba(255,255,255,0.12)', color: '#FFFFFF',
                  fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24 }}>

            {/* Selection Grid (Landscape side-by-side) */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
              {/* Period selection in 2-column grid */}
              <div style={{ flex: '1.4 1 0' }}>
                <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#64748B', marginBottom: 8 }}>Reporting Period</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { key: 'all', label: 'All Items', desc: 'Full database' },
                    { key: 'daily', label: 'Daily', desc: 'Added today' },
                    { key: 'weekly', label: 'Weekly', desc: 'Last 7 days' },
                    { key: 'monthly', label: 'Monthly', desc: 'This month' },
                    { key: 'yearly', label: 'Yearly', desc: 'This year' },
                  ].map(p => (
                    <button key={p.key} type="button"
                      onClick={() => setExportPeriod(p.key)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${exportPeriod === p.key ? '#C8151A' : '#E2E8F0'}`,
                        background: exportPeriod === p.key ? 'rgba(200,21,26,0.03)' : '#FFFFFF',
                        boxShadow: exportPeriod === p.key ? '0 0 0 3px rgba(200,21,26,0.08)' : 'none',
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '.8125rem', fontWeight: exportPeriod === p.key ? 700 : 600, color: '#0F172A' }}>{p.label}</div>
                        <div style={{ fontSize: '.6875rem', color: '#64748B', marginTop: 1 }}>{p.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: '#E2E8F0' }} />

              {/* Format selection */}
              <div style={{ flex: '1 1 0' }}>
                <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#64748B', marginBottom: 8 }}>Export Format</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { key: 'csv', label: 'CSV Spreadsheet' },
                    { key: 'xls', label: 'Excel (XLS)' },
                    { key: 'pdf', label: 'PDF Document' },
                  ].map(f => (
                    <button key={f.key} type="button"
                      onClick={() => setExportFormat(f.key)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${exportFormat === f.key ? '#C8151A' : '#E2E8F0'}`,
                        background: exportFormat === f.key ? 'rgba(200,21,26,0.03)' : '#FFFFFF',
                        boxShadow: exportFormat === f.key ? '0 0 0 3px rgba(200,21,26,0.08)' : 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit'
                      }}
                    >
                      <FileText size={14} color={exportFormat === f.key ? '#C8151A' : '#94A3B8'} />
                      <span style={{ fontSize: '.78125rem', fontWeight: exportFormat === f.key ? 700 : 600, color: '#0F172A' }}>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '.78125rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exportRowCount === 0}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none', background: '#E31837', color: '#FFFFFF',
                  fontSize: '.78125rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(227,24,55,0.2)', opacity: exportRowCount === 0 ? 0.5 : 1
                }}
              >
                <Download size={14} />
                Export {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

    </div>
  );
}