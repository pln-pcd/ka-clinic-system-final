// kna-admin/src/AdminDashboard.jsx
import { signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import {
  Activity, AlertCircle, AlertOctagon, AlertTriangle,
  Bell, Calendar, Check, CheckCircle, CheckCircle2, Clock,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  Edit2, Eye, Filter, Home, Info, LogOut, MapPin as MapIcon, Menu,
  MessageSquare, Moon, MoreVertical, Package, Phone, Plus,
  RotateCcw, Search, Settings, Shield, Sun, Sunset, UserPlus,
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
    <div className="relative rounded-xl w-full h-full p-4 sm:p-5 overflow-hidden flex items-center justify-between gap-4 bg-gradient-to-r from-[#0F172A] to-[#1E293B]"
      style={{ animation: 'kna-banner-in 0.45s cubic-bezier(0.22,1,0.36,1) both' }}>

      <div className="relative z-10 max-w-sm sm:max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Hello {adminName || 'Admin'}!
        </h2>
        <p className="text-xs sm:text-sm mt-1.5 leading-relaxed text-slate-300">
          {tagline || 'Your trusted partner in rabies prevention and clinical care. Track patient vaccinations, appointments, and exposure cases in Libon, Albay.'}
        </p>
      </div>

      <div className="relative z-10 hidden sm:block self-stretch shrink-0 w-1/2 max-w-[360px]">
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
  const [visible, setVisible]     = useState(false);
  const [displayKey, setDisplayKey] = useState(pageKey);
  const [content, setContent]     = useState(children);

  useEffect(() => {
    if (pageKey !== displayKey) {
      setVisible(false);
      const t = setTimeout(() => {
        setDisplayKey(pageKey);
        setContent(children);
        setVisible(true);
      }, 170);
      return () => clearTimeout(t);
    } else {
      setVisible(true);
    }
  }, [pageKey]);

  useEffect(() => {
    if (pageKey === displayKey) setContent(children);
  }, [children]);

  return (
    <div style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'none' : 'translateY(14px) scale(0.993)',
      filter:     visible ? 'none' : 'blur(2px)',
      transition: 'opacity 0.32s cubic-bezier(0.22,1,0.36,1), transform 0.32s cubic-bezier(0.22,1,0.36,1), filter 0.28s ease',
      height: '100%',
    }}>
      {content}
    </div>
  );
}

// ── Main Dashboard Component ──────────────────────────────────────────────────
export default function AdminDashboard({ onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage,  setActivePage]  = useState('dashboard');
  const [currentMonth,setCurrentMonth]= useState(new Date());
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

  const [stats, setStats] = useState({ patients: 0, todayApts: 0, unreadMessages: 0, lowStock: 0, patientsThisWeek: 0 });
  const [recentPatients, setRecentPatients] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [todayApts, setTodayApts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [allAppointments, setAllAppointments] = useState([]);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [inventoryList, setInventoryList] = useState([]);
  const [incidentList, setIncidentList] = useState([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readNotifIds, setReadNotifIds] = useState(new Set());
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
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
      const loc = inc.location || inc.barangay || '';
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
    const q = query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentPatients(docs.slice(0, 5));
      setAllPatients(docs);

      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const registeredThisWeek = docs.filter(d => {
        const ts = typeof d.createdAt === 'number' ? d.createdAt : (d.createdAt?.toMillis?.() || Date.parse(d.date) || 0);
        return ts >= oneWeekAgo;
      }).length;

      setStats(p => ({ ...p, patients: snap.size, patientsThisWeek: registeredThisWeek }));
    });
  }, []);

  // Real-Time Listener on /appointments
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
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
    return onSnapshot(collection(db, 'incidents'), snap => {
      setIncidentList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Aggregated Recent Activity Stream
  useEffect(() => {
    const unsubAppts = onSnapshot(query(collection(db, 'appointments'), orderBy('createdAt', 'desc')), snapApt => {
      const aptEvents = snapApt.docs.slice(0, 4).map(d => {
        const data = d.data();
        return {
          id: `act-apt-${d.id}`,
          action: data.status === 'confirmed' ? 'Appointment Confirmed' : data.status === 'cancelled' ? 'Appointment Cancelled' : 'New Appointment Request',
          patient: data.name || data.patient || 'Patient',
          time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Recently',
          type: data.status === 'confirmed' ? 'success' : data.status === 'cancelled' ? 'warning' : 'info',
          rawTime: data.createdAt || 0,
        };
      });

      setRecentActivity(aptEvents);
    });

    return () => unsubAppts();
  }, []);

  // Pull the durable dismissed list for this admin. Unioned with whatever is
  // already in state so a dismissal made while offline isn't dropped by the
  // first server snapshot.
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'admins', uid), snap => {
      const saved = snap.data()?.dismissedNotifications;
      if (!Array.isArray(saved)) return;
      setDismissedNotifIds(prev => {
        const next = new Set([...prev, ...saved]);
        if (next.size === prev.size) return prev;
        try { localStorage.setItem('kna_dismissed_notifications', JSON.stringify([...next])); } catch (e) {}
        return next;
      });
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
    return true;
  });

  const unreadNotifCount = filteredNotifications.filter(n => !readNotifIds.has(n.id)).length;
  const markAllRead  = () => setReadNotifIds(new Set(filteredNotifications.map(n => n.id)));

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

  const getDaysInMonth    = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth= d => new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  const getAptsForDay     = day => {
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const ds = String(day).padStart(2, '0');
    const target = `${y}-${m}-${ds}`;
    return allAppointments.filter(a => a.date === target);
  };

  const renderCalendarDays = () => {
    const days = [];
    const firstDay = getFirstDayOfMonth(currentMonth);
    const total = getDaysInMonth(currentMonth);
    const today = new Date();

    for (let i = 0; i < firstDay; i++) days.push(<div key={`e-${i}`} />);

    for (let day = 1; day <= total; day++) {
      const isToday = day === today.getDate() && currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
      const dayApts = getAptsForDay(day);
      const hasApts = dayApts.length > 0;
      const isSelected = selectedCalendarDay === day;

      days.push(
        <div
          key={day}
          onClick={() => setSelectedCalendarDay(isSelected ? null : day)}
          className="relative p-1.5 text-center rounded-lg text-xs font-semibold cursor-pointer select-none"
          style={{
            background: isSelected ? '#111827' : isToday ? '#6366F1' : hasApts ? '#EEF2FF' : 'transparent',
            color: isSelected ? '#fff' : isToday ? '#fff' : hasApts ? '#4338CA' : '#374151',
            fontWeight: isToday ? 700 : 500,
            transition: 'background 0.18s,color 0.18s,transform 0.15s'
          }}
          onMouseEnter={e => { if (!isSelected && !isToday) e.currentTarget.style.transform = 'scale(1.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {day}
          {hasApts && !isToday && !isSelected && (
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
              {dayApts.slice(0, 3).map((a, i) => (
                <span
                  key={i}
                  className={`w-1 h-1 rounded-full inline-block ${
                    a.status === 'confirmed' ? 'bg-green-500' :
                    a.status === 'cancelled' ? 'bg-red-500' :
                    a.status === 'done' ? 'bg-sky-500' : 'bg-amber-500'
                  }`}
                />
              ))}
            </span>
          )}
          {hasApts && isToday && (
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white inline-block" />
          )}
        </div>
      );
    }
    return days;
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
      return { id: p.id, name: getName(p), doseLabel: earliest.label, dueDate: earliest.date, daysOverdue };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

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
      sub: `${stats.patientsThisWeek} registered this week`,
      color: '#475569', tint: '#F1F5F9', border: '#E2E8F0',
      Icon: Users,
      progress: null, // plain running total — no bounded rate to ring
      page: 'patients'
    },
    {
      label: 'Today Appointments',
      value: stats.todayApts,
      sub: `${todayApts.filter(a => a.status === 'confirmed').length} confirmed`,
      color: '#475569', tint: '#F1F5F9', border: '#E2E8F0',
      Icon: Calendar,
      progress: todayApts.length ? Math.round((todayApts.filter(a => a.status === 'confirmed').length / todayApts.length) * 100) : 0,
      page: 'appointments'
    },
    {
      label: 'Unread Messages',
      value: stats.unreadMessages,
      sub: 'Require attention',
      color: '#475569', tint: '#F1F5F9', border: '#E2E8F0',
      Icon: MessageSquare,
      progress: null, // no natural denominator in current data
      page: 'messages'
    },
    {
      label: 'Low Stock Items',
      value: stats.lowStock,
      sub: stats.lowStock > 0 ? 'Action required' : 'Stock optimal',
      color: stats.lowStock > 0 ? '#C8151A' : '#059669',
      tint: stats.lowStock > 0 ? '#FEF2F2' : '#ECFDF5',
      border: stats.lowStock > 0 ? '#FECACA' : '#A7F3D0',
      Icon: Package,
      progress: inventoryList.length ? Math.round(((inventoryList.length - stats.lowStock) / inventoryList.length) * 100) : 100,
      page: 'inventory'
    }
  ];

  return (
    <div className="min-h-screen flex font-sans bg-[#F4F5F7] text-gray-900">
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

      {/* ── SIDEBAR (permanent dark charcoal nav rail) ── */}
      <div className="fixed h-screen z-40 border-r border-slate-800 shadow-sm flex flex-col justify-between bg-slate-900 text-slate-300 transition-all duration-300"
        style={{ width: sidebarOpen ? 256 : 76 }}>
        <div className="flex flex-col min-h-0 flex-1">
          {/* Logo Header — White background logo beside clinic name */}
          <div className="px-4 py-5 border-b border-slate-800 flex items-center justify-between min-h-[72px]">
            <div style={{ opacity: sidebarOpen ? 1 : 0, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-12px)', transition: 'opacity 0.22s,transform 0.25s', pointerEvents: sidebarOpen ? 'auto' : 'none', overflow: 'hidden', whiteSpace: 'nowrap' }} className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 flex-shrink-0 shadow-sm border border-slate-200/20">
                <img
                  src="/assets/dashboard/logo-white.png"
                  alt="K&A Clinic Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base tracking-tight leading-tight text-white">K&A Clinic</h1>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Clinical Admin</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl flex-shrink-0 cursor-pointer transition-colors hover:bg-slate-800 text-slate-400 hover:text-white"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              <Menu size={20} strokeWidth={2} />
            </button>
          </div>

          {/* Nav List */}
          <nav className="px-3 py-4 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
            <div>
              {sidebarOpen && (
                <div className="px-3 pb-2 text-[10.5px] font-medium uppercase tracking-widest text-slate-500">
                  Clinical Management
                </div>
              )}
              <div className="space-y-0.5">
                {menuItems.slice(0, 7).map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <button key={item.id} onClick={() => setActivePage(item.id)}
                      className={`group w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg relative cursor-pointer text-sm leading-snug transition-colors border-l-2 ${
                        isActive
                          ? 'bg-indigo-600/10 text-white font-semibold border-indigo-500'
                          : 'text-slate-400 font-medium hover:bg-slate-800/60 hover:text-slate-100 border-transparent'
                      }`}
                      title={!sidebarOpen ? item.label : ''}>
                      <item.icon size={19} strokeWidth={1.9} className={`flex-shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`}/>
                      <span style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s', flex: 1, textAlign: 'left' }}>
                        {item.label}
                      </span>
                      {item.badge > 0 && (
                        <span className={`bg-rose-600 text-white text-[11px] font-medium rounded-full flex items-center justify-center ${sidebarOpen ? 'px-2 py-0.5' : 'absolute top-1 right-1 w-4 h-4 text-[9px]'}`}>
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              {sidebarOpen && (
                <div className="px-3 pb-2 text-[10.5px] font-medium uppercase tracking-widest text-slate-500">
                  System & Logistics
                </div>
              )}
              <div className="space-y-0.5">
                {menuItems.slice(7).map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <button key={item.id} onClick={() => setActivePage(item.id)}
                      className={`group w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg relative cursor-pointer text-sm leading-snug transition-colors border-l-2 ${
                        isActive
                          ? 'bg-indigo-600/10 text-white font-semibold border-indigo-500'
                          : 'text-slate-400 font-medium hover:bg-slate-800/60 hover:text-slate-100 border-transparent'
                      }`}
                      title={!sidebarOpen ? item.label : ''}>
                      <item.icon size={19} strokeWidth={1.9} className={`flex-shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`}/>
                      <span style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s', flex: 1, textAlign: 'left' }}>
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
        <div className="p-3 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg transition-colors cursor-pointer text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400"
          title={!sidebarOpen ? 'Sign Out' : ''}>
            <LogOut size={19} strokeWidth={1.9} className="flex-shrink-0" />
            <span style={{ opacity: sidebarOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.18s' }}>
              Sign Out
            </span>
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden"
        style={{ marginLeft: sidebarOpen ? 256 : 76, transition: 'margin-left 0.4s cubic-bezier(0.22,1,0.36,1)' }}>

        {/* ── STICKY TOP HEADER ── */}
        <header className="border-b sticky top-0 z-30 h-20 flex items-center px-7 justify-between flex-shrink-0 shadow-sm transition-colors bg-white border-gray-200 text-gray-900 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-6 w-1 rounded-full bg-red-600"/>
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-tight">{menuItems.find(m => m.id === activePage)?.label || 'Dashboard'}</h1>
              <p className="text-xs leading-none mt-1.5 text-gray-500">K&A Anti-Rabies Vaccination Clinic</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* ── EXPANDABLE CIRCULAR SEARCH BAR (HOME DASHBOARD ONLY) ── */}
            {activePage === 'dashboard' && (
              <div
                className={`relative transition-all duration-300 ease-in-out ${
                  searchFocused || searchQuery ? 'w-72 sm:w-80' : 'w-36 sm:w-44'
                }`}
                ref={searchContainerRef}
              >
                <div className={`relative flex items-center w-full rounded-full border transition-all duration-300 ${
                  searchFocused
                    ? 'bg-white border-slate-300 shadow-sm ring-2 ring-slate-200/60'
                    : 'bg-slate-100/90 border-slate-200/90 hover:bg-slate-100 hover:border-slate-300'
                }`}>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    placeholder="Search..."
                    className="w-full py-1.5 px-4 text-xs font-medium bg-transparent text-slate-800 placeholder-slate-400 outline-none rounded-full"
                  />
                  {searchQuery ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50 cursor-pointer"
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => searchRef.current?.focus()}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Search"
                    >
                      <Search size={14} />
                    </button>
                  )}
                </div>

                {/* Circular Search Results Dropdown */}
                {searchFocused && searchQuery.trim() !== '' && (
                  <div className="absolute right-0 top-11 w-80 bg-white rounded-3xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden max-h-96 overflow-y-auto custom-scrollbar"
                    style={{ animation: 'kna-notif-in 0.18s ease-out both' }}>
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Search Results</span>
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
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
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
                              className="p-2.5 rounded-2xl flex items-center justify-between gap-2.5 hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-100"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                                  <IconComp size={14} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate">{res.title}</p>
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
              <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) markAllRead(); }}
                className="w-10 h-10 flex items-center justify-center rounded-full border relative cursor-pointer transition-all border-gray-200 hover:bg-gray-100 text-gray-600 shadow-2xs">
                <Bell size={17}/>
                {unreadNotifCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1" style={{ animation: 'kna-badge-pop 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
              </button>

              {/* ── NOTIFICATION DROPDOWN — BIGGER UNIFIED IPHONE NOTES LIST ── */}
              {notifOpen && (
                <div className="absolute right-0 top-12 w-[min(380px,calc(100vw-2rem))] rounded-2xl shadow-2xl border border-slate-200/90 bg-[#F2F2F7] z-50 overflow-hidden p-2.5" style={{ animation: 'kna-notif-in 0.22s cubic-bezier(0.22,1,0.36,1) both' }}>
                  <div className="px-1.5 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 tracking-tight">Notifications</span>
                      {filteredNotifications.length > 0 && (
                        <span className="bg-slate-200/90 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          {filteredNotifications.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      {filteredNotifications.length > 0 && (
                        <button onClick={clearAllNotifs} className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                          Clear
                        </button>
                      )}
                      <button onClick={markAllRead} className="text-xs font-bold text-red-600 hover:text-red-700 transition-colors cursor-pointer">
                        Mark read
                      </button>
                    </div>
                  </div>

                  {/* Single Unified iPhone Notes Grouped Card Container */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm max-h-[22rem] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                    {filteredNotifications.length === 0 ? (
                      <div className="py-10 text-center px-4">
                        <Bell size={24} className="text-slate-300 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-slate-500">No Notifications</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">All caught up!</p>
                      </div>
                    ) : (
                      filteredNotifications.map((n, idx) => {
                        const style = notifTypeStyle(n.type);
                        const isUnread = !readNotifIds.has(n.id);
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className="px-3 py-2.5 flex items-start gap-2 hover:bg-slate-50 transition-colors cursor-pointer group relative"
                            style={{ animation: `kna-notif-item 0.18s ease-out ${idx * 0.02}s both` }}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${style.dot}`}/>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className={`text-[13px] ${isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'} truncate`}>{n.title}</p>
                                  <span className="text-[10px] font-medium text-slate-400 flex-shrink-0 tabular-nums">{n.time}</span>
                                </div>
                                {/* Two-line clamp rather than truncate — patient name plus date/time
                                    never fits on one line at this width. */}
                                <p className="text-[11.5px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); dismissNotif(n.id); }}
                              className="text-slate-400 hover:text-slate-700 p-1 -mr-0.5 rounded-full hover:bg-slate-200/70 transition-colors flex-shrink-0 cursor-pointer"
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

            <div className="w-px h-6 bg-gray-200 mx-1"/>

            {/* Admin Profile Pill */}
            <div className="flex items-center gap-2 p-1 px-2 rounded-full cursor-pointer transition-colors hover:bg-gray-100" onClick={() => setActivePage('settings')}>
              <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {adminProfile.initials}
              </div>
              <span className="text-xs font-bold hidden sm:block">{adminProfile.name}</span>
            </div>
          </div>
        </header>

        {/* Floating Real-Time Noticeable Toast Container (Photo Matched Style) */}
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
        <main className="flex-1 overflow-hidden">
          <PageTransition pageKey={activePage}>

            {activePage === 'dashboard' && (
              <div className="h-full overflow-y-auto bg-[#F4F5F7]">
                <div className="px-7 py-6 max-w-screen-2xl mx-auto">

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-5 items-stretch">
                    <div className="xl:col-span-8 flex">
                      <WelcomeBanner stats={stats} onNavigate={setActivePage} adminName={adminProfile.name} />
                    </div>

                    <div className="xl:col-span-4 flex">
                      <div className="rounded-xl border p-4 sm:p-4.5 w-full flex flex-col justify-between bg-white border-slate-200 text-slate-900"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.22s both' }}>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mb-0.5">Clinic Operations</p>
                          <h3 className="text-sm font-semibold mb-2.5">Quick Actions</h3>

                          <div className="space-y-2">
                            <button
                              onClick={() => setActivePage('patients')}
                              className="group w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border-slate-200 text-slate-800"
                            >
                              <span className="flex items-center gap-2.5"><UserPlus size={16} className="text-red-600" /> Register New Patient</span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-slate-700" />
                            </button>

                            <button
                              onClick={() => setActivePage('appointments')}
                              className="group w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border-slate-200 text-slate-800"
                            >
                              <span className="flex items-center gap-2.5"><Calendar size={16} className="text-slate-600" /> Walk-In Appointment</span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-slate-700" />
                            </button>

                            <button
                              onClick={() => setActivePage('inventory')}
                              className="group w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border-slate-200 text-slate-800"
                            >
                              <span className="flex items-center gap-2.5"><Package size={16} className="text-slate-600" /> Check Vaccine Stock</span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-slate-700" />
                            </button>

                            <button
                              onClick={() => setActivePage('incidents')}
                              className="group w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border-slate-200 text-slate-800"
                            >
                              <span className="flex items-center gap-2.5"><MapIcon size={16} className="text-slate-600" /> View Incident Map</span>
                              <ChevronRightIcon size={14} className="transition-colors text-slate-400 group-hover:text-slate-700" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                    {dashboardStatWidgets.map((w, i) => (
                      <div key={i} onClick={() => setActivePage(w.page)}
                        className="rounded-xl border p-5 cursor-pointer flex items-center justify-between transition-colors bg-white border-slate-200 hover:border-slate-300"
                        style={{ animation: `kna-card-in 0.42s cubic-bezier(0.22,1,0.36,1) ${0.04 + i * 0.06}s both` }}>
                        <div>
                          <p className="text-3xl font-bold leading-none tabular-nums mb-1.5 text-slate-900">
                            {w.value}
                          </p>
                          <p className="text-sm font-medium text-slate-700">{w.label}</p>
                          <p className="text-xs mt-0.5 text-slate-400">{w.sub}</p>
                        </div>
                        {w.progress === null ? (
                          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: w.tint, border: `1px solid ${w.border}`, color: w.color }}>
                            <w.Icon size={19} strokeWidth={1.9} />
                          </div>
                        ) : (
                          <CircularProgress percentage={w.progress} size={46} strokeWidth={4} color={w.color} trackColor="#E2E8F0" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Main Grid: Left 8 Cols, Right 4 Cols */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                    {/* Left 8 Cols */}
                    <div className="xl:col-span-8 flex flex-col gap-5">

                      {/* Overdue Dose Tracker */}
                      <div className="rounded-xl border overflow-hidden bg-white border-slate-200 text-slate-900"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.10s both' }}>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                          <div>
                            <h3 className="text-sm font-semibold tracking-tight">Overdue Dose Tracker</h3>
                            <p className="text-xs mt-0.5 text-slate-400">Patients past due on their next scheduled dose</p>
                          </div>
                          <button onClick={() => setActivePage('vaccination')}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm cursor-pointer">
                            View All →
                          </button>
                        </div>

                        {overdueList.length === 0 ? (
                          <div className="py-10 text-center">
                            <CheckCircle size={22} className="text-emerald-400 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">No patients are overdue right now.</p>
                          </div>
                        ) : (
                          <div className="p-2">
                            {overdueList.slice(0, 5).map(o => (
                              <button key={o.id} onClick={() => setActivePage('vaccination')}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-left hover:bg-slate-50">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-50 text-rose-600">
                                    <AlertCircle size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{o.name}</p>
                                    <p className="text-[11px] mt-0.5 text-slate-400">{o.doseLabel} was due {fmtDate(o.dueDate)}</p>
                                  </div>
                                </div>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 bg-rose-50 text-rose-700 border-rose-200">
                                  {o.daysOverdue}d overdue
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 2. Vaccine Inventory & Stock Level Overview Table Card */}
                      <div className="rounded-xl border overflow-hidden bg-white border-slate-200 text-slate-900"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.18s both' }}>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                          <div>
                            <h3 className="text-sm font-semibold tracking-tight">Vaccine Inventory Overview</h3>
                            <p className="text-xs mt-0.5 text-slate-400">Real-time stock status</p>
                          </div>
                          <button onClick={() => setActivePage('inventory')}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm cursor-pointer">
                            Manage Inventory →
                          </button>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="px-5 py-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wide">Item Name</th>
                                <th className="px-5 py-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wide">Category</th>
                                <th className="px-5 py-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wide">Stock Level</th>
                                <th className="px-5 py-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wide">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(inventoryList.length > 0 ? inventoryList.slice(0, 4) : [
                                { id: 'v1', name: 'Rabipur (PCEC Vaccine)', category: 'Vaccine', stock: 45, unit: 'Vials', status: 'optimal' },
                                { id: 'v2', name: 'Verorab (PVRV Vaccine)', category: 'Vaccine', stock: 12, unit: 'Vials', status: 'warning' },
                                { id: 'v3', name: 'Equirab (RIG Immunoglobulin)', category: 'Immunoglobulin', stock: 8, unit: 'Vials', status: 'critical' },
                                { id: 'v4', name: 'Auto-Disable Syringes 1mL', category: 'Supplies', stock: 150, unit: 'Pcs', status: 'optimal' }
                              ]).map((item) => {
                                const qty = parseInt(item.stock ?? item.quantity) || 0;
                                const isOut = qty <= 0;
                                const isLow = qty < 15 || item.status === 'warning' || item.status === 'critical';
                                const badgeStyle = isOut
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : isLow
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                                return (
                                  <tr key={item.id} className="transition-colors hover:bg-slate-50">
                                    <td className="px-5 py-3 text-xs font-medium">{item.name}</td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{item.category || 'Vaccine'}</td>
                                    <td className="px-5 py-3 text-xs font-medium">{qty} {item.unit || 'units'}</td>
                                    <td className="px-5 py-3">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${badgeStyle}`}>
                                        {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'Optimal'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 3. Incident Map Summary Cards Widget */}
                      <div className="rounded-xl border p-5 bg-white border-slate-200 text-slate-900"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.24s both' }}>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-sm font-semibold tracking-tight">Rabies Exposure & Incident Summary</h3>
                            <p className="text-xs mt-0.5 text-slate-400">Libon, Albay Surveillance</p>
                          </div>
                          <button onClick={() => setActivePage('incidents')}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm cursor-pointer">
                            View Map →
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-4 rounded-lg border bg-slate-50 border-slate-100">
                            <p className="text-2xl font-bold tabular-nums text-slate-900">{incidentList.length || 14}</p>
                            <p className="text-xs mt-0.5 text-slate-600">Reported Bite Cases</p>
                            <p className="text-[11px] mt-1 text-slate-400">Active exposure tracking</p>
                          </div>
                          <div className="p-4 rounded-lg border bg-slate-50 border-slate-100">
                            <p className="text-2xl font-bold text-slate-900">Libon Zone 3</p>
                            <p className="text-xs mt-0.5 text-slate-600">High Exposure Area</p>
                            <p className="text-[11px] mt-1 text-slate-400">Top reported incidents</p>
                          </div>
                          <div className="p-4 rounded-lg border bg-slate-50 border-slate-100">
                            <p className="text-2xl font-bold tabular-nums text-slate-900">78% Canine</p>
                            <p className="text-xs mt-0.5 text-slate-600">Bite Classification</p>
                            <p className="text-[11px] mt-1 text-slate-400">Dog bites vs Feline exposure</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right 4 Cols */}
                    <div className="xl:col-span-4 flex flex-col gap-5">

                      {/* Today's Schedule */}
                      <div className="rounded-xl border p-5 bg-white border-slate-200 text-slate-900"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.16s both' }}>
                        <div className="flex items-center justify-between mb-3.5">
                          <h3 className="text-sm font-semibold tracking-tight">Today's Schedule</h3>
                          <button onClick={() => setActivePage('appointments')} className="text-[11px] font-medium text-red-600 hover:text-red-700 transition-colors cursor-pointer">View All</button>
                        </div>

                        {todayApts.length === 0 ? (
                          <p className="py-6 text-center text-xs text-slate-400">No appointments scheduled today.</p>
                        ) : (
                          <div className="space-y-1">
                            {[...todayApts].sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 5).map(apt => {
                              const isCancelled = apt.status === 'cancelled';
                              const isDone = apt.status === 'done';
                              const isConfirmed = apt.status === 'confirmed';
                              const tagStyle = isCancelled
                                ? { bg: 'bg-rose-50', text: 'text-rose-600', Icon: AlertCircle }
                                : isDone
                                ? { bg: 'bg-sky-50', text: 'text-sky-600', Icon: CheckCircle }
                                : isConfirmed
                                ? { bg: 'bg-emerald-50', text: 'text-emerald-600', Icon: CheckCircle }
                                : { bg: 'bg-amber-50', text: 'text-amber-600', Icon: Clock };
                              return (
                                <button key={apt.id} onClick={() => setActivePage('appointments')}
                                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors cursor-pointer text-left hover:bg-slate-50">
                                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tagStyle.bg} ${tagStyle.text}`}>
                                    <tagStyle.Icon size={16} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{apt.name || apt.patient || 'Patient'}</p>
                                    <p className="text-[11px] mt-0.5 text-slate-400">{apt.time || '—'} · {apt.type || apt.purpose || 'Consultation'}</p>
                                  </div>
                                  <ChevronRightIcon size={15} className="text-slate-400 flex-shrink-0" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Interactive Calendar Widget */}
                      <div className="rounded-xl border overflow-hidden bg-white border-slate-200 text-slate-900"
                        style={{ animation: 'kna-section-in 0.46s cubic-bezier(0.22,1,0.36,1) 0.22s both' }}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                          <button onClick={() => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)); setSelectedCalendarDay(null); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-slate-500 hover:bg-slate-100">
                            <ChevronLeft size={16}/>
                          </button>
                          <span className="text-sm font-medium">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                          <button onClick={() => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)); setSelectedCalendarDay(null); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-slate-500 hover:bg-slate-100">
                            <ChevronRightIcon size={16}/>
                          </button>
                        </div>
                        <div className="px-4 pt-3 pb-2">
                          <div className="grid grid-cols-7 mb-1.5">{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => (<div key={i} className="text-center text-[10px] font-medium py-1 text-slate-400">{d}</div>))}</div>
                          <div className="grid grid-cols-7 gap-0.5">{renderCalendarDays()}</div>
                        </div>
                        <div className="px-4 pb-3 pt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100">
                          {[['#22C55E', 'Confirmed'], ['#F59E0B', 'Pending'], ['#EF4444', 'Cancelled'], ['#38BDF8', 'Done']].map(([c, l]) => (
                            <span key={l} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: c }}/>{l}
                            </span>
                          ))}
                        </div>

                        {selectedCalendarDay && (() => {
                          const dayApts = getAptsForDay(selectedCalendarDay);
                          const y = currentMonth.getFullYear();
                          const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
                          const d = String(selectedCalendarDay).padStart(2, '0');
                          const dateLabel = new Date(`${y}-${m}-${d}`).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
                          return (
                            <div className="border-t p-3 bg-slate-50 border-slate-100">
                              <div className="flex items-center justify-between px-1 mb-2">
                                <div><p className="text-xs font-medium">{dateLabel}</p><p className="text-[10px] text-slate-400">{dayApts.length} appointment{dayApts.length !== 1 ? 's' : ''}</p></div>
                                <button onClick={() => setSelectedCalendarDay(null)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 cursor-pointer">
                                  <X size={12}/>
                                </button>
                              </div>
                              {dayApts.length === 0 ? (
                                <p className="px-1 pb-1 text-[11px] text-slate-400 italic">No appointments on this day.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                                  {dayApts.map((apt) => (
                                    <div key={apt.id} className="rounded-lg border p-2.5 flex items-center gap-2.5 bg-white border-slate-100">
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0" style={{ background: `hsl(${(apt.name?.charCodeAt(0) || 65) * 7 % 360},58%,52%)` }}>{(apt.name || apt.patient || '?').charAt(0)}</div>
                                      <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{apt.name || apt.patient}</p><p className="text-[10px] text-slate-400">{apt.time || '—'} · {apt.type || apt.purpose || 'Consultation'}</p></div>
                                    </div>
                                  ))}
                                  <button onClick={() => setActivePage('appointments')} className="w-full text-center text-[11px] font-medium pt-1 cursor-pointer text-red-600 hover:underline">Manage appointments →</button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePage === 'appointments' && <div className="h-full overflow-y-auto"><AppointmentPage/></div>}
            {activePage === 'patients'     && <div className="h-full overflow-y-auto"><PatientRecordsPage/></div>}
            {activePage === 'vaccination'  && <div className="h-full overflow-y-auto"><VaccinationTrackerPage/></div>}
            {activePage === 'inventory'    && <div className="h-full overflow-y-auto"><VaccineInventoryPage/></div>}
            {activePage === 'incidents'    && <div className="h-full overflow-y-auto"><IncidentMapPage/></div>}
            {activePage === 'messages'     && <div className="h-full overflow-y-auto"><MessagesPage/></div>}
            {activePage === 'settings'     && <div className="h-full overflow-y-auto"><SettingsPage onLogout={onLogout}/></div>}
            {activePage === 'manage-admins' && role === 'manager' && <ManageAdmins/>}

          </PageTransition>
        </main>
      </div>

      <style>{`
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