// kna-admin/src/appts.jsx
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  Phone,
  Plus,
  RotateCcw,
  Tag,
  UserCheck,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import Toast from '../components/Toast';
import { authedPostJson } from '../lib/apiClient';
import { getTodayDateString, addDaysToDateString, formatDateLong } from '../lib/dates';

/* ─────────────────────────── CSS ─────────────────────────── */
const globalCSS = `
  :root {
    --primary-red: #6366F1;
    --red-hover: #4F46E5;
    --red-soft: #EEF2FF;
    --bg-main: #F0F4FA;
    --bg-card: #FFFFFF;
    --bg-subtle: #F4F1F1;
    --text-main: #1C1C1E;
    --text-muted: #7A6E6E;
    --border: #E8E2E2;
    --green: #16A34A;
    --green-soft: #DCFCE7;
    --amber: #D97706;
    --amber-soft: #FEF3C7;
    --blue: #3D5AFE;
    --blue-soft: #EEF1FD;
    --radius-lg: 12px;
    --radius-md: 8px;
    --radius-sm: 6px;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Roboto', system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text-main); }

  /* Main Container */
  .appts-container {
    padding: 16px;
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100vh;
  }

  /* Header Bar */
  .page-header-bar {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: var(--radius-lg);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-icon-box {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-md);
    background: #EEF2FF;
    border: 1px solid #C7D2FE;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6366F1;
  }
  .header-title {
    color: #111827;
    font-size: 1.125rem;
    font-weight: 800;
    letter-spacing: -0.2px;
  }
  .header-subtitle {
    color: #6B7280;
    font-size: 0.75rem;
    font-weight: 500;
    margin-top: 2px;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  /* Month Navigator in Header */
  .month-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 10px;
    border-radius: var(--radius-md);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .month-title {
    color: #FFFFFF;
    font-size: 0.8125rem;
    font-weight: 700;
    min-width: 120px;
    text-align: center;
  }
  .month-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s;
  }
  .month-btn:hover { background: rgba(255, 255, 255, 0.2); color: #FFF; }

  /* Add Walk-In Button */
  .btn-add-primary {
    background: var(--primary-red);
    color: #FFFFFF;
    border: none;
    border-radius: var(--radius-md);
    padding: 8px 16px;
    font-size: 0.8125rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: background 0.15s;
    box-shadow: 0 2px 8px rgba(200, 21, 26, 0.3);
  }
  .btn-add-primary:hover { background: var(--red-hover); }

  /* Main 2-Column Grid Layout */
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .dashboard-grid { grid-template-columns: 1fr; }
  }

  /* Left Panel */
  .left-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Card Base */
  .card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    padding: 16px;
    box-shadow: var(--shadow-sm);
  }

  /* Calendar Section */
  .calendar-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 500px;
    width: 100%;
  }
  .calendar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }
  .calendar-head-title {
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--text-main);
  }

  /* Calendar Grid */
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }
  .cal-day-name {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding-bottom: 10px;
  }
  .cal-day-cell {
    background: transparent;
    border-radius: 10px;
    border: none;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    min-height: 60px;
  }
  .cal-day-cell:hover {
    background: var(--bg-subtle);
  }
  .cal-day-cell.other-month {
    opacity: 0.3;
  }
  .cal-day-cell.selected {
    background: #EEF2FF;
    border: 2px solid #6366F1 !important;
    border-radius: 8px;
  }
  .cal-day-cell.selected:hover {
    background: #E0E7FF;
  }
  /* Bookable days — clinic only accepts appointments Sat & Sun. Weekdays
     just carry a small "Closed" label; weekends are the implied default,
     so they don't need their own color callout. */
  .cal-day-cell.weekday .cal-num {
    color: var(--text-muted);
  }
  .cal-num {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-main);
    line-height: 1;
  }
  .cal-day-cell.today:not(.selected) .cal-num {
    color: #6366F1;
    font-weight: 800;
  }
  .cal-day-cell.selected .cal-num {
    color: #6366F1;
    font-weight: 800;
  }
  .cal-closed-tag {
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.2px;
    text-transform: uppercase;
    color: var(--text-muted);
    opacity: 0.7;
  }
  .cal-day-cell.selected .cal-closed-tag {
    color: rgba(255,255,255,0.7);
  }

  /* Status Dots inside Calendar Cell */
  .cal-dots-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .cal-day-cell.selected .dot-status {
    background-color: #FFFFFF !important;
    opacity: 0.9;
  }
  .dot-status {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }
  .dot-confirmed { background-color: var(--green); }
  .dot-pending { background-color: var(--amber); }
  .dot-cancelled { background-color: #EF4444; }
  .dot-done { background-color: var(--blue); }

  /* Legend */
  .calendar-legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    font-size: 0.625rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .legend-item { display: flex; align-items: center; gap: 3px; }

  /* Timeline Agenda Section */
  .agenda-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .agenda-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }
  .agenda-date-label {
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--text-main);
  }

  .timeline-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 480px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .timeline-card-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--bg-card);
    border-radius: 14px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
    padding: 14px 16px;
    box-shadow: var(--shadow-sm);
    transition: all 0.15s ease;
  }
  .timeline-card-item:hover {
    border-color: #D4CBCB;
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }
  .timeline-card-item.tl-confirmed { border-left-color: var(--green); }
  .timeline-card-item.tl-pending { border-left-color: var(--amber); }
  .timeline-card-item.tl-done { border-left-color: var(--blue); }
  .timeline-card-item.tl-cancelled { border-left-color: #EF4444; }

  .tl-left-info {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .tl-time-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: var(--bg-subtle);
    padding: 8px 10px;
    border-radius: 12px;
    white-space: nowrap;
    flex-shrink: 0;
    text-align: center;
  }
  .tl-time-box .tl-time-start {
    font-size: 0.8125rem;
    font-weight: 800;
    color: var(--text-main);
    line-height: 1.2;
  }
  .tl-time-box .tl-time-end {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--text-muted);
    line-height: 1.2;
  }
  .tl-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 800;
    color: #FFFFFF;
    flex-shrink: 0;
    background: linear-gradient(135deg, #94A3B8, #64748B);
  }
  .timeline-card-item.tl-confirmed .tl-avatar { background: linear-gradient(135deg, #34D399, #16A34A); }
  .timeline-card-item.tl-pending .tl-avatar { background: linear-gradient(135deg, #FBBF24, #D97706); }
  .timeline-card-item.tl-done .tl-avatar { background: linear-gradient(135deg, #60A5FA, #3D5AFE); }
  .timeline-card-item.tl-cancelled .tl-avatar { background: linear-gradient(135deg, #F87171, #C8151A); }
  .tl-patient-name {
    font-size: 0.9375rem;
    font-weight: 800;
    color: var(--text-main);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tl-patient-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 4px;
    min-width: 0;
  }
  .tl-patient-meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tl-right-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  /* Badges — status and source share the same pill shape now */
  .badge-status {
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }
  .badge-confirmed { background: var(--green-soft); color: #15803D; }
  .badge-pending { background: var(--amber-soft); color: #B45309; }
  .badge-cancelled { background: var(--red-soft); color: #B91C1C; }
  .badge-done { background: var(--blue-soft); color: var(--blue); }

  .badge-source {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 9px;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 700;
    background: #F1F5F9;
    color: #475569;
    white-space: nowrap;
  }

  /* Icon Buttons */
  .icon-btn {
    width: 33px;
    height: 33px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: all 0.12s;
  }
  .icon-btn:hover { border-color: var(--primary-red); color: var(--primary-red); background: var(--red-soft); }
  .icon-btn.danger:hover { border-color: #B91C1C; color: #B91C1C; background: var(--red-soft); }

  /* Right Panel (Metrics & Pending Queue) */
  .right-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Queue Panel */
  .queue-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }
  .queue-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }
  .queue-title {
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--text-main);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .queue-badge-count {
    background: var(--amber-soft);
    color: #B45309;
    padding: 2px 7px;
    border-radius: 99px;
    font-size: 0.6875rem;
    font-weight: 800;
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 1000px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .queue-item-card {
    background: var(--bg-main);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.12s;
  }
  .queue-item-card:hover {
    background: var(--bg-card);
    border-color: var(--amber);
  }
  .q-name {
    font-size: 0.8125rem;
    font-weight: 800;
    color: var(--text-main);
  }
  .q-meta {
    font-size: 0.72rem;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .q-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 4px;
  }

  .btn-queue-action {
    padding: 6px;
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    font-weight: 800;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: opacity 0.15s;
  }
  .btn-queue-confirm { background: var(--green-soft); color: #15803D; }
  .btn-queue-confirm:hover { opacity: 0.85; }
  .btn-queue-cancel { background: var(--red-soft); color: #B91C1C; }
  .btn-queue-cancel:hover { opacity: 0.85; }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 30px 10px;
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  /* Modal Overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.5);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    padding: 16px;
  }
  .modal-card {
    background: var(--bg-card);
    border-radius: 16px;
    padding: 24px;
    width: 480px;
    max-width: 100%;
    box-shadow: 0 20px 50px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
  }
  .modal-title { font-size: 1.05rem; font-weight: 900; color: var(--text-main); }
  .modal-close {
    background: var(--bg-subtle);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
  .modal-close:hover { background: var(--red-soft); color: var(--primary-red); }

  /* Dark navy banner header — matches the Add Inventory Item modal. */
  .modal-card.has-banner { padding: 0; gap: 0; overflow: hidden; }
  .modal-card.has-banner .form-grid,
  .modal-card.has-banner .modal-footer { padding-left: 24px; padding-right: 24px; }
  .modal-card.has-banner .form-grid { padding-top: 20px; }
  .modal-card.has-banner .modal-footer { padding-bottom: 24px; }

  .modal-banner {
    background: #1E293B;
    padding: 18px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .modal-banner-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .modal-banner-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: rgba(255,255,255,0.1);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .modal-banner-title { font-size: 1rem; font-weight: 800; color: #fff; line-height: 1.25; }
  .modal-banner-sub { font-size: .6875rem; font-weight: 500; color: #CBD5E1; margin-top: 2px; }
  .modal-banner-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #94A3B8;
    display: flex;
    align-items: center;
    transition: color .15s ease;
  }
  .modal-banner-close:hover { color: #fff; }

  .form-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .form-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
  }
  .form-input, .form-select {
    font-family: inherit;
    font-size: 0.8125rem;
    padding: 10px 12px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-main);
    color: var(--text-main);
    outline: none;
  }
  .form-input:focus, .form-select:focus {
    border-color: var(--primary-red);
    background: #FFF;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .modal-footer-right {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .btn-secondary {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    padding: 8px 14px;
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-main);
    cursor: pointer;
  }
  .btn-secondary:hover { background: #E5E7EB; }

  /* Toast Notification */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 700;
    color: white;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: toastSlideIn 0.25s ease;
  }
  @keyframes toastSlideIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .toast-success { background: #15803D; }
  .toast-error { background: #B91C1C; }
`;

const TIME_SLOTS = [
  "8:00 AM - 9:00 AM",
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "1:00 PM - 2:00 PM",
  "2:00 PM - 3:00 PM",
  "3:00 PM - 4:00 PM",
  "4:00 PM - 5:00 PM",
];

// Clinic only takes appointment bookings on Saturday (6) and Sunday (0) —
// parsed as a local date (not UTC) so "YYYY-MM-DD" strings match the day
// the calendar actually shows.
// One patient per hour: appointmentSlots holds a doc per taken (date, time)
// pair so the patient app can grey out booked hours without being allowed to
// read other patients' appointment records. Must stay in sync with slotId() in
// patient-app/app/(tabs)/appt.tsx — the two sides derive the same key.
const slotId = (date, time) => `${date}_${String(time).replace(/[\s:]/g, '')}`;

// Frees an hour so another patient can take it. Slot holds are deliberately
// NOT released when a patient cancels — the clinic clears them explicitly,
// which is what deleting or rescheduling an appointment does here.
const releaseSlot = async (date, time) => {
  if (!date || !time) return;
  try {
    await deleteDoc(doc(db, 'appointmentSlots', slotId(date, time)));
  } catch (err) {
    console.error('Slot release error:', err);
  }
};

const isWeekendDate = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
};

// Rolls a weekday date forward to the same week's Saturday, leaving
// weekend dates untouched — used to pre-fill the date field with a valid
// default instead of handing the admin a date that will just get rejected.
const nextAvailableDate = (dateStr) => {
  if (!dateStr || isWeekendDate(dateStr)) return dateStr;
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const daysUntilSaturday = 6 - day;
  return addDaysToDateString(dateStr, daysUntilSaturday);
};

const SERVICE_TYPES = [
  "PEP Follow-up",
  "PrEP Consultation",
  "Anti-Tetanus Vaccine",
  "Hepatitis B Vaccine",
  "Pneumococcal Vaccine",
  "General Consultation",
  "Walk-in Emergency",
];

const getInitials = (name = '') =>
  name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export default function AppointmentPage() {
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [currentViewDate, setCurrentViewDate] = useState(new Date());
  const [rightPanelTab, setRightPanelTab] = useState('requests'); // 'requests' | 'cancellations'

  const [datePreviewModalOpen, setDatePreviewModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingApt, setEditingApt] = useState(null);

  const [addForm, setAddForm] = useState({
    name: '',
    contactNumber: '',
    date: nextAvailableDate(selectedDate),
    time: TIME_SLOTS[0],
    type: SERVICE_TYPES[0],
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    contactNumber: '',
    date: '',
    time: '',
    type: '',
    status: '',
    notes: '',
    cancellationReason: '',
  });

  const [toast, setToast] = useState({ msg: '', type: '' });
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3000);
  };

  // Real-time Firestore subscription
  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Appointments subscription error:', err);
    });
    return unsub;
  }, []);

  // Update addForm date default when selectedDate changes
  useEffect(() => {
    setAddForm(prev => ({ ...prev, date: nextAvailableDate(selectedDate) }));
  }, [selectedDate]);

  // Hours already spoken for on the date being added/edited. Derived from the
  // appointments the dashboard already subscribes to, so it needs no extra
  // read of appointmentSlots. Cancelled appointments still occupy their hour —
  // the clinic frees those explicitly by deleting or rescheduling.
  const takenTimesOn = (date, exceptId) =>
    appointments
      .filter(a => a.date === date && a.id !== exceptId && a.status !== 'cancelled')
      .map(a => a.time);

  // Calendar Generation
  const generateCalendar = () => {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const cells = [];
    const prevMonthDays = new Date(year, month, 0).getDate();

    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, month: month - 1, year, isOtherMonth: true });
    }
    for (let i = 1; i <= totalDays; i++) {
      cells.push({ day: i, month, year, isOtherMonth: false });
    }
    return cells;
  };

  const navigateMonth = (val) => {
    const next = new Date(currentViewDate);
    next.setMonth(next.getMonth() + val);
    setCurrentViewDate(next);
  };

  // Filtered Appointments
  const timelineApts = appointments.filter(a => a.date === selectedDate);
  const pendingOnlineRequests = appointments.filter(a => a.status === 'pending' && a.source !== 'walk-in');
  const cancellationRequests = appointments.filter(a => a.status === 'cancellation_pending');
  const allCancelledApts = appointments.filter(a => a.status === 'cancelled' || a.status === 'cancellation_pending');

  // Metrics
  const todayStr = getTodayDateString();
  const confirmedToday = appointments.filter(a => a.date === todayStr && (a.status === 'confirmed' || a.status === 'accepted')).length;

  // Actions
  // Approving an appointment tells the patient. The app already surfaces a
  // confirmed appointment in its notification list from the appointments
  // listener, but that only fires while the app is open — this pushes through
  // the same /api/notifications pipeline the dose reminders use, so it also
  // lands in the patient's inbox and as a push/email when the app is closed.
  const notifyAppointmentApproved = async (apt) => {
    const patientId = apt?.patientId;
    if (!patientId) return;
    const whenDate = formatDateLong(apt.date) || apt.date || 'your scheduled date';
    const whenTime = apt.time ? ` at ${apt.time}` : '';
    try {
      await authedPostJson('/api/notifications', {
        action: 'send-followup',
        patientId,
        title: 'Appointment approved',
        message: `Your ${apt.type || 'appointment'} at K&A Clinic on ${whenDate}${whenTime} has been approved. Please arrive 10 minutes early and bring your patient record.`,
        dueDate: whenDate,
        source: 'appointment-approved',
      });
    } catch (err) {
      // The status change itself already succeeded; a failed notification
      // must not read as a failed approval.
      console.error('Appointment approval notification failed:', err);
      showToast('Appointment approved, but the patient notification failed to send', 'error');
    }
  };

  const handleQuickAction = async (id, newStatus) => {
    try {
      const target = appointments.find(a => a.id === id);
      await updateDoc(doc(db, 'appointments', id), { status: newStatus, updatedAt: Date.now() });
      if (newStatus === 'cancelled' && target) {
        await releaseSlot(target.date, target.time);
      }
      if ((newStatus === 'confirmed' || newStatus === 'accepted') && target) {
        await notifyAppointmentApproved(target);
      }
      showToast(`Appointment status updated to ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      showToast('Failed to update status', 'error');
    }
  };

  const handleSaveAdd = () => {
    if (!addForm.name.trim() || !addForm.contactNumber.trim()) {
      showToast('Please fill in patient name and contact number', 'error');
      return;
    }
    if (!isWeekendDate(addForm.date)) {
      showToast('Appointments are only available on Saturdays and Sundays', 'error');
      return;
    }
    const newApt = {
      name: (addForm.name || '').trim(),
      contactNumber: (addForm.contactNumber || '').trim(),
      date: addForm.date || selectedDate || '',
      time: addForm.time || TIME_SLOTS[0] || '',
      type: addForm.type || SERVICE_TYPES[0] || '',
      notes: (addForm.notes || '').trim(),
      status: 'confirmed',
      source: 'walk-in',
      createdAt: Date.now(),
    };
    setAddModalOpen(false);
    setSaving(false);
    setAddForm({
      name: '',
      contactNumber: '',
      date: nextAvailableDate(selectedDate),
      time: TIME_SLOTS[0],
      type: SERVICE_TYPES[0],
      notes: '',
    });
    showToast('Walk-in / Appointment added successfully!');
    addDoc(collection(db, 'appointments'), newApt)
      .then(async () => {
        try {
          await setDoc(doc(db, 'appointmentSlots', slotId(newApt.date, newApt.time)), {
            date:      newApt.date,
            time:      newApt.time,
            heldBy:    auth.currentUser?.uid || 'admin',
            createdAt: Date.now(),
          });
        } catch (err) {
          console.error('Slot claim error:', err);
        }
      })
      .catch(err => {
        console.error('Add error:', err);
        showToast(err?.message || 'Failed to add appointment', 'error');
      });
  };

  const openEditModal = (apt) => {
    setEditingApt(apt);
    setEditForm({
      name: apt.name || '',
      contactNumber: apt.contactNumber || apt.contact || '',
      date: apt.date || selectedDate,
      time: apt.time || TIME_SLOTS[0],
      type: apt.type || SERVICE_TYPES[0],
      status: apt.status || 'confirmed',
      notes: apt.notes || '',
      cancellationReason: apt.cancellationReason || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingApt) return;
    if (!editForm.name.trim() || !editForm.contactNumber.trim()) {
      showToast('Please fill in patient name and contact number', 'error');
      return;
    }
    if (editForm.date !== editingApt.date && !isWeekendDate(editForm.date)) {
      showToast('Appointments are only available on Saturdays and Sundays', 'error');
      return;
    }
    const updatedData = {
      name: (editForm.name || '').trim(),
      contactNumber: (editForm.contactNumber || '').trim(),
      date: editForm.date || selectedDate || '',
      time: editForm.time || TIME_SLOTS[0] || '',
      type: editForm.type || SERVICE_TYPES[0] || '',
      status: editForm.status || 'confirmed',
      notes: (editForm.notes || '').trim(),
      cancellationReason: (editForm.cancellationReason || '').trim(),
      source: editingApt.source || 'walk-in',
      updatedAt: Date.now(),
    };
    const aptId = editingApt.id;
    const prevDate = editingApt.date;
    const prevTime = editingApt.time;
    const rescheduled = prevDate !== updatedData.date || prevTime !== updatedData.time;
    setEditModalOpen(false);
    setEditingApt(null);
    setEditSaving(false);
    showToast('Appointment updated successfully!');
    updateDoc(doc(db, 'appointments', aptId), updatedData)
      .then(async () => {
        if (updatedData.status === 'cancelled') {
          await releaseSlot(prevDate, prevTime);
        } else if (rescheduled) {
          await releaseSlot(prevDate, prevTime);
          try {
            await setDoc(doc(db, 'appointmentSlots', slotId(updatedData.date, updatedData.time)), {
              date:      updatedData.date,
              time:      updatedData.time,
              heldBy:    auth.currentUser?.uid || 'admin',
              createdAt: Date.now(),
            });
          } catch (err) {
            console.error('Slot claim error:', err);
          }
        }
      })
      .catch(err => {
        console.error('Edit error:', err);
        showToast(err?.message || 'Failed to update appointment', 'error');
      });
  };

  return (
    <div className="appts-container">
      <style>{globalCSS}</style>

      {/* Toast */}
      <Toast
        msg={toast.msg}
        type={toast.type}
        onClose={() => setToast({ msg: '', type: '' })}
      />

      {/* 1. TOP SUMMARY CARDS ABOVE CALENDAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Appointments', value: appointments.length, sub: 'All recorded bookings', Icon: CalendarIcon },
          { label: 'Pending Requests', value: pendingOnlineRequests.length, sub: 'Awaiting confirmation', Icon: Clock },
          { label: 'Confirmed Today', value: confirmedToday, sub: 'Ready for today’s visits', Icon: CheckCircle2 },
          { label: 'Cancelled Records', value: allCancelledApts.length, sub: 'Cancelled & Archived', Icon: AlertCircle },
        ].map((m, i) => (
          <div key={i} style={{
            background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <m.Icon size={18} strokeWidth={2} color="#475569" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.375rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
              <div style={{ fontSize: '.6875rem', fontWeight: 700, color: '#475569', marginTop: 3 }}>{m.label}</div>
              <div style={{ fontSize: '.65625rem', color: 'var(--text-muted)', fontWeight: 600 }}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column Equal Height Row: Enlarged Calendar (500px Left) + Expanded Requests/Cancellation Card (1fr Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '500px 1fr', gap: 16, alignItems: 'stretch', marginBottom: 16 }}>

        {/* LEFT PANEL: COMPACT CALENDAR CARD */}
        <div className="card calendar-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          {/* Calendar Header */}
          <div className="calendar-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            
            {/* Left Header Info: Month Navigator on top, Today & Selected Date below month */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Month Navigator */}
              <div className="month-nav" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
                <button className="month-btn" style={{ color: '#4B5563', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => navigateMonth(-1)} title="Previous Month">
                  <ChevronLeft size={16} />
                </button>
                <span className="month-title" style={{ color: '#1F2937', fontWeight: 800, fontSize: '.875rem' }}>
                  {currentViewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button className="month-btn" style={{ color: '#4B5563', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => navigateMonth(1)} title="Next Month">
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Below Month: Today Button & Selected Date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setCurrentViewDate(new Date()); setSelectedDate(todayStr); setDatePreviewModalOpen(true); }}
                  style={{ fontSize: '.75rem', fontWeight: 700, color: '#3B50DF', background: '#EEF2FF', border: '1px solid #E0E7FF', borderRadius: 8, padding: '3px 8px', cursor: 'pointer' }}
                >
                  Today
                </button>

                <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                  Selected: <strong style={{ color: '#3B50DF' }}>{selectedDate}</strong>
                </span>
              </div>
            </div>

            {/* Right Header Button: "Add Appointment" (Aligned to right) */}
            <button className="btn-add-primary" onClick={() => { setSaving(false); setAddModalOpen(true); }} style={{ marginLeft: 'auto', alignSelf: 'flex-start', padding: '7px 14px', fontSize: '0.8125rem' }}>
              <Plus size={15} />
              <span>Add Appointment</span>
            </button>
          </div>

          <div className="cal-grid" style={{ flex: 1, margin: '8px 0' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="cal-day-name">{d}</div>
            ))}

            {generateCalendar().map((c, i) => {
              const dStr = `${c.year}-${String(c.month + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
              const dayApts = appointments.filter(a => a.date === dStr);

              const hasConfirmed = dayApts.some(a => a.status === 'confirmed' || a.status === 'accepted');
              const hasPending = dayApts.some(a => a.status === 'pending');
              const hasCancelled = dayApts.some(a => a.status === 'cancelled');
              const hasDone = dayApts.some(a => a.status === 'done');

              const isToday = dStr === todayStr;
              const isSelected = selectedDate === dStr;
              const isWeekend = isWeekendDate(dStr);

              return (
                <div
                  key={i}
                  className={`cal-day-cell ${c.isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isWeekend ? 'weekend' : 'weekday'}`}
                  onClick={() => { setSelectedDate(dStr); setDatePreviewModalOpen(true); }}
                  title="Click to view appointment preview popup for this date"
                >
                  <span className="cal-num">{c.day}</span>

                  {dayApts.length > 0 && (
                    <div className="cal-dots-row">
                      {hasConfirmed && <div className="dot-status dot-confirmed" title="Confirmed" />}
                      {hasPending && <div className="dot-status dot-pending" title="Pending" />}
                      {hasDone && <div className="dot-status dot-done" title="Done" />}
                      {hasCancelled && <div className="dot-status dot-cancelled" title="Cancelled" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
<div className="calendar-legend" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div className="legend-item"><div className="dot-status dot-confirmed" /> Confirmed</div>
            <div className="legend-item"><div className="dot-status dot-pending" /> Pending</div>
            <div className="legend-item"><div className="dot-status dot-done" /> Done</div>
            <div className="legend-item"><div className="dot-status dot-cancelled" /> Cancelled</div>
          </div>
        </div>

        {/* RIGHT PANEL: REQUESTS & CANCELLATION CARD WITH CENTERED BLACK HEADERS */}
        <div className="right-panel">

          <div className="card queue-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 22px' }}>
            
            {/* 2-Column Centered Black Header Row with Middle Division Line */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, borderBottom: '1px solid #E2E8F0', paddingBottom: 12, marginBottom: 16 }}>
              
              {/* Left Centered Black Header: Appointment Requests */}
              <div style={{ paddingRight: 16, borderRight: '1.5px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  Appointment Requests
                  <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>
                    {pendingOnlineRequests.length}
                  </span>
                </h3>
              </div>

              {/* Right Centered Black Header: Appointment Cancellation */}
              <div style={{ paddingLeft: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  Appointment Cancellation
                  <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>
                    {allCancelledApts.length}
                  </span>
                </h3>
              </div>
            </div>

            {/* 2-Column Grid Content with Vertical Division Line in the Middle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1, overflowY: 'auto' }}>
              
              {/* LEFT COLUMN: Appointment Requests */}
              <div style={{ paddingRight: 16, borderRight: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingOnlineRequests.length === 0 ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9' }}>
                    <CheckCircle2 size={24} style={{ color: '#15803D', margin: '0 auto 6px' }} />
                    <p style={{ fontSize: '.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>All caught up!</p>
                    <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>No pending appointment requests.</p>
                  </div>
                ) : (
                  <div className="queue-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pendingOnlineRequests.map(apt => (
                      <div key={apt.id} className="queue-item-card" style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span className="q-name" style={{ fontSize: '0.875rem' }}>{apt.name}</span>
                          <span className="badge-source">
                            {(apt.source === 'online' || apt.source === 'landing') ? 'Online' : 'Walk-In'}
                          </span>
                        </div>

                        <div className="q-meta" style={{ marginTop: 6 }}>
                          <span><Phone size={11} style={{ display: 'inline', marginRight: 4 }} />{apt.contactNumber || apt.contact || 'No contact'}</span>
                          <span><CalendarIcon size={11} style={{ display: 'inline', marginRight: 3 }} />{apt.date} · <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{apt.time}</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: 2 }}>{apt.type}</span>
                        </div>

                        <div className="q-actions" style={{ marginTop: 10 }}>
                          <button className="btn-queue-action btn-queue-confirm" onClick={() => handleQuickAction(apt.id, 'confirmed')}>
                            <UserCheck size={13} /> Confirm
                          </button>
                          <button className="btn-queue-action btn-queue-cancel" onClick={() => handleQuickAction(apt.id, 'cancelled')}>
                            <X size={13} /> Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Cancellation Table & Requests */}
              <div style={{ paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Pending Cancellation Requests Alerts */}
                {cancellationRequests.length > 0 && (
                  <div style={{ padding: 10, background: '#FFF5F5', borderRadius: 10, border: '1px solid #FCA5A5', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <AlertCircle size={14} style={{ color: '#DC2626' }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#991B1B' }}>
                        Pending Cancellation Requests ({cancellationRequests.length})
                      </span>
                    </div>
                    {cancellationRequests.map(apt => (
                      <div key={apt.id} style={{ background: '#FFFFFF', padding: 8, borderRadius: 6, border: '1px solid #FECACA', marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78125rem', fontWeight: 700 }}>{apt.name}</span>
                          <span className="badge-source" style={{ background: '#FEE2E2', color: '#991B1B', fontSize: '0.6875rem' }}>Cancel Request</span>
                        </div>
                        <div style={{ fontSize: '0.71875rem', color: '#64748B', marginTop: 2 }}><CalendarIcon size={11} style={{ display: 'inline', marginRight: 3 }} />{apt.date} · <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{apt.time}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button className="btn-queue-action btn-queue-cancel" onClick={() => handleQuickAction(apt.id, 'cancelled')} style={{ background: '#DC2626', color: '#FFF', fontSize: '0.6875rem', padding: '3px 8px' }}>
                            <X size={11} /> Approve
                          </button>
                          <button className="btn-queue-action btn-queue-confirm" onClick={() => handleQuickAction(apt.id, 'confirmed')} style={{ fontSize: '0.6875rem', padding: '3px 8px' }}>
                            <UserCheck size={11} /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {allCancelledApts.length === 0 ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9' }}>
                    <CheckCircle2 size={24} style={{ color: '#16A34A', margin: '0 auto 6px', opacity: 0.8 }} />
                    <p style={{ fontSize: '.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>No Cancelled Records</p>
                    <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>No cancelled appointments recorded.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78125rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                          <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-muted)' }}>Patient Name</th>
                          <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-muted)' }}>Date & Time</th>
                          <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-muted)' }}>Reason</th>
                          <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allCancelledApts.map(apt => (
                          <tr key={apt.id} style={{ borderBottom: '1px solid var(--border)' }} className="transition-colors hover:bg-slate-50">
                            <td style={{ padding: '8px 8px', fontWeight: 700 }}>
                              <button onClick={() => openEditModal(apt)} className="text-left font-bold text-slate-800 hover:text-red-600 cursor-pointer">
                                {apt.name}
                              </button>
                            </td>
                            <td style={{ padding: '8px 8px', color: 'var(--text-muted)', fontSize: '0.71875rem' }}>{apt.date}<br />{apt.time}</td>
                            <td style={{ padding: '8px 8px', color: '#991B1B', fontSize: '0.71875rem' }}>
                              {apt.cancellationReason || apt.notes || 'No reason'}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button
                                  className="btn-queue-action btn-queue-confirm"
                                  onClick={() => handleQuickAction(apt.id, 'confirmed')}
                                  title="Reactivate appointment"
                                  style={{ padding: '3px 6px', fontSize: '0.65625rem' }}
                                >
                                  <RotateCcw size={10} />
                                  <span>Reactivate</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* POPUP CARD FOR APPOINTMENT PREVIEW ON A SPECIFIC DATE (Matches Add Report / Patients Modal Style) */}
      {datePreviewModalOpen && (
        <div
          className="modal-overlay"
          style={{ alignItems: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', zIndex: 9999 }}
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setDatePreviewModalOpen(false); }}
        >
          <div
            className="modal bg-white rounded-3xl shadow-2xl border border-slate-200"
            style={{ maxWidth: 680, width: '92%', maxHeight: '85vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            
            {/* Light Brand Header Bar — Matches Add Report Header Style */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ flexShrink: 0, background: '#F4F6FE', borderBottom: '1px solid #E0E5FA' }}
            >
              <div className="flex items-center gap-3">
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#3B50DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CalendarIcon size={17} color="#FFFFFF" strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Appointment Preview
                  </h3>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDatePreviewModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg cursor-pointer transition-colors"
                title="Close preview"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content List Body */}
            <div style={{ padding: '16px 24px', maxHeight: 460, overflowY: 'auto', flex: 1 }}>
              {timelineApts.length === 0 ? (
                <div className="empty-state" style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <Clock size={32} style={{ opacity: 0.35, margin: '0 auto 10px', color: '#64748B' }} />
                  <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1E293B' }}>No appointments scheduled</p>
                  <p style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: 3 }}>No bookings recorded for {selectedDate}.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {timelineApts.map((apt, idx) => {
                    const [timeStart, timeEnd] = (apt.time || 'TBD').split(' - ');
                    const isLast = idx === timelineApts.length - 1;

                    return (
                      <div
                        key={apt.id}
                        style={{
                          padding: '14px 10px',
                          borderRadius: 12,
                          borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                          transition: 'background-color 0.15s ease'
                        }}
                        className="hover:bg-slate-50/80"
                      >
                        {/* Left Details */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0F172A' }}>
                              {apt.name}
                            </span>
                            <span style={{
                              fontSize: '0.6875rem', fontWeight: 700,
                              padding: '2px 9px', borderRadius: 999,
                              background: apt.status === 'confirmed' || apt.status === 'accepted' ? '#DCFCE7' : apt.status === 'done' ? '#DBEAFE' : apt.status === 'cancelled' ? '#FEE2E2' : '#FEF3C7',
                              color: apt.status === 'confirmed' || apt.status === 'accepted' ? '#15803D' : apt.status === 'done' ? '#1D4ED8' : apt.status === 'cancelled' ? '#B91C1C' : '#B45309',
                              border: `1px solid ${apt.status === 'confirmed' || apt.status === 'accepted' ? '#86EFAC' : apt.status === 'done' ? '#93C5FD' : apt.status === 'cancelled' ? '#FCA5A5' : '#FDE68A'}`
                            }}>
                              {apt.status === 'accepted' ? 'Confirmed' : apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: 5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={13} style={{ color: '#64748B' }} />
                              {timeStart}{timeEnd ? ` - ${timeEnd}` : ''}
                            </span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CalendarIcon size={13} style={{ color: '#64748B' }} />
                              {apt.type || 'Consultation'}
                            </span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Phone size={13} style={{ color: '#64748B' }} />
                              {apt.contactNumber || apt.contact || 'No contact'}
                            </span>
                          </div>
                        </div>

                        {/* Right Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {apt.status === 'pending' && (
                            <button
                              className="btn-queue-action btn-queue-confirm"
                              onClick={() => handleQuickAction(apt.id, 'confirmed')}
                              title="Accept / Confirm"
                              style={{ padding: '5px 12px', fontSize: '0.71875rem' }}
                            >
                              <UserCheck size={12} />
                              <span>Confirm</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clean Footer Bar */}
            <div
              className="px-6 py-3.5 flex items-center justify-between"
              style={{ flexShrink: 0, background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}
            >
              <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 600 }}>
                {timelineApts.length} appointment{timelineApts.length === 1 ? '' : 's'} on this date
              </span>
              <button
                type="button"
                onClick={() => setDatePreviewModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 transition-colors shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Appointment Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setAddModalOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 my-8 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Light Clean Header Bar */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add Appointment</h3>
                <p className="text-[11px] text-slate-400 font-normal mt-0.5">Fill in the details for the new appointment</p>
              </div>
              <button
                type="button"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                onClick={() => setAddModalOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-6 space-y-4 text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
              <div>
                <label className="block mb-1.5 text-slate-500">Full Name *</label>
                <input
                  type="text"
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  placeholder="e.g. Juan Dela Cruz"
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block mb-1.5 text-slate-500">Contact Number *</label>
                <input
                  type="text"
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  placeholder="e.g. +639123456789"
                  value={addForm.contactNumber}
                  onChange={e => setAddForm({ ...addForm, contactNumber: e.target.value })}
                />
              </div>

              <div>
                <label className="block mb-1.5 text-slate-500">Date</label>
                <input
                  type="date"
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  value={addForm.date}
                  onChange={e => setAddForm({ ...addForm, date: e.target.value })}
                  style={!isWeekendDate(addForm.date) ? { borderColor: '#FCA5A5', background: '#FFF5F5' } : undefined}
                />
                <span className="block mt-1 text-[11px] font-semibold" style={{ color: isWeekendDate(addForm.date) ? '#64748B' : '#B91C1C' }}>
                  {isWeekendDate(addForm.date) ? 'Available Saturdays & Sundays only.' : 'This date is a weekday — appointments are only available Saturdays & Sundays.'}
                </span>
              </div>

              <div>
                <label className="block mb-1.5 text-slate-500">Time Slot</label>
                <select
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  value={addForm.time}
                  onChange={e => setAddForm({ ...addForm, time: e.target.value })}
                >
                  {/* Taken hours stay selectable — the clinic can deliberately
                      double-book a walk-in — but are labelled so it is a choice,
                      not an accident. */}
                  {TIME_SLOTS.map(t => {
                    const taken = takenTimesOn(addForm.date).includes(t);
                    return <option key={t} value={t}>{taken ? `${t} — booked` : t}</option>;
                  })}
                </select>
              </div>

              <div>
                <label className="block mb-1.5 text-slate-500">Purpose / Service</label>
                <select
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  value={addForm.type}
                  onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                >
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block mb-1.5 text-slate-500">Notes <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  rows={3}
                  placeholder="Any relevant details for this visit…"
                  value={addForm.notes}
                  onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            {/* Footer Bar */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => setAddModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#3B50DF] hover:bg-[#2F40B5] text-white cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                onClick={handleSaveAdd}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Appointment Modal with Preview & Editable Info */}
      {editModalOpen && editingApt && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ width: 520 }}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366F1, #4338CA)',
                  color: '#FFF', fontWeight: 800, fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {getInitials(editForm.name || editingApt.name)}
                </div>
                <div>
                  <h2 className="modal-title">Appointment Preview & Edit</h2>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    ID: {editingApt.id.slice(0, 10)}… · Created: {editingApt.createdAt ? new Date(editingApt.createdAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setEditModalOpen(false)}><X size={16} /></button>
            </div>

            <div className="form-grid" style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: 4 }}>

              {/* Status & Source Preview Pills */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyBetween: 'space-between',
                padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 10, gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Source:</span>
                  <span className="badge-source">
                    <Tag size={10} />
                    {(editingApt.source === 'online' || editingApt.source === 'landing') ? 'Online Booking' : 'Walk-In / Admin'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Current Status:</span>
                  <span className={`badge-status ${
                    editForm.status === 'confirmed' ? 'badge-confirmed' : editForm.status === 'done' ? 'badge-done' : editForm.status === 'cancelled' ? 'badge-cancelled' : 'badge-pending'
                  }`}>
                    {editForm.status}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Number *</label>
                <input
                  type="text"
                  className="form-input"
                  value={editForm.contactNumber}
                  onChange={e => setEditForm({ ...editForm, contactNumber: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editForm.date}
                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                    style={!isWeekendDate(editForm.date) ? { borderColor: '#FCA5A5', background: '#FFF5F5' } : undefined}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Time Slot</label>
                  <select
                    className="form-select"
                    value={editForm.time}
                    onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                  >
                    {TIME_SLOTS.map(t => {
                      const taken = takenTimesOn(editForm.date, editingApt?.id).includes(t);
                      return <option key={t} value={t}>{taken ? `${t} — booked` : t}</option>;
                    })}
                  </select>
                </div>
              </div>

              <span style={{ fontSize: '.6875rem', fontWeight: 600, color: isWeekendDate(editForm.date) ? 'var(--text-muted)' : '#B91C1C', marginTop: -4 }}>
                {isWeekendDate(editForm.date) ? 'Available Saturdays & Sundays only.' : 'Weekday date — only allowed if unchanged from original booking.'}
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Purpose / Service</label>
                  <select
                    className="form-select"
                    value={editForm.type}
                    onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                  >
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Clinical / Patient Notes</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Patient notes or clinical remarks…"
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {(editForm.status === 'cancelled' || editingApt.status === 'cancellation_pending') && (
                <div className="form-group">
                  <label className="form-label" style={{ color: '#991B1B' }}>Cancellation Reason</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Reason for cancellation…"
                    value={editForm.cancellationReason}
                    onChange={e => setEditForm({ ...editForm, cancellationReason: e.target.value })}
                    style={{ resize: 'vertical', fontFamily: 'inherit', borderColor: '#FCA5A5', background: '#FFF5F5' }}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ gap: 8 }}>
              {editForm.status === 'cancelled' && (
                <button
                  className="btn-secondary"
                  style={{ color: '#15803D', borderColor: '#A7F3D0', background: '#DCFCE7', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setEditForm(prev => ({ ...prev, status: 'confirmed' }))}
                >
                  <RotateCcw size={13} />
                  Reactivate
                </button>
              )}

              <div className="modal-footer-right">
                <button className="btn-secondary" onClick={() => setEditModalOpen(false)}>Cancel</button>
                <button className="btn-add-primary" onClick={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}