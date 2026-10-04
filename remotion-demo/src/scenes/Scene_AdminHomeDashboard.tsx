import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
  Img,
  staticFile,
  spring,
  useVideoConfig,
} from "remotion";
import {
  FONT,
  DASH,
  SIDEBAR_W,
  HEADER_H,
  DEMO_STATS,
  DEMO_OVERDUE,
  DEMO_TODAY_DOSES,
  DEMO_SCHEDULE,
  ASSETS,
} from "../tokens";

// ─── Timing (frames @ 30fps, total 300 = 10s) ────────────────────────────────
const T = {
  start:         0,
  sidebarIn:     0,
  headerIn:      20,
  welcomeIn:     35,
  statsIn:       70,
  statsCountUp:  90,
  overdueIn:    110,
  dosesIn:      125,
  scheduleIn:   140,
  cursorIdle:   160,
  badgePulse:   200,
  fadeOut:      270,
  end:          300,
};

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const easeOut = Easing.bezier(0.0, 0.0, 0.2, 1);

function clamp(frame: number, a: number, b: number, va: number, vb: number, e = ease) {
  return interpolate(frame, [a, b], [va, vb], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: e,
  });
}

// ─── Lucide-style SVG Icons (matching AdminDashboard.jsx imports) ─────────────
const Icon = {
  Home: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Users: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  Calendar: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  MessageSquare: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  MapPin: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Package: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
    </svg>
  ),
  Settings: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  LogOut: () => (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Bell: () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Search: () => (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Menu: () => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  AlertCircle: (size = 15) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Syringe: () => (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>
    </svg>
  ),
  Clock: () => (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  UserPlus: () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  ),
  CheckCircleGreen: () => (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard",    label: "Dashboard",           Icon: Icon.Home,          section: "clinical" },
  { id: "patients",     label: "Patient Records",     Icon: Icon.Users,         section: "clinical" },
  { id: "vaccination",  label: "Vaccination Tracker", Icon: Icon.CheckCircle,   section: "clinical" },
  { id: "appointments", label: "Appointments",        Icon: Icon.Calendar,      section: "clinical" },
  { id: "messages",     label: "Messages",            Icon: Icon.MessageSquare, section: "clinical", badge: 3 },
  { id: "incidents",    label: "Incident Map",        Icon: Icon.MapPin,        section: "clinical" },
  { id: "inventory",    label: "Inventory",           Icon: Icon.Package,       section: "clinical" },
  { id: "settings",     label: "Settings",            Icon: Icon.Settings,      section: "system"   },
];

const DashboardSidebar: React.FC<{ slideIn: number }> = ({ slideIn }) => (
  <div style={{
    position: "fixed", top: 0, left: 0, height: "100%", width: SIDEBAR_W,
    background: DASH.sidebar, color: "white",
    display: "flex", flexDirection: "column",
    transform: `translateX(${(slideIn - 1) * SIDEBAR_W}px)`,
    zIndex: 40, fontFamily: FONT,
    boxSizing: "border-box",
  }}>
    {/* Logo header */}
    <div style={{ padding: "20px 16px", borderBottom: `1px solid ${DASH.sidebarBorder}`, display: "flex", alignItems: "center", gap: 12, minHeight: 72, boxSizing: "border-box" }}>
      <div style={{ width: 40, height: 40, background: "white", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 4, flexShrink: 0, border: "1px solid rgba(219,234,254,0.9)", boxSizing: "border-box" }}>
        <Img src={staticFile("logo-white-nobg.png")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.1px", color: "white", whiteSpace: "nowrap" }}>K&A Clinic</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "2.5px", marginTop: 2 }}>Clinical Admin</div>
      </div>
      <div style={{ marginLeft: "auto", color: "white", opacity: 0.7 }}><Icon.Menu /></div>
    </div>

    {/* Nav items */}
    <nav style={{ flex: 1, padding: "16px 12px 0 12px", overflowY: "auto" }}>
      {/* Clinical Management section */}
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,0.55)", padding: "0 12px", marginBottom: 8 }}>
        Clinical Management
      </div>
      <div style={{ marginBottom: 16 }}>
        {NAV_ITEMS.filter(i => i.section === "clinical").map(item => {
          const isActive = item.id === "dashboard";
          return (
            <div key={item.id} style={{ position: "relative" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12, position: "relative", cursor: "pointer",
                fontSize: 14, lineHeight: "1.3",
                color: isActive ? "black" : "white",
                fontWeight: isActive ? 800 : 500,
                background: isActive ? DASH.activeNavBg : "transparent",
                borderRadius: isActive ? "16px 0 0 16px" : 12,
                padding: isActive ? "12px 12px 12px 14px" : "10px 12px 10px 14px",
                marginRight: isActive ? -4 : 16,
                width: isActive ? "calc(100% + 4px)" : "auto",
                boxSizing: "border-box",
                marginBottom: 2,
              }}>
                {/* SVG concave notches for active item — matching real code exactly */}
                {isActive && (
                  <>
                    <svg style={{ position: "absolute", right: -1, top: -16, width: 16, height: 16, color: DASH.activeNavBg, pointerEvents: "none", zIndex: 20 }} viewBox="0 0 16 16" fill="currentColor">
                      <path d="M16 16V0C16 8.83656 8.83656 16 0 16H16Z" />
                    </svg>
                    <svg style={{ position: "absolute", right: -1, bottom: -16, width: 16, height: 16, color: DASH.activeNavBg, pointerEvents: "none", zIndex: 20 }} viewBox="0 0 16 16" fill="currentColor">
                      <path d="M16 0V16C16 7.16344 8.83656 0 0 0H16Z" />
                    </svg>
                  </>
                )}
                <span style={{ color: isActive ? "black" : "white", flexShrink: 0, position: "relative", zIndex: 10 }}>
                  <item.Icon />
                </span>
                <span style={{ position: "relative", zIndex: 10, flex: 1, textAlign: "left", overflow: "hidden", whiteSpace: "nowrap" }}>{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span style={{ position: "relative", zIndex: 10, background: "#F43F5E", color: "white", fontSize: 11, fontWeight: 700, borderRadius: 9999, padding: "2px 7px" }}>
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* System section */}
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,0.55)", padding: "0 12px", marginBottom: 8 }}>
        System &amp; Logistics
      </div>
      {NAV_ITEMS.filter(i => i.section === "system").map(item => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 14px", borderRadius: 12, marginRight: 16, cursor: "pointer", color: "white", fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
          <span style={{ color: "white" }}><item.Icon /></span>
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>
        </div>
      ))}
    </nav>

    {/* Logout footer */}
    <div style={{ padding: 12, borderTop: `1px solid ${DASH.sidebarBorder}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, cursor: "pointer", color: "white", fontSize: 14, fontWeight: 500 }}>
        <Icon.LogOut />
        <span style={{ whiteSpace: "nowrap" }}>Sign Out</span>
      </div>
    </div>
  </div>
);

// ─── Header ──────────────────────────────────────────────────────────────────
const DashboardHeader: React.FC<{ slideIn: number; badgePulse: number }> = ({ slideIn, badgePulse }) => (
  <header style={{
    position: "sticky", top: 0, zIndex: 30,
    height: HEADER_H, background: DASH.headerBg,
    borderBottom: `1px solid ${DASH.headerBorder}`,
    display: "flex", alignItems: "center",
    padding: "0 28px", gap: 16,
    boxSizing: "border-box", fontFamily: FONT,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transform: `translateY(${(1 - slideIn) * -HEADER_H}px)`,
  }}>
    {/* Left: title */}
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <div style={{ height: 24, width: 4, borderRadius: 9999, background: DASH.primaryBlue }} />
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: DASH.deepNavy, margin: 0, lineHeight: 1, letterSpacing: "-0.3px" }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: DASH.slate500, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
          K&A Anti-Rabies Vaccination Clinic
        </p>
      </div>
    </div>

    {/* Search bar */}
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ width: 208, height: 36, borderRadius: 9999, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", padding: "0 14px", gap: 8 }}>
        <span style={{ color: "#94A3B8" }}><Icon.Search /></span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", fontFamily: FONT }}>Search patients, stock...</span>
      </div>

      {/* Notification bell */}
      <div style={{ position: "relative" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", background: "white", color: DASH.slate500 }}>
          <Icon.Bell />
        </div>
        {/* Badge with pulse animation */}
        <div style={{
          position: "absolute", top: -2, right: -2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#F43F5E", color: "white",
          fontSize: 10, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid white",
          transform: `scale(${badgePulse})`,
          fontFamily: FONT,
        }}>5</div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: "#E2E8F0" }} />

      {/* Admin avatar pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 6px 6px", borderRadius: 9999, border: "1px solid #E2E8F0", background: "white" }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg,${DASH.midNavy},${DASH.primaryBlue})`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 800, fontFamily: FONT }}>
          AD
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: DASH.deepNavy, fontFamily: FONT, lineHeight: 1 }}>Admin</div>
          <div style={{ fontSize: 10, color: DASH.slate400, fontFamily: FONT, marginTop: 1 }}>Clinic Staff</div>
        </div>
      </div>
    </div>
  </header>
);

// ─── Welcome Banner (from WelcomeBanner component in AdminDashboard.jsx) ──────
const WelcomeBanner: React.FC<{ opacity: number; translateY: number }> = ({ opacity, translateY }) => (
  <div style={{
    gridColumn: "span 8",
    borderRadius: DASH.cardRadius, border: `1px solid rgba(226,232,240,0.70)`,
    background: DASH.cardBg, padding: "28px", overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    opacity, transform: `translateY(${translateY}px)`,
    fontFamily: FONT, boxSizing: "border-box",
    height: 180,
    position: "relative",
  }}>
    <div style={{ maxWidth: 420, position: "relative", zIndex: 10 }}>
      <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#0F172A", margin: "0 0 8px" }}>
        Hello, Admin!
      </h2>
      <p style={{ fontSize: 13, marginTop: 0, lineHeight: 1.6, color: DASH.slate500, fontWeight: 500, maxWidth: 380 }}>
        Your trusted partner in rabies prevention and clinical care. Track patient vaccinations, appointments, and exposure cases in Libon, Albay.
      </p>
    </div>
    <div style={{ position: "relative", zIndex: 10, flexShrink: 0, width: 280, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
      <Img src={staticFile("welcome_banner.png")} style={{ height: "100%", width: "100%", objectFit: "contain", objectPosition: "bottom right" }} />
    </div>
  </div>
);

// ─── Quick Clinic Operations card (col-span-4 beside WelcomeBanner) ───────────
const ClinicOpsCard: React.FC<{ opacity: number; translateY: number }> = ({ opacity, translateY }) => {
  const actions = [
    { label: "New Patient",   Icon: Icon.UserPlus,    color: DASH.primaryBlue, tint: DASH.blueTint   },
    { label: "Walk-In Apt",   Icon: Icon.Calendar,    color: DASH.midNavy,     tint: DASH.navyTint   },
    { label: "Vaccine Stock", Icon: Icon.Package,     color: "#059669",        tint: DASH.greenTint  },
    { label: "Incident Map",  Icon: Icon.MapPin,      color: "#E11D48",        tint: DASH.redTint    },
  ];
  return (
    <div style={{
      gridColumn: "span 4",
      borderRadius: DASH.cardRadius, border: `1px solid ${DASH.cardBorder}`,
      background: DASH.cardBg, padding: "24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      opacity, transform: `translateY(${translateY}px)`,
      fontFamily: FONT, boxSizing: "border-box", height: 180,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: DASH.deepNavy, marginBottom: 16 }}>Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {actions.map(({ label, Icon: Ic, color, tint }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 8px", borderRadius: 16, background: tint, cursor: "pointer", border: "1px solid rgba(0,0,0,0.04)" }}>
            <span style={{ color }}><Ic /></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: DASH.deepNavy, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Stat Bar (4 stat widgets in a row) ───────────────────────────────────────
interface StatWidget {
  label: string;
  value: number;
  sub: string;
  color: string;
  tint: string;
  border: string;
  Icon: () => JSX.Element;
  progress: number | null;
}

const StatBar: React.FC<{ opacity: number; translateY: number; animatedValues: number[] }> = ({ opacity, translateY, animatedValues }) => {
  const widgets: StatWidget[] = [
    {
      label: "Total Patients",
      value: DEMO_STATS.totalPatients,
      sub: `${DEMO_STATS.thisWeek} registered this week · excludes archived`,
      color: DASH.blueIcon, tint: DASH.blueTint, border: DASH.blueBorder,
      Icon: Icon.Users, progress: null,
    },
    {
      label: "Today Appointments",
      value: DEMO_STATS.todayApts,
      sub: `${DEMO_STATS.confirmedApts} confirmed`,
      color: DASH.navyIcon, tint: DASH.navyTint, border: DASH.navyBorder,
      Icon: Icon.Calendar, progress: null,
    },
    {
      label: "Unread Messages",
      value: DEMO_STATS.unreadMessages,
      sub: "Require attention",
      color: DASH.primaryBlue, tint: DASH.blueTint, border: DASH.blueBorder,
      Icon: Icon.MessageSquare, progress: null,
    },
    {
      label: "Low Stock Items",
      value: DEMO_STATS.lowStock,
      sub: DEMO_STATS.lowStock > 0 ? "Action required" : "Stock optimal",
      color: DEMO_STATS.lowStock > 0 ? DASH.redIcon : DASH.greenIcon,
      tint: DEMO_STATS.lowStock > 0 ? DASH.redTint : DASH.greenTint,
      border: DEMO_STATS.lowStock > 0 ? DASH.redBorder : DASH.greenBorder,
      Icon: Icon.Package, progress: null,
    },
  ];

  return (
    <div style={{
      background: DASH.cardBg, borderRadius: DASH.cardRadius,
      border: `1px solid ${DASH.cardBorder}`,
      display: "flex", flexDirection: "row",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      opacity, transform: `translateY(${translateY}px) scale(${opacity < 1 ? 0.97 + opacity * 0.03 : 1})`,
      fontFamily: FONT, overflow: "hidden",
    }}>
      {widgets.map((w, i) => (
        <div key={w.label} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px", gap: 16,
          borderRight: i < widgets.length - 1 ? `1px solid ${DASH.cardBorder}` : "none",
          cursor: "pointer", transition: "background 0.15s",
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 30, fontWeight: 800, color: DASH.deepNavy, margin: "0 0 2px", lineHeight: 1, fontFamily: FONT }}>
              {Math.round(animatedValues[i])}
            </p>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: DASH.slate500, margin: "6px 0 2px" }}>
              {w.label}
            </p>
            <p style={{ fontSize: 11, color: DASH.slate400, margin: 0, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
              {w.sub}
            </p>
          </div>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: w.tint, border: `1px solid ${w.border}`, color: w.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <w.Icon />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Overdue Dose Tracker card ────────────────────────────────────────────────
const OverdueCard: React.FC<{ opacity: number; translateY: number }> = ({ opacity, translateY }) => (
  <div style={{ borderRadius: DASH.cardRadius, border: `1px solid ${DASH.cardBorder}`, background: DASH.cardBg, overflow: "hidden", display: "flex", flexDirection: "column", opacity, transform: `translateY(${translateY}px)`, fontFamily: FONT }}>
    {/* Header */}
    <div style={{ padding: "20px", borderBottom: "1px solid #EFF6FF", background: "#F0F7FF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: DASH.deepNavy, margin: 0, letterSpacing: "-0.2px" }}>Overdue Dose Tracker</h3>
          <span style={{ background: "#FFF1F2", color: DASH.redIcon, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, border: "1px solid #FECDD3" }}>
            {DEMO_OVERDUE.length} Action Needed
          </span>
        </div>
        <p style={{ fontSize: 11, margin: "4px 0 0", color: DASH.slate500, fontWeight: 400 }}>Patients past due on scheduled doses</p>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: DASH.primaryBlue }}>View All →</span>
    </div>
    {/* Rows */}
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
      {DEMO_OVERDUE.map(o => (
        <div key={o.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px", borderRadius: 16, background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 12, background: "#FEE2E2", color: DASH.redIcon, border: "1px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {Icon.AlertCircle(15)}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: DASH.deepNavy, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</p>
              <p style={{ fontSize: 10.5, color: DASH.slate500, margin: "2px 0 0", fontWeight: 400 }}>
                {o.dose} · <span style={{ fontWeight: 600, color: DASH.redIcon }}>Overdue</span>
              </p>
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 9999, border: `1px solid ${DASH.roseBorder}`, background: DASH.roseBg, color: DASH.roseText, flexShrink: 0 }}>
            {o.daysOverdue}d overdue
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Today's Doses card ───────────────────────────────────────────────────────
const TodayDosesCard: React.FC<{ opacity: number; translateY: number }> = ({ opacity, translateY }) => (
  <div style={{ borderRadius: DASH.cardRadius, border: `1px solid ${DASH.cardBorder}`, background: DASH.cardBg, overflow: "hidden", display: "flex", flexDirection: "column", opacity, transform: `translateY(${translateY}px)`, fontFamily: FONT }}>
    <div style={{ padding: "20px", borderBottom: "1px solid #EFF6FF", background: "#F0F7FF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: DASH.deepNavy, margin: 0 }}>Today's Doses</h3>
          <span style={{ background: DASH.blueTint, color: DASH.primaryBlue, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${DASH.blueBorder}` }}>
            {DEMO_TODAY_DOSES.length} Due Today
          </span>
        </div>
        <p style={{ fontSize: 11, margin: "4px 0 0", color: DASH.slate500, fontWeight: 400 }}>
          Patients scheduled for today · <span style={{ fontWeight: 600, color: DASH.primaryBlue }}>Sep 20, 2026</span>
        </p>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: DASH.primaryBlue }}>View All →</span>
    </div>
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
      {DEMO_TODAY_DOSES.map(d => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px", borderRadius: 16, background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: d.done ? "#D1FAE5" : "#DBEAFE", color: d.done ? "#059669" : DASH.primaryBlue, border: `1px solid ${d.done ? "#A7F3D0" : DASH.blueBorder}` }}>
              {d.done ? <Icon.CheckCircle /> : <Icon.Syringe />}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: DASH.deepNavy, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</p>
              <p style={{ fontSize: 10.5, color: DASH.slate500, margin: "2px 0 0", fontWeight: 400 }}>{d.dose}</p>
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 9999, border: `1px solid ${d.done ? DASH.emeraldBorder : DASH.amberBorder}`, background: d.done ? DASH.emeraldBg : DASH.amberBg, color: d.done ? DASH.emeraldText : DASH.amberText, flexShrink: 0 }}>
            {d.done ? "Administered" : "Due Today"}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Today's Schedule card ────────────────────────────────────────────────────
const TodayScheduleCard: React.FC<{ opacity: number; translateY: number }> = ({ opacity, translateY }) => (
  <div style={{ borderRadius: DASH.cardRadius, border: `1px solid ${DASH.cardBorder}`, background: DASH.cardBg, overflow: "hidden", display: "flex", flexDirection: "column", opacity, transform: `translateY(${translateY}px)`, fontFamily: FONT }}>
    <div style={{ padding: "20px", borderBottom: "1px solid #EFF6FF", background: "#F0F7FF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: DASH.deepNavy, margin: 0 }}>Today's Schedule</h3>
          <span style={{ background: DASH.indigoBg, color: DASH.indigoText, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${DASH.indigoBorder}` }}>
            {DEMO_SCHEDULE.length} Appointments
          </span>
        </div>
        <p style={{ fontSize: 11, margin: "4px 0 0", color: DASH.slate500, fontWeight: 400 }}>Confirmed &amp; pending clinic visits</p>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: DASH.primaryBlue }}>View All →</span>
    </div>
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
      {DEMO_SCHEDULE.map(apt => (
        <div key={apt.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px", borderRadius: 16, background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 12, background: DASH.indigoBg, color: DASH.indigoText, border: `1px solid ${DASH.indigoBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon.Clock />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: DASH.deepNavy, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{apt.name}</p>
              <p style={{ fontSize: 10.5, color: DASH.slate500, margin: "2px 0 0", fontWeight: 400 }}>{apt.time} · {apt.type}</p>
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 9999, border: `1px solid ${apt.status === "confirmed" ? DASH.emeraldBorder : DASH.blueBorder}`, background: apt.status === "confirmed" ? DASH.emeraldBg : DASH.blueTint, color: apt.status === "confirmed" ? DASH.emeraldText : DASH.primaryBlue, flexShrink: 0 }}>
            {apt.status}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Main Dashboard Scene ─────────────────────────────────────────────────────
export const Scene_AdminHomeDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Sidebar slides in from left
  const sidebarSlide = clamp(frame, T.sidebarIn, T.sidebarIn + 25, 0, 1);

  // Header drops in from top
  const headerSlide = clamp(frame, T.headerIn, T.headerIn + 25, 0, 1);

  // Welcome banner: kna-banner-in — translateY(-16px) scale(0.98) → final
  const welcomeOpacity = clamp(frame, T.welcomeIn, T.welcomeIn + 30, 0, 1);
  const welcomeY = clamp(frame, T.welcomeIn, T.welcomeIn + 30, -16, 0);

  // Stats bar: kna-card-in — translateY(20px) scale(0.97) → final
  const statsOpacity = clamp(frame, T.statsIn, T.statsIn + 30, 0, 1);
  const statsY = clamp(frame, T.statsIn, T.statsIn + 30, 20, 0);

  // Stat counter animation
  const countProgress = clamp(frame, T.statsCountUp, T.statsCountUp + 50, 0, 1, easeOut);
  const statValues = [
    DEMO_STATS.totalPatients * countProgress,
    DEMO_STATS.todayApts * countProgress,
    DEMO_STATS.unreadMessages * countProgress,
    DEMO_STATS.lowStock * countProgress,
  ];

  // 3-column grid cards: kna-section-in — translateY(22px) → 0
  const overdueOpacity = clamp(frame, T.overdueIn, T.overdueIn + 28, 0, 1);
  const overdueY = clamp(frame, T.overdueIn, T.overdueIn + 28, 22, 0);
  const dosesOpacity = clamp(frame, T.dosesIn, T.dosesIn + 28, 0, 1);
  const dosesY = clamp(frame, T.dosesIn, T.dosesIn + 28, 22, 0);
  const scheduleOpacity = clamp(frame, T.scheduleIn, T.scheduleIn + 28, 0, 1);
  const scheduleY = clamp(frame, T.scheduleIn, T.scheduleIn + 28, 22, 0);

  // Badge pulse on notification bell
  const badgePulse = (() => {
    if (frame < T.badgePulse || frame > T.badgePulse + 30) return 1;
    const t = (frame - T.badgePulse) / 30;
    // 0→1.25→1 bounce — matches kna-badge-pop keyframe
    if (t < 0.55) return 1 + Math.sin(t / 0.55 * Math.PI) * 0.25;
    return 1 + (1 - (t - 0.55) / 0.45) * 0.05;
  })();

  // Scene fade out
  const sceneOpacity = clamp(frame, T.fadeOut, T.end, 1, 0);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: DASH.pageBg, opacity: sceneOpacity }}>

      {/* Sidebar */}
      <DashboardSidebar slideIn={sidebarSlide} />

      {/* Main content area */}
      <div style={{ marginLeft: SIDEBAR_W, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: DASH.pageBg }}>

        {/* Sticky header */}
        <DashboardHeader slideIn={headerSlide} badgePulse={badgePulse} />

        {/* Scrollable page content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", boxSizing: "border-box" }}>

          {/* Row 1: WelcomeBanner + Clinic Ops */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 20, marginBottom: 20 }}>
            <WelcomeBanner opacity={welcomeOpacity} translateY={welcomeY} />
            <ClinicOpsCard opacity={welcomeOpacity} translateY={welcomeY} />
          </div>

          {/* Row 2: Stat bar */}
          <div style={{ marginBottom: 20 }}>
            <StatBar opacity={statsOpacity} translateY={statsY} animatedValues={statValues} />
          </div>

          {/* Row 3: 3-column grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "stretch" }}>
            <OverdueCard opacity={overdueOpacity} translateY={overdueY} />
            <TodayDosesCard opacity={dosesOpacity} translateY={dosesY} />
            <TodayScheduleCard opacity={scheduleOpacity} translateY={scheduleY} />
          </div>

        </div>
      </div>
    </AbsoluteFill>
  );
};
