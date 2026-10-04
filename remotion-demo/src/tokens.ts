/**
 * tokens.ts
 * Design constants pulled directly from the real codebase.
 * Sources:
 *  - ka-clinic-admin/src/components/landing/constants.js  (CSS vars)
 *  - ka-clinic-admin/src/pages/adm-loginsign.jsx          (login screen styles)
 *  - ka-clinic-admin/src/pages/AdminDashboard.jsx          (dashboard styles)
 *  - ka-clinic-admin/src/index.css                         (Tailwind classes)
 */

// ─── Font ────────────────────────────────────────────────────────────────────
export const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

// ─── Landing Page Colors (from constants.js CSS vars) ────────────────────────
export const LANDING = {
  red:       '#E31837',    // --red  (navbar "Admin Login" button)
  redDark:   '#C41228',    // --red-dark
  redGlow:   'rgba(227,24,55,0.20)',
  navy:      '#0F172A',    // --navy
  navy2:     '#1B2843',    // --navy2
  text:      '#0F172A',    // --text
  text2:     '#334155',    // --text2
  muted:     '#64748B',    // --muted
  border:    '#E2E8F0',    // --border
  bgLight:   '#FFFFFF',    // --bg-light
  bgAlt:     '#F8FAFC',    // --bg-alt
};

// ─── Login Page Colors (from adm-loginsign.jsx) ───────────────────────────────
export const LOGIN = {
  bg:              '#060e24',   // full-screen background
  glow1:           'rgba(96,165,250,0.25)',   // blue-600/25 top-left blob
  glow2:           'rgba(79,70,229,0.20)',    // indigo-700/20 bottom-left blob
  glow3:           'rgba(14,165,233,0.15)',   // sky-500/15 top-right blob
  overlay:         'rgba(6,14,36,0.90)',      // from-[#060e24]/90 gradient
  cardBg:          '#FFFFFF',
  cardRadius:      36,
  cardShadow:      '0 30px 90px rgba(3,10,32,0.6)',
  cardBorder:      'rgba(219,234,254,0.90)',  // blue-100/90
  // Heading
  headingColor:    '#0a1b3f',
  // Primary gradient button
  btnFrom:         '#0a1d47',
  btnVia:          '#0e2a6d',
  btnTo:           '#1d4ed8',
  btnShadow:       '0 10px 25px rgba(14,42,109,0.35)',
  // Input
  inputBg:         '#F8FAFC',   // slate-50
  inputBorder:     '#E2E8F0',   // slate-200
  inputFocusBorder:'#1d4ed8',
  inputFocusRing:  'rgba(29,78,216,0.15)',
  inputText:       '#0F172A',   // slate-900
  inputPlaceholder:'#94A3B8',   // slate-400
  // Checkbox (Remember Me) — checked state
  checkboxBg:      '#0e2a6d',
  checkboxBorder:  '#0e2a6d',
  // Back-to-website button in header
  backBtn:         'rgba(10,30,74,0.60)',
  backBtnHover:    'rgba(18,50,117,0.80)',
  backBtnBorder:   'rgba(96,165,250,0.30)',
  // Carousel dot active
  dotActive:       '#38BDF8',   // sky-400
  dotInactive:     'rgba(147,197,253,0.30)',
  // OTP field
  otpText:         '#0a1b3f',
  otpPlaceholder:  '#CBD5E1',   // slate-300
  // Resend / back link
  linkBlue:        '#1d4ed8',
  linkMuted:       '#64748B',
  // Success overlay
  successBg:       '#060e24',
};

// ─── Dashboard Colors (from AdminDashboard.jsx) ────────────────────────────
export const DASH = {
  pageBg:          '#F0F4FA',
  sidebar:         '#06122c',
  sidebarBorder:   'rgba(255,255,255,0.10)',
  sidebarSection:  'rgba(255,255,255,0.60)',   // section label text
  activeNavBg:     '#F0F4FA',                  // active nav item bg (same as page bg!)
  activeNavText:   '#000000',                  // black text on active item
  inactiveNavText: '#FFFFFF',
  // Header
  headerBg:        '#FFFFFF',
  headerBorder:    '#E2E8F0',
  headerBlueBar:   '#1D4ED8',
  headerTitle:     '#0a1d47',
  // Brand accent
  primaryBlue:     '#1D4ED8',
  deepNavy:        '#0a1d47',
  midNavy:         '#0e2a6d',
  // Card
  cardBg:          '#FFFFFF',
  cardBorder:      'rgba(219,234,254,0.80)',   // blue-100/80
  cardRadius:      24,                          // rounded-3xl
  // Stat widget colors
  blueIcon:        '#1D4ED8',
  blueTint:        '#EFF6FF',
  blueBorder:      '#DBEAFE',
  navyIcon:        '#0E2A6D',
  navyTint:        '#EEF2FF',
  navyBorder:      '#E0E7FF',
  redIcon:         '#DC2626',
  redTint:         '#FEF2F2',
  redBorder:       '#FCA5A5',
  greenIcon:       '#059669',
  greenTint:       '#ECFDF5',
  greenBorder:     '#A7F3D0',
  // Status badges
  roseBg:          '#FFF1F2',
  roseText:        '#DC2626',
  roseBorder:      '#FECDD3',
  amberBg:         '#FFFBEB',
  amberText:       '#D97706',
  amberBorder:     '#FDE68A',
  emeraldBg:       '#ECFDF5',
  emeraldText:     '#059669',
  emeraldBorder:   '#A7F3D0',
  indigoBg:        '#EEF2FF',
  indigoText:      '#4F46E5',
  indigoBorder:    '#C7D2FE',
  // Muted
  slate400:        '#94A3B8',
  slate500:        '#64748B',
};

// ─── Sidebar layout ──────────────────────────────────────────────────────────
export const SIDEBAR_W = 256;
export const HEADER_H  = 80;

// ─── Viewport ────────────────────────────────────────────────────────────────
export const VP_W = 1920;
export const VP_H = 1080;

// ─── Login Slides (from SLIDES[] in adm-loginsign.jsx) ───────────────────────
export const LOGIN_SLIDES = [
  {
    tag:      'Clinical Intelligence',
    headline: 'Protect Smarter.\nCare Faster.\nHeal Anywhere.',
    desc:     'From immediate bite triage to digital PEP dose schedules, our powerful clinical portal coordinates patient care seamlessly.',
  },
  {
    tag:      'PEP Dose Protocol',
    headline: 'Never Miss A Dose.\nPrecision Tracking.',
    desc:     'Automatic Day 0, 3, 7, and 14 schedule tracking keeps every anti-rabies patient strictly on protocol.',
  },
  {
    tag:      'Triage & Incident Map',
    headline: 'Rapid Bite Response.\nDigital Records.',
    desc:     'Log, assess category severity, and track vaccination inventory in real time across the entire clinic.',
  },
];

// ─── Absolute paths to real assets ──────────────────────────────────────────
// Adjust these paths if the remotion-demo folder is relocated.
const ASSET_BASE = 'c:/Users/Admin/OneDrive/Desktop/KnAPrototype_reorganized/KnAPrototype_final_reorg/ka-clinic-admin/public/assets/dashboard';
export const ASSETS = {
  logo:           `${ASSET_BASE}/logo-white-nobg.png`,
  logoBlack:      `${ASSET_BASE}/logo-black.png`,
  welcomeBanner:  `${ASSET_BASE}/welcome_banner.png`,
  loginBg:        (n: 1|2|3|4|5|6) => `${ASSET_BASE}/login/${n}.jpg`,
};

// ─── Demo data for dashboard (realistic, non-identifiable) ───────────────────
export const DEMO_STATS = {
  totalPatients: 247,
  thisWeek: 8,
  todayApts: 12,
  confirmedApts: 5,
  unreadMessages: 3,
  lowStock: 2,
};

export const DEMO_OVERDUE = [
  { name: 'Reyes, Maria L.',   dose: 'Day 14 (4th Dose)', daysOverdue: 7  },
  { name: 'Santos, Juan C.',   dose: 'Day 7 (3rd Dose)',  daysOverdue: 4  },
  { name: 'Dela Cruz, Ana M.', dose: 'Day 3 (2nd Dose)',  daysOverdue: 2  },
];

export const DEMO_TODAY_DOSES = [
  { name: 'Mendoza, Rafael B.', dose: 'Day 0 (1st Dose)',  done: false },
  { name: 'Garcia, Liza T.',    dose: 'Day 3 (2nd Dose)',  done: true  },
  { name: 'Torres, Pedro K.',   dose: 'Day 7 (3rd Dose)',  done: false },
  { name: 'Bautista, Ana R.',   dose: 'Day 14 (4th Dose)', done: false },
];

export const DEMO_SCHEDULE = [
  { name: 'Villanueva, Rosa S.', time: '8:00 AM',  type: 'Consultation',  status: 'confirmed' },
  { name: 'Bautista, Carlo M.',  time: '9:00 AM',  type: 'PEP Dose',      status: 'confirmed' },
  { name: 'Cruz, Lea S.',        time: '10:00 AM', type: 'Follow-up',     status: 'pending'   },
  { name: 'Panganiban, Rey J.',  time: '1:00 PM',  type: 'Wound Check',   status: 'confirmed' },
];
