// kna-admin/src/inventory.jsx
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { AlertCircle, Check, Download, Edit3, FileText, Minus, Package, Plus, Search, X, XCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { today, getTodayDateString } from '../lib/dates';

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

/* ─────────────────────────── HELPERS ─────────────────────────── */
const liveStatus = item => (parseInt(item.stock) || 0) <= 0 ? 'out-of-stock' : 'in-stock';

const fmtUnit = (u) => u ? u.charAt(0).toUpperCase() + u.slice(1) : '';

const INVENTORY_HEADERS = ['Item Name', 'Category', 'Stock', 'Unit', 'Expiry', 'Status'];

const statusLabel = r => liveStatus(r) === 'in-stock' ? 'In Stock' : 'Out of Stock';

// One source of truth for the report body — official Philippine institutional letterhead format
const buildInventoryReportHtml = (rows, periodLabel) => {
  const tableRows = rows.map((r, i) => `<tr>
    <td style="text-align:center;color:#64748B;">${i + 1}</td>
    <td style="font-weight:700;color:#0F172A;">${r.name}</td>
    <td style="text-align:center;font-weight:600;">${r.category}</td>
    <td style="text-align:center;font-weight:700;color:#0F172A;">${r.stock} ${fmtUnit(r.unit)}</td>
    <td style="text-align:center;">${r.expiry || '—'}</td>
    <td style="text-align:center;font-weight:700;color:${liveStatus(r) === 'in-stock' ? '#15803D' : '#DC2626'};">${statusLabel(r).toUpperCase()}</td>
  </tr>`).join('');

  return `<!DOCTYPE html><html><head><title>Inventory Stock Report</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;color:#0F172A;padding:28px 36px;margin:0;font-size:11.5px;line-height:1.5;background:#FFFFFF;}
    table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #CBD5E1;margin-bottom:20px;}
    th{background:#F1F5F9;border:1px solid #CBD5E1;padding:8px 10px;text-align:left;color:#334155;font-size:9px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;}
    td{border:1px solid #E2E8F0;padding:7px 10px;}
    tr:nth-child(even) td{background:#FAFAFA;}
    .footer{font-size:9px;color:#94A3B8;margin-top:24px;border-top:1px solid #E2E8F0;padding-top:10px;display:flex;justify-content:space-between;align-items:center;}
    @media print{@page{margin:10mm 15mm;}}
  </style></head><body>

  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2px solid #0F172A;margin-bottom:16px;">
    <div style="width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#FAFAFA;border:1px solid #CBD5E1;flex-shrink:0;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B50DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v12M6 12h12"/>
      </svg>
    </div>
    <div style="text-align:center;flex:1;padding:0 16px;font-family:'Plus Jakarta Sans','Inter',-apple-system,sans-serif;">
      <div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:1.2px;text-transform:uppercase;">Republic of the Philippines</div>
      <div style="font-size:18px;font-weight:800;color:#1E293B;margin:2px 0 1px;letter-spacing:-0.01em;">K&amp;A Anti-Rabies Vaccine Clinic</div>
      <div style="font-size:10.5px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;">Animal Bite Treatment Center</div>
      <div style="font-size:9px;color:#64748B;margin-top:3px;">Polangui, Albay &bull; Contact: (052) 486-1220 &bull; Email: knaclinic.ph@gmail.com</div>
    </div>
    <div style="width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#0F172A;border:1px solid #0F172A;flex-shrink:0;">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M12 8v8M8 12h8"/>
      </svg>
    </div>
  </div>

  <div style="text-align:center;margin-bottom:14px;font-size:11px;color:#0F172A;line-height:1.8;">
    <strong>Reporting Period:</strong> <span style="text-decoration:underline;margin-right:16px;">${periodLabel}</span>
    <strong>Date Exported:</strong> <span style="text-decoration:underline;margin-right:16px;">${new Date().toLocaleString('en-PH')}</span>
    <strong>Total Items:</strong> <span style="text-decoration:underline;">${rows.length} Items</span>
  </div>

  <div style="text-align:center;font-size:13.5px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:18px;">
    OFFICIAL INVENTORY STOCK REPORT
  </div>

  <table>
    <thead><tr><th style="text-align:center;">#</th><th>Item Name</th><th style="text-align:center;">Category</th><th style="text-align:center;">Stock Level</th><th style="text-align:center;">Expiration Date</th><th style="text-align:center;">Stock Status</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    <span>K&amp;A Clinic &bull; Official Inventory Stock Report</span>
    <span>Page 1 of 1</span>
  </div>
  </body></html>`;
};

// Excel HTML export helper
const exportXLS = (rows, filename, periodLabel) => {
  const cols = INVENTORY_HEADERS.length;
  const tableRows = rows.map((r, i) => `<tr>
    <td>${i + 1}</td><td>${r.name}</td><td>${r.category}</td><td>${r.stock} ${fmtUnit(r.unit)}</td>
    <td>${r.expiry || ''}</td><td>${statusLabel(r)}</td>
  </tr>`).join('');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
    <style>
      td,th{font-family:Calibri,Arial,sans-serif;font-size:11pt;}
      .brand{font-size:16pt;font-weight:bold;color:#0F172A;}
      .tagline{font-size:9pt;color:#475569;}
      .meta{font-size:10pt;color:#475569;}
      th.col{background:#F1F5F9;font-weight:bold;color:#0F172A;text-align:left;}
    </style></head><body>
    <table border="0">
      <tr><td class="brand" colspan="${cols}">K&amp;A Clinic</td></tr>
      <tr><td class="tagline" colspan="${cols}">Anti-Rabies &amp; Animal Bite Center</td></tr>
      <tr><td class="meta" colspan="${cols}">Inventory Stock Report — ${periodLabel}</td></tr>
      <tr><td class="meta" colspan="${cols}">Generated: ${new Date().toLocaleString('en-PH')} | Total Items: ${rows.length}</td></tr>
      <tr><td colspan="${cols}"></td></tr>
    </table>
    <table border="1"><thead><tr>${INVENTORY_HEADERS.map(h => `<th class="col">${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>
    </body></html>`;
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportPDF = (rows, periodLabel) => {
  const w = window.open('', '_blank');
  w.document.write(buildInventoryReportHtml(rows, periodLabel));
  w.document.close();
  w.print();
};

/* ─────────────────────────── COMPONENT ─────────────────────────── */
export default function VaccineInventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPeriod, setExportPeriod] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf'); // 'xls' | 'pdf'
  const [exportZoomLevel, setExportZoomLevel] = useState(0.85);
  const [exportRotation, setExportRotation] = useState(0);
  // Preview gate — the report is shown in-app before anything is downloaded
  // or sent to the printer. 'form' = pick period/format, 'preview' = review.
  const [exportStep, setExportStep] = useState('form');
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' });

  // Use stock modal state
  const [showUseStockModal, setShowUseStockModal] = useState(false);
  const [useStockQty, setUseStockQty] = useState(1);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    return onSnapshot(q, snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);
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

  const exportPeriodLabel = () => periods.find(p => p.key === exportPeriod)?.label || exportPeriod;

  const handleExport = () => {
    const rows = getExportRows();
    const label = exportPeriodLabel().replace(' ', '-');
    if (exportFormat === 'xls') {
      exportXLS(rows, `inventory-${label}-${today()}.xls`, exportPeriodLabel());
    } else if (exportFormat === 'pdf') {
      exportPDF(rows, exportPeriodLabel());
    }
    closeExportModal();
  };

  const closeExportModal = () => {
    setShowExportModal(false);
    setExportStep('form');
  };

  const exportRowCount = getExportRows().length;

  return (
    <div className="p-4">
      <style>{globalCSS}</style>

      {/* Stats Row */}
      {(() => {
        const stats = [
          { label: 'Total Items', value: inventory.length, sub: 'Active inventory items', icon: Package },
          { label: 'Low Stock', value: inventory.filter(i => i.stock < 10 && i.stock > 0).length, sub: 'Reorder recommended', icon: AlertCircle },
          { label: 'Out of Stock', value: inventory.filter(i => i.stock <= 0).length, sub: 'Immediate restocking required', icon: XCircle },
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
              onClick={() => setShowAddModal(true)}
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

      {/* ── Add Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }}>
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Add Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Fill in the details for the new vaccine or supply item</p>
              </div>
              <button onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors" title="Close" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="px-7 py-6 space-y-4.5">
              <div>
                <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. BCG Vaccine"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
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
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Stock <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stock}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Min Threshold</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={formData.minStock || ''}
                    onChange={e => setFormData(f => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiry}
                    onChange={e => setFormData(f => ({ ...f, expiry: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 pt-2 bg-white flex items-center gap-3">
              <button
                onClick={() => { setShowAddModal(false); setFormData({ name: '', category: 'Vaccine', unit: 'Vials', stock: '', minStock: '10', expiry: '' }); }}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name || !formData.stock}
                className="flex-1 py-3 rounded-xl bg-[#3B50DF] text-white font-bold text-sm cursor-pointer hover:bg-indigo-700 shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={16} /> {saving ? 'Saving Item…' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Edit Item Modal (Comfortable 580px card + refined typography, Portaled to body) ── */}
      {showEditModal && selectedItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => { setShowEditModal(false); setSelectedItem(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-[580px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Card head */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">Edit Inventory Item</h3>
                <p className="text-[13px] text-slate-500 font-normal mt-0.5">Update details for <span className="font-bold text-slate-700">{selectedItem.name}</span></p>
              </div>
              
              <button onClick={() => { setShowEditModal(false); setSelectedItem(null); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors" title="Close" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="px-7 py-6 space-y-4.5">
              <div>
                <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. BCG Vaccine"
                  value={editFormData.name}
                  onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Category</label>
                  <select
                    value={editFormData.category}
                    onChange={e => setEditFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  >
                    <option value="Vaccine">Vaccine</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Supply">Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Unit</label>
                  <select
                    value={editFormData.unit}
                    onChange={e => setEditFormData(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
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
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Stock Quantity <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.stock}
                    onChange={e => setEditFormData(f => ({ ...f, stock: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-slate-600 block mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={editFormData.expiry}
                    onChange={e => setEditFormData(f => ({ ...f, expiry: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#3B50DF] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 pt-2 bg-white flex items-center gap-3">
              <button
                onClick={() => { setShowEditModal(false); setSelectedItem(null); }}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm cursor-pointer hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editFormData.name || !editFormData.stock}
                className="flex-1 py-3 rounded-xl bg-[#3B50DF] text-white font-bold text-sm cursor-pointer hover:bg-indigo-700 shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Check size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Use Stock Modal (Portaled to body) ── */}
      {showUseStockModal && selectedItem && createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur z-[9999] flex items-center justify-center p-4" onClick={() => { setShowUseStockModal(false); setSelectedItem(null); }}>
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
        </div>,
        document.body
      )}

      {/* ── Export Report Modal (Print Preview Split Layout, Portaled to body) ── */}
      {showExportModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 24, width: '1360px', maxWidth: '98vw', height: '92vh', maxHeight: '960px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #E2E8F0' }}>
            
            {/* Light Clean Header Bar (Matching Export Clinic Report) */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ flexShrink: 0, background: '#F4F6FE', borderBottom: '1px solid #E0E5FA' }}
            >
              <div className="flex items-center gap-3">
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#3B50DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Export Inventory Report</h3>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">Generate, print, and download inventory stock reports</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeExportModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal 2-Column Split Body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

              {/* LEFT PANEL: Settings Controls */}
              <div style={{
                width: '330px', flexShrink: 0, background: '#F7F8FD',
                borderRight: '1px solid #E3E7F5', padding: '20px 20px',
                display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto'
              }}>
                {/* Period selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    REPORT PERIOD:
                  </label>
                  <select
                    value={exportPeriod}
                    onChange={e => setExportPeriod(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 10,
                      border: '1px solid #CBD5E1', fontSize: '.8125rem', fontWeight: 600,
                      color: '#0F172A', background: '#FFFFFF', outline: 'none'
                    }}
                  >
                    <option value="all">All Items (Full Database)</option>
                    <option value="daily">Daily (Added Today)</option>
                    <option value="weekly">Weekly (Last 7 Days)</option>
                    <option value="monthly">Monthly (This Month)</option>
                    <option value="yearly">Yearly (This Year)</option>
                  </select>
                </div>

                {/* Format selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    EXPORT FORMAT:
                  </label>
                  <select
                    value={exportFormat}
                    onChange={e => setExportFormat(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: '.8125rem', fontWeight: 600, color: '#0F172A',
                      border: '1px solid #CBD5E1', borderRadius: 12, background: '#FFFFFF', outline: 'none', cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                    }}
                  >
                    <option value="pdf">PDF Document</option>
                    <option value="xls">Excel Spreadsheet (XLS)</option>
                  </select>
                </div>

                {/* Left Sidebar Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exportRowCount === 0}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid transparent',
                      background: '#3B50DF', color: '#FFFFFF',
                      fontSize: '.8125rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: exportRowCount === 0 ? 0.5 : 1
                    }}
                  >
                    <Download size={15} />
                    {exportFormat === 'pdf' ? 'Print / Export PDF' : 'Export XLS'}
                  </button>
                </div>
              </div>

              {/* RIGHT PANEL: Live Paper Document Preview Workspace */}
              <div style={{ flex: 1, background: '#1E293B', padding: '16px 24px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                
                {/* Top Centered Dark PDF Viewer Toolbar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: '#1E293B', padding: '6px 16px', borderRadius: 8,
                  color: '#FFFFFF', fontSize: '.8125rem', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)', marginBottom: 16, flexShrink: 0,
                  position: 'sticky', top: 0, zIndex: 10
                }}>
                  {/* Page indicator */}
                  <span style={{ fontSize: '.78125rem', color: '#CBD5E1' }}>1 / 1</span>
                  
                  <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
                  
                  {/* Zoom controls */}
                  <button type="button" onClick={() => setExportZoomLevel(z => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#FFF', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom Out">-</button>
                  
                  <span style={{ minWidth: 46, textAlign: 'center', fontWeight: 700, color: '#FFFFFF', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4, fontSize: '.78125rem' }}>
                    {Math.round(exportZoomLevel * 100)}%
                  </span>
                  
                  <button type="button" onClick={() => setExportZoomLevel(z => Math.min(1.6, Math.round((z + 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#FFF', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom In">+</button>
                  
                  <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
                  
                  {/* Rotate Page */}
                  <button type="button" onClick={() => setExportRotation(r => (r + 90) % 360)} style={{ background: 'transparent', border: 'none', color: '#FFF', fontSize: '1rem', cursor: 'pointer', padding: '0 4px' }} title="Rotate Page">↻</button>
                </div>

                {/* Paper Sheet Preview Container (Scales as a whole paper sheet!) */}
                <div style={{
                  width: '820px', height: '1060px',
                  background: '#FFFFFF', borderRadius: 4, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                  overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0,
                  transform: `scale(${exportZoomLevel}) ${exportRotation ? `rotate(${exportRotation}deg)` : ''}`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  marginBottom: exportZoomLevel < 1 ? `-${(1 - exportZoomLevel) * 1060}px` : `${(exportZoomLevel - 1) * 200}px`
                }}>
                  <iframe
                    title="Inventory report preview"
                    sandbox=""
                    srcDoc={buildInventoryReportHtml(getExportRows(), exportPeriodLabel())}
                    style={{ display: 'block', width: '100%', height: '100%', border: 'none', background: '#FFFFFF' }}
                  />
                </div>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
