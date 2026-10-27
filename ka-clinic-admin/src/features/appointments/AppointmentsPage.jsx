// ka-clinic-admin/src/features/appointments/AppointmentsPage.jsx
import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Clock,
  Copy,
  Lock,
  Phone,
  Plus,
  RotateCcw,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { peekLiveCollection, useLiveCollection } from '../../lib/liveStore';
import Toast from '../../components/Toast';
import { authedPostJson } from '../../lib/adminSession';
import { actionLabel, diffFields, logActivity } from '../../lib/activityLog';
import { getTodayDateString, formatDateLong, formatDateMedium, formatServiceType } from '../../lib/formatters';
import Modal from '../../components/Modal';
import useDiscardGuard from '../../components/useDiscardGuard';
import Select from '../../components/Select';
import IconButton from '../../components/IconButton';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import SegmentedTabs from '../../components/SegmentedTabs';
import { BTN, BTN_ICON, BTN_SM, BTN_SM_ICON } from '../../lib/buttons';
import DatePicker from '../../components/DatePicker';
import { FieldError, FormErrorNote, useFieldErrors } from '../../components/FormValidation';
import { isWeekendDate } from '../../lib/clinicDays';
import StatusBadge from '../../components/StatusBadge';
import { trackEvent } from '../../lib/analytics';

/* ─────────────────────────── CSS ─────────────────────────── */
// Scoped to .appts-container. This block used to set :root variables plus a
// "* { margin: 0; padding: 0 }" reset and a body font, which kept applying to
// every other page once Appointments had been opened.
const globalCSS = `
  /* Popups are portalled to <body>, outside .appts-container, so they get
     the same variables through the shared overlay class. */
  .appts-container, .kna-modal-overlay {
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

  /* Main Container */
  .appts-container {
    padding: 16px;
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text-main);
  }

  /* Calendar + requests row. Both cards share one fixed height so neither
     the number of requests nor the month's week count can resize the row;
     the request lists scroll inside their card instead. Stacks on narrow
     screens. */
  /* Calendar ~45% of the row (never narrower than its header needs), the
     request panel gets the rest. */
  .appts-main-row {
    display: grid;
    grid-template-columns: minmax(440px, 0.9fr) minmax(0, 1.1fr);
    gap: 16px;
    height: 600px;
  }
  .appts-main-row > * { min-height: 0; height: 100%; }
  /* Laptop heights: shorter day cells so both cards end together on screen. */
  @media (max-height: 820px) {
    .appts-main-row { height: 540px; }
    .appts-container .cal-day-cell { height: 54px; padding-top: 8px; gap: 5px; }
  }
  @media (max-width: 1200px) {
    .appts-main-row { grid-template-columns: minmax(0, 1fr); height: auto; }
    .appts-main-row > * { height: 600px; }
  }
  .appts-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 12px;
  }

  /* One-line cells: a long name or service is cut with an ellipsis (full
     text on hover) instead of wrapping and making the row taller. */
  .appts-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8125rem; table-layout: fixed; }
  .appts-table th { padding: 8px 10px; font-weight: 700; color: var(--text-muted); font-size: 0.75rem; white-space: nowrap; }
  .appts-table td { padding: 8px 10px; vertical-align: middle; }
  .appts-table .one-line { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
    width: 132px;
    text-align: center;
    white-space: nowrap;
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
    white-space: nowrap;
    transition: background 0.15s;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
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
    gap: 4px;
  }
  /* Day rows share the card's height: rows stretch to fill the card, and a
     6-week month shrinks them instead of pushing the legend out. */
  .cal-grid-fit {
    min-height: 0;
    grid-template-rows: auto;
    grid-auto-rows: minmax(0, 1fr);
  }
  .appts-container .cal-grid-fit .cal-day-cell { height: auto; min-height: 0; overflow: hidden; }
  .cal-day-name {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding-bottom: 6px;
  }
  .cal-day-cell {
    background: transparent;
    border-radius: 10px;
    border: none;
    padding: 6px 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 3px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    position: relative;
    height: 62px;
    padding-top: 10px;
    gap: 6px;
  }
  .cal-day-cell.weekend:hover {
    background: var(--bg-subtle);
  }
  .cal-day-cell.weekend:focus-visible {
    outline: 2px solid #3B50DF;
    outline-offset: 1px;
  }
  /* Closed weekdays: muted, no hover, no click. */
  .cal-day-cell.weekday {
    cursor: default;
    opacity: 0.45;
  }
  /* Days from the previous/next month look like this month's days:
     weekends dark and clickable, weekdays muted like any weekday. */
  /* Inset ring, not a border: the base cell has none, so a 2px border
     on select pushed the day number down and the cell grew. */
  .cal-day-cell.selected {
    background: #EEF2FF;
    box-shadow: inset 0 0 0 2px #6366F1;
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
    font-size: 0.9375rem;
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
    gap: 3px;
    height: 7px;
  }
  /* The selected day keeps its real status colours; the light indigo
     background leaves every dot visible. */
  .cal-day-cell.selected .dot-status {
    box-shadow: 0 0 0 1.5px #FFFFFF;
  }
  .dot-status {
    width: 7px;
    height: 7px;
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
    flex-wrap: wrap;
    gap: 6px 14px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .legend-item { display: flex; align-items: center; gap: 5px; }

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
  .form-input, .form-select, .kna-select.form-select {
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

  /* Schedule Closures */
  .cal-day-cell.closed-day {
    background: repeating-linear-gradient(
      -45deg,
      #F8FAFC,
      #F8FAFC 6px,
      #E2E8F0 6px,
      #E2E8F0 12px
    ) !important;
  }
  .cal-day-cell.closed-day:hover {
    background: repeating-linear-gradient(
      -45deg,
      #F1F5F9,
      #F1F5F9 6px,
      #CBD5E1 6px,
      #CBD5E1 12px
    ) !important;
  }
  .cal-lock-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 9999px;
    background: #FEF3C7;
    color: #D97706;
    border: 1px solid #FCD34D;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .cal-lock-badge.full {
    background: #FEE2E2;
    color: #DC2626;
    border-color: #FCA5A5;
  }
  .cal-lock-badge.inline { position: static; box-shadow: none; }
  .btn-close-schedule {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #FFFFFF;
    border: 1px solid #D1D5DB;
    color: #374151;
    border-radius: var(--radius-md);
    padding: 7px 13px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .btn-close-schedule:hover {
    background: #F9FAFB;
    border-color: #9CA3AF;
    color: #111827;
  }
`;

const CLOSURE_PRESETS = [
  { id: 'doctor_unavailable', label: 'Doctor unavailable', defaultMsg: 'The doctor is unavailable on this date. Appointments are temporarily suspended.' },
  { id: 'holiday', label: 'Holiday', defaultMsg: 'The clinic is closed in observance of the holiday.' },
  { id: 'clinic_event', label: 'Clinic event', defaultMsg: 'The clinic is holding a special event during this time. Regular appointments are suspended.' },
  { id: 'maintenance', label: 'System maintenance', defaultMsg: 'The clinic is undergoing scheduled facility or system maintenance.' },
  { id: 'other', label: 'Other', defaultMsg: '' },
];

const EMPTY_CLOSE_FORM = () => ({
  id: null,
  type: 'day', // 'day' | 'slots'
  startDate: '',
  endDate: '',
  isRange: false,
  slots: [],
  reasonPreset: 'doctor_unavailable',
  reason: 'The doctor is unavailable on this date. Appointments are temporarily suspended.',
  internalNote: '',
});

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
// which is what deleting or rescheduling an appointment does here. Returns
// false when the delete failed, so the caller can tell staff the hour is
// still blocked instead of failing silently.
const releaseSlot = async (date, time) => {
  if (!date || !time) return true;
  try {
    await deleteDoc(doc(db, 'appointmentSlots', slotId(date, time)));
    return true;
  } catch (err) {
    console.error('Slot release error:', err);
    return false;
  }
};


// Stored as-is in `type`. "PEP" was "PEP Follow-up" before 1.0.5; older
// bookings keep that value and display as "PEP" (formatServiceType).
const SERVICE_TYPES = [
  "PEP",
  "PrEP Consultation",
  "Anti-Tetanus Vaccine",
  "Pneumococcal Vaccine",
  "General Consultation",
];

// How a booking reached the clinic. Staff-entered bookings are 'walk-in' or
// 'phone'; the patient app writes 'app' and the landing page 'online'.
const SOURCE_LABELS = { 'walk-in': 'Walk-in', phone: 'Phone-in', app: 'Patient App', online: 'Online Booking', landing: 'Online Booking' };
const sourceLabel = (s) => SOURCE_LABELS[s] || 'Walk-in / Admin';

// A new appointment starts blank: staff choose the date, time and service.
const EMPTY_ADD_FORM = () => ({
  name: '',
  contactNumber: '',
  date: '',
  time: '',
  type: '',
  notes: '',
});

// Service label, same look as the patient-record service badge.
function ServicePill({ type }) {
  const label = formatServiceType(type);
  return (
    <span title={label} className="inline-block shrink min-w-0 max-w-full truncate text-[11px] font-bold leading-4 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300">
      {label}
    </span>
  );
}

// One card for every side-panel tab (same padding, radius, border, hover),
// in two columns:
//   LEFT   name + service badge (+ status badge) on one centred line,
//          date · time · phone, then "Reason: …" when there is one
//   RIGHT  the actions, stacked and centred against the left block
//          (negative first, primary below) — or, on read-only cards, a
//          chevron. On narrow widths the actions drop under the details.
// The whole card opens the appointment preview.
function QueueCard({ apt, reason, reasonLabel = 'Reason', actions, badge, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const reasonRef = useRef(null);
  useEffect(() => {
    const el = reasonRef.current;
    if (el && !expanded) setOverflows(el.scrollWidth > el.clientWidth + 1);
  }, [reason, expanded]);
  const phone = apt.contactNumber || apt.contact;
  const stop = e => e.stopPropagation();
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onOpen(apt)}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(apt); } }}
      aria-label={`View appointment for ${apt.name}`}
      className="group shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 outline-none focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-200 flex items-center gap-x-4 gap-y-2.5 flex-wrap"
    >
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="flex items-center gap-2 min-w-0 h-6">
          <span className="shrink-0 max-w-full text-sm font-semibold leading-5 text-slate-900 truncate underline-offset-2 decoration-slate-400 group-hover:underline">{apt.name}</span>
          <ServicePill type={apt.type} />
          {badge}
          {(apt.rescheduledAt || apt.previousDate) && (
            <span
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
              title={`Previously: ${formatDateMedium(apt.previousDate || '')} ${apt.previousTime || ''}`}
            >
              Rescheduled
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs leading-5 text-slate-500 truncate">
          {formatDateMedium(apt.date)} · {apt.time || '—'}{phone ? ` · ${phone}` : ''}
          {(apt.rescheduledAt || apt.previousDate) && ` (was ${formatDateMedium(apt.previousDate || '')} ${apt.previousTime || ''})`}
        </div>
        {reason && (
          <div className={`mt-0.5 text-xs leading-5 text-slate-500 ${expanded ? 'whitespace-pre-wrap break-words' : 'flex items-center gap-1 min-w-0'}`}>
            <span ref={reasonRef} className={expanded ? '' : 'truncate min-w-0'}>
              <span className="font-semibold text-slate-600">{reasonLabel}:</span> {reason}
            </span>
            {(overflows || expanded) && (
              <button type="button" onClick={e => { stop(e); setExpanded(v => !v); }} onKeyDown={stop}
                className="shrink-0 ml-1 text-[11px] font-semibold text-[#3B50DF] hover:underline cursor-pointer">
                {expanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        )}
      </div>
      {/* Side by side, right-aligned and centred on the details; 34px tall,
          sized to their text. On a narrow card they wrap under the details.
          "View details" comes first; on the read-only Cancelled tab it is
          the only action. */}
      <div className="shrink-0 flex items-center gap-2 ml-auto [&>button:not(.kna-icon-btn)]:h-[34px] [&>button:not(.kna-icon-btn)]:px-3" onClick={stop} onKeyDown={stop}>
        <IconButton bordered icon={Eye} label="View details" size={34} iconSize={16} onClick={() => onOpen(apt)} />
        {actions}
      </div>
    </div>
  );
}


// "2026-10-11" → "October 2026"
const monthLabel = (d) => {
  const [y, m] = String(d || '').split('-').map(Number);
  return y && m ? new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'No date';
};

// Add Appointment checks, shown inline under each field (FormValidation).
// Strict: a name is letters only (with spaces, periods, hyphens,
// apostrophes, commas), and a contact number is a PH mobile number with
// nothing else typed in it ("09067785552w" is refused, not cleaned up).
const NAME_MAX = 80;
const NOTES_MAX = 300;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ][A-Za-zÀ-ÖØ-öø-ÿÑñ .,'-]*$/;
const PH_MOBILE_RE = /^(09\d{9}|\+639\d{9}|639\d{9})$/;
const phoneDigits = v => String(v || '').replace(/[\s-]/g, '');
/** 09171234567 / +639171234567 / 639171234567 → +639171234567. */
const toE164 = v => {
  const d = phoneDigits(v).replace(/^\+/, '');
  return d.startsWith('09') ? `+63${d.slice(1)}` : `+${d}`;
};
const ADD_APPT_RULES = {
  name: f => {
    const n = f.name.trim();
    if (!n) return 'Enter the patient name';
    if (!NAME_RE.test(n)) return 'Use letters only (spaces, periods, hyphens and apostrophes are allowed)';
    if ((n.match(/[A-Za-zÀ-ÖØ-öø-ÿÑñ]/g) || []).length < 2) return 'Enter the full name';
    if (n.length > NAME_MAX) return `Keep the name under ${NAME_MAX} characters`;
    return '';
  },
  contactNumber: f => {
    const c = f.contactNumber.trim();
    if (!c) return 'Enter a contact number';
    if (/[^\d\s+-]/.test(c)) return 'Use numbers only, e.g. 0917 123 4567';
    if (!PH_MOBILE_RE.test(phoneDigits(c))) return 'Enter an 11-digit PH mobile number, e.g. 0917 123 4567';
    return '';
  },
  date: f => (!f.date ? 'Choose a date'
    : !isWeekendDate(f.date) ? 'Choose a Saturday or Sunday'
    : f.date < getTodayDateString() ? 'Choose today or a later date' : ''),
  time: f => (f.time ? '' : 'Choose a time slot'),
  type: f => (f.type ? '' : 'Choose the purpose / service'),
  notes: f => ((f.notes || '').trim().length > NOTES_MAX ? `Keep notes under ${NOTES_MAX} characters` : ''),
};
const ADD_APPT_FIELDS = ['name', 'contactNumber', 'date', 'time', 'type', 'notes'];

const INACTIVE_STATUSES = ['cancelled', 'canceled', 'declined'];

const getInitials = (name = '') =>
  name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export default function AppointmentPage({ openPreviewDate, onPreviewOpened } = {}) {
  const [appointments, setAppointments] = useState(() => peekLiveCollection('appointments').rows);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [currentViewDate, setCurrentViewDate] = useState(new Date());
  const [rightPanelTab, setRightPanelTab] = useState('requests'); // 'requests' | 'closures' | 'cancel-requests' | 'cancelled'
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const monthPickerRef = useRef(null);

  const [datePreviewModalOpen, setDatePreviewModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingApt, setEditingApt] = useState(null);

  // Schedule Closures state
  const closureLive = useLiveCollection('scheduleClosures');
  const closures = closureLive.rows || [];
  const activeClosures = closures.filter(c => c.active !== false);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeForm, setCloseForm] = useState(EMPTY_CLOSE_FORM);
  const [savingClosure, setSavingClosure] = useState(false);
  const [reopenConfirm, setReopenConfirm] = useState(null);
  const [reopening, setReopening] = useState(false);
  const [showPastClosures, setShowPastClosures] = useState(false);

  // Ask before closing Close Schedule modal with changes typed in it
  const [requestCloseClosure, closureDiscardDialog] = useDiscardGuard(
    closeForm,
    () => setCloseModalOpen(false),
    { resetKey: closeModalOpen, enabled: closeModalOpen }
  );

  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  // Ask before closing Add Appointment with something typed in it.
  const [requestCloseAdd, addDiscardDialog] = useDiscardGuard(addForm, () => setAddModalOpen(false), { resetKey: addModalOpen, enabled: addModalOpen });
  const addV = useFieldErrors(ADD_APPT_RULES, addForm, 'appt');


  const [toast, setToast] = useState({ msg: '', type: '' });
  const [saving, setSaving] = useState(false);

  // Confirm pop-up — every quick status change goes through this so
  // the admin sees the appointment details before committing.
  const [pendingAction, setPendingAction] = useState(null); // { apt, status }
  const [pendingActionSaving, setPendingActionSaving] = useState(false);

  const promptQuickAction = (apt, status) => setPendingAction({ apt, status });

  const runPendingAction = async () => {
    if (!pendingAction) return;
    setPendingActionSaving(true);
    try {
      await handleQuickAction(pendingAction.apt.id, pendingAction.status);
      setPendingAction(null);
    } finally {
      setPendingActionSaving(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3000);
  };

  // Shared live appointments (lib/liveStore.js): cached rows at once, live after.
  const aptLive = useLiveCollection('appointments');
  useEffect(() => { setAppointments(aptLive.rows); }, [aptLive]);

  // Hours already spoken for on a date: the same appointmentSlots holds the
  // patient app reads (one per active booking, released on cancel/decline),
  // plus any active appointment, so both apps show the same "Full" hours.
  const slotLive = useLiveCollection('appointmentSlots');
  const takenTimesOn = (date, exceptId) => Array.from(new Set([
    ...slotLive.rows.filter(sl => sl.date === date).map(sl => sl.time),
    ...appointments
      .filter(a => a.date === date && a.id !== exceptId && !INACTIVE_STATUSES.includes(String(a.status || 'pending').toLowerCase()))
      .map(a => a.time),
  ]));

  // Schedule closure lookup for a date
  const getDayClosure = (dateStr) => {
    if (!dateStr) return null;
    const matches = activeClosures.filter(c => c.startDate <= dateStr && dateStr <= (c.endDate || c.startDate));
    if (!matches.length) return null;
    const dayClosure = matches.find(c => c.type === 'day');
    if (dayClosure) return { type: 'day', closure: dayClosure, all: matches };
    const allSlots = matches.filter(c => c.type === 'slots').flatMap(c => c.slots || []);
    const uniqueSlots = Array.from(new Set(allSlots));
    if (uniqueSlots.length >= TIME_SLOTS.length) {
      return { type: 'day', closure: matches[0], all: matches, slots: uniqueSlots };
    }
    return { type: 'slots', closure: matches[0], all: matches, slots: uniqueSlots };
  };

  const openCloseScheduleModal = async (closureToEdit = null) => {
    if (closureToEdit) {
      let internalNote = '';
      try {
        const res = await authedPostJson('/api/notifications', { action: 'getClosureNote', id: closureToEdit.id });
        if (res && res.internalNote) internalNote = res.internalNote;
      } catch (err) {
        console.warn('Could not fetch internalNote:', err);
      }
      setCloseForm({
        id: closureToEdit.id,
        type: closureToEdit.type || 'day',
        startDate: closureToEdit.startDate || '',
        endDate: closureToEdit.endDate || closureToEdit.startDate || '',
        isRange: Boolean(closureToEdit.endDate && closureToEdit.endDate !== closureToEdit.startDate),
        slots: Array.isArray(closureToEdit.slots) ? [...closureToEdit.slots] : [],
        reasonPreset: closureToEdit.reasonPreset || 'other',
        reason: closureToEdit.reason || '',
        internalNote,
      });
    } else {
      const defaultDate = isWeekendDate(selectedDate) ? selectedDate : '';
      setCloseForm({
        ...EMPTY_CLOSE_FORM(),
        startDate: defaultDate,
        endDate: defaultDate,
      });
    }
    setCloseModalOpen(true);
  };

  const handleSaveClosure = async () => {
    if (!closeForm.startDate) {
      showToast('Please select a start date', 'error');
      return;
    }
    if (!isWeekendDate(closeForm.startDate)) {
      showToast('Start date must be a Saturday or Sunday', 'error');
      return;
    }
    // Past days are already over; closing them would only clutter the list.
    if (closeForm.startDate < getTodayDateString()) {
      showToast('Start date cannot be in the past', 'error');
      return;
    }
    const end = closeForm.type === 'day' && closeForm.isRange && closeForm.endDate ? closeForm.endDate : closeForm.startDate;
    if (end !== closeForm.startDate && !isWeekendDate(end)) {
      showToast('End date must be a Saturday or Sunday', 'error');
      return;
    }
    if (end < closeForm.startDate) {
      showToast('End date cannot be before start date', 'error');
      return;
    }
    if (closeForm.type === 'slots' && (!closeForm.slots || closeForm.slots.length === 0)) {
      showToast('Please select at least one time slot to close', 'error');
      return;
    }
    if (!closeForm.reason || !closeForm.reason.trim()) {
      showToast('Message to patients is required', 'error');
      return;
    }

    setSavingClosure(true);
    try {
      const payload = {
        action: 'saveClosure',
        id: closeForm.id || undefined,
        type: closeForm.type,
        startDate: closeForm.startDate,
        endDate: end,
        slots: closeForm.type === 'slots' ? closeForm.slots : [],
        reasonPreset: closeForm.reasonPreset,
        reason: closeForm.reason.trim().slice(0, 150),
        internalNote: closeForm.internalNote.trim(),
        // Every new or edited closure is announced to all patients.
        notifyAffectedPatients: true,
      };
      const res = await authedPostJson('/api/notifications', payload);
      if (!res?.success) throw new Error(res?.error || 'Failed to save closure');

      const action = closeForm.id ? 'closure.update' : 'closure.create';
      logActivity({
        action,
        collection: 'scheduleClosures',
        docId: res.id || closeForm.id || '',
        summary: `${closeForm.id ? 'Updated' : 'Created'} schedule closure for ${closeForm.startDate}${end !== closeForm.startDate ? ` to ${end}` : ''}: ${closeForm.reason.slice(0, 50)}`,
      });

      trackEvent(closeForm.id ? 'schedule_closure_updated' : 'schedule_closure_created');
      const told = res.notified
        ? ` · ${res.notified.app} app user${res.notified.app === 1 ? '' : 's'} notified, ${res.notified.email} email${res.notified.email === 1 ? '' : 's'} sent`
        : '';
      showToast(`${closeForm.id ? 'Schedule closure updated' : 'Schedule closed successfully'}${told}`);
      setCloseModalOpen(false);
    } catch (err) {
      console.error('Save closure error:', err);
      showToast(err?.message || 'Failed to close schedule', 'error');
    } finally {
      setSavingClosure(false);
    }
  };

  const handleReopenClosure = async (closure) => {
    setReopening(true);
    try {
      const res = await authedPostJson('/api/notifications', { action: 'reopenClosure', id: closure.id });
      if (!res?.success) throw new Error(res?.error || 'Failed to reopen schedule');

      logActivity({
        action: 'closure.reopen',
        collection: 'scheduleClosures',
        docId: closure.id,
        summary: `Reopened schedule closure for ${closure.startDate}: patients can book again`,
      });

      trackEvent('schedule_closure_reopened');
      showToast('Schedule reopened. Patients can book again.');
      setReopenConfirm(null);
    } catch (err) {
      console.error('Reopen error:', err);
      showToast(err?.message || 'Failed to reopen schedule', 'error');
    } finally {
      setReopening(false);
    }
  };

  // Calendar Generation
  // Always 6 full weeks (42 cells), so the calendar card is the same height
  // in every month instead of growing and shrinking between 4 and 6 rows.
  const generateCalendar = () => {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const startDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Only the weeks this month touches, so no row is all next-month days.
    const weeks = Math.ceil((startDay + daysInMonth) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(year, month, 1 - startDay + i);
      return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), isOtherMonth: d.getMonth() !== month };
    });
  };

  // Opened from a dashboard row: jump to that date and show its preview.
  useEffect(() => {
    if (!openPreviewDate) return;
    setSelectedDate(openPreviewDate);
    setCurrentViewDate(new Date(`${openPreviewDate}T00:00:00`));
    setDatePreviewModalOpen(true);
    onPreviewOpened?.();
  }, [openPreviewDate]);

  // Popups close on Escape through <Modal>; this only closes the month picker.
  useEffect(() => {
    if (!monthPickerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) setMonthPickerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [monthPickerOpen]);

  useEffect(() => {
    if (!monthPickerOpen) return undefined;
    const onDown = (e) => {
      if (e.target.closest?.('[data-kna-select-menu]')) return;
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target)) setMonthPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [monthPickerOpen]);

  // A weekend from the previous/next month shown in the grid opens like any
  // other weekend, and the calendar moves to that month.
  const openDay = (dStr, cell) => {
    if (cell?.isOtherMonth) setCurrentViewDate(new Date(cell.year, cell.month, 1));
    setSelectedDate(dStr);
    setDatePreviewModalOpen(true);
  };

  const navigateMonth = (val) => {
    const next = new Date(currentViewDate);
    next.setMonth(next.getMonth() + val);
    setCurrentViewDate(next);
  };

  // Filtered Appointments
  // The day overview (and the calendar dots) list only live visits:
  // pending, confirmed, cancellation requested and done. Cancelled and
  // declined ones stay in the side panel's Cancelled tab.
  const isActiveApt = (a) => !INACTIVE_STATUSES.includes(String(a.status || 'pending').toLowerCase());
  const dayAptsAll = appointments.filter(a => a.date === selectedDate);
  const timelineApts = dayAptsAll.filter(isActiveApt);
  const pendingOnlineRequests = appointments.filter(a => a.status === 'pending' && a.source !== 'walk-in');
  const cancellationRequests = appointments.filter(a => a.status === 'cancellation_pending');
  // Only finalized cancellations. Requests still awaiting review live in
  // cancellationRequests; counting them here listed the same visit twice.
  const allCancelledApts = appointments.filter(a => a.status === 'cancelled' || a.status === 'declined');

  // Metrics
  const todayStr = getTodayDateString();
  // Year list for the month picker: from the earliest year that has an
  // appointment (2024 when there are none) to five years past the current
  // Manila year, so it extends by itself every January.
  const thisYear = Number(todayStr.slice(0, 4));
  const firstDataYear = appointments.reduce((min, a) => {
    const y = Number(String(a.date || '').slice(0, 4));
    return y > 1999 && y < min ? y : min;
  }, Infinity);
  const yearRange = [Math.min(Number.isFinite(firstDataYear) ? firstDataYear : 2024, thisYear), thisYear + 5];
  const confirmedToday = appointments.filter(a => a.date === todayStr && (a.status === 'confirmed' || a.status === 'accepted')).length;

  // Actions
  // Confirming an appointment tells the patient. The app already surfaces a
  // confirmed appointment in its notification list from the appointments
  // listener, but that only fires while the app is open — this pushes through
  // the same /api/notifications pipeline the dose reminders use, so it also
  // lands in the patient's inbox and as a push/email when the app is closed.
  const notifyAppointmentConfirmed = async (apt) => {
    const patientId = apt?.patientId;
    if (!patientId) return;
    const whenDate = formatDateLong(apt.date) || apt.date || 'your scheduled date';
    const whenTime = apt.time ? `, ${apt.time}` : '';
    try {
      await authedPostJson('/api/notifications', {
        action: 'send-followup',
        patientId,
        title: 'Appointment confirmed by the clinic',
        message: `Your appointment on ${whenDate}${whenTime} was confirmed by the clinic.`,
        dueDate: whenDate,
        source: 'appointment-confirmed',
      });
    } catch (err) {
      // The status change itself already succeeded; a failed notification
      // must not read as a failed confirmation.
      console.error('Appointment confirmation notification failed:', err);
      showToast('Appointment confirmed, but the patient notification failed to send', 'error');
    }
  };

  const handleQuickAction = async (id, newStatus) => {
    try {
      const target = appointments.find(a => a.id === id);
      await updateDoc(doc(db, 'appointments', id), { status: newStatus, updatedAt: Date.now() });
      if (target) {
        const wasCancelReq = target.status === 'cancellation_pending';
        const action = wasCancelReq
          ? (newStatus === 'cancelled' ? 'appointment.cancel_approve' : 'appointment.cancel_reject')
          : newStatus === 'confirmed' || newStatus === 'accepted' ? 'appointment.confirm'
          : newStatus === 'cancelled' ? 'appointment.cancel' : 'appointment.update';
        logActivity({ action, collection: 'appointments', docId: id, mrn: target.patientId || '',
          summary: `${actionLabel(action)}: ${formatServiceType(target.type)} on ${target.date} ${target.time || ''} for ${target.name}`.trim(),
          changes: [{ field: 'status', before: target.status || 'pending', after: newStatus }] });
      }
      const released = newStatus === 'cancelled' && target
        ? await releaseSlot(target.date, target.time)
        : true;
      if ((newStatus === 'confirmed' || newStatus === 'accepted') && target) {
        await notifyAppointmentConfirmed(target);
      }
      trackEvent(`appointment_${newStatus}`);
      if (!released) showToast(`Appointment cancelled, but the ${target.time} slot could not be freed. Try again or check your connection.`, 'error');
      else showToast(newStatus === 'confirmed' ? 'Appointment confirmed' : `Appointment status updated to ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      showToast('Failed to update status', 'error');
    }
  };

  // Staff booking for a phone-in or walk-in patient. It is saved already
  // confirmed, in the same shape as an approved request, so it appears
  // everywhere approved appointments do: the calendar, the day preview, the
  // dashboard's schedule, and (when linked to a patient) their record and
  // patient app, with the same approval notification a request gets.
  const handleSaveAdd = async () => {
    if (!addV.validate(ADD_APPT_FIELDS)) return;
    // The slot may have been booked or closed since it was picked.
    const closureNow = getDayClosure(addForm.date);
    if (takenTimesOn(addForm.date).includes(addForm.time)
      || closureNow?.type === 'day'
      || (closureNow?.type === 'slots' && closureNow.slots.includes(addForm.time))) {
      showToast('That time slot is no longer available. Choose another one.', 'error');
      setAddForm(f => ({ ...f, time: '' }));
      return;
    }
    const newApt = {
      name: addForm.name.trim().replace(/\s+/g, ' '),
      contactNumber: toE164(addForm.contactNumber),
      date: addForm.date,
      time: addForm.time,
      type: addForm.type,
      notes: (addForm.notes || '').trim(),
      status: 'confirmed',
      source: 'walk-in',
      createdAt: Date.now(),
    };
    // Guard against booking on closed schedule
    const closureInfo = getDayClosure(newApt.date);
    if (closureInfo) {
      if (closureInfo.type === 'day' || (closureInfo.type === 'slots' && closureInfo.slots.includes(newApt.time))) {
        showToast(`Cannot book: This time is closed (${closureInfo.closure.reason})`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      // Claim the hour and write the appointment in one transaction, the same
      // way the patient app books: if a patient already holds this hour, stop
      // instead of overwriting their hold and double-booking it.
      const slotRef = doc(db, 'appointmentSlots', slotId(newApt.date, newApt.time));
      const created = doc(collection(db, 'appointments'));
      await runTransaction(db, async tx => {
        const existing = await tx.get(slotRef);
        if (existing.exists()) throw new Error('SLOT_TAKEN');
        tx.set(slotRef, {
          date:      newApt.date,
          time:      newApt.time,
          heldBy:    auth.currentUser?.uid || 'admin',
          createdAt: Date.now(),
        });
        tx.set(created, newApt);
      });
      logActivity({ action: 'appointment.create', collection: 'appointments', docId: created.id,
        summary: `Booked ${formatServiceType(newApt.type)} on ${newApt.date} ${newApt.time} for ${newApt.name} (${sourceLabel(newApt.source)})`,
        changes: diffFields({}, newApt, ['name', 'date', 'time', 'type', 'notes', 'status']) });
      trackEvent('appointment_added_by_staff');
      showToast(`${sourceLabel(newApt.source)} appointment added for ${newApt.name}`);
      setAddModalOpen(false);
      setAddForm(EMPTY_ADD_FORM());
    } catch (err) {
      console.error('Add error:', err);
      showToast(err?.message === 'SLOT_TAKEN'
        ? `${newApt.time} on this date is already booked. Pick another time.`
        : 'Failed to add appointment', 'error');
    } finally {
      setSaving(false);
    }
  };

  // The preview is read-only: patient-entered details are shown as booked
  // and staff act on the request (confirm / decline) instead of editing it.
  const openEditModal = (apt) => {
    setEditingApt(apt);
    setEditModalOpen(true);
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
      <div className="appts-summary">
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
              <div style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
              <div style={{ fontSize: '.6875rem', fontWeight: 700, color: '#475569', marginTop: 3 }}>{m.label}</div>
              <div style={{ fontSize: '.65625rem', color: 'var(--text-muted)', fontWeight: 600 }}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column Equal Height Row: Compact Calendar (380px Left) + Wide Requests/Cancellation Card (1fr Right) */}
      <div className="appts-main-row">

        {/* LEFT PANEL: CALENDAR CARD */}
        <div className="card calendar-card" style={{ display: 'flex', flexDirection: 'column', maxWidth: 'none', overflow: 'visible' }}>

          {/* Calendar Header: month navigator (label opens month/year picker) + Add button.
              Wraps onto two lines when narrow, so the button is never cut off. */}
          <div className="calendar-head" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <div ref={monthPickerRef} className="month-nav" style={{ position: 'relative', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconButton icon={ChevronLeft} label="Previous month" size={32} onClick={() => navigateMonth(-1)} />
                <button
                  type="button"
                  onClick={() => { setPickerYear(currentViewDate.getFullYear()); setMonthPickerOpen(o => !o); }}
                  aria-haspopup="dialog"
                  aria-expanded={monthPickerOpen}
                  title="Jump to a month"
                  // Fixed width (fits "September 2026"), text centred, so the
                  // arrows never move when the month name changes length.
                  style={{ width: 172, justifyContent: 'center', color: '#1F2937', fontWeight: 800, fontSize: '.9375rem', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                  className="hover:bg-slate-200/60"
                >
                  {currentViewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  <ChevronDown size={14} style={{ color: '#64748B' }} />
                </button>
                <IconButton icon={ChevronRight} label="Next month" size={32} onClick={() => navigateMonth(1)} />

                {monthPickerOpen && (
                  // One popover: "< year >" on top, the twelve months below.
                  // Today's month has a ring; the month being viewed is filled.
                  <div role="dialog" aria-label="Choose month and year" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, width: 248, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, boxShadow: '0 12px 32px rgba(15,23,42,0.16)', padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <IconButton icon={ChevronLeft} label="Previous year" size={32} iconSize={16} disabled={pickerYear <= yearRange[0]} onClick={() => setPickerYear(y => Math.max(yearRange[0], y - 1))} />
                      <span style={{ fontWeight: 800, fontSize: '.9375rem', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }} aria-live="polite">{pickerYear}</span>
                      <IconButton icon={ChevronRight} label="Next year" size={32} iconSize={16} disabled={pickerYear >= yearRange[1]} onClick={() => setPickerYear(y => Math.min(yearRange[1], y + 1))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, mi) => {
                        const selected = currentViewDate.getFullYear() === pickerYear && currentViewDate.getMonth() === mi;
                        const isCurrent = Number(todayStr.slice(0, 4)) === pickerYear && Number(todayStr.slice(5, 7)) - 1 === mi;
                        return (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => { setCurrentViewDate(new Date(pickerYear, mi, 1)); setMonthPickerOpen(false); }}
                            className={selected ? '' : 'bg-white hover:bg-indigo-50'}
                            style={{ height: 36, borderRadius: 8, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', border: selected ? '1px solid #3B50DF' : isCurrent ? '1.5px solid #3B50DF' : '1px solid #E2E8F0', background: selected ? '#3B50DF' : undefined, color: selected ? '#FFFFFF' : isCurrent ? '#3B50DF' : '#334155' }}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-close-schedule"
                onClick={() => openCloseScheduleModal()}
                title="Close schedule days or time slots"
              >
                <Lock size={15} />
                <span>Close schedule</span>
              </button>

              <button className="btn-add-primary" onClick={() => { setSaving(false); setAddForm(EMPTY_ADD_FORM()); addV.clear(); setAddModalOpen(true); }} style={{ padding: '7px 14px', fontSize: '0.8125rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <Plus size={15} />
                <span>Add Appointment</span>
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginTop: 8 }}>
            Selected: <strong style={{ color: '#3B50DF' }}>{formatDateMedium(selectedDate)}</strong>
            <span style={{ marginLeft: 8, color: '#94A3B8', fontWeight: 500 }}>Appointments are on Saturdays &amp; Sundays only.</span>
          </div>

          <div className="cal-grid cal-grid-fit" style={{ flex: 1, margin: '8px 0' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="cal-day-name">{d}</div>
            ))}

            {generateCalendar().map((c, i) => {
              // Days from the previous/next month stay as empty cells to fill
              // the first and last week, but show no number, dots or closures.
              if (c.isOtherMonth) return <div key={i} className="cal-day-cell other-month" aria-hidden="true" style={{ pointerEvents: 'none' }} />;
              const dStr = `${c.year}-${String(c.month + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
              const dayApts = appointments.filter(a => a.date === dStr && isActiveApt(a));

              const hasConfirmed = dayApts.some(a => a.status === 'confirmed' || a.status === 'accepted');
              const hasPending = dayApts.some(a => a.status === 'pending' || a.status === 'cancellation_pending');
              const hasDone = dayApts.some(a => a.status === 'done');

              const isToday = dStr === todayStr;
              const isSelected = selectedDate === dStr;
              const isWeekend = isWeekendDate(dStr);
              const closureInfo = isWeekend ? getDayClosure(dStr) : null;
              const isFullyClosed = closureInfo?.type === 'day';
              const isPartiallyClosed = closureInfo?.type === 'slots';

              // Weekdays are closed: shown muted, not clickable, no popup.
              // Weekends (past ones too) open the day's appointments.
              return (
                <div
                  key={i}
                  className={`cal-day-cell ${c.isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isWeekend ? 'weekend' : 'weekday'} ${isFullyClosed ? 'closed-day' : ''}`}
                  onClick={isWeekend ? () => openDay(dStr, c) : undefined}
                  onKeyDown={isWeekend ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(dStr, c); } } : undefined}
                  role={isWeekend ? 'button' : undefined}
                  tabIndex={isWeekend ? 0 : -1}
                  aria-disabled={!isWeekend}
                  title={isWeekend ? (isFullyClosed ? `Closed: ${closureInfo.closure.reason}` : isPartiallyClosed ? `Partially closed (${closureInfo.slots.length} slots)` : `View appointments on ${formatDateMedium(dStr)}`) : 'Closed on weekdays'}
                >
                  <span className="cal-num">{c.day}</span>

                  {/* Lock badge for closures */}
                  {isFullyClosed && (
                    <span className="cal-lock-badge full" title={`Closed: ${closureInfo.closure.reason}`}>
                      <Lock size={9} strokeWidth={2.5} />
                    </span>
                  )}
                  {isPartiallyClosed && !isFullyClosed && (
                    <span className="cal-lock-badge" title={`Partially closed (${closureInfo.slots.length} slots)`}>
                      <Lock size={9} strokeWidth={2.5} />
                    </span>
                  )}

                  {dayApts.length > 0 && (
                    <div className="cal-dots-row">
                      {hasConfirmed && <div className="dot-status dot-confirmed" title="Confirmed" />}
                      {hasPending && <div className="dot-status dot-pending" title="Pending" />}
                      {hasDone && <div className="dot-status dot-done" title="Done" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="calendar-legend" style={{ paddingTop: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div className="legend-item"><div className="dot-status dot-confirmed" /> Confirmed</div>
            <div className="legend-item"><div className="dot-status dot-pending" /> Pending</div>
            <div className="legend-item"><div className="dot-status dot-done" /> Done</div>
            <div className="legend-item"><span className="cal-lock-badge inline full"><Lock size={9} strokeWidth={2.5} /></span> Day closed</div>
            <div className="legend-item"><span className="cal-lock-badge inline"><Lock size={9} strokeWidth={2.5} /></span> Slots closed</div>
          </div>
        </div>

        {/* RIGHT PANEL: requests, cancellation requests and cancelled visits as
            tabs of cards. Reasons show in full; every action stays. */}
        <div className="right-panel">
          <div className="card queue-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '16px 18px', overflow: 'hidden' }}>
            {(() => {
              // Queues and closures tabs
              const TABS = [
                { key: 'requests', label: 'Requests', count: pendingOnlineRequests.length, action: true,
                  desc: 'New bookings from the app and website, waiting for you to confirm.' },
                { key: 'closures', label: 'Closures', count: activeClosures.length, action: false,
                  desc: 'Closed dates and hours. Patients cannot book closed schedules.' },
                ...(cancellationRequests.length > 0 ? [{ key: 'cancel-requests', label: 'Cancel Requests', count: cancellationRequests.length, action: true,
                  desc: 'Patients asked to cancel a confirmed visit. Staff can keep or review.' }] : []),
                { key: 'cancelled', label: 'Cancelled', count: allCancelledApts.length, action: false,
                  desc: 'Visits cancelled by the patient, kept here for 90 days.' },
              ];
              const active = TABS.find(t => t.key === rightPanelTab) || TABS[0];
              return (
                <>
                  <SegmentedTabs tabs={TABS} value={rightPanelTab} onChange={setRightPanelTab} label="Appointment queues" fill className="shrink-0" />
                  <p style={{ fontSize: '.75rem', color: '#64748B', margin: '10px 2px 12px', flexShrink: 0 }}>{active.desc}</p>
                </>
              );
            })()}

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '2px' }}>
              {(() => {
                const empty = (Icon, title, text) => <EmptyState icon={Icon} title={title} text={text} className="h-full" />;

                // Closures Panel
                if (rightPanelTab === 'closures') {
                  const displayedClosures = showPastClosures
                    ? [...closures].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
                    : activeClosures.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

                  return (
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-1">
                        <span className="text-xs font-semibold text-slate-500">
                          {displayedClosures.length} {showPastClosures ? 'total' : 'active'} closure{displayedClosures.length === 1 ? '' : 's'}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#3B50DF] focus:ring-[#3B50DF]"
                            checked={showPastClosures}
                            onChange={e => setShowPastClosures(e.target.checked)}
                          />
                          <span>Show past / reopened</span>
                        </label>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col divide-y divide-slate-100">
                        {displayedClosures.length === 0 ? (
                          <EmptyState
                            icon={Lock}
                            title={showPastClosures ? "No closures recorded" : "No active closures"}
                            text={showPastClosures ? "No schedule closures have been recorded yet." : "All weekend clinic schedules are currently open for booking."}
                            minHeight={160}
                          />
                        ) : (
                          displayedClosures.map(c => {
                            const isReopened = c.active === false;
                            const dateRangeLabel = c.startDate === c.endDate || !c.endDate
                              ? formatDateMedium(c.startDate)
                              : `${formatDateMedium(c.startDate)} – ${formatDateMedium(c.endDate)}`;
                            const isSlots = c.type === 'slots';

                            return (
                              <div
                                key={c.id}
                                className={`flex items-start justify-between gap-3 px-1 py-3 ${isReopened ? 'opacity-60' : ''}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-slate-900">{dateRangeLabel}</span>
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                      {isReopened ? 'Reopened' : isSlots ? 'Specific slots' : 'Whole day'}
                                    </span>
                                  </div>

                                  {isSlots && Array.isArray(c.slots) && (
                                    <div className="text-[11px] font-medium text-slate-600 mt-1 flex items-center gap-1 flex-wrap">
                                      <Clock size={11} /> {c.slots.join(', ')}
                                    </div>
                                  )}

                                  <p className="text-xs text-slate-600 mt-1">{c.reason}</p>

                                  <div className="mt-1 text-[10px] text-slate-400 flex items-center gap-3">
                                  <span>Closed by {c.createdBy?.name || 'Staff'}</span>
                                  {isReopened && c.reopenedBy && (
                                    <span>Reopened by {c.reopenedBy?.name || 'Staff'}</span>
                                  )}
                                  </div>
                                </div>

                                {!isReopened && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                      onClick={() => openCloseScheduleModal(c)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors cursor-pointer shadow-xs"
                                      onClick={() => setReopenConfirm(c)}
                                    >
                                      Reopen
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                }

                // Card actions: negative on the left, primary on the right.
                if (rightPanelTab === 'cancel-requests') {
                  if (cancellationRequests.length === 0) return empty(CheckCircle2, 'No cancel requests', 'When a patient asks to cancel a confirmed visit, it appears here.');
                  return cancellationRequests.map(apt => (
                    <QueueCard key={apt.id} apt={apt} onOpen={openEditModal}
                      reason={apt.cancellationReason || 'No reason given'}
                      actions={<>
                        <button type="button" className={BTN_SM.outline} onClick={() => promptQuickAction(apt, 'confirmed')} title="Keep this appointment">
                          <RotateCcw size={BTN_SM_ICON} /> Keep appointment
                        </button>
                      </>} />
                  ));
                }

                // Cancelled history: newest first, grouped by month, each card
                // saying who ended the visit. Read-only (chevron, no actions).
                if (rightPanelTab === 'cancelled') {
                  if (allCancelledApts.length === 0) return <EmptyState icon={CalendarX} title="No cancelled appointments" text="Cancelled visits are kept here for 90 days after the visit date." minHeight={140} />;
                  const shown = allCancelledApts;
                  const sorted = [...shown].sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')) || String(y.time || '').localeCompare(String(x.time || '')));
                  const groups = [];
                  sorted.forEach(apt => {
                    const label = monthLabel(apt.date);
                    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
                    groups[groups.length - 1].items.push(apt);
                  });
                  return groups.map(g => (
                    <section key={g.label} className="flex flex-col gap-2" aria-label={g.label}>
                      <h4 className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.label}</h4>
                      {g.items.map(apt => (
                        <QueueCard key={apt.id} apt={apt} onOpen={openEditModal}
                          badge={<StatusBadge tone="slate" label="Cancelled by patient" />}
                          reason={apt.cancellationReason || apt.declineReason || 'No reason recorded'} />
                      ))}
                    </section>
                  ));
                }

                if (pendingOnlineRequests.length === 0) return empty(CheckCircle2, 'All caught up', 'No booking requests are waiting.');
                return pendingOnlineRequests.map(apt => (
                  <QueueCard key={apt.id} apt={apt} onOpen={openEditModal}
                    reason={apt.notes} reasonLabel="Patient note"
                    actions={<>
                      <button type="button" className={BTN_SM.primary} onClick={() => promptQuickAction(apt, 'confirmed')} title="Confirm appointment">
                        <UserCheck size={BTN_SM_ICON} /> Confirm
                      </button>
                    </>} />
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* POPUP CARD FOR APPOINTMENT PREVIEW ON A SPECIFIC DATE (Matches Add Report / Patients Modal Style) */}
      {datePreviewModalOpen && (
        <Modal onClose={() => setDatePreviewModalOpen(false)}>
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
              <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={() => setDatePreviewModalOpen(false)} />
            </div>

            {/* Active Closure Banner */}
            {(() => {
              const closureInfo = getDayClosure(selectedDate);
              if (!closureInfo) return null;
              const c = closureInfo.closure;
              const isAllDay = closureInfo.type === 'day';
              return (
                <div className="mx-4 mt-3 mb-1 p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Lock size={15} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {isAllDay ? 'Closed all day' : `Closed: ${closureInfo.slots.join(', ')}`}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 capitalize">
                            {c.reasonPreset ? c.reasonPreset.replace('_', ' ') : 'Closed'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1">{c.reason}</p>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                          <span>Closed by: <strong>{c.createdBy?.name || 'Staff'}</strong></span>
                          <span>•</span>
                          <span>{formatDateMedium(new Date(c.createdAt || Date.now()).toISOString().slice(0, 10))}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        onClick={() => { setDatePreviewModalOpen(false); openCloseScheduleModal(c); }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors cursor-pointer shadow-xs"
                        onClick={() => { setDatePreviewModalOpen(false); setReopenConfirm(c); }}
                      >
                        Reopen
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Content List Body */}
            <div style={{ padding: '10px 18px', maxHeight: 520, overflowY: 'auto', flex: 1 }}>
              {timelineApts.length === 0 ? (
                dayAptsAll.length > 0
                  ? <EmptyState icon={Clock} title="No active appointments on this date" text="Every booking on this date was cancelled or declined. They are listed in the Cancelled tab." minHeight={180} />
                  : <EmptyState icon={Clock} title="No appointments scheduled" text={`No bookings recorded for ${formatDateMedium(selectedDate)}.`} minHeight={180} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {timelineApts.map((apt, idx) => {
                    const [timeStart, timeEnd] = (apt.time || 'TBD').split(' - ');
                    const isLast = idx === timelineApts.length - 1;

                    // Read-only overview: the whole row opens the full preview,
                    // where Confirm / Decline live.
                    return (
                      <div
                        key={apt.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open appointment for ${apt.name}`}
                        onClick={() => { setDatePreviewModalOpen(false); openEditModal(apt); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDatePreviewModalOpen(false); openEditModal(apt); } }}
                        style={{
                          padding: '9px 10px',
                          borderRadius: 10,
                          borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                          transition: 'background-color 0.15s ease'
                        }}
                        className="group cursor-pointer hover:bg-indigo-50/50"
                      >
                        {/* Left Details */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>
                              {apt.name}
                            </span>
                            <StatusBadge status={apt.status || 'pending'} />
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={13} style={{ color: '#64748B' }} />
                              {timeStart}{timeEnd ? ` - ${timeEnd}` : ''}
                            </span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CalendarIcon size={13} style={{ color: '#64748B' }} />
                              {formatServiceType(apt.type)}
                            </span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Phone size={13} style={{ color: '#64748B' }} />
                              {apt.contactNumber || apt.contact || 'No contact'}
                            </span>
                          </div>
                        </div>

                        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-slate-400 group-hover:text-[#3B50DF] transition-colors" />
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
        </Modal>
      )}

      {/* Add Appointment Modal */}
      {addModalOpen && (
        <Modal onClose={requestCloseAdd}>
          {addDiscardDialog}
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 my-auto flex flex-col"
            style={{ maxHeight: 'calc(100vh - 130px)', transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Light Clean Header Bar */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add Appointment</h3>
                <p className="text-[11px] text-slate-400 font-normal mt-0.5">Fill in the details for the new appointment</p>
              </div>
              <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={requestCloseAdd} />
            </div>

            {/* Scrollable Form Body */}
            <div className="kna-form-body text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
              <div>
                <label htmlFor="appt-name" className="block mb-1.5 text-slate-500">Full Name <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  {...addV.field('name')}
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  placeholder="e.g. Juan Dela Cruz"
                  maxLength={NAME_MAX}
                  autoComplete="off"
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                />
                <FieldError v={addV} name="name" />
              </div>

              <div>
                <label htmlFor="appt-contactNumber" className="block mb-1.5 text-slate-500">Contact Number <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  {...addV.field('contactNumber')}
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  placeholder="e.g. 0917 123 4567"
                  inputMode="tel"
                  maxLength={16}
                  autoComplete="off"
                  value={addForm.contactNumber}
                  onChange={e => setAddForm({ ...addForm, contactNumber: e.target.value })}
                />
                <FieldError v={addV} name="contactNumber" />
              </div>

              <div>
                <label htmlFor="appt-date" className="block mb-1.5 text-slate-500">Date <span className="text-rose-600">*</span></label>
                {/* Weekdays are disabled in the calendar: the clinic takes
                    appointments on Saturdays and Sundays only. */}
                <DatePicker
                  {...addV.field('date')}
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  value={addForm.date}
                  onChange={e => {
                    const date = e.target.value;
                    // A time picked for the previous date may already be
                    // booked on the new one; clear it so it is chosen again.
                    const keepTime = addForm.time && !takenTimesOn(date).includes(addForm.time);
                    setAddForm({ ...addForm, date, time: keepTime ? addForm.time : '' });
                  }}
                  isDateDisabled={d => !isWeekendDate(d)}
                  disabledHint="Closed on weekdays"
                  min={getTodayDateString()}
                />
                {addV.error('date')
                  ? <FieldError v={addV} name="date" />
                  : <span className="block mt-1 text-[11px] font-medium text-slate-500">Saturdays and Sundays only.</span>}
              </div>

              <div>
                <label htmlFor="appt-time" className="block mb-1.5 text-slate-500">Time Slot <span className="text-rose-600">*</span></label>
                <Select
                  {...addV.field('time', { withBlur: false })}
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  value={addForm.time}
                  onChange={e => setAddForm({ ...addForm, time: e.target.value })}
                >
                  <option value="">{addForm.date ? 'Select time slot' : 'Choose a date first'}</option>
                  {TIME_SLOTS.map(t => {
                    const taken = takenTimesOn(addForm.date).includes(t);
                    const closureInfo = getDayClosure(addForm.date);
                    const isClosed = closureInfo && (
                      closureInfo.type === 'day' ||
                      (closureInfo.type === 'slots' && closureInfo.slots.includes(t))
                    );
                    const reason = closureInfo?.closure?.reason;
                    return (
                      <option key={t} value={t} disabled={isClosed || taken}>
                        {isClosed
                          ? `${t} — Closed (${reason || 'Clinic schedule closed'})`
                          : taken
                            ? `${t} — booked`
                            : t}
                      </option>
                    );
                  })}
                </Select>
                <FieldError v={addV} name="time" />
              </div>

              <div>
                <label htmlFor="appt-type" className="block mb-1.5 text-slate-500">Purpose / Service <span className="text-rose-600">*</span></label>
                <Select
                  {...addV.field('type', { withBlur: false })}
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  value={addForm.type}
                  onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                >
                  <option value="">Select service</option>
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <FieldError v={addV} name="type" />
              </div>

              <div>
                <label htmlFor="appt-notes" className="block mb-1.5 text-slate-500">Notes <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  {...addV.field('notes')}
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 text-xs transition-all"
                  rows={3}
                  maxLength={NOTES_MAX}
                  placeholder="Any relevant details for this visit…"
                  value={addForm.notes}
                  onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                {addV.error('notes')
                  ? <FieldError v={addV} name="notes" />
                  : <span className="block mt-1 text-[11px] font-medium text-slate-400">{(addForm.notes || '').length}/{NOTES_MAX} characters</span>}
              </div>
            </div>

            {/* Footer Bar */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                className={BTN.outline}
                onClick={requestCloseAdd}
              >
                Cancel
              </button>
              <div className="flex items-center gap-4">
                <FormErrorNote count={addV.count(ADD_APPT_FIELDS)} action="save" />
                <button
                  type="button"
                  className={BTN.primary}
                  onClick={handleSaveAdd}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Appointment'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Appointment Preview Modal — read-only; staff confirm or decline */}
      {editModalOpen && editingApt && (() => {
        const apt = editingApt;
        const isPendingReq = apt.status === 'pending';
        const isCancelReq = apt.status === 'cancellation_pending';
        // Built only from Tailwind classes: this popup is portalled to <body>,
        // outside .appts-container, so the page's scoped CSS variables and
        // classes do not reach it.
        // Read-only: label + value pairs, no input boxes.
        const Field = ({ label, value, span }) => (
          <div className={span ? 'sm:col-span-2' : ''}>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900 whitespace-pre-wrap break-words">
              {value || <span className="text-slate-400">—</span>}
            </dd>
          </div>
        );
        const close = () => { setEditModalOpen(false); setEditingApt(null); };
        const staffBooked = apt.source === 'walk-in' || apt.source === 'phone';
        const reason = apt.cancellationReason || apt.declineReason;
        const shortId = apt.id.length > 10 ? `${apt.id.slice(0, 6)}…${apt.id.slice(-4)}` : apt.id;
        return (
          <Modal onClose={close}>
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-[680px] max-h-[calc(100vh-32px)] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#3B50DF] text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {getInitials(apt.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Appointment Preview</div>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight truncate">{apt.name || 'Patient'}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                    <span>ID</span>
                    <span className="font-mono text-slate-600" title={apt.id}>{shortId}</span>
                    <button type="button" title="Copy full ID" aria-label="Copy appointment ID"
                      onClick={() => { navigator.clipboard?.writeText(apt.id); showToast('Appointment ID copied', 'success'); }}
                      className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-[#3B50DF] hover:bg-slate-100 cursor-pointer">
                      <Copy size={12} />
                    </button>
                    <span>· Created {apt.createdAt ? formatDateMedium(apt.createdAt) : '—'}</span>
                  </p>
                </div>
                <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={close} />
              </div>

              {/* Body */}
              <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={apt.status || 'pending'} size="md" />
                  <StatusBadge tone="slate" label={sourceLabel(apt.source)} size="md" />
                  <ServicePill type={apt.type} />
                </div>
                <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
                  <AlertCircle size={14} className="text-slate-400 shrink-0 mt-px" />
                  <span>{staffBooked
                    ? `Booked by clinic staff${apt.patientId ? ` for patient ${apt.patientId}` : ''}.`
                    : 'Entered by the patient at booking; clinic staff cannot edit these details.'}</span>
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-4 pt-4 border-t border-slate-100">
                  <Field label="Full Name" value={apt.name} />
                  <Field label="Contact Number" value={apt.contactNumber || apt.contact} />
                  <Field label="Date" value={formatDateLong(apt.date) || apt.date} />
                  <Field label="Time Slot" value={apt.time} />
                  <Field label="Purpose / Service" value={formatServiceType(apt.type, '')} />
                  {isCancelReq && apt.cancellationReason && <Field label="Reason for cancelling" value={apt.cancellationReason} span />}
                  {apt.status === 'cancelled' && reason && <Field label="Cancellation Reason" value={reason} span />}
                  {(apt.rescheduledAt || apt.previousDate) && (
                    <Field
                      label="Rescheduled"
                      value={`Previously ${formatDateLong(apt.previousDate) || apt.previousDate || 'earlier date'} at ${apt.previousTime || '—'}${apt.rescheduledCount ? ` (${apt.rescheduledCount} time${apt.rescheduledCount === 1 ? '' : 's'})` : ''}`}
                      span
                    />
                  )}
                  {apt.cancelledAt && (
                    <Field
                      label="Cancelled At"
                      value={`${formatDateLong(apt.cancelledAt)} at ${new Date(apt.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    />
                  )}
                </dl>
              </div>

              {/* Footer: Close far left; primary Confirm on the right */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2.5 shrink-0">
                <button type="button" onClick={close} className={BTN.outline}>Close</button>
                {isPendingReq && (
                  <div className="flex items-center gap-2.5">
                    <button type="button" className={BTN.primary} onClick={() => { close(); promptQuickAction(apt, 'confirmed'); }}>
                      <UserCheck size={BTN_ICON} /> Confirm
                    </button>
                  </div>
                )}
                {isCancelReq && (
                  <div className="flex items-center gap-2.5">
                    <button type="button" className={BTN.outline} onClick={() => { close(); promptQuickAction(apt, 'confirmed'); }}>
                      <RotateCcw size={BTN_ICON} /> Keep appointment
                    </button>
                    <span className="text-xs text-slate-400 italic">Patients cancel visits directly in app</span>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Confirm Action Pop-up — shows appointment details before committing */}
      {pendingAction && (() => {
        const { apt, status } = pendingAction;
        const isCancelReq = apt.status === 'cancellation_pending';
        const approving = status === 'confirmed' || status === 'accepted';
        // Cancellation requests (legacy)
        const title = isCancelReq
          ? (approving ? 'Keep this appointment?' : 'Approve cancellation?')
          : (approving ? 'Confirm Appointment?' : 'Cancel Appointment?');
        // One sentence saying what happens, key words in bold.
        const message = isCancelReq
          ? (approving
            ? <>The appointment stays <strong>Confirmed</strong> and the patient is notified.</>
            : <>The slot is <strong>released</strong> and the patient is notified.</>)
          : (approving
            ? <>The appointment is <strong>Confirmed</strong> and the patient is notified.</>
            : <>The slot is <strong>released</strong> and the patient is notified.</>);
        const danger = !approving;
        const dialogVariant = danger ? 'danger' : 'neutral';
        const dialogIcon = isCancelReq && !approving ? CalendarX : danger ? AlertCircle : UserCheck;
        const actionLabel = isCancelReq
          ? (approving ? 'Keep appointment' : 'Approve cancellation')
          : (approving ? 'Confirm appointment' : 'Cancel appointment');
        return (
          <ConfirmDialog
            variant={dialogVariant}
            icon={dialogIcon}
            title={title}
            subtitle={isCancelReq ? 'Cancel request' : 'Booking request'}
            message={message}
            details={[
              ['Patient', apt.name],
              ['Contact', apt.contactNumber || apt.contact],
              ['Date', formatDateLong(apt.date) || apt.date],
              ['Time slot', apt.time],
              ['Service', formatServiceType(apt.type)],
              ['Patient notes', apt.notes],
              ['Patient reason', isCancelReq ? apt.cancellationReason : ''],
            ]}
            confirmLabel={actionLabel}
            busy={pendingActionSaving}
            busyLabel="Saving…"
            onConfirm={runPendingAction}
            onCancel={() => setPendingAction(null)}
          />
        );
      })()}

      {/* Close Schedule Modal */}
      {closeModalOpen && (() => {
        const affectedBookings = appointments.filter(a => {
          if (!a.date || INACTIVE_STATUSES.includes(String(a.status || '').toLowerCase())) return false;
          const end = closeForm.type === 'day' && closeForm.isRange && closeForm.endDate ? closeForm.endDate : closeForm.startDate;
          if (a.date < closeForm.startDate || a.date > end) return false;
          if (closeForm.type === 'slots') {
            return closeForm.slots.includes(a.time);
          }
          return true;
        });

        const CLOSE_TABS = [
          { key: 'day', label: 'Whole day' },
          { key: 'slots', label: 'Specific time slots' },
        ];

        return (
          <Modal
            isOpen={closeModalOpen}
            onClose={requestCloseClosure}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[calc(100vh-64px)] flex flex-col overflow-hidden my-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Lock size={17} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {closeForm.id ? "Edit Schedule Closure" : "Close Schedule"}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Close specific weekend dates or hours to new patient bookings.
                    </p>
                  </div>
                </div>
                <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={requestCloseClosure} />
              </div>

              {/* Scrollable Form Body */}
              <div className="p-6 overflow-y-auto flex-1 min-h-0 flex flex-col gap-5">
                {/* What to close: Whole day / Specific time slots */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    What to Close <span className="text-rose-600">*</span>
                  </label>
                  <SegmentedTabs
                    tabs={CLOSE_TABS}
                    value={closeForm.type}
                    onChange={val => setCloseForm(f => ({ ...f, type: val }))}
                    label="Closure type"
                    fill
                  />
                </div>

                {/* Date selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {closeForm.isRange && closeForm.type === 'day' ? 'Date Range' : 'Date'} <span className="text-rose-600">*</span>
                    </label>
                    {closeForm.type === 'day' && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={closeForm.isRange}
                          onChange={e => setCloseForm(f => ({ ...f, isRange: e.target.checked, endDate: e.target.checked ? f.endDate || f.startDate : f.startDate }))}
                          className="rounded border-slate-300 text-slate-800 focus:ring-slate-700"
                        />
                        <span>Multi-day range</span>
                      </label>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-slate-500 mb-1 block">Start Date (Saturday or Sunday)</span>
                      <DatePicker
                        value={closeForm.startDate}
                        onChange={e => {
                          const d = e.target.value;
                          setCloseForm(f => ({ ...f, startDate: d, endDate: f.isRange && f.endDate >= d ? f.endDate : d }));
                        }}
                        isDateDisabled={d => !isWeekendDate(d)}
                        disabledHint="Only Saturdays and Sundays can be closed"
                        min={getTodayDateString()}
                        placeholder="Select weekend date"
                      />
                    </div>
                    {closeForm.isRange && closeForm.type === 'day' && (
                      <div>
                        <span className="text-[11px] text-slate-500 mb-1 block">End Date (Saturday or Sunday)</span>
                        <DatePicker
                          value={closeForm.endDate}
                          onChange={e => setCloseForm(f => ({ ...f, endDate: e.target.value }))}
                          isDateDisabled={d => !isWeekendDate(d)}
                          disabledHint="Only Saturdays and Sundays can be closed"
                          min={closeForm.startDate || getTodayDateString()}
                          placeholder="Select end weekend date"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">Only Saturdays and Sundays (clinic appointment days) can be closed.</p>
                </div>

                {/* Time Slots (if specific time slots) */}
                {closeForm.type === 'slots' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Time Slots to Close <span className="text-rose-600">*</span>
                      </label>
                      <span className="text-xs text-slate-600 font-medium">
                        {closeForm.slots.length} of {TIME_SLOTS.length} selected
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50">
                      {TIME_SLOTS.map(slot => {
                        const isSelected = closeForm.slots.includes(slot);
                        const bookedCount = appointments.filter(a => a.date === closeForm.startDate && a.time === slot && !INACTIVE_STATUSES.includes(String(a.status || '').toLowerCase())).length;
                        return (
                          <label
                            key={slot}
                            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-slate-800 bg-slate-100 text-slate-900 font-semibold'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setCloseForm(f => ({
                                    ...f,
                                    slots: isSelected ? f.slots.filter(s => s !== slot) : [...f.slots, slot]
                                  }));
                                }}
                                className="rounded border-slate-300 text-slate-800 focus:ring-slate-700"
                              />
                              <span>{slot}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bookedCount > 0 ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                              {bookedCount} booked
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reason Presets */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Reason Preset
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {CLOSURE_PRESETS.map(preset => {
                      const active = closeForm.reasonPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setCloseForm(f => ({
                              ...f,
                              reasonPreset: preset.id,
                              reason: preset.defaultMsg || f.reason,
                            }));
                          }}
                          className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors cursor-pointer ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Message to Patients */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="closure-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Message to Patients <span className="text-rose-600">*</span>
                    </label>
                    <span className={`text-xs ${closeForm.reason.length > 140 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                      {closeForm.reason.length} / 150
                    </span>
                  </div>
                  <textarea
                    id="closure-reason"
                    rows={2}
                    maxLength={150}
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-slate-400 bg-white font-medium text-slate-800 text-xs transition-all resize-none"
                    value={closeForm.reason}
                    onChange={e => setCloseForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="Shown to patients before booking..."
                  />

                  {/* Patient Live Preview */}
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-1">
                    <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                      <Lock size={12} className="text-slate-500" /> Patient Preview
                    </div>
                    <blockquote className="text-xs text-slate-800 font-medium italic border-l-2 border-slate-300 pl-2.5 my-0.5">
                      &ldquo;Message from K&amp;A Clinic: {closeForm.reason || 'Reason for schedule closure...'}&rdquo;
                    </blockquote>
                    <p className="text-[10px] text-slate-500">
                      Shown when patients select {closeForm.startDate || 'this date'}{closeForm.type === 'slots' && closeForm.slots.length > 0 ? ` (${closeForm.slots.join(', ')})` : ''}.
                    </p>
                  </div>
                </div>

                {/* No internal note field: a closure saved earlier keeps its
                    note (loaded on edit and saved back unchanged). */}

                {/* Existing bookings warning card */}
                {affectedBookings.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                      <AlertTriangle size={15} className="text-slate-600 shrink-0" />
                      <span>{affectedBookings.length} Existing Appointment{affectedBookings.length === 1 ? '' : 's'} Affected</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Existing appointments stay as they are. Closing only stops new bookings. Affected patients will be notified so they can reschedule or cancel. Staff cannot cancel them.
                    </p>
                    <div className="max-h-36 overflow-y-auto flex flex-col gap-1.5 mt-1 border-t border-slate-200 pt-2">
                      {affectedBookings.map(a => (
                        <div key={a.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white border border-slate-200">
                          <span className="font-semibold text-slate-900">{a.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">{a.time}</span>
                            <StatusBadge status={a.status} />
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={requestCloseClosure}
                  className={BTN.outline}
                  disabled={savingClosure}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveClosure}
                  disabled={savingClosure}
                  className={BTN.primary}
                >
                  <Lock size={BTN_ICON} />
                  <span>{savingClosure ? 'Saving…' : closeForm.id ? 'Update Schedule Closure' : 'Close Schedule'}</span>
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Discard confirmation dialogs */}
      {closureDiscardDialog}

      {/* Reopen Closure Confirmation Dialog */}
      {reopenConfirm && (
        <ConfirmDialog
          variant="neutral"
          icon={Lock}
          title={`Reopen ${reopenConfirm.startDate === reopenConfirm.endDate || !reopenConfirm.endDate ? formatDateMedium(reopenConfirm.startDate) : `${formatDateMedium(reopenConfirm.startDate)} – ${formatDateMedium(reopenConfirm.endDate)}`}?`}
          subtitle="Schedule Closure"
          message={<>Patients will be able to book again on {reopenConfirm.type === 'slots' ? `the selected slots (${reopenConfirm.slots?.join(', ') || ''})` : 'this day'}.</>}
          confirmLabel="Reopen Schedule"
          cancelLabel="Keep Closed"
          busy={reopening}
          busyLabel="Reopening…"
          onConfirm={() => handleReopenClosure(reopenConfirm)}
          onCancel={() => setReopenConfirm(null)}
        />
      )}

    </div>
  );
}