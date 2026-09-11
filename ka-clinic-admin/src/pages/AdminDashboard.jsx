import { signOut } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import {
  Activity, AlertCircle, AlertOctagon, AlertTriangle,
  Bell, Calendar, Check, CheckCheck, CheckCircle, CheckCircle2, Clock,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  Edit2, Eye, Filter, Home, Info, LogOut, MapPin as MapIcon, Menu,
  MessageSquare, Moon, MoreVertical, Package, Phone, Plus,
  RotateCcw, Search, Settings, Shield, Sun, Sunset, Syringe, UserPlus,
  Users, Wrench, X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import AppointmentPage from './appts';
import { auth, db } from '../lib/firebase';
import IncidentMapPage from './incidents';
import VaccineInventoryPage from './inventory';
import ManageAdmins from './ManageAdmins';
import MessagesPage from './messages';
import PatientRecordsPage from './patients';
import SettingsPage from './settings';
import { useAuth } from '../lib/useAuth';
import VaccinationTrackerPage, { buildDoses, fmtDate, getName } from './vaccination';
import { getTodayDateString } from '../lib/dates';

// ── Greeting helpers ─────────────────────────────────────────────────────────
function getGreeting(hour) {
  if (hour < 12) return { text: 'Good morning', Icon: Sun };
  if (hour < 17) return { text: 'Good afternoon', Icon: Sun };
  if (hour < 20) return { text: 'Good evening', Icon: Sunset };
  return { text: 'Good night', Icon: Moon };
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
// ── Photo-matched Noticeable Toast Notification Card ───────────────────────────
function ToastNotificationCard({ type = 'info', title, message, time, onDismiss, onClick }) {
  const config = {
    success: {
      bg: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    warning: {
      bg: 'bg-amber-500',
      icon: AlertTriangle,
    },
    info: {
      bg: 'bg-blue-500',
      icon: Info,
    },
    critical: {
      bg: 'bg-red-600',
      icon: AlertOctagon,
    },
    danger: {
      bg: 'bg-red-600',
      icon: AlertOctagon,
    }
  }[type] || { bg: 'bg-blue-500', icon: Info };

  const IconComp = config.icon;

  return (
    <div
      onClick={onClick}
      className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-3.5 px-4 shadow-xl border border-slate-200/80 flex items-center justify-between gap-3 relative transition-all duration-200 hover:shadow-2xl cursor-pointer group"
      style={{
        boxShadow: '0 12px 32px -8px rgba(15, 23, 42, 0.14), 0 4px 12px -2px rgba(15, 23, 42, 0.04)'
      }}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Circle Icon Container matching Photo */}
        <div className={`w-9 h-9 rounded-full ${config.bg} flex items-center justify-center text-white flex-shrink-0 shadow-sm`}>
          <IconComp size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 tracking-tight truncate leading-snug">
              {title}
            </h4>
            {time && <span className="text-[10px] font-medium text-slate-400 shrink-0">{time}</span>}
          </div>
          <p className="text-xs text-slate-500 leading-snug truncate mt-0.5 font-normal">
            {message}
          </p>
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0 cursor-pointer"
          title="Dismiss notification"
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function WelcomeBanner({ stats, onNavigate, adminName, tagline }) {
  return (
    <div className="relative rounded-3xl w-full h-full p-6 sm:p-7 overflow-hidden flex items-center justify-between gap-4 bg-white border border-slate-200/70 shadow-xs"
      style={{ animation: 'kna-banner-in 0.45s cubic-bezier(0.22,1,0.36,1) both' }}>

      <div className="relative z-10 max-w-sm sm:max-w-md">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Hello {adminName || 'Admin'}!
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
export default function AdminDashboard({ onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage,  setActivePage]  = useState('dashboard');
  const [openAddPatientModal, setOpenAddPatientModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Batch 5/6 — role drives the Manage Admins sidebar item + route guard
  // below. Also: if a manager revokes this session's account while it's
  // still open on a device (or the invite/OTP flow never granted access
  // in the first place), status flips away from "active" in real time —
  // sign out immediately rather than leaving a stale session on screen.
  const { role, status: adminStatus } = useAuth();
  useEffect(() => {
    if (adminStatus !== null && adminStatus !== 'active') {
      signOut(auth).finally(() => { if (onLogout) onLogout(); });
    }
  }, [adminStatus]);

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
  const [incidentList, setIncidentList] = useState([]);

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
  const [notifTab, setNotifTab] = useState('Today');
  const searchRef = useRef(null);
  const searchContainerRef = useRef(null);
  const [activeToast, setActiveToast] = useState(null);

  const triggerToast = (title, message, type = 'info', time = 'Just now') => {
    setActiveToast({ id: Date.now(), title, message, type, time });
    setTimeout(() => {
      setActiveToast(prev => (prev?.id ? null : prev));
    }, 5000);
  };

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
    const handleOpenAddPatientModal = () => {
      setActivePage('patients');
      setOpenAddPatientModal(true);
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
      const purpose = a.type || a.purpose || '';
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
          sub: `Category: ${cat || 'Supplies'} · ${i.quantity ?? i.stock ?? 0} units remaining`,
          page: 'inventory',
          item: i
        });
      }
    });

    // Search Incidents
    incidentList.forEach(inc => {
      const loc = inc.address || inc.location || inc.barangay || '';
      const victim = inc.victimName || inc.patient || '';
      if (loc.toLowerCase().includes(q) || victim.toLowerCase().includes(q)) {
        results.push({
          type: 'incident',
          title: `Incident: ${loc || 'Bite Report'}`,
          sub: victim ? `Victim: ${victim}` : 'Active exposure area',
          page: 'incidents',
          item: inc
        });
      }
    });

    return results.slice(0, 8);
  }, [searchQuery, allPatients, allAppointments, inventoryList, incidentList]);

  // Click Outside Notification Dropdown
  useEffect(() => {
    const handler = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Real-Time Listener on /settings/config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'config'), snap => {
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
  useEffect(() => {
    const q = query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, firestoreId: d.id, ...d.data() }));
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

      // Real-time overdue patient notifications
      const overdueNotifs = docs
        .map(p => {
          if (p.isArchived || p.status === 'completed') return null;
          const missed = buildDoses(p).filter(d => d.status === 'miss');
          if (missed.length === 0) return null;
          const earliest = missed.reduce((a, b) => (a.date < b.date ? a : b));
          const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(earliest.date).getTime()) / 86400000));
          return {
            id: `overdue-${p.id}`,
            patientId: p.firestoreId || p.id || p.name,
            type: 'critical',
            title: 'Patient Overdue for Vaccination',
            message: `${getName(p)} (${p.id || 'MRN'}) is ${daysOverdue}d overdue for ${earliest.label}.`,
            time: `${daysOverdue}d overdue`,
            icon: 'overdue'
          };
        })
        .filter(Boolean)
        .slice(0, 10);

      setNotifications(prev => [...overdueNotifs, ...prev.filter(n => !n.id.startsWith('overdue-'))]);
    });
  }, []);

  // Real-Time Listener on /appointments
  useEffect(() => {
    const today = getTodayDateString();
    const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const todays = all.filter(a => a.date === today);
      setTodayApts(todays);
      setStats(p => ({ ...p, todayApts: todays.length }));
      setAllAppointments(all);

      // Notification stream
      const aptNotifs = snap.docs.slice(0, 8).map(d => {
        const data = d.data();
        return {
          id: `apt-${d.id}`,
          type: data.status === 'confirmed' ? 'success' : data.status === 'cancelled' ? 'warning' : 'info',
          title: data.status === 'confirmed' ? 'Appointment Confirmed' : data.status === 'cancelled' ? 'Appointment Cancelled' : 'New Appointment Request',
          message: `${data.name || data.patient || 'Unknown'} — ${data.date || ''} at ${data.time || ''}`,
          time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
          icon: 'apt'
        };
      });
      setNotifications(p => [...aptNotifs, ...p.filter(n => !n.id.startsWith('apt-'))]);
    });
  }, []);

  // Real-Time Listener on /chatThreads
  useEffect(() => {
    const q = query(collection(db, 'chatThreads'), where('unread', '==', true));
    return onSnapshot(q, snap => {
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
          icon: 'msg'
        };
      });
      setNotifications(p => [...msgNotifs, ...p.filter(n => !n.id.startsWith('msg-'))]);
    });
  }, []);

  // Real-Time Listener on /inventory (Low stock alerts & Inventory Table)
  useEffect(() => {
    return onSnapshot(collection(db, 'inventory'), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventoryList(docs);
      const low = docs.filter(d => {
        const qty = d.quantity ?? d.stock ?? 0;
        return qty < 10 || d.status === 'critical' || d.status === 'warning';
      });
      setStats(p => ({ ...p, lowStock: low.length }));

      const stockNotifs = low.map(d => ({
        id: `inv-${d.id}`,
        type: d.status === 'critical' || (d.quantity ?? d.stock ?? 0) <= 0 ? 'critical' : 'warning',
        title: (d.quantity ?? d.stock ?? 0) <= 0 ? 'Out of Stock' : 'Low Stock Warning',
        message: `${d.name || 'Vaccine'} is running low (${d.quantity ?? d.stock ?? '?'} units remaining)`,
        time: 'Inventory',
        icon: 'stock'
      }));
      setNotifications(p => [...stockNotifs, ...p.filter(n => !n.id.startsWith('inv-'))]);
    });
  }, []);

  // Real-Time Listener on /incidents
  useEffect(() => {
    const q = query(collection(db, 'incidents'), limit(50));
    return onSnapshot(q, snap => {
      setIncidentList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

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
    const unsub = onSnapshot(doc(db, 'admins', uid), snap => {
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

  const filteredNotifications = notifications.filter(n => {
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
  });

  const unreadNotifCount = filteredNotifications.filter(n => !readNotifIds.has(n.id)).length;

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
      const next = new Set([...prev, ...filteredNotifications.map(n => n.id)]);
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
      const next = new Set([...prev, ...filteredNotifications.map(n => n.id)]);
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
      await signOut(auth);
      if (onLogout) onLogout();
      else window.location.href = '/';
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
    // Only a manager ever sees this item — role comes from Firestore via
    // useAuth(), never a hardcoded email/string check. Ordered before
    // Settings so admin-management sits with the rest of clinic management.
    ...(role === 'manager' ? [{ id: 'manage-admins', label: 'Manage Admins', icon: Shield }] : []),
    { id: 'settings',   label: 'Settings',            icon: Settings },
  ];

  const notifTypeStyle = type => ({
    success: { dot: 'bg-green-500' },
    warning: { dot: 'bg-amber-500' },
    critical:{ dot: 'bg-red-500' },
    info:    { dot: 'bg-sky-500' }
  }[type] || { dot: 'bg-gray-400' });

  // Overdue Dose Tracker — reuses vaccination.jsx's own buildDoses (same ARV
  // schedule + isOverdue logic the real Vaccination Tracker page uses, not
  // re-derived here) so "overdue" means exactly the same thing in both
  // places. A patient is overdue if any dose has status 'miss'; the widget
  // surfaces their single most-overdue dose.
  const overdueList = allPatients
    .map(p => {
      const missed = buildDoses(p).filter(d => d.status === 'miss');
      if (missed.length === 0) return null;
      const earliest = missed.reduce((a, b) => (a.date < b.date ? a : b));
      const daysOverdue = Math.floor((Date.now() - new Date(earliest.date).getTime()) / 86400000);
      return { id: p.id, firestoreId: p.firestoreId || p.id, name: getName(p), doseLabel: earliest.label, dueDate: earliest.date, daysOverdue };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  // Today's Doses — patients that have a vaccination dose scheduled strictly for today
  const todayStr = getTodayDateString();
  const todayDosesList = allPatients
    .flatMap(p => {
      if (p.isArchived) return [];
      const doses = buildDoses(p);
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
      value: stats.todayApts,
      sub: `${todayApts.filter(a => a.status === 'confirmed').length} confirmed`,
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
      {/* ── LOGOUT CONFIRM MODAL ── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', animation: 'kna-backdrop-in 0.2s ease both' }}
          onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200"
            style={{ animation: 'kna-modal-in 0.28s cubic-bezier(0.22,1,0.36,1) both' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-rose-50 border border-rose-200">
                <LogOut size={24} className="text-rose-600" />
              </div>
              <h2 className="text-base font-bold">Sign out of Admin Panel?</h2>
              <p className="text-sm mt-1.5 leading-relaxed text-gray-500">You will be redirected to the login page.</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all cursor-pointer hover:opacity-95 bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SIDEBAR (Deep Rich Dark Navy Blue Theme with SVG Curved Notch Cutout Active Tabs) ── */}
      <div className="fixed h-screen z-40 flex flex-col justify-between bg-[#06122c] text-white transition-all duration-300"
        style={{ width: sidebarOpen ? 256 : 76 }}>
        <div className="flex flex-col min-h-0 flex-1">
          {/* Logo Header — White background logo beside clinic name */}
          <div className={`py-5 border-b border-white/10 flex items-center min-h-[72px] transition-all duration-300 ${
            sidebarOpen ? 'px-4 justify-between' : 'pl-3 pr-0 justify-start'
          }`}>
            {sidebarOpen && (
              <div className="flex items-center gap-3 min-w-0 overflow-hidden">
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
              </div>
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
          <nav className="pl-3 pr-0 py-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
            <div>
              <div className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-widest text-white h-6 flex items-center overflow-hidden">
                <span className={`whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                  Clinical Management
                </span>
              </div>
              <div className="space-y-1">
                {menuItems.slice(0, 7).map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <button key={item.id} onClick={() => { setSelectedOverduePatientId(null); setActivePage(item.id); }}
                      className={`group w-full flex items-center gap-3 relative cursor-pointer text-sm leading-snug transition-colors duration-150 ${
                        isActive
                          ? 'bg-[#F0F4FA] text-black font-extrabold rounded-l-2xl pl-3.5 pr-3 py-3 relative z-10 -mr-1 w-[calc(100%+4px)]'
                          : 'text-white font-medium hover:bg-white/10 hover:text-white pl-3.5 pr-3 py-2.5 rounded-xl mr-4'
                      }`}
                      title={!sidebarOpen ? item.label : ''}>

                      {/* PERFECT SVG CONCAVE CURVED NOTCHES */}
                      {isActive && (
                        <>
                          <svg className="absolute -right-0.5 -top-4 w-4 h-4 text-[#F0F4FA] pointer-events-none z-20" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M16 16V0C16 8.83656 8.83656 16 0 16H16Z" />
                          </svg>
                          <svg className="absolute -right-0.5 -bottom-4 w-4 h-4 text-[#F0F4FA] pointer-events-none z-20" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M16 0V16C16 7.16344 8.83656 0 0 0H16Z" />
                          </svg>
                        </>
                      )}

                      <item.icon size={19} strokeWidth={2.2} className={`flex-shrink-0 transition-colors relative z-10 ${isActive ? 'text-black' : 'text-white'}`}/>
                      <span className={`relative z-10 ${isActive ? 'text-black font-extrabold' : 'text-white'}`} style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s', flex: 1, textAlign: 'left' }}>
                        {item.label}
                      </span>
                      {item.badge > 0 && (
                        <span className={`relative z-10 bg-rose-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center ${sidebarOpen ? 'px-2 py-0.5' : 'absolute top-1 right-1 w-4 h-4 text-[9px]'}`}>
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-widest text-white h-6 flex items-center overflow-hidden">
                <span className={`whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                  System & Logistics
                </span>
              </div>
              <div className="space-y-1">
                {menuItems.slice(7).map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <button key={item.id} onClick={() => { setSelectedOverduePatientId(null); setActivePage(item.id); }}
                      className={`group w-full flex items-center gap-3 relative cursor-pointer text-sm leading-snug transition-colors duration-150 ${
                        isActive
                          ? 'bg-[#F0F4FA] text-black font-extrabold rounded-l-2xl pl-3.5 pr-3 py-3 relative z-10 -mr-1 w-[calc(100%+4px)]'
                          : 'text-white font-medium hover:bg-white/10 hover:text-white pl-3.5 pr-3 py-2.5 rounded-xl mr-4'
                      }`}
                      title={!sidebarOpen ? item.label : ''}>

                      {/* PERFECT SVG CONCAVE CURVED NOTCHES */}
                      {isActive && (
                        <>
                          <svg className="absolute -right-0.5 -top-4 w-4 h-4 text-[#F0F4FA] pointer-events-none z-20" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M16 16V0C16 8.83656 8.83656 16 0 16H16Z" />
                          </svg>
                          <svg className="absolute -right-0.5 -bottom-4 w-4 h-4 text-[#F0F4FA] pointer-events-none z-20" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M16 0V16C16 7.16344 8.83656 0 0 0H16Z" />
                          </svg>
                        </>
                      )}

                      <item.icon size={19} strokeWidth={2.2} className={`flex-shrink-0 transition-colors relative z-10 ${isActive ? 'text-black' : 'text-white'}`}/>
                      <span className={`relative z-10 ${isActive ? 'text-black font-extrabold' : 'text-white'}`} style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s', flex: 1, textAlign: 'left' }}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        {/* Logout Footer */}
        <div className="p-3 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 pl-3.5 pr-3 py-2.5 rounded-xl transition-colors cursor-pointer text-sm font-medium text-white hover:bg-white/10 hover:text-rose-300"
          title={!sidebarOpen ? 'Sign Out' : ''}>
            <LogOut size={19} strokeWidth={2} className="flex-shrink-0 text-white" />
            <span style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s' }}>
              Sign Out
            </span>
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#F0F4FA]"
        style={{ marginLeft: sidebarOpen ? 256 : 76, transition: 'margin-left 0.4s cubic-bezier(0.22,1,0.36,1)' }}>

        {/* ── STICKY TOP HEADER (CLEAN WHITE MODERN DESIGN) ── */}
        <header className="border-b sticky top-0 z-30 h-20 flex items-center px-7 justify-between flex-shrink-0 transition-all bg-white border-slate-200 text-slate-900 gap-4 shadow-2xs">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-6 w-1 rounded-full bg-[#1D4ED8]"/>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight text-[#0a1d47]">{menuItems.find(m => m.id === activePage)?.label || 'Dashboard'}</h1>
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
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 p-1 text-slate-400 hover:text-[#0a1d47] rounded-full hover:bg-blue-50 cursor-pointer"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
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
              <button onClick={() => setNotifOpen(o => !o)}
                className="w-11 h-11 flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-[#1D4ED8] text-slate-700 shadow-2xs relative cursor-pointer transition-all">
                <Bell size={19}/>
                {unreadNotifCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] bg-rose-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1" style={{ animation: 'kna-badge-pop 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
              </button>

              {/* ── NOTIFICATION CENTER CARD ── */}
              {notifOpen && (
                <div
                  className="absolute right-0 top-13 w-[min(400px,calc(100vw-2rem))] rounded-3xl shadow-2xl border border-slate-200 bg-white z-50 overflow-hidden p-5 text-slate-900"
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
                    {['Today', 'This Week', 'Earlier'].map((tab) => {
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
                        </button>
                      );
                    })}
                  </div>

                  {/* NOTIFICATIONS LIST CONTAINER */}
                  <div className="max-h-[340px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                    {filteredNotifications.length === 0 ? (
                      <div className="py-10 text-center px-4">
                        <Bell size={24} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-700">No Notifications</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-normal">All clear for today!</p>
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
                            <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform ${
                              isOverdue
                                ? 'bg-rose-50 border-rose-200 text-rose-600'
                                : 'bg-blue-50 border-blue-100 text-[#1D4ED8]'
                            }`}>
                              <IconComponent size={17} strokeWidth={2} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 inline-block ${isUnread ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                  <p className={`text-xs ${isUnread ? 'font-bold text-[#0a1d47]' : 'font-semibold text-slate-700'} truncate`}>
                                    {n.title}
                                  </p>
                                </div>
                                <span className="text-[10.5px] font-normal text-slate-400 shrink-0 tabular-nums">{n.time}</span>
                              </div>

                              <p className="text-[11.5px] text-slate-500 leading-snug mt-1 pl-3 font-normal line-clamp-2">
                                {n.message}
                              </p>
                            </div>

                            <button
                              onClick={(e) => { e.stopPropagation(); dismissNotif(n.id); }}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200/60 transition-all shrink-0 cursor-pointer -mr-1 -mt-1"
                              title="Dismiss"
                            >
                              <X size={14}/>
                            </button>
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
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0a1d47] to-[#1D4ED8] flex items-center justify-center text-white font-extrabold text-xs shadow-2xs">
                {adminProfile.initials}
              </div>
              <span className="text-xs font-bold hidden sm:block text-[#0a1d47]">{adminProfile.name}</span>
            </div>
          </div>
        </header>

        {/* Floating Real-Time Noticeable Toast Container */}
        {activeToast && (
          <div className="fixed top-24 right-6 z-50 w-96 transition-all duration-300" style={{ animation: 'kna-notif-in 0.25s cubic-bezier(0.22,1,0.36,1) both' }}>
            <ToastNotificationCard
              type={activeToast.type}
              title={activeToast.title}
              message={activeToast.message}
              time={activeToast.time}
              onDismiss={() => setActiveToast(null)}
            />
          </div>
        )}

        {/* ── PAGE CONTENT ── */}
        <main className="flex-1 overflow-hidden bg-[#F0F4FA]">
          <PageTransition pageKey={activePage}>

            {activePage === 'dashboard' && (
              <div className="h-full overflow-y-auto bg-[#F0F4FA]">
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
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs hover:-translate-y-0.5 h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <UserPlus size={15} />
                                </div>
                                <span className="truncate">New Patient</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-transform text-slate-400 group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 shrink-0" />
                            </button>

                            <button
                              onClick={() => setActivePage('appointments')}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs hover:-translate-y-0.5 h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <Calendar size={15} />
                                </div>
                                <span className="truncate">Walk-In Apt</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-transform text-slate-400 group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 shrink-0" />
                            </button>

                            <button
                              onClick={() => setActivePage('inventory')}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs hover:-translate-y-0.5 h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <Package size={15} />
                                </div>
                                <span className="truncate">Vaccine Stock</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-transform text-slate-400 group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 shrink-0" />
                            </button>

                            <button
                              onClick={() => setActivePage('incidents')}
                              className="group flex items-center justify-between p-3.5 px-4 rounded-2xl text-xs font-semibold border border-blue-100/80 transition-all cursor-pointer bg-blue-50/30 hover:bg-white hover:border-blue-300 text-[#0a1d47] shadow-2xs hover:shadow-xs hover:-translate-y-0.5 h-full"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0 border border-blue-100">
                                  <MapIcon size={15} />
                                </div>
                                <span className="truncate">Incident Map</span>
                              </span>
                              <ChevronRightIcon size={14} className="transition-transform text-slate-400 group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 shrink-0" />
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
                            <p className="text-3xl font-extrabold leading-none tabular-nums text-[#0a1d47] group-hover:text-[#1D4ED8] transition-colors">
                              {w.value}
                            </p>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-2 truncate">{w.label}</p>
                            <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate">{w.sub}</p>
                          </div>
                          {w.progress === null ? (
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 shadow-2xs"
                              style={{ background: w.tint, border: `1px solid ${w.border}`, color: w.color }}>
                              <w.Icon size={20} strokeWidth={2} />
                            </div>
                          ) : (
                            <div className="transition-transform group-hover:scale-105 shrink-0">
                              <CircularProgress percentage={w.progress} size={48} strokeWidth={4} color={w.color === '#DC2626' ? '#DC2626' : '#1D4ED8'} trackColor="#DBEAFE" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── MAIN DASHBOARD GRID ── */}
                  {/* ── MAIN DASHBOARD GRID (3 EQUAL COLUMNS: OVERDUE, TODAY'S DOSES, TODAY'S SCHEDULE) ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

                    {/* 1. Overdue Dose Tracker Card */}
                    <div className="rounded-3xl border overflow-hidden bg-white border-blue-100/80 shadow-2xs text-slate-900 flex flex-col h-full"
                      style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.10s both' }}>
                      <div className="p-5 border-b border-blue-50 bg-blue-50/40 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold tracking-tight text-[#0a1d47]">Overdue Dose Tracker</h3>
                            {overdueList.length > 0 && (
                              <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">
                                {overdueList.length} Action Needed
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] mt-0.5 text-slate-500 font-normal">Patients past due on scheduled doses</p>
                        </div>
                        <button onClick={() => setActivePage('vaccination')}
                          className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer">
                          View All →
                        </button>
                      </div>

                      {overdueList.length === 0 ? (
                        <div className="py-12 text-center p-5 flex-1 flex flex-col items-center justify-center min-h-[260px]">
                          <CheckCircle size={28} className="text-emerald-500 mx-auto mb-2" />
                          <p className="text-sm font-bold text-slate-800">All patients on schedule!</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-normal">No overdue doses detected.</p>
                        </div>
                      ) : (
                        <div className="p-3.5 space-y-2.5 flex-1 overflow-y-auto max-h-[440px] custom-scrollbar">
                          {overdueList.slice(0, 8).map(o => (
                            <button key={o.id} onClick={() => { setSelectedOverduePatientId(o.firestoreId || o.id || o.name); setActivePage('vaccination'); }}
                              className="w-full flex items-center justify-between gap-2.5 p-3 rounded-2xl transition-all cursor-pointer text-left bg-slate-50/50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 group">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-rose-100/80 text-rose-600 border border-rose-200/60">
                                  <AlertCircle size={15} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#0a1d47] group-hover:text-[#1D4ED8] transition-colors truncate">{o.name}</p>
                                  <p className="text-[10.5px] text-slate-500 font-normal truncate">{o.doseLabel} · <span className="font-semibold text-rose-600">{fmtDate(o.dueDate)}</span></p>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 bg-rose-50 text-rose-600 border-rose-200">
                                {o.daysOverdue}d overdue
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 2. Today's Doses Card (In Between) */}
                    <div className="rounded-3xl border overflow-hidden bg-white border-blue-100/80 shadow-2xs text-slate-900 flex flex-col h-full"
                      style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.14s both' }}>
                      <div className="p-5 border-b border-blue-50 bg-blue-50/40 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold tracking-tight text-[#0a1d47]">Today's Doses</h3>
                            {todayDosesList.length > 0 && (
                              <span className="bg-blue-50 text-[#1D4ED8] text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                                {todayDosesList.length} Due Today
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] mt-0.5 text-slate-500 font-normal">
                            Patients scheduled for today · <span className="font-semibold text-[#1D4ED8]">{fmtDate(todayStr)}</span>
                          </p>
                        </div>
                        <button onClick={() => setActivePage('vaccination')}
                          className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer">
                          View All →
                        </button>
                      </div>

                      {todayDosesList.length === 0 ? (
                        <div className="py-12 text-center p-5 flex-1 flex flex-col items-center justify-center min-h-[260px]">
                          <CheckCircle size={28} className="text-blue-400 mx-auto mb-2" />
                          <p className="text-sm font-bold text-slate-800">No doses due today</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-normal">No patients scheduled for {fmtDate(todayStr)}.</p>
                        </div>
                      ) : (
                        <div className="p-3.5 space-y-2.5 flex-1 overflow-y-auto max-h-[440px] custom-scrollbar">
                          {todayDosesList.slice(0, 8).map(d => (
                            <button key={d.id} onClick={() => { setSelectedOverduePatientId(d.patientId); setActivePage('vaccination'); }}
                              className="w-full flex items-center justify-between gap-2.5 p-3 rounded-2xl transition-all cursor-pointer text-left bg-slate-50/50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 group">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                  d.done ? 'bg-emerald-100/80 text-emerald-600 border border-emerald-200/60' : 'bg-blue-100/80 text-[#1D4ED8] border border-blue-200/60'
                                }`}>
                                  {d.done ? <CheckCircle size={15} /> : <Syringe size={15} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#0a1d47] group-hover:text-[#1D4ED8] transition-colors truncate">{d.name}</p>
                                  <p className="text-[10.5px] text-slate-500 font-normal truncate">{d.doseLabel}{d.service ? ` · ${d.service}` : ''}</p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end flex-shrink-0 gap-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                                  d.done ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {d.done ? 'Administered' : 'Due Today'}
                                </span>
                                <span className="text-[10px] font-bold text-[#1D4ED8] bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-200/60">
                                  {fmtDate(d.dueDate)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 3. Today's Schedule Card (Same Size) */}
                    <div className="rounded-3xl border overflow-hidden bg-white border-blue-100/80 shadow-2xs text-slate-900 flex flex-col h-full"
                      style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.18s both' }}>
                      <div className="p-5 border-b border-blue-50 bg-blue-50/40 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold tracking-tight text-[#0a1d47]">Today's Schedule</h3>
                            {todayApts.length > 0 && (
                              <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                                {todayApts.length} Appointment{todayApts.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] mt-0.5 text-slate-500 font-normal">Confirmed & pending clinic visits</p>
                        </div>
                        <button onClick={() => setActivePage('appointments')}
                          className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer">
                          View All →
                        </button>
                      </div>

                      {todayApts.length === 0 ? (
                        <div className="py-12 text-center p-5 flex-1 flex flex-col items-center justify-center min-h-[260px]">
                          <Calendar size={28} className="text-slate-300 mx-auto mb-2" />
                          <p className="text-sm font-bold text-slate-800">No appointments today</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-normal">All clear for today</p>
                        </div>
                      ) : (
                        <div className="p-3.5 space-y-2.5 flex-1 overflow-y-auto max-h-[440px] custom-scrollbar">
                          {[...todayApts].sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 8).map((apt, idx) => (
                            <button key={apt.id || idx} onClick={() => setActivePage('appointments')}
                              className="w-full flex items-center justify-between gap-2.5 p-3 rounded-2xl transition-all cursor-pointer text-left bg-slate-50/50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 group">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-100/80 text-indigo-600 border border-indigo-200/60">
                                  <Clock size={15} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#0a1d47] group-hover:text-[#1D4ED8] transition-colors truncate">{apt.name || apt.patient || 'Patient'}</p>
                                  <p className="text-[10.5px] text-slate-500 font-normal truncate">{apt.time || '10:00 AM'} · {apt.type || apt.purpose || 'Consultation'}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                                apt.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-blue-50 text-blue-600 border-blue-200'
                              }`}>
                                {apt.status || 'Scheduled'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            )}

            {activePage === 'appointments' && <div className="h-full overflow-y-auto"><AppointmentPage/></div>}
            {activePage === 'patients'     && (
              <div className="h-full overflow-y-auto">
                <PatientRecordsPage
                  initialOpenAddModal={openAddPatientModal}
                  onAddModalClosed={() => setOpenAddPatientModal(false)}
                />
              </div>
            )}
            {activePage === 'vaccination'  && (
              <div className="h-full overflow-y-auto">
                <VaccinationTrackerPage
                  selectedPatientId={selectedOverduePatientId}
                  onClearSelectedPatient={() => setSelectedOverduePatientId(null)}
                  initialPatients={allPatients}
                />
              </div>
            )}
            {activePage === 'inventory'    && <div className="h-full overflow-y-auto"><VaccineInventoryPage/></div>}
            {activePage === 'incidents'    && <div className="h-full overflow-y-auto"><IncidentMapPage/></div>}
            {activePage === 'messages'     && <div className="h-full overflow-y-auto"><MessagesPage/></div>}
            {activePage === 'settings'     && <div className="h-full overflow-y-auto"><SettingsPage onLogout={onLogout}/></div>}
            {activePage === 'manage-admins' && role === 'manager' && <ManageAdmins/>}

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
          from{opacity:0;transform:translateX(8px);}
          to  {opacity:1;transform:translateX(0);}
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