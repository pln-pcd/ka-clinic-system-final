import { signOut } from 'firebase/auth';
import IconButton from '../../components/IconButton';
import { collection, doc, query, setDoc, where } from 'firebase/firestore';
import { trackEvent } from '../../lib/analytics';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Bell,
  Calendar,
  CheckCheck,
  CheckCircle,
  Clock,
  ChevronRight as ChevronRightIcon,
  Home,
  LogOut,
  MapPin as MapIcon,
  Menu,
  MessageSquare,
  Package,
  Search,
  Settings,
  Shield,
  Syringe,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { auth, db, listen } from '../../lib/firebase';
import { useIncidents } from '../incidents/useIncidents';
import { authedPostJson, useAuth } from '../../lib/adminSession';
import Avatar from '../../components/Avatar';
import { useAdminAvatar } from '../../lib/adminAvatars';
import { buildDoses } from '../../lib/doseSchedules';
import { addDaysToDateString, formatDateShort as fmtDate, formatServiceType, getName, getTodayDateString } from '../../lib/formatters';
import StatusBadge from '../../components/StatusBadge';
import { useLiveCollection } from '../../lib/liveStore';
import ConfirmDialog from '../../components/ConfirmDialog';
import { deriveStockStatus, formatVials } from '../../lib/inventoryStock';
import ReportSendToasts from '../../components/ReportSendToasts';
import { NotFoundPage, PageErrorBoundary } from '../../components/ErrorPages';

import { PageSkeleton } from '../../components/Skeleton';
// Each section's code downloads when it is first opened. All of them are
// fetched in the background once the dashboard is up (see preloadSections),
// so switching sections normally shows no loading state.
const SECTION_LOADERS = {
  appointments: () => import('../appointments/AppointmentsPage'),
  archive: () => import('../archive/ArchivePage'),
  incidents: () => import('../incidents/IncidentMapPage'),
  inventory: () => import('../inventory/InventoryPage'),
  admins: () => import('../admins/ManageAdminsPage'),
  messages: () => import('../messages/MessagesPage'),
  patients: () => import('../patients/PatientsPage'),
  settings: () => import('../settings/SettingsPage'),
  vaccination: () => import('../vaccination/VaccinationTrackerPage'),
};
// A section's download is retried twice before it counts as failed (a
// flaky connection, a request cut off mid-navigation, the dev server busy).
// The browser remembers a failed import() for that exact URL — including a
// failed background preload — so a plain retry never refetches; retries
// import the URL from the error message with a cache-busting query instead.
// React.lazy also keeps a failure forever, so a failed section gets a fresh
// lazy component when the page's error card is reloaded (resetFailedSections).
const wait = ms => new Promise(r => setTimeout(r, ms));
async function loadWithRetry(load) {
  let attemptLoad = load;
  for (let attempt = 0; ; attempt++) {
    try { return await attemptLoad(); } catch (err) {
      const url = String(err?.message || '').match(/https?:\/\/\S+/)?.[0];
      if (attempt >= 2 || !url) throw err;
      await wait(400 * (attempt + 1));
      const fresh = new URL(url);
      fresh.searchParams.set('retry', String(Date.now()));
      attemptLoad = () => import(/* @vite-ignore */ fresh.href);
    }
  }
}
const sections = [];
function lazySection(load) {
  const entry = { failed: false, Comp: null };
  const make = () => lazy(() => loadWithRetry(load).catch(err => { entry.failed = true; throw err; }));
  entry.Comp = make();
  entry.reset = () => { if (entry.failed) { entry.failed = false; entry.Comp = make(); } };
  sections.push(entry);
  const Section = props => <entry.Comp {...props} />;
  return Section;
}
function resetFailedSections() {
  sections.forEach(s => s.reset());
}
const AppointmentPage = lazySection(SECTION_LOADERS.appointments);
const ArchivePage = lazySection(SECTION_LOADERS.archive);
const IncidentMapPage = lazySection(SECTION_LOADERS.incidents);
const VaccineInventoryPage = lazySection(SECTION_LOADERS.inventory);
const ManageAdmins = lazySection(SECTION_LOADERS.admins);
const MessagesPage = lazySection(SECTION_LOADERS.messages);
const PatientRecordsPage = lazySection(SECTION_LOADERS.patients);
const SettingsPage = lazySection(SECTION_LOADERS.settings);
const VaccinationTrackerPage = lazySection(SECTION_LOADERS.vaccination);

function preloadSections() {
  Object.values(SECTION_LOADERS).forEach(load => load().catch(() => {}));
}

// Shown only if a section's code is not preloaded yet: a page-shaped
// skeleton, not a spinner.
function SectionLoading() {
  return <PageSkeleton />;
}

// buildDoses depends only on the record and today's date. Records from a
// snapshot keep their identity across renders, so each one's schedule is
// worked out once per snapshot per day instead of on every render.
const doseCache = new WeakMap();
function cachedDoses(p) {
  const today = getTodayDateString();
  const hit = doseCache.get(p);
  if (hit && hit.today === today) return hit.doses;
  const doses = buildDoses(p);
  doseCache.set(p, { today, doses });
  return doses;
}

// ── Dashboard panels ──────────────────────────────────────────────────────────
// Each panel shows at most DASH_PANEL_ROWS rows and sends the rest to its
// page through "View all", so there are no inner scrollbars. The list area
// always reserves room for that many rows, which keeps the three panels the
// same height whether they are full, short or empty.
const DASH_PANEL_ROWS = 5;
const DASH_ROW_H = 60;

function DashPanel({ title, subtitle, badge, total, onViewAll, delay, empty, children }) {
  const hasRows = total > 0;
  return (
    <section className="rounded-3xl border overflow-hidden bg-white border-blue-100/80 shadow-2xs text-slate-900 flex flex-col h-full"
      style={{ animation: `kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) ${delay} both` }}>
      <div className="px-5 py-4 border-b border-blue-50 bg-blue-50/40 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold tracking-tight text-[#0a1d47]">{title}</h3>
            {badge}
          </div>
          <p className="text-[11px] mt-0.5 text-slate-500 font-normal">{subtitle}</p>
        </div>
        <button type="button" onClick={onViewAll} className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer shrink-0 mt-0.5">
          View all
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2" style={{ minHeight: DASH_PANEL_ROWS * DASH_ROW_H + (DASH_PANEL_ROWS - 1) * 8 + 24 }}>
        {hasRows ? children : empty}
      </div>
      {total > DASH_PANEL_ROWS && (
        <button type="button" onClick={onViewAll}
          className="px-5 py-2.5 border-t border-slate-100 text-[11.5px] font-semibold text-[#1D4ED8] hover:bg-blue-50/50 transition-colors cursor-pointer text-left">
          View all {total} →
        </button>
      )}
    </section>
  );
}

function DashRow({ Icon, iconCls, title, sub, badge, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ height: DASH_ROW_H }}
      className="w-full flex items-center justify-between gap-2.5 px-3 rounded-2xl transition-colors cursor-pointer text-left bg-slate-50/60 hover:bg-blue-50/60 border border-slate-100 hover:border-blue-200 group shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${iconCls}`}>
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#0a1d47] group-hover:text-[#1D4ED8] transition-colors truncate">{title}</p>
          <p className="text-[10.5px] text-slate-500 font-normal truncate">{sub}</p>
        </div>
      </div>
      {badge}
    </button>
  );
}

function DashEmpty({ Icon, tone, title, text }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
        <Icon size={20} className={tone} />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="text-xs text-slate-400 mt-0.5 font-normal">{text}</p>
    </div>
  );
}

// ── Circular SVG Progress Indicator Component ──────────────────────────────────
function CircularProgress({ percentage = 75, size = 46, strokeWidth = 4, color = "#6366F1", trackColor = "#E2E8F0", textColor = color }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold" style={{ color: textColor }}>
        {percentage}%
      </span>
    </div>
  );
}

// ── Welcome Banner — fixed dark card (like the sidebar) with the clinic
// support illustration on the right; independent of the light/dark content
// toggle, same reasoning as the sidebar in the previous pass. Now paired
// side-by-side with Quick Clinic Operations (see the dashboard render
// below) — a naturally short card, so it fills the row's stretched height
// (h-full) while staying compact overall, rather than carrying its own
// margin — the wrapping row owns the spacing instead. ─────────────────────

function WelcomeBanner({ stats, onNavigate, adminName, tagline }) {
  return (
    <div className="relative rounded-3xl w-full h-full p-6 sm:p-7 overflow-hidden flex items-center justify-between gap-4 bg-white border border-slate-200/70 shadow-xs"
      style={{ animation: 'kna-banner-in 0.45s cubic-bezier(0.22,1,0.36,1) both' }}>

      <div className="relative z-10 max-w-sm sm:max-w-md">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Hello, {adminName || 'Admin'}!
        </h2>
        <p className="text-xs sm:text-sm mt-2 leading-relaxed text-slate-500 font-medium">
          {tagline || 'Your trusted partner in rabies prevention and clinical care. Track patient vaccinations, appointments, and exposure cases in Libon, Albay.'}
        </p>
      </div>

      <div className="relative z-10 hidden sm:block self-stretch shrink-0 w-1/2 max-w-[340px]">
        <img
          src="/assets/dashboard/welcome_banner.png"
          alt="Clinic support staff assisting patients by phone and chat"
          className="w-full h-full object-contain object-bottom"
        />
      </div>
    </div>
  );
}

// Sidebar width and content margin animate together on collapse/expand.
const SIDEBAR_EASE = '0.4s cubic-bezier(0.22,1,0.36,1)';

// ── Page Transition Wrapper ───────────────────────────────────────────────────
function PageTransition({ children, pageKey }) {
  return (
    <div
      key={pageKey}
      style={{
        height: '100%',
        backgroundColor: '#F0F4FA',
        animation: 'kna-fade-in 0.16s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {children}
    </div>
  );
}

// ── Main Dashboard Component ──────────────────────────────────────────────────
export default function AdminDashboard({ onLogout, notFound = false }) {
  useEffect(() => { preloadSections(); }, []);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  // An unknown URL opens the 404 page inside the dashboard shell; moving to
  // any page puts the address back to "/".
  const [activePage,  setActivePage]  = useState(notFound ? 'not-found' : 'dashboard');
  useEffect(() => {
    if (activePage !== 'not-found' && window.location.pathname !== '/') window.history.replaceState({}, '', '/');
  }, [activePage]);
  const [openAddPatientModal, setOpenAddPatientModal] = useState(false);
  const [addModalInitialPatient, setAddModalInitialPatient] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Batch 5/6 — role drives the Manage Staff sidebar item + route guard
  // below. Also: if a manager revokes this session's account while it's
  // still open on a device (or the invite/OTP flow never granted access
  // in the first place), status flips away from "active" in real time —
  // sign out immediately rather than leaving a stale session on screen.
  const { role, status: adminStatus } = useAuth();
  const myAvatar = useAdminAvatar(auth.currentUser?.uid);
  useEffect(() => {
    if (adminStatus !== null && adminStatus !== 'active') {
      signOut(auth).finally(() => { if (onLogout) onLogout(); });
    }
  }, [adminStatus]);

  // Catch-up for the nightly patient-archive-sweep: if it has not run today
  // (missed cron, emulator or local dev, CRON_SECRET unset) the server runs it
  // now. Once per browser session; the server skips it if already done today.
  useEffect(() => {
    try {
      const key = `kna.archiveSweepCheck.${getTodayDateString()}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* storage blocked: the server-side date check still applies */ }
    authedPostJson('/api/notifications', { action: 'archive-sweep-if-due' })
      .then(r => { if (r?.ran && r.archived) console.info(`[archive] catch-up sweep archived ${r.archived} record(s)`); })
      .catch(() => {});
  }, []);

  // Anonymous page-view telemetry (only writes when the Settings toggle is on).
  useEffect(() => { trackEvent(`page_${activePage}`); }, [activePage]);

  useEffect(() => {
    if (activePage === 'manage-admins' && role !== null && role !== 'manager') {
      setActivePage('dashboard');
    }
  }, [activePage, role]);

  // Keep --sidebar-width and --header-height CSS variables synchronized for dynamic modal centering
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', sidebarOpen ? '256px' : '76px');
    document.documentElement.style.setProperty('--header-height', '80px');
  }, [sidebarOpen]);

  const [stats, setStats] = useState({ patients: 0, todayApts: 0, unreadMessages: 0, lowStock: 0, patientsThisWeek: 0 });
  const [recentPatients, setRecentPatients] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [todayApts, setTodayApts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [allAppointments, setAllAppointments] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const { incidents: incidentList, loading: incidentsLoading } = useIncidents();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // Read state is durable the same way the dismissed set is: localStorage for
  // first paint, admins/{uid} for the copy that survives a new browser or a
  // fresh Vercel deployment hostname.
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem('kna_read_notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  // Seeded from localStorage so the list is correct on first paint, then
  // reconciled against Firestore below. localStorage alone is per-origin, so
  // a dismissal on localhost never reached the deployed site — and Vercel
  // gives every deployment its own hostname, which wiped the list on each
  // redeploy. Firestore is the durable copy; localStorage is just the cache.
  const [dismissedNotifIds, setDismissedNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem('kna_dismissed_notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const notifRef = useRef(null);

  const [notifConfig, setNotifConfig] = useState({
    newAppointment: true,
    cancelledApt: true,
    lowStock: true,
    expiringStock: true,
    newMessage: true,
    dailySummary: false,
    emailAlerts: true,
  });

  const [adminProfile, setAdminProfile] = useState({
    name: auth?.currentUser?.displayName || 'Admin',
    initials: (auth?.currentUser?.displayName || 'Admin').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AD',
  });

  // Search Box & Toast Notification States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedOverduePatientId, setSelectedOverduePatientId] = useState(null);
  // A date whose appointment preview should open when Appointments loads.
  const [apptPreviewDate, setApptPreviewDate] = useState(null);
  const [notifTab, setNotifTab] = useState('Today');
  const searchRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Keyboard listener for Ctrl+K / Cmd+K search shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    const handleOpenPatientRecord = () => {
      setActivePage('patients');
    };
    // Add Another Service from outside the Patients page (e.g. a record
    // restored on the Archive page): open the Register pop-up there with
    // that patient's details.
    const handleOpenAddPatientModal = (e) => {
      setAddModalInitialPatient(e?.detail || null);
      setOpenAddPatientModal(true);
      setActivePage('patients');
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-patient-record', handleOpenPatientRecord);
    window.addEventListener('open-add-patient-modal', handleOpenAddPatientModal);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-patient-record', handleOpenPatientRecord);
      window.removeEventListener('open-add-patient-modal', handleOpenAddPatientModal);
    };
  }, []);

  // Click outside search container to close results popover
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter search results across Patients, Appointments, Inventory, and Incidents
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const results = [];

    // Search Patients
    allPatients.forEach(p => {
      const name = getName(p) || '';
      const phone = p.phone || p.contactNumber || '';
      const addr = p.address || '';
      if (name.toLowerCase().includes(q) || phone.includes(q) || addr.toLowerCase().includes(q)) {
        results.push({
          type: 'patient',
          title: name || 'Patient Record',
          sub: `${phone ? phone + ' · ' : ''}${addr || 'Registered Patient'}`,
          page: 'patients',
          item: p
        });
      }
    });

    // Search Appointments
    allAppointments.forEach(a => {
      const name = a.name || a.patient || '';
      const phone = a.contactNumber || a.contact || '';
      const purpose = formatServiceType(a.type || a.purpose, '');
      if (name.toLowerCase().includes(q) || phone.includes(q) || purpose.toLowerCase().includes(q) || (a.date && a.date.includes(q))) {
        results.push({
          type: 'appointment',
          title: `Appointment: ${name || 'Patient'}`,
          sub: `${a.date || ''} at ${a.time || ''} (${purpose || 'Consultation'})`,
          page: 'appointments',
          item: a
        });
      }
    });

    // Search Inventory
    inventoryList.forEach(i => {
      const name = i.name || '';
      const cat = i.category || '';
      if (name.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) {
        results.push({
          type: 'inventory',
          title: `Stock: ${name}`,
          // Same number as the Inventory list: whole vials.
          sub: `Category: ${cat || 'Supplies'} · ${formatVials(i)} remaining`,
          page: 'inventory',
          item: i
        });
      }
    });

    // Incidents are not searched: the map holds simulated demo data only,
    // with no place or patient text to match (docs/STUDY_MODE.md).

    return results.slice(0, 8);
  }, [searchQuery, allPatients, allAppointments, inventoryList]);

  // Click Outside Notification Dropdown
  useEffect(() => {
    const handler = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Real-Time Listener on /settings/config
  useEffect(() => {
    const unsub = listen(doc(db, 'settings', 'config'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.notif) setNotifConfig(prev => ({ ...prev, ...d.notif }));
        const liveName = auth?.currentUser?.displayName || d?.account?.adminName || 'Admin';
        const init = liveName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AD';
        setAdminProfile({ name: liveName, initials: init });
      }
    });
    return () => unsub();
  }, []);

  // Real-Time Listener on /vaccinations (Patients count, recent patients, weekly trend)
  // Shared live collections (lib/liveStore.js): the pages read the same
  // listeners, so switching pages never re-fetches or shows a spinner.
  const vaxLive = useLiveCollection('vaccinations');
  const aptLive = useLiveCollection('appointments');
  const invLive = useLiveCollection('inventory');
  useEffect(() => {
    if (!vaxLive.loaded) return;
    {
      const docs = vaxLive.rows;
      setRecentPatients(docs.slice(0, 5));
      setAllPatients(docs);

      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const registeredThisWeek = docs.filter(d => {
        const ts = typeof d.createdAt === 'number' ? d.createdAt : (d.createdAt?.toMillis?.() || Date.parse(d.date) || 0);
        return ts >= oneWeekAgo;
      }).length;

      // Archived records are excluded, matching the Patients page. Counting
      // snap.size meant the dashboard headline and the Patients page disagreed
      // about how many patients the clinic has.
      const activePatients = docs.filter(d => !d.isArchived).length;
      setStats(p => ({ ...p, patients: activePatients, patientsThisWeek: registeredThisWeek }));

      // Real-time overdue patient notifications: one per patient record, for
      // its earliest missed dose. The id is the Firestore doc id plus the dose
      // (the doc's own `id` field is the MRN, which several records can
      // share), and a second record for the same MRN, service and dose is
      // skipped, so a patient never appears twice. `day` is the first Manila
      // day the dose counted as overdue, which is what the tabs filter on.
      const todayStr = getTodayDateString();
      const seenOverdue = new Set();
      const overdueNotifs = docs
        .map(p => {
          if (p.isArchived || p.status === 'completed') return null;
          const missed = cachedDoses(p).filter(d => d.status === 'miss');
          if (missed.length === 0) return null;
          const earliest = missed.reduce((a, b) => (a.date < b.date ? a : b));
          const dupKey = `${p.id || getName(p)}|${p.service || ''}|${earliest.key || earliest.label}`;
          if (seenOverdue.has(dupKey)) return null;
          seenOverdue.add(dupKey);
          const dueDay = String(earliest.date || '').slice(0, 10);
          const daysOverdue = Math.max(1, Math.round((Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86400000));
          return {
            id: `overdue-${p.firestoreId}-${earliest.key || 'dose'}`,
            patientId: p.firestoreId,
            type: 'critical',
            title: 'Overdue dose',
            message: `${getName(p)} (${p.id || 'MRN'}) is ${daysOverdue}d overdue for ${earliest.label}.`,
            time: `${daysOverdue}d overdue`,
            day: addDaysToDateString(dueDay, 1),
            ts: Date.parse(`${addDaysToDateString(dueDay, 1)}T00:00:00+08:00`),
            icon: 'overdue'
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts)
        .slice(0, 10);

      setNotifications(prev => [...overdueNotifs, ...prev.filter(n => !n.id.startsWith('overdue-'))]);
    }
  }, [vaxLive]);

  // Real-Time Listener on /appointments
  useEffect(() => {
    const today = getTodayDateString();
    if (!aptLive.loaded) return;
    {
      const all = aptLive.rows;
      const todays = all.filter(a => a.date === today);
      setTodayApts(todays);
      setStats(p => ({ ...p, todayApts: todays.length }));
      setAllAppointments(all);

      // Notification stream
      const aptNotifs = all.slice(0, 8).map(d => {
        const data = d;
        return {
          id: `apt-${d.id}`,
          type: data.status === 'confirmed' ? 'success' : data.status === 'cancelled' ? 'warning' : 'info',
          title: data.status === 'confirmed' ? 'Appointment Confirmed' : data.status === 'cancelled' ? 'Appointment Cancelled' : 'New Appointment Request',
          message: `${data.name || data.patient || 'Unknown'} — ${data.date || ''} at ${data.time || ''}`,
          time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
          ts: data.updatedAt || data.createdAt || null,
          day: (data.updatedAt || data.createdAt) ? getTodayDateString(new Date(data.updatedAt || data.createdAt)) : '',
          icon: 'apt'
        };
      });
      setNotifications(p => [...aptNotifs, ...p.filter(n => !n.id.startsWith('apt-'))]);
    }
  }, [aptLive]);

  // Real-Time Listener on /chatThreads
  useEffect(() => {
    const q = query(collection(db, 'chatThreads'), where('unread', '==', true));
    return listen(q, snap => {
      setUnreadCount(snap.size);
      setStats(p => ({ ...p, unreadMessages: snap.size }));

      const msgNotifs = snap.docs.map(d => {
        const data = d.data();
        return {
          id: `msg-${d.id}`,
          type: 'info',
          title: 'New Message',
          message: data.lastMessage || 'You have an unread message',
          time: data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
          ts: data.updatedAt || null,
          day: data.updatedAt ? getTodayDateString(new Date(data.updatedAt)) : '',
          icon: 'msg'
        };
      });
      setNotifications(p => [...msgNotifs, ...p.filter(n => !n.id.startsWith('msg-'))]);
    });
  }, []);

  // Real-Time Listener on /inventory (Low stock alerts & Inventory Table)
  useEffect(() => {
    if (!invLive.loaded) return;
    {
      const docs = invLive.rows;
      setInventoryList(docs);
      const low = docs.filter(d => {
        const st = deriveStockStatus(d);
        return st === 'out-of-stock' || st === 'low-stock';
      });
      setStats(p => ({ ...p, lowStock: low.length }));

      const stockNotifs = low.map(d => {
        const st = deriveStockStatus(d);
        const isOut = st === 'out-of-stock';
        return {
          id: `inv-${d.id}`,
          type: isOut ? 'critical' : 'warning',
          title: isOut ? 'Out of Stock' : 'Low Stock Warning',
          message: `${d.name || 'Vaccine'} ${isOut ? 'is out of stock' : 'is running low'} (${formatVials(d)})`,
          time: 'Inventory',
          ts: d.updatedAt || d.createdAt || Date.now(),
          day: getTodayDateString(new Date(d.updatedAt || d.createdAt || Date.now())),
          icon: 'stock'
        };
      });
      setNotifications(p => [...stockNotifs, ...p.filter(n => !n.id.startsWith('inv-'))]);
    }
  }, [invLive]);

  // Aggregated Recent Activity Stream (derived from allAppointments, no duplicate listener)
  useEffect(() => {
    if (!allAppointments || allAppointments.length === 0) return;
    const aptEvents = allAppointments.slice(0, 4).map(data => ({
      id: `act-apt-${data.id}`,
      action: data.status === 'confirmed' ? 'Appointment Confirmed' : data.status === 'cancelled' ? 'Appointment Cancelled' : 'New Appointment Request',
      patient: data.name || data.patient || 'Patient',
      time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Recently',
      type: data.status === 'confirmed' ? 'success' : data.status === 'cancelled' ? 'warning' : 'info',
      rawTime: data.createdAt || 0,
    }));

    setRecentActivity(aptEvents);
  }, [allAppointments]);

  // Pull the durable dismissed list for this admin. Unioned with whatever is
  // already in state so a dismissal made while offline isn't dropped by the
  // first server snapshot.
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    const unsub = listen(doc(db, 'admins', uid), snap => {
      const saved = snap.data()?.dismissedNotifications;
      if (Array.isArray(saved)) {
        setDismissedNotifIds(prev => {
          const next = new Set([...prev, ...saved]);
          if (next.size === prev.size) return prev;
          try { localStorage.setItem('kna_dismissed_notifications', JSON.stringify([...next])); } catch (e) {}
          return next;
        });
      }
      const savedRead = snap.data()?.readNotifications;
      if (Array.isArray(savedRead)) {
        setReadNotifIds(prev => {
          const next = new Set([...prev, ...savedRead]);
          if (next.size === prev.size) return prev;
          try { localStorage.setItem('kna_read_notifications', JSON.stringify([...next])); } catch (e) {}
          return next;
        });
      }
    }, err => console.error('Dismissed notifications listener failed:', err));
    return () => unsub();
  }, []);

  // Tabs work on Manila calendar days (n.day, YYYY-MM-DD): Today is today in
  // Manila; This Week is Sunday–Saturday, the same week the appointments
  // calendar shows; All is everything. An item with no day shows under All.
  const notifToday = getTodayDateString();
  const notifWeekStart = addDaysToDateString(notifToday, -new Date(`${notifToday}T00:00:00Z`).getUTCDay());
  const notifWeekEnd = addDaysToDateString(notifWeekStart, 6);
  const inNotifTab = (n, tab) => {
    if (tab === 'Today') return n.day === notifToday;
    if (tab === 'This Week') return !!n.day && n.day >= notifWeekStart && n.day <= notifWeekEnd;
    return true;
  };
  const visibleNotifications = notifications.filter(n => {
    if (dismissedNotifIds.has(n.id)) return false;
    if (n.id.startsWith('inv-')) {
      if (n.type === 'critical' || n.type === 'warning') return notifConfig.lowStock !== false;
      return notifConfig.expiringStock !== false;
    }
    if (n.id.startsWith('apt-')) {
      if (n.type === 'warning') return notifConfig.cancelledApt !== false;
      return notifConfig.newAppointment !== false;
    }
    if (n.id.startsWith('msg-')) {
      return notifConfig.newMessage !== false;
    }
    if (n.id.startsWith('overdue-')) {
      return notifConfig.overdueVaccination !== false;
    }
    return true;
  }).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const filteredNotifications = visibleNotifications.filter(n => inNotifTab(n, notifTab));
  const notifTabCounts = Object.fromEntries(['Today', 'This Week', 'All'].map(t => [t, visibleNotifications.filter(n => inNotifTab(n, t)).length]));

  // The bell badge and "Mark all read" cover every notification, not just
  // the open tab, so the badge doesn't change when you switch tabs.
  const unreadNotifCount = visibleNotifications.filter(n => !readNotifIds.has(n.id)).length;

  const persistRead = (next) => {
    try { localStorage.setItem('kna_read_notifications', JSON.stringify([...next])); } catch (e) {}
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    setDoc(doc(db, 'admins', uid), { readNotifications: [...next] }, { merge: true })
      .catch(err => console.error('Failed to save read notifications:', err));
  };

  // Explicit action now — opening the bell no longer silently marks everything
  // read, so the unread count still means something after a glance.
  const markAllRead = () => {
    setReadNotifIds(prev => {
      const next = new Set([...prev, ...visibleNotifications.map(n => n.id)]);
      persistRead(next);
      return next;
    });
  };

  const markNotifRead = (id) => {
    setReadNotifIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistRead(next);
      return next;
    });
  };

  // Writes the dismissed set to both the local cache and admins/{uid}, so it
  // survives logout, a different browser, and a fresh Vercel deployment URL.
  const persistDismissed = (next) => {
    try { localStorage.setItem('kna_dismissed_notifications', JSON.stringify([...next])); } catch (e) {}
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    setDoc(doc(db, 'admins', uid), { dismissedNotifications: [...next] }, { merge: true })
      .catch(err => console.error('Failed to save dismissed notifications:', err));
  };

  const dismissNotif = id => {
    setDismissedNotifIds(prev => {
      const next = new Set(prev);
      next.add(id);
      persistDismissed(next);
      return next;
    });
  };

  const clearAllNotifs = () => {
    setDismissedNotifIds(prev => {
      const next = new Set([...prev, ...visibleNotifications.map(n => n.id)]);
      persistDismissed(next);
      return next;
    });
  };

  const handleNotifClick = (n) => {
    if (n.id.startsWith('apt-')) {
      setActivePage('appointments');
    } else if (n.id.startsWith('inv-')) {
      setActivePage('inventory');
    } else if (n.id.startsWith('msg-')) {
      setActivePage('messages');
    } else if (n.id.startsWith('overdue-')) {
      if (n.patientId) setSelectedOverduePatientId(n.patientId);
      setActivePage('vaccination');
    }
    setNotifOpen(false);
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = async () => {
    try {
      const revocation = authedPostJson('/api/devices', { action: 'logout' }).catch(() => {});
      if (onLogout) onLogout();
      else window.location.href = '/';
      await signOut(auth);
      await revocation;
    } catch (e) {
      console.error('Logout error:', e);
    }
  };



  const menuItems = [
    { id: 'dashboard',   label: 'Dashboard',          icon: Home },
    { id: 'patients',    label: 'Patient Records',    icon: Users },
    { id: 'vaccination', label: 'Vaccination Tracker',icon: CheckCircle },
    { id: 'appointments',label: 'Appointments',       icon: Calendar },
    { id: 'messages',   label: 'Messages',            icon: MessageSquare, badge: unreadCount },
    { id: 'incidents',  label: 'Incident Map',       icon: MapIcon },
    { id: 'inventory',  label: 'Inventory',          icon: Package },
    { id: 'archive',    label: 'Archive',            icon: Archive },
    // Only a manager ever sees this item — role comes from Firestore via
    // useAuth(), never a hardcoded email/string check. Ordered before
    // Settings so admin-management sits with the rest of clinic management.
    // Label only: the route id stays 'manage-admins' and stored roles are
    // unchanged ("Manage Staff" because nurses are on it too).
    ...(role === 'manager' ? [{ id: 'manage-admins', label: 'Manage Staff', icon: Shield }] : []),
    { id: 'settings',   label: 'Settings',            icon: Settings },
  ];

  // Browser tab title follows the open section.
  const activeLabel = activePage === 'not-found' ? 'Page not found' : (menuItems.find(m => m.id === activePage)?.label || 'Dashboard');
  useEffect(() => {
    document.title = `${activeLabel} · K&A Clinic Admin`;
  }, [activeLabel]);

  // Sidebar nav item. Every state — default, hover, active — has the exact
  // same box: same padding, margin, width and font weight. The hover pill,
  // the active tab and its curved notches are absolutely positioned layers
  // behind the content, so switching sections repaints but never reflows.
  // The button spans the full nav width (to the sidebar edge) so the active
  // tab can merge into the content area; the hover pill stops 16px short.
  const renderNavItem = (item) => {
    const isActive = activePage === item.id;
    return (
      <button key={item.id} onClick={() => { setSelectedOverduePatientId(null); setActivePage(item.id); }}
        aria-current={isActive ? 'page' : undefined}
        className="group relative w-full flex items-center gap-3 pl-3.5 pr-7 py-2.5 cursor-pointer text-sm font-semibold leading-snug"
        title={!sidebarOpen ? item.label : ''}>

        {isActive ? (
          <span aria-hidden="true" className="absolute inset-0 rounded-l-2xl bg-[#F0F4FA] pointer-events-none">
            {/* Concave notches that curve the tab into the content area */}
            <svg className="absolute right-0 -top-4 w-4 h-4 text-[#F0F4FA]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M16 16V0C16 8.83656 8.83656 16 0 16H16Z" />
            </svg>
            <svg className="absolute right-0 -bottom-4 w-4 h-4 text-[#F0F4FA]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M16 0V16C16 7.16344 8.83656 0 0 0H16Z" />
            </svg>
          </span>
        ) : (
          <span aria-hidden="true" className="absolute inset-y-0 left-0 right-4 rounded-xl bg-white/0 group-hover:bg-white/10 transition-colors duration-150 pointer-events-none" />
        )}

        <item.icon size={19} strokeWidth={2.2} className={`flex-shrink-0 relative transition-colors duration-150 ${isActive ? 'text-black' : 'text-white'}`}/>
        <span className={`relative transition-colors duration-150 ${isActive ? 'text-black' : 'text-white'}`} style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s, color 0.15s', flex: 1, textAlign: 'left' }}>
          {item.label}
        </span>
        {item.badge > 0 && (
          <span className={`bg-rose-500 text-white font-bold rounded-full flex items-center justify-center ${sidebarOpen ? 'relative text-[11px] px-2 py-0.5' : 'absolute top-1 right-5 w-4 h-4 text-[9px]'}`}>
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    );
  };

  const notifTypeStyle = type => ({
    success: { dot: 'bg-green-500' },
    warning: { dot: 'bg-amber-500' },
    critical:{ dot: 'bg-red-500' },
    info:    { dot: 'bg-sky-500' }
  }[type] || { dot: 'bg-gray-400' });

  // Overdue Dose Tracker — reuses VaccinationTrackerPage.jsx's own buildDoses (same ARV
  // schedule + isOverdue logic the real Vaccination Tracker page uses, not
  // re-derived here) so "overdue" means exactly the same thing in both
  // places. A patient is overdue if any dose has status 'miss'; the widget
  // surfaces their single most-overdue dose.
  // Archived and completed records are skipped, and one row is kept per
  // patient record + dose (records can share an MRN), counted in Manila days.
  const todayStr = getTodayDateString();
  const overdueSeen = new Set();
  const overdueList = allPatients
    .map(p => {
      if (p.isArchived || p.status === 'completed') return null;
      const missed = cachedDoses(p).filter(d => d.status === 'miss');
      if (missed.length === 0) return null;
      const earliest = missed.reduce((a, b) => (a.date < b.date ? a : b));
      const dupKey = `${p.id || getName(p)}|${p.service || ''}|${earliest.key || earliest.label}`;
      if (overdueSeen.has(dupKey)) return null;
      overdueSeen.add(dupKey);
      const dueDay = String(earliest.date || '').slice(0, 10);
      const daysOverdue = Math.max(1, Math.round((Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86400000));
      return { key: `${p.firestoreId}-${earliest.key || 'dose'}`, firestoreId: p.firestoreId, name: getName(p), doseLabel: earliest.label, dueDate: earliest.date, daysOverdue };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  // Today's Doses — patients that have a vaccination dose scheduled strictly for today
  const todayDosesList = allPatients
    .flatMap(p => {
      if (p.isArchived) return [];
      const doses = cachedDoses(p);
      // Strictly match date against current date in YYYY-MM-DD
      const dosesToday = doses.filter(d => (d.date || '').slice(0, 10) === todayStr);
      return dosesToday.map(d => ({
        id: `${p.firestoreId || p.id}-${d.key || d.label}`,
        patientId: p.firestoreId || p.id || p.name,
        name: getName(p),
        doseLabel: d.label,
        dueDate: d.date,
        status: d.status,
        done: d.status === 'done',
        service: p.service || '',
        category: p.category || '',
      }));
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  const todayDosesPending = todayDosesList.filter(d => !d.done).length;

  // Today's Schedule lists only visits that are still happening today:
  // confirmed and pending (cancelled, declined and done are left out).
  const todayScheduleList = todayApts
    .filter(a => ['confirmed', 'accepted', 'pending'].includes(String(a.status || 'pending').toLowerCase()))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  // Colored duotone cards (matches the Vaccination Tracker's summary cards)
  // — a progress ring only where the metric is a genuine rate (confirmed
  // apts, inventory health), a plain icon where it's just a running count
  // (patients, unread messages). Low Stock's color stays tied to whether
  // stock actually needs action, same real-alert logic as before, now
  // expressed as a full card color instead of just an icon tint.
  // Neutral slate cards by default — color is reserved for Low Stock, whose
  // red/emerald is a real alert signal (stock actually needs action or
  // doesn't), not decoration.
  const dashboardStatWidgets = [
    {
      label: 'Total Patients',
      value: stats.patients,
      sub: `${stats.patientsThisWeek} registered this week · excludes archived`,
      color: '#1D4ED8', tint: '#EFF6FF', border: '#DBEAFE',
      Icon: Users,
      progress: null,
      page: 'patients'
    },
    {
      label: 'Today Appointments',
      value: todayScheduleList.length,
      sub: `${todayScheduleList.filter(a => a.status === 'confirmed' || a.status === 'accepted').length} confirmed · ${todayScheduleList.filter(a => a.status === 'pending').length} pending`,
      color: '#0E2A6D', tint: '#EEF2FF', border: '#E0E7FF',
      Icon: Calendar,
      progress: null,
      page: 'appointments'
    },
    {
      label: 'Unread Messages',
      value: stats.unreadMessages,
      sub: 'Require attention',
      color: '#2563EB', tint: '#EFF6FF', border: '#DBEAFE',
      Icon: MessageSquare,
      progress: null,
      page: 'messages'
    },
    {
      label: 'Low Stock Items',
      value: stats.lowStock,
      sub: stats.lowStock > 0 ? 'Action required' : 'Stock optimal',
      color: stats.lowStock > 0 ? '#DC2626' : '#059669',
      tint: stats.lowStock > 0 ? '#FEF2F2' : '#ECFDF5',
      border: stats.lowStock > 0 ? '#FCA5A5' : '#A7F3D0',
      Icon: Package,
      progress: null,
      page: 'inventory'
    }
  ];

  return (
    <div className="min-h-screen flex font-sans bg-[#F0F4FA] text-gray-900">
      <ReportSendToasts />
      {/* ── LOGOUT CONFIRM MODAL ── */}
      {showLogoutConfirm && (
        <ConfirmDialog
          variant="danger"
          size="compact"
          icon={LogOut}
          title="Sign out?"
          message={(() => {
            const firstName = (adminProfile.name || '').trim().replace(/^(dr|mr|mrs|ms|rn|rph)\.?\s+/i, '').split(/\s+/)[0];
            return firstName && firstName !== 'Admin'
              ? <>You'll be signed out, {firstName}, and need to sign in again.</>
              : <>You'll be signed out and need to sign in again.</>;
          })()}
          confirmLabel="Sign out"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* ── SIDEBAR (Deep Rich Dark Navy Blue Theme with SVG Curved Notch Cutout Active Tabs) ── */}
      <aside className="fixed inset-y-0 left-0 z-40 flex flex-col bg-[#06122c] text-white overflow-hidden"
        style={{ width: sidebarOpen ? 256 : 76, transition: `width ${SIDEBAR_EASE}` }}>
        <div className="flex flex-col min-h-0 flex-1">
          {/* Logo Header — White background logo beside clinic name */}
          <div className={`h-20 flex-shrink-0 border-b border-white/10 flex items-center ${
            sidebarOpen ? 'px-4 justify-between' : 'pl-3 pr-0 justify-start'
          }`}>
            {sidebarOpen && (
              <button
                type="button"
                onClick={() => setActivePage('dashboard')}
                title="Go to Dashboard"
                aria-label="K&A Clinic — go to Dashboard"
                className="flex items-center gap-3 min-w-0 overflow-hidden text-left rounded-xl -ml-1.5 pl-1.5 pr-2 py-1 cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 flex-shrink-0 shadow-sm border border-blue-100/90">
                  <img
                    src="/assets/dashboard/logo-white-nobg.png"
                    alt="K&A Clinic Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="font-bold text-base tracking-normal leading-tight text-white whitespace-nowrap">K&A Clinic</h1>
                  <p className="text-[10px] font-bold text-white uppercase tracking-widest mt-0.5 whitespace-nowrap">Clinical Admin</p>
                </div>
              </button>
            )}
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`flex items-center cursor-pointer transition-colors hover:bg-white/10 text-white ${
                sidebarOpen ? 'p-2 rounded-xl flex-shrink-0' : 'pl-3.5 pr-3 py-2.5 rounded-xl flex-shrink-0'
              }`}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              <Menu size={sidebarOpen ? 20 : 19} strokeWidth={sidebarOpen ? 2 : 2.2} className="flex-shrink-0 text-white" />
            </button>
          </div>

          {/* Nav List */}
          <nav className="sidebar-nav pl-3 pr-0 py-4 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            <div>
              <div className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-widest text-white h-6 flex items-center overflow-hidden">
                <span className={`whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                  Clinical Management
                </span>
              </div>
              <div className="space-y-1">
                {menuItems.slice(0, 8).map(renderNavItem)}
              </div>
            </div>

            <div>
              <div className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-widest text-white h-6 flex items-center overflow-hidden">
                <span className={`whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                  System & Logistics
                </span>
              </div>
              <div className="space-y-1">
                {menuItems.slice(8).map(renderNavItem)}
              </div>
            </div>
          </nav>
        </div>

        {/* Logout Footer */}
        <div className="flex-shrink-0 p-3 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 pl-3.5 pr-3 py-2.5 rounded-xl transition-colors cursor-pointer text-sm font-medium text-white hover:bg-white/10 hover:text-rose-300"
          title={!sidebarOpen ? 'Sign Out' : ''}>
            <LogOut size={19} strokeWidth={2} className="flex-shrink-0 text-white" />
            <span style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s' }}>
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#F0F4FA]"
        style={{ marginLeft: sidebarOpen ? 256 : 76, transition: `margin-left ${SIDEBAR_EASE}` }}>

        {/* ── STICKY TOP HEADER (CLEAN WHITE MODERN DESIGN) ── */}
        <header className="border-b sticky top-0 z-30 h-20 flex items-center px-7 justify-between flex-shrink-0 transition-all bg-white border-slate-200 text-slate-900 gap-4 shadow-2xs">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-6 w-1 rounded-full bg-[#1D4ED8]"/>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight text-[#0a1d47]">{activeLabel}</h1>
              <p className="text-xs leading-none mt-1.5 text-slate-500 font-normal flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                K&A Anti-Rabies Vaccination Clinic
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 shrink-0 ml-auto">
            {/* ── EXPANDABLE CIRCULAR SEARCH BAR ── */}
            {activePage === 'dashboard' && (
              <div
                className={`relative transition-all duration-300 ease-in-out ${
                  searchFocused || searchQuery ? 'w-72 sm:w-80' : 'w-44 sm:w-52'
                }`}
                ref={searchContainerRef}
              >
                <div className={`relative flex items-center w-full rounded-full border transition-all duration-300 ${
                  searchFocused
                    ? 'bg-white border-blue-500 shadow-xs ring-2 ring-blue-500/15'
                    : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300'
                }`}>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    placeholder="Search patients, stock..."
                    className="w-full py-2 px-4 text-xs font-semibold bg-transparent text-[#0a1d47] placeholder-slate-400 outline-none rounded-full"
                  />
                  {searchQuery ? (
                    <IconButton icon={X} label="Clear search" size={28} iconSize={14} className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')} />
                  ) : (
                    <div className="absolute right-3 flex items-center gap-1">
                      <button
                        onClick={() => searchRef.current?.focus()}
                        className="text-slate-400 hover:text-[#1D4ED8] cursor-pointer"
                        title="Search"
                      >
                        <Search size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Circular Search Results Dropdown */}
                {searchFocused && searchQuery.trim() !== '' && (
                  <div className="absolute right-0 top-11 w-72 sm:w-80 bg-white rounded-3xl shadow-xl border border-blue-100 z-50 overflow-hidden max-h-96 overflow-y-auto custom-scrollbar text-slate-900"
                    style={{ animation: 'kna-notif-in 0.18s ease-out both' }}>
                    <div className="px-4 py-2.5 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#0a1d47] uppercase tracking-wider">Search Results</span>
                      <span className="text-[10px] font-semibold text-slate-400">{searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}</span>
                    </div>

                    {searchResults.length === 0 ? (
                      <div className="py-7 text-center px-4">
                        <Search size={20} className="text-slate-300 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-slate-600">No records found for "{searchQuery}"</p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5">Try searching by patient name or stock item.</p>
                      </div>
                    ) : (
                      <div className="p-1.5 space-y-1">
                        {searchResults.map((res, i) => {
                          const badgeBg = res.type === 'patient'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : res.type === 'appointment'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : res.type === 'inventory'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200';

                          const IconComp = res.type === 'patient' ? Users : res.type === 'appointment' ? Calendar : res.type === 'inventory' ? Package : MapIcon;

                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setActivePage(res.page);
                                setSearchFocused(false);
                                setSearchQuery('');
                              }}
                              className="p-2.5 rounded-2xl flex items-center justify-between gap-2.5 hover:bg-blue-50/50 transition-colors cursor-pointer border border-transparent hover:border-blue-100"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#1D4ED8] flex items-center justify-center flex-shrink-0">
                                  <IconComp size={15} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#0a1d47] truncate">{res.title}</p>
                                  <p className="text-[10.5px] text-slate-400 truncate mt-0.5">{res.sub}</p>
                                </div>
                              </div>
                              <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${badgeBg}`}>
                                {res.type}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button type="button" onClick={() => setNotifOpen(o => !o)}
                aria-label={unreadNotifCount ? `Notifications, ${unreadNotifCount} unread` : 'Notifications'}
                aria-expanded={notifOpen}
                style={{ lineHeight: 0 }}
                className="w-11 h-11 inline-flex items-center justify-center shrink-0 rounded-full border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-[#1D4ED8] text-slate-700 shadow-2xs relative cursor-pointer transition-colors outline-none focus-visible:shadow-[0_0_0_3px_rgba(59,80,223,.35)]">
                <Bell size={19} style={{ display: 'block' }}/>
                {unreadNotifCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] bg-rose-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1" style={{ animation: 'kna-badge-pop 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
              </button>

              {/* ── NOTIFICATION CENTER CARD ── */}
              {notifOpen && (
                <div
                  className="absolute right-0 top-13 w-[min(400px,calc(100vw-2rem))] rounded-3xl shadow-2xl border border-slate-200 bg-white z-50 overflow-hidden overflow-x-hidden p-5 text-slate-900"
                  style={{ animation: 'kna-notif-in 0.22s cubic-bezier(0.22,1,0.36,1) both' }}
                >
                  {/* TOP HEADER ROW */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-[#0a1d47] tracking-tight">Notification Center</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={markAllRead}
                        disabled={unreadNotifCount === 0}
                        title={unreadNotifCount === 0 ? 'Nothing unread' : `Mark ${unreadNotifCount} notification${unreadNotifCount === 1 ? '' : 's'} as read`}
                        className="px-3 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-xs font-semibold text-[#0a1d47] shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-default disabled:hover:bg-slate-50 disabled:hover:border-slate-200"
                      >
                        <CheckCheck size={13} strokeWidth={2.4} />
                        Mark all read
                      </button>
                    </div>
                  </div>

                  {/* SEGMENTED TAB PILL CONTAINER */}
                  <div className="bg-slate-100/90 p-1 rounded-2xl flex items-center mb-4 text-xs font-semibold text-slate-500">
                    {['Today', 'This Week', 'All'].map((tab) => {
                      const isSelected = notifTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setNotifTab(tab)}
                          className={`flex-1 py-1.5 px-3 rounded-xl text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-white text-[#0a1d47] font-bold shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {tab}
                          <span className={`ml-1 tabular-nums ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>{notifTabCounts[tab]}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* NOTIFICATIONS LIST CONTAINER */}
                  <div className="max-h-[340px] overflow-y-auto overflow-x-hidden custom-scrollbar divide-y divide-slate-100" style={{ scrollbarGutter: 'stable' }}>
                    {filteredNotifications.length === 0 ? (
                      <div className="py-10 text-center px-4">
                        <Bell size={24} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-700">
                          {notifTab === 'Today' ? 'Nothing new today' : notifTab === 'This Week' ? 'Nothing this week' : 'No notifications'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-normal">
                          {notifTab === 'All' ? 'You are all caught up.' : 'Older items are under All.'}
                        </p>
                      </div>
                    ) : (
                      filteredNotifications.map((n, idx) => {
                        const isUnread = !readNotifIds.has(n.id);
                        const isOverdue = n.id.startsWith('overdue-');
                        const IconComponent = n.id.startsWith('inv-')
                          ? Package
                          : n.id.startsWith('apt-')
                          ? Calendar
                          : n.id.startsWith('msg-')
                          ? MessageSquare
                          : isOverdue
                          ? AlertTriangle
                          : n.id.startsWith('inc-')
                          ? AlertCircle
                          : Wrench;

                        return (
                          <div
                            key={n.id}
                            onClick={() => { markNotifRead(n.id); handleNotifClick(n); }}
                            className="py-3 px-1 flex items-start gap-3 hover:bg-blue-50/40 transition-all cursor-pointer group relative"
                            style={{ animation: `kna-notif-item 0.18s ease-out ${idx * 0.03}s both` }}
                          >
                            <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              isOverdue
                                ? 'bg-rose-50 border-rose-200 text-rose-600'
                                : 'bg-blue-50 border-blue-100 text-[#1D4ED8]'
                            }`}>
                              <IconComponent size={17} strokeWidth={2} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 inline-block mt-[5px] ${isUnread ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                  <p className={`text-xs ${isUnread ? 'font-bold text-[#0a1d47]' : 'font-semibold text-slate-700'} break-words`}>
                                    {n.title}
                                  </p>
                                </div>
                                <span className="text-[10.5px] font-normal text-slate-400 shrink-0 tabular-nums">{n.time}</span>
                              </div>

                              <p className="text-[11.5px] text-slate-500 leading-snug mt-1 pl-3 font-normal line-clamp-2">
                                {n.message}
                              </p>
                            </div>

                            <IconButton icon={X} label="Dismiss" size={28} iconSize={14} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 -mr-1 -mt-1" onClick={(e) => { e.stopPropagation(); dismissNotif(n.id); }} />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-slate-300 mx-1.5"/>

            {/* Admin Profile Pill */}
            <div className="flex items-center gap-2 p-1 pl-1 pr-3.5 rounded-full cursor-pointer transition-all bg-slate-50 hover:bg-blue-50/70 hover:shadow-2xs border border-slate-200 text-slate-900" onClick={() => setActivePage('settings')}>
              <Avatar src={myAvatar} alt={adminProfile.name} size={32} />
              <span className="text-xs font-bold hidden sm:block text-[#0a1d47]">{adminProfile.name}</span>
            </div>
          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <main className="flex-1 overflow-hidden bg-[#F0F4FA]">
          <PageTransition pageKey={activePage}>
          <PageErrorBoundary resetKey={activePage} onReset={resetFailedSections} onDashboard={() => setActivePage('dashboard')}>
            {activePage === 'not-found' && <div className="page-scroll"><NotFoundPage onDashboard={() => setActivePage('dashboard')} /></div>}

            {activePage === 'dashboard' && (
              <div className="page-scroll bg-[#F0F4FA]">
                <div className="px-4 sm:px-6 md:px-8 py-6 w-full max-w-[1700px] mx-auto space-y-6">

                  {/* ── TOP HERO ROW: WELCOME BANNER + QUICK CLINIC OPERATIONS ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    <div className="lg:col-span-7 xl:col-span-8 flex">
                      <WelcomeBanner stats={stats} onNavigate={setActivePage} adminName={adminProfile.name} />
                    </div>

                    <div className="lg:col-span-5 xl:col-span-4 flex">
                      <div className="rounded-3xl border p-5 sm:p-6 w-full flex flex-col bg-white border-blue-100/80 shadow-2xs text-slate-900 transition-all"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.18s both' }}>
                        <div className="flex-1 flex flex-col">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-[#0a1d47]">Clinic Operations</h3>
                          </div>

                          {/* 2-Column responsive action grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 flex-1">
                            <button
                              onClick={() => {
                                setActivePage('patients');
                                setOpenAddPatientModal(true);
                              }}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <UserPlus size={15} />
                                </div>
                                <span className="truncate">New Patient</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-[#1D4ED8] shrink-0" />
                            </button>

                            <button
                              onClick={() => setActivePage('appointments')}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <Calendar size={15} />
                                </div>
                                <span className="truncate">Walk-In Apt</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-[#1D4ED8] shrink-0" />
                            </button>

                            <button
                              onClick={() => setActivePage('inventory')}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <Package size={15} />
                                </div>
                                <span className="truncate">Vaccine Stock</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-[#1D4ED8] shrink-0" />
                            </button>

                            <button
                              onClick={() => setActivePage('incidents')}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <MapIcon size={15} />
                                </div>
                                <span className="truncate">Incident Map</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-[#1D4ED8] shrink-0" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STAT BAR ── */}
                  <div className="rounded-3xl border bg-white border-blue-100/80 shadow-2xs overflow-hidden"
                    style={{ animation: 'kna-card-in 0.42s cubic-bezier(0.22,1,0.36,1) 0.04s both' }}>
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-blue-100/80">
                      {dashboardStatWidgets.map((w, i) => (
                        <div key={i} onClick={() => setActivePage(w.page)}
                          className="group flex-1 min-w-0 p-5 sm:p-6 cursor-pointer flex items-center justify-between transition-colors duration-200 hover:bg-blue-50/30">
                          <div className="min-w-0 pr-3">
                            <p className="text-3xl font-extrabold leading-tight pt-0.5 tabular-nums text-[#0a1d47] group-hover:text-[#1D4ED8] transition-colors">
                              {w.value}
                            </p>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-2 truncate">{w.label}</p>
                            <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate">{w.sub}</p>
                          </div>
                          {w.progress === null ? (
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs"
                              style={{ background: w.tint, border: `1px solid ${w.border}`, color: w.color }}>
                              <w.Icon size={20} strokeWidth={2} />
                            </div>
                          ) : (
                            <div className="shrink-0">
                              <CircularProgress percentage={w.progress} size={48} strokeWidth={4} color={w.color === '#DC2626' ? '#DC2626' : '#1D4ED8'} trackColor="#DBEAFE" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── MAIN DASHBOARD GRID: three equal panels, a fixed number of
                      rows each (no inner scrollbars), "View all" for the rest ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

                    <DashPanel
                      title="Overdue Doses"
                      subtitle="Patients past due on a scheduled dose"
                      badge={overdueList.length > 0 ? <StatusBadge tone="red" label={`${overdueList.length} overdue`} /> : null}
                      total={overdueList.length}
                      onViewAll={() => setActivePage('vaccination')}
                      delay="0.10s"
                      empty={<DashEmpty Icon={CheckCircle} tone="text-emerald-500" title="Everyone is on schedule" text="No overdue doses right now." />}
                    >
                      {overdueList.slice(0, DASH_PANEL_ROWS).map(o => (
                        <DashRow
                          key={o.key}
                          Icon={AlertCircle}
                          iconCls="bg-rose-50 text-rose-600 border-rose-200"
                          title={o.name}
                          sub={`${o.doseLabel} · due ${fmtDate(o.dueDate)}`}
                          badge={<StatusBadge tone="red" label={`${o.daysOverdue}d overdue`} />}
                          onClick={() => { setSelectedOverduePatientId(o.firestoreId); setActivePage('vaccination'); }}
                        />
                      ))}
                    </DashPanel>

                    <DashPanel
                      title="Today's Doses"
                      subtitle={<>Doses scheduled for <span className="font-semibold text-[#1D4ED8]">{fmtDate(todayStr)}</span></>}
                      badge={todayDosesList.length > 0 ? <StatusBadge tone="amber" label={`${todayDosesPending} due today`} /> : null}
                      total={todayDosesList.length}
                      onViewAll={() => setActivePage('vaccination')}
                      delay="0.14s"
                      empty={<DashEmpty Icon={Syringe} tone="text-blue-400" title="No doses due today" text={`Nothing is scheduled for ${fmtDate(todayStr)}.`} />}
                    >
                      {todayDosesList.slice(0, DASH_PANEL_ROWS).map(d => (
                        <DashRow
                          key={d.id}
                          Icon={d.done ? CheckCircle : Syringe}
                          iconCls={d.done ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-blue-50 text-[#1D4ED8] border-blue-200'}
                          title={d.name}
                          sub={`${d.doseLabel}${d.service ? ` · ${d.service}` : ''}`}
                          badge={<StatusBadge status={d.done ? 'administered' : 'due_today'} />}
                          onClick={() => { setSelectedOverduePatientId(d.patientId); setActivePage('vaccination'); }}
                        />
                      ))}
                    </DashPanel>

                    <DashPanel
                      title="Today's Schedule"
                      subtitle="Confirmed & pending clinic visits"
                      badge={todayScheduleList.length > 0 ? <StatusBadge tone="blue" label={`${todayScheduleList.length} appointment${todayScheduleList.length === 1 ? '' : 's'}`} /> : null}
                      total={todayScheduleList.length}
                      onViewAll={() => setActivePage('appointments')}
                      delay="0.18s"
                      empty={<DashEmpty Icon={Calendar} tone="text-slate-300" title="No visits today" text="No confirmed or pending appointments today." />}
                    >
                      {todayScheduleList.slice(0, DASH_PANEL_ROWS).map((apt, idx) => (
                        <DashRow
                          key={apt.id || idx}
                          Icon={Clock}
                          iconCls="bg-indigo-50 text-indigo-600 border-indigo-200"
                          title={apt.name || apt.patient || 'Patient'}
                          sub={`${apt.time || 'Time not set'} · ${formatServiceType(apt.type || apt.purpose)}`}
                          badge={<StatusBadge status={apt.status || 'pending'} />}
                          onClick={() => { setApptPreviewDate(todayStr); setActivePage('appointments'); }}
                        />
                      ))}
                    </DashPanel>

                  </div>
                </div>
              </div>
            )}

            <Suspense fallback={<SectionLoading />}>
            {activePage === 'appointments' && <div className="page-scroll"><AppointmentPage openPreviewDate={apptPreviewDate} onPreviewOpened={() => setApptPreviewDate(null)} /></div>}
            {activePage === 'patients'     && (
              <div className="page-scroll">
                <PatientRecordsPage
                  initialOpenAddModal={openAddPatientModal}
                  initialPatientForAdd={addModalInitialPatient}
                  onAddModalClosed={() => {
                    setOpenAddPatientModal(false);
                    setAddModalInitialPatient(null);
                  }}
                />
              </div>
            )}
            {activePage === 'vaccination'  && (
              <div className="page-scroll">
                <VaccinationTrackerPage
                  selectedPatientId={selectedOverduePatientId}
                  onClearSelectedPatient={() => setSelectedOverduePatientId(null)}
                  initialPatients={allPatients}
                />
              </div>
            )}
            {activePage === 'inventory'    && <div className="page-scroll"><VaccineInventoryPage/></div>}
            {activePage === 'incidents'    && <div className="page-scroll"><IncidentMapPage incidents={incidentList} loading={incidentsLoading}/></div>}
            {activePage === 'messages'     && <div className="page-scroll"><MessagesPage/></div>}
            {activePage === 'archive'      && <div className="page-scroll"><ArchivePage/></div>}
            {activePage === 'settings'     && <div className="page-scroll"><SettingsPage onLogout={onLogout}/></div>}
            {activePage === 'manage-admins' && role === 'manager' && <div className="page-scroll"><ManageAdmins/></div>}
            </Suspense>
          </PageErrorBoundary>

          </PageTransition>
        </main>
      </div>

      <style>{`
        *, html, body, button, input, select, textarea, span, div, p, a, h1, h2, h3, h4, h5, h6, nav, header, aside, section, main {
          font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        @keyframes kna-fade-in {
          from{opacity:0.85;}
          to  {opacity:1;}
        }
        @keyframes kna-banner-in {
          from{opacity:0;transform:translateY(-16px) scale(0.98);}
          to  {opacity:1;transform:translateY(0)      scale(1);}
        }
        @keyframes kna-card-in {
          from{opacity:0;transform:translateY(20px) scale(0.97);}
          to  {opacity:1;transform:translateY(0)    scale(1);}
        }
        @keyframes kna-section-in {
          from{opacity:0;transform:translateY(22px);}
          to  {opacity:1;transform:translateY(0);}
        }
        @keyframes kna-notif-in {
          from{opacity:0;transform:translateY(-10px) scale(0.96);}
          to  {opacity:1;transform:translateY(0)     scale(1);}
        }
        @keyframes kna-notif-item {
          from{opacity:0;transform:translateY(4px);}
          to  {opacity:1;transform:translateY(0);}
        }
        @keyframes kna-backdrop-in { from{opacity:0;} to{opacity:1;} }
        @keyframes kna-modal-in {
          from{opacity:0;transform:scale(0.94) translateY(20px);}
          to  {opacity:1;transform:scale(1)    translateY(0);}
        }
        @keyframes kna-badge-pop { 0%{transform:scale(0);} 70%{transform:scale(1.28);} 100%{transform:scale(1);} }

        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.12);border-radius:99px;}
        ::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,0.22);}
      `}</style>
    </div>
  );
}
