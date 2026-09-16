import { authedPostJson } from "../lib/apiClient";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auth, db } from "../lib/firebase";
import { buildDoses } from "./vaccination";
import { buildInitialDoses, buildScheduleDates, isAgeGrouped, scheduleLabel, getEligibleVaccinesForService, isVaccineForService } from "../lib/doseSchedules";
import { formatDateLong, formatDateLong as fmtDate, formatDateShort, formatDateNumeric, getTodayDateString, today, addDaysToDateString } from "../lib/dates";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import Toast from "../components/Toast";
import { CLINIC_LOGO_BASE64 } from "../assets/clinicLogoBase64";
import { Printer, Download, MapPin, AlertTriangle, AlertCircle } from "lucide-react";
import { trackEvent } from "../lib/analytics";

/* ─────────────────────────── CSS ─────────────────────────── */
const globalCSS = `
  :root {
    --blue:#3B50DF; --blue-light:#EEF2FF; --blue-soft:#E0E7FF;
    --white:#FFFFFF; --bg:#F0F4FA; --bg-2:#E2E8F0;
    --text:#1C1C1E; --text-2:#3D3535;
    --muted:#7A6E6E; --muted-2:#A89E9E;
    --border:#E8E2E2; --border-2:#D4CBCB;
    --green:#16A34A; --green-soft:#DCFCE7;
    --orange:#D97706; --orange-soft:#FEF3C7;
    --red:#DC2626; --red-soft:#FEE2E2;
    --shadow-sm:0 1px 3px rgba(0,0,0,0.06);
    --shadow-md:0 4px 12px rgba(0,0,0,0.08);
    --r-xs:3px;--r-sm:5px;--r-md:7px;--r-lg:10px;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body, button, input, select, textarea, table, td, th, div, span, p, h1, h2, h3, h4 { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  body{background:#F0F4FA;color:var(--text);}

  /* Table */
  .table-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;}
  thead th{font-size:.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;background:var(--bg);}
  tbody td{font-size:.8125rem;font-weight:400;padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  tbody tr:last-child td{border-bottom:none;}
  tbody tr{cursor:pointer;transition:background .12s;}
  tbody tr:hover{background:var(--bg-2);}
  .tbl-av{width:2rem;height:2rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6875rem;font-weight:800;color:#fff;flex-shrink:0;}

  /* Badge */
  .badge{display:inline-flex;align-items:center;font-size:.625rem;font-weight:600;padding:2px 8px;border-radius:var(--r-xs);white-space:nowrap;letter-spacing:.2px;}
  .badge-green{background:var(--green-soft);color:#15803D;}
  .badge-orange{background:var(--orange-soft);color:#B45309;}
  .badge-red{background:var(--red-soft);color:#B91C1C;}
  .badge-blue{background:#EEF1FD;color:#3D5AFE;}
  .badge-purple{background:#F3E8FF;color:#7C3AED;}
  .badge-teal{background:#CCFBF1;color:#0F766E;}

  /* Service type pills */
  .service-pill{display:inline-flex;align-items:center;gap:4px;font-size:.625rem;font-weight:700;padding:3px 9px;border-radius:var(--r-xs);letter-spacing:.3px;text-transform:uppercase;white-space:nowrap;}
  .service-pep{background:#EEF2FF;color:#3B50DF;border:1px solid #E0E7FF;}
  .service-prep{background:#EEF1FD;color:#3D5AFE;border:1px solid #C7D2FE;}
  .service-tetanus{background:#FEF3C7;color:#B45309;border:1px solid #FDE68A;}
  .service-hepa{background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0;}
  .service-pneumonia{background:#F3E8FF;color:#6D28D9;border:1px solid #DDD6FE;}

  /* Service selector grid */
  .service-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
  .service-select-btn{padding:10px 8px;border-radius:var(--r-lg);border:2px solid var(--border);background:var(--bg);cursor:pointer;font-family:inherit;text-align:center;transition:all .15s;}
  .service-select-btn:hover{border-color:var(--blue);background:var(--blue-light);}
  .service-select-btn.sel-pep{border-color:#3B50DF;background:#EEF2FF;}
  .service-select-btn.sel-prep{border-color:#3D5AFE;background:#EEF1FD;}
  .service-select-btn.sel-tetanus{border-color:#D97706;background:#FEF3C7;}
  .service-select-btn.sel-hepa{border-color:#059669;background:#ECFDF5;}
  .service-select-btn.sel-pneumonia{border-color:#7C3AED;background:#F3E8FF;}
  .service-select-btn .ss-icon{font-size:1.125rem;margin-bottom:4px;}
  .service-select-btn .ss-label{font-size:.75rem;font-weight:800;color:var(--text);display:block;}
  .service-select-btn .ss-desc{font-size:.625rem;color:var(--muted);margin-top:2px;display:block;line-height:1.3;}

  /* Buttons */
  .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r-md);font-size:.8125rem;font-weight:500;font-family:inherit;cursor:pointer;border:none;transition:all .13s ease;}
  .btn-primary{background:var(--blue);color:#fff;}
  .btn-primary:hover{background:#a81015;}
  .btn-outline{background:var(--white);color:var(--text-2);border:1.5px solid var(--border);}
  .btn-outline:hover{border-color:var(--blue);color:var(--blue);}
  .btn-sm{padding:5px 10px;font-size:.75rem;}

  /* Card */
  .card{background:var(--white);border-radius:var(--r-lg);border:1px solid var(--border);}

  /* Tab row */
  .tab-row{display:flex;align-items:center;gap:4px;margin-bottom:14px;flex-wrap:wrap;}
  .tab-btn{padding:5px 13px;border-radius:var(--r-sm);border:1px solid #E5E7EB;background:#F9FAFB;font-size:.78125rem;font-weight:500;font-family:inherit;color:#4B5563;cursor:pointer;transition:all .13s;}
  .tab-btn:hover{background:#F3F4F6;color:#111827;}
  .tab-btn.on{background:#6366F1;color:#fff;font-weight:700;border-color:#6366F1;}

  /* Search */
  .table-search{padding:5px 11px 5px 30px;border-radius:var(--r-sm);border:1px solid #E5E7EB;background:#F9FAFB;font-size:.78125rem;font-family:inherit;color:#111827;outline:none;transition:border-color .14s;width:180px;}
  .table-search::placeholder{color:#9CA3AF;}
  .table-search:focus{border-color:#6366F1;background:#FFFFFF;}

  /* Page header — LIGHT CARD SYSTEM */
  .page-header-bar{
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: var(--r-lg);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  /* Medical record detail */
  .rec-detail{background:var(--white);border-radius:var(--r-lg);border:1px solid var(--border);padding:20px;overflow-y:auto;}
  .detail-section{margin-bottom:20px;}
  .detail-section h3{font-size:.625rem;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-2);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);}
  .detail-row{display:flex;gap:8px;margin-bottom:8px;}
  .detail-key{font-size:.75rem;font-weight:400;color:var(--muted);width:130px;flex-shrink:0;}
  .detail-val{font-size:.75rem;font-weight:500;color:var(--text-2);}

  /* Progress tracker timeline */
  .dose-timeline{display:flex;flex-direction:column;gap:0;}
  .dose-track-item{display:flex;align-items:stretch;gap:0;}
  .dose-track-left{display:flex;flex-direction:column;align-items:center;width:36px;flex-shrink:0;}
  .dose-track-circle{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6875rem;font-weight:800;flex-shrink:0;z-index:1;transition:all .2s;border:2px solid var(--border);background:var(--white);color:var(--muted);}
  .dose-track-circle.done{background:var(--green);border-color:var(--green);color:#fff;}
  .dose-track-circle.miss{background:var(--red);border-color:var(--red);color:#fff;}
  .dose-track-circle.active{background:var(--blue);border-color:var(--blue);color:#fff;}
  .dose-track-line{width:2px;flex:1;background:var(--border);margin:0 auto;}
  .dose-track-line.done{background:var(--green);}
  .dose-track-content{flex:1;padding:2px 0 18px 14px;}
  .dose-track-item:last-child .dose-track-content{padding-bottom:4px;}
  .dose-track-name{font-size:.8125rem;font-weight:700;color:var(--text);transition:all .2s;}
  .dose-track-name.done{text-decoration:line-through;color:var(--muted);font-weight:500;}
  .dose-track-name.miss{text-decoration:line-through;color:var(--red);font-weight:500;}
  .dose-track-date{font-size:.6875rem;color:var(--muted);margin-top:2px;}
  .dose-track-date.done{color:var(--green);}

  /* icon action buttons */
  .icon-btn{width:30px;height:30px;border-radius:var(--r-sm);border:1.5px solid var(--border);background:var(--white);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .13s;padding:0;}
  .icon-btn:hover{border-color:var(--blue);color:var(--blue);}
  .icon-btn.danger:hover{border-color:var(--red);color:var(--red);background:var(--red-soft);}

  /* Modal */
  .modal-overlay, .admin-modal-overlay{position:fixed;top:max(80px, var(--header-height, 80px));bottom:0;right:0;left:var(--sidebar-width, 256px);width:calc(100vw - var(--sidebar-width, 256px));height:calc(100vh - max(80px, var(--header-height, 80px)));background:rgba(26,34,64,.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;box-sizing:border-box;backdrop-filter:blur(8px);transition:left 0.4s cubic-bezier(0.22,1,0.36,1),width 0.4s cubic-bezier(0.22,1,0.36,1),top 0.4s cubic-bezier(0.22,1,0.36,1),height 0.4s cubic-bezier(0.22,1,0.36,1);}
  .modal{background:var(--white);border-radius:1.25rem;padding:28px;width:32.5rem;max-width:min(32.5rem, calc(100% - 32px));max-height:calc(100vh - 130px);overflow-y:auto;box-shadow:0 20px 60px rgba(26,34,64,.18);transition:all 0.4s cubic-bezier(0.22,1,0.36,1);}
  .modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;}
  .modal-head h2{font-size:1.0625rem;font-weight:900;}
  .modal-close{width:2rem;height:2rem;border-radius:50%;border:1px solid #E2E8F0;background:#FFFFFF;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748B;transition:all .15s ease;box-shadow:0 1px 2px rgba(0,0,0,0.04);}
  .modal-close:hover{background:#FEE2E2;color:#DC2626;border-color:#FECACA;}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .form-field{display:flex;flex-direction:column;gap:6px;}
  .form-field.full{grid-column:span 2;}
  .form-field label{font-size:.75rem;font-weight:700;color:var(--muted);}
  .form-field input,.form-field select,.form-field textarea{font-family:inherit;font-size:.8125rem;font-weight:500;padding:9px 12px;border:1.5px solid var(--border);border-radius:.625rem;background:var(--bg);color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s;}
  .form-field input:focus,.form-field select:focus,.form-field textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(200,21,26,.10);background:#fff;}
  .form-field textarea{resize:vertical;min-height:70px;}
  .modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:22px;}

  /* Vaccine modal steps */
  .modal-steps{display:flex;align-items:center;gap:0;margin-bottom:24px;}
  .step{display:flex;align-items:center;gap:8px;flex:1;position:relative;}
  .step:not(:last-child)::after{content:'absolute';left:28px;right:0;top:14px;height:2px;background:var(--border);z-index:0;}
  .step.done::after{background:var(--blue);}
  .step-num{width:28px;height:28px;border-radius:50%;background:var(--bg);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;color:var(--muted);flex-shrink:0;z-index:1;transition:all .2s;}
  .step.active .step-num{background:var(--blue);border-color:var(--blue);color:#fff;}
  .step.done .step-num{background:var(--green);border-color:var(--green);color:#fff;}
  .step-label{font-size:.71875rem;font-weight:700;color:var(--muted);}
  .step.active .step-label{color:var(--blue);}
  .step.done .step-label{color:var(--green);}

  /* Vaccine type buttons */
  .vaccine-types{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;}
  .vaccine-type-btn{padding:14px 12px;border-radius:.875rem;border:2px solid var(--border);background:var(--bg);cursor:pointer;font-family:inherit;text-align:left;transition:all .15s;}
  .vaccine-type-btn:hover{border-color:var(--blue);background:var(--blue-light);}
  .vaccine-type-btn.selected{border-color:var(--blue);background:var(--blue-soft);}
  .vt-icon{display:flex;justify-content:center;margin-bottom:.375rem;color:var(--blue);}
  .vt-icon svg{width:1.375rem;height:1.375rem;}
  .vt-name{font-size:.8125rem;font-weight:800;color:var(--text);}
  .vt-desc{font-size:.6875rem;color:var(--muted);margin-top:2px;}

  /* Dose schedule rows */
  .dose-schedule{display:flex;flex-direction:column;gap:8px;margin-top:4px;}
  .dose-schedule-row{display:grid;grid-template-columns:28px 1fr 1fr auto;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:.6875rem;border:1px solid var(--border);}
  .dose-index{width:1.625rem;height:1.625rem;border-radius:50%;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;font-size:.6875rem;font-weight:800;}
  .dose-schedule-row input[type=date],.dose-schedule-row select{font-family:inherit;font-size:.78125rem;font-weight:500;padding:7px 10px;border:1.5px solid var(--border);border-radius:.5625rem;background:var(--white);color:var(--text);outline:none;width:100%;transition:border-color .15s;}
  .dose-schedule-row input[type=date]:focus,.dose-schedule-row select:focus{border-color:var(--blue);}

  /* Summary */
  .summary-block{background:var(--bg);border-radius:var(--r-lg);border:1px solid var(--border);padding:14px;margin-bottom:12px;}
  .summary-block h4{font-size:.6875rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px;}
  .summary-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:.78125rem;border-bottom:1px solid var(--border);}
  .summary-row:last-child{border-bottom:none;}
  .summary-row .s-key{font-weight:600;color:var(--muted);}
  .summary-row .s-val{font-weight:700;}

  /* Send channel buttons */
  .send-ch-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r-md);font-size:.8125rem;font-weight:500;font-family:inherit;cursor:pointer;border:1.5px solid var(--border);background:var(--white);color:var(--text-2);transition:all .13s;}
  .send-ch-btn:hover{border-color:var(--blue);color:var(--blue);}
  .send-ch-btn.active{border-color:var(--blue);background:var(--blue-soft);color:var(--blue);}

  /* Toast */
  .toast{position:fixed;bottom:20px;right:20px;background:#111827;color:#fff;padding:10px 18px;border-radius:var(--r-lg);font-size:.8125rem;font-weight:500;box-shadow:var(--shadow-md);z-index:9999;animation:fadeIn .18s ease;}
  .toast.success{background:var(--green);}
  .toast.error{background:var(--red);}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px;}
  ::-webkit-scrollbar-track{background:transparent;}
`;

/* ─────────────────────────── DATA ─────────────────────────── */
const AVATAR_COLORS = ['#3D5AFE', '#06B6D4', '#F59E0B', '#22C55E', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6'];

const VACCINE_PRESETS = {
  ARV: { label: 'Anti-Rabies Vaccine (ARV)', doses: ['Day 0 — Dose 1', 'Day 3 — Dose 2', 'Day 7 — Dose 3', 'Day 14 — Dose 4', 'Day 28 — Dose 5'] },
  ERIG: { label: 'ERIG (Equine Rabies Immunoglobulin)', doses: ['Day 0 — ERIG'] },
  TT: { label: 'Tetanus Toxoid (TT)', doses: ['Day 0 — Dose 1', 'Day 7 — Dose 2'] },
  CUSTOM: { label: 'Custom / Other', doses: [] },
};

/* ─────────────────────────── LIBON GEODATA DICTIONARY ─────────────────────────── */
// Standard option lists for the patient intake form. Free-text fields were
// converted to dropdowns so records stay consistent and searchable; each list
// keeps an "Other" escape hatch where clinical reality demands one.
export const ZONE_OPTIONS = [
  'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7',
  'Zone 8', 'Zone 9', 'Zone 10', 'Zone 11',
  'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6',
  'Sitio Proper', 'Poblacion',
];

export const GENERIC_NAME_OPTIONS = [
  'Purified Chick Embryo Cell Rabies Vaccine (PCECV)',
  'Purified Vero Cell Rabies Vaccine (PVRV)',
  'Human Diploid Cell Rabies Vaccine (HDCV)',
  'Equine Rabies Immunoglobulin (ERIG)',
  'Human Rabies Immunoglobulin (HRIG)',
  'Tetanus Toxoid (TT)',
  'Tetanus-Diphtheria (Td)',
  'Other',
];

export const WOUND_LOCATION_OPTIONS = [
  'Right Hand', 'Left Hand', 'Right Arm', 'Left Arm',
  'Right Leg', 'Left Leg', 'Right Foot', 'Left Foot',
  'Head', 'Face', 'Neck', 'Trunk / Torso', 'Back',
  'Multiple Sites', 'Other',
];

export const PAST_VACCINE_OPTIONS = [
  'None',
  'Completed PEP (within 1 year)',
  'Completed PEP (1–3 years ago)',
  'Completed PEP (over 3 years ago)',
  'Incomplete / Interrupted PEP',
  'Pre-Exposure Prophylaxis (PrEP) only',
  'Tetanus Toxoid only',
  'Unknown',
];

export const ALLERGY_OPTIONS = [
  'No known allergies',
  'Penicillin',
  'Sulfa drugs',
  'Aspirin / NSAIDs',
  'Eggs',
  'Seafood',
  'Latex',
  'Previous vaccine reaction',
  'Other',
];

export const PLACE_OF_EXPOSURE_OPTIONS = [
  'Own residence',
  "Neighbor's residence",
  'Street / Roadside',
  'Public market',
  'School premises',
  'Workplace',
  'Farm / Field',
  'Other municipality',
  'Other',
];

export const LIBON_BARANGAYS = [
  'San Juan', 'San Rafael', 'Matacon', 'Bulusan', 'Bonavista', 'Carisac East',
  'Carisac West', 'Rawis', 'Pantao', 'Bap-bap', 'Bambon', 'Barbon', 'Burabod',
  'Cagbulos', 'Harigue', 'Liberacion', 'Izcala', 'Labnig', 'Linao', 'Magcawayan',
  'Malabag', 'Maroba', 'Molosbolos', 'Nino Jesus', 'Nogpo', 'San Agustin',
  'San Antonio', 'San Isidro', 'San Jose', 'San Roque', 'San Vicente', 'Santa Cruz',
  'Sogo', 'Talin-talin', 'Tambo', 'Tipa-tipa', 'Zone 1', 'Zone 2', 'Zone 3',
  'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9', 'Zone 10', 'Zone 11'
];

export const LIBON_BARANGAY_COORDS = {
  'San Juan':       { lat: 13.3000, lng: 123.4350 },
  'San Rafael':     { lat: 13.2920, lng: 123.4280 },
  'Matacon':        { lat: 13.2850, lng: 123.4210 },
  'Bulusan':        { lat: 13.3150, lng: 123.4420 },
  'Bonavista':      { lat: 13.3210, lng: 123.4500 },
  'Carisac East':   { lat: 13.3100, lng: 123.4600 },
  'Carisac West':   { lat: 13.3080, lng: 123.4520 },
  'Rawis':          { lat: 13.3320, lng: 123.4650 },
  'Pantao':         { lat: 13.3450, lng: 123.4750 },
  'Bap-bap':        { lat: 13.2750, lng: 123.4100 },
  'Bambon':         { lat: 13.2980, lng: 123.4250 },
  'Barbon':         { lat: 13.2820, lng: 123.4310 },
  'Burabod':        { lat: 13.3040, lng: 123.4400 },
  'Cagbulos':       { lat: 13.3120, lng: 123.4310 },
  'Harigue':        { lat: 13.3180, lng: 123.4220 },
  'Liberacion':     { lat: 13.3010, lng: 123.4370 },
  'Izcala':         { lat: 13.2900, lng: 123.4480 },
  'Labnig':         { lat: 13.3250, lng: 123.4380 },
  'Linao':          { lat: 13.3300, lng: 123.4420 },
  'Magcawayan':     { lat: 13.3350, lng: 123.4550 },
  'Malabag':        { lat: 13.2950, lng: 123.4500 },
  'Maroba':         { lat: 13.2880, lng: 123.4600 },
  'Molosbolos':     { lat: 13.3060, lng: 123.4680 },
  'Nino Jesus':     { lat: 13.2990, lng: 123.4290 },
  'Nogpo':          { lat: 13.3400, lng: 123.4600 },
  'San Agustin':    { lat: 13.3050, lng: 123.4200 },
  'San Antonio':    { lat: 13.3100, lng: 123.4150 },
  'San Isidro':     { lat: 13.2920, lng: 123.4390 },
  'San Jose':       { lat: 13.2960, lng: 123.4440 },
  'San Roque':      { lat: 13.3020, lng: 123.4460 },
  'San Vicente':    { lat: 13.3080, lng: 123.4410 },
  'Santa Cruz':     { lat: 13.3150, lng: 123.4510 },
  'Sogo':           { lat: 13.3220, lng: 123.4620 },
  'Talin-talin':    { lat: 13.3280, lng: 123.4710 },
  'Tambo':          { lat: 13.3360, lng: 123.4800 },
  'Tipa-tipa':      { lat: 13.3420, lng: 123.4880 },
  'Zone 1':         { lat: 13.3005, lng: 123.4355 },
  'Zone 2':         { lat: 13.3015, lng: 123.4365 },
  'Zone 3':         { lat: 13.3025, lng: 123.4375 },
  'Zone 4':         { lat: 13.3035, lng: 123.4385 },
  'Zone 5':         { lat: 13.3045, lng: 123.4395 },
  'Zone 6':         { lat: 13.2995, lng: 123.4345 },
  'Zone 7':         { lat: 13.2985, lng: 123.4335 },
  'Zone 8':         { lat: 13.2975, lng: 123.4325 },
  'Zone 9':         { lat: 13.2965, lng: 123.4315 },
  'Zone 10':        { lat: 13.2955, lng: 123.4305 },
  'Zone 11':        { lat: 13.2945, lng: 123.4295 },
};

function getHashOffset(str) {
  if (!str) return { latOffset: 0, lngOffset: 0 };
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((Math.abs(hash) % 30) - 15) * 0.0001;
  const lngOffset = ((Math.abs(hash * 31) % 30) - 15) * 0.0001;
  return { latOffset, lngOffset };
}

export function geocodeLibonAddress(barangay, zone) {
  const base = LIBON_BARANGAY_COORDS[barangay] || { lat: 13.3000, lng: 123.4350 };
  const { latOffset, lngOffset } = getHashOffset(zone || barangay);
  return {
    lat: +(base.lat + latOffset).toFixed(6),
    lng: +(base.lng + lngOffset).toFixed(6),
  };
}

/* ─────────────────────────── HELPERS ─────────────────────────── */
const getInitials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2);
const statusBadgeClass = { ongoing: 'badge-blue', completed: 'badge-green' };
const doseBadgeClass = { done: 'badge-green', miss: 'badge-red', pending: 'badge-orange' };
const derivePatientStatus = (patient) => {
  if (!patient) return 'ongoing';
  if (patient.isArchived || patient.status === 'archived' || patient.status === 'completed') return 'completed';
  const doses = patient.doses || [];
  if (doses.length > 0) {
    const allDone = doses.every(d => {
      const st = String(d.s || d.status || '').toLowerCase();
      return st === 'done' || st === 'completed' || d.done === true;
    });
    if (allDone) return 'completed';
  }
  if (patient.status === 'overdue') return 'overdue';
  return patient.status || 'ongoing';
};

const getDOHRetentionYear = (patient) => {
  if (!patient) return new Date().getFullYear() + 10;
  if (patient.retentionExpiryYear) return patient.retentionExpiryYear;
  const dStr = patient.completedDate || patient.date || (patient.createdAt?.toDate ? getTodayDateString(patient.createdAt.toDate()) : today());
  const d = new Date(dStr);
  const yr = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return yr + 10;
};

/* ─────────────────────────── SERVICE CONFIG ─────────────────────────── */
const SERVICE_TYPES = [
  {
    key: 'PEP', label: 'PEP', desc: 'Post-Exposure Prophylaxis', sub: 'After animal bite',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    pillClass: 'service-pep', selClass: 'sel-pep'
  },
  {
    key: 'PrEP', label: 'PrEP', desc: 'Pre-Exposure Prophylaxis', sub: 'Before exposure',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    pillClass: 'service-prep', selClass: 'sel-prep'
  },
  {
    key: 'Tetanus', label: 'Anti-Tetanus', desc: 'Tetanus Toxoid (TT)', sub: 'Wound / injury',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M2 22l4-4"/><path d="M16 2l4 4"/></svg>,
    pillClass: 'service-tetanus', selClass: 'sel-tetanus'
  },
  {
    key: 'Pneumonia', label: 'Pneumonia', desc: 'Pneumococcal Vaccine', sub: 'PCV / PPSV23',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    pillClass: 'service-pneumonia', selClass: 'sel-pneumonia'
  },
];

/* ─────────────────────────── FORMAT TITLE CASE ─────────────────────────── */
function formatTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Accepts the same shapes formatE164 normalizes: 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX.
// An empty value is treated as valid since the field is optional.
function isValidPHPhone(v) {
  const digits = (v || '').replace(/\D/g, '');
  if (!digits) return true;
  return (
    (digits.startsWith('09') && digits.length === 11) ||
    (digits.startsWith('639') && digits.length === 12) ||
    (digits.startsWith('9') && digits.length === 10)
  );
}

/* ─────────────────────────── RABIES / BITE INCIDENT CHECK ─────────────────────────── */
export function isRabiesOrBiteIncident(patient) {
  if (!patient) return false;
  const s = (patient.service || '').trim().toLowerCase();

  // Explicit non-rabies services
  if (s.includes('tetanus') || s.includes('hepa') || s.includes('pneumo')) {
    return false;
  }

  // Has explicit biting / animal exposure data
  const hasBiteData = Boolean(
    patient.animal ||
    (patient.typeOfExposure && patient.typeOfExposure.toLowerCase().includes('bite')) ||
    patient.numberOfBites ||
    patient.woundLocation ||
    patient.placeOfExposure
  );
  if (hasBiteData) return true;

  // Rabies services: PEP (Post-Exposure Prophylaxis) and PrEP (Pre-Exposure Prophylaxis)
  if (s === 'pep' || s === 'prep' || s.includes('pep') || s.includes('prep') || s.includes('rabies')) {
    return true;
  }

  return false;
}

/* ─────────────────────────── SERVICE BADGE ─────────────────────────── */
function ServiceBadge({ service }) {
  const found = SERVICE_TYPES.find(s => s.key === service);
  const label = found ? found.label : (service || 'PEP');
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      borderRadius: 6,
      background: '#F1F5F9',
      color: '#334155',
      border: '1px solid #CBD5E1',
      fontSize: '.71875rem',
      fontWeight: 700,
      fontFamily: 'inherit',
      whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  );
}

/* ─────────────────────────── SERVICE SELECTOR ─────────────────────────── */
function ServiceSelector({ value, onChange }) {
  return (
    <div className="service-grid">
      {SERVICE_TYPES.map(s => (
        <button key={s.key} type="button"
          className={`service-select-btn${value === s.key ? ' ' + s.selClass : ''}`}
          onClick={() => onChange(s.key)}>
          <div className="ss-icon">{s.icon}</div>
          <span className="ss-label" style={value === s.key ? { color: 'var(--text)' } : {}}>{s.label}</span>
          <span className="ss-desc">{s.desc}</span>
          <span className="ss-desc" style={{ color: 'var(--muted-2)' }}>{s.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── TOAST ─────────────────────────── */



/* ─────────────────────────── SCHEDULE SUMMARY CALCULATION ─────────────────────────── */
function ScheduleSummary({ service, baseDate, dob, ageGroup }) {
  if (!baseDate) return (
    <div style={{ gridColumn: 'span 2', marginTop: 14, padding: '12px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', fontSize: '.75rem', color: 'var(--muted)', textAlign: 'center' }}>
      Select a date above to preview the vaccination schedule.
    </div>
  );

  // Resolved from src/lib/doseSchedules.js — the same definitions the record
  // is written from, so a preview can never promise a different schedule.
  const schedule = buildScheduleDates(service, { day0: baseDate, dob, ageGroup })
    .map(d => ({ label: d.label, date: formatDateShort(d.date) || d.date }));
  const needsDob = isAgeGrouped(service) && ageGroup === 'infant' && !dob;

  return (
    <div style={{ gridColumn: 'span 2', marginTop: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
      <div style={{ fontSize: '.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px', color: '#475569', marginBottom: 4 }}>Estimated Vaccination Schedule</div>
      <div style={{ fontSize: '.6875rem', color: '#64748B', marginBottom: 12 }}>{scheduleLabel(service, ageGroup)}</div>
      {needsDob && (
        <div style={{ fontSize: '.71875rem', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          Enter the date of birth above — these dates are spaced correctly but anchored to today until it is set.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {schedule.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '.75rem' }}>
            <strong style={{ color: '#334155' }}>{s.label}</strong>
            <span style={{ color: '#0F172A', fontWeight: 600 }}>{s.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── CONTEXTUAL SERVICE FIELDS ─────────────────────────── */
function ServiceFields({ service, form, set }) {
  if (service === 'PEP') return (
    <>
      <div className="form-field"><label>Biting Animal</label><select value={form.animal || 'Dog'} onChange={e => set('animal', e.target.value)}><option>Dog</option><option>Cat</option><option>Monkey</option><option>Bat</option><option>Rat</option><option>Other</option></select></div>
      <div className="form-field"><label>Exposure Category</label><select value={form.cat || 'Category I'} onChange={e => set('cat', e.target.value)}><option>Category I</option><option>Category II</option><option>Category III</option></select></div>
      <div className="form-field"><label>Date of Exposure</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
      <div className="form-field"><label>Wound Location</label><input type="text" value={form.woundLocation || ''} onChange={e => set('woundLocation', e.target.value)} placeholder="e.g. Left hand" /></div>
      <div className="form-field"><label>Wound Depth</label><select value={form.woundDepth || 'Superficial'} onChange={e => set('woundDepth', e.target.value)}><option>Superficial</option><option>Deep / Penetrating</option><option>Multiple</option><option>Unknown</option></select></div>
      <div className="form-field"><label>No. of Bites</label><select value={form.numberOfBites || '1'} onChange={e => set('numberOfBites', e.target.value)}><option>1</option><option>2</option><option>3</option><option>4+</option></select></div>
      <div className="form-field full"><label>Past Vaccination History</label><input type="text" value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)} placeholder="e.g. Fully vaccinated 2023, None..." /></div>
      <div className="form-field full"><label>Allergies</label><input type="text" value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. No known allergies, Penicillin..." /></div>
      <div className="form-field full"><label>Clinical Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Other observations..." /></div>
      <ScheduleSummary service={service} baseDate={form.date} />
    </>
  );

  if (service === 'PrEP') return (
    <>
      <div className="form-field full"><label>Date of Consultation</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
      <div className="form-field full"><label>Past Vaccination History</label><input type="text" value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)} placeholder="e.g. None" /></div>
      <div className="form-field full"><label>Allergies</label><input type="text" value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. No known allergies" /></div>
      <div className="form-field full"><label>Clinical Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional observations..." /></div>
      <ScheduleSummary service={service} baseDate={form.date} dob={form.dob} ageGroup={form.ageGroup} />
    </>
  );

  if (service === 'Tetanus') return (
    <>
      <div className="form-field full"><label>Age Group <span style={{ color: '#C8151A' }}>*</span> <span style={{ fontWeight: 400, color: '#64748B', fontSize: '.6875rem' }}>(sets the dose schedule)</span></label>
        <select value={form.ageGroup || 'adult'} onChange={e => set('ageGroup', e.target.value)}>
          <option value="adult">Adult / Older child — schedule counts from today</option>
          <option value="infant">Infant / Child series — schedule counts from date of birth</option>
        </select>
      </div>
      {form.ageGroup === 'infant' && (
        <div className="form-field full"><label>Date of Birth <span style={{ color: '#C8151A' }}>*</span></label>
          <input type="date" value={form.dob || ''} max={today()} onChange={e => set('dob', e.target.value)} />
          <span style={{ fontSize: '.6875rem', color: '#64748B', marginTop: 4 }}>
            Required: the childhood series is scheduled by the patient's age, not by the visit date.
          </span>
        </div>
      )}

      <div className="form-field"><label>Wound / Injury Type</label><select value={form.woundType || 'Laceration'} onChange={e => set('woundType', e.target.value)}>
        <option>Laceration</option><option>Puncture</option><option>Abrasion</option><option>Burn</option><option>Crush injury</option><option>Other</option>
      </select></div>
      <div className="form-field"><label>Date of Consult</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
      <div className="form-field full"><label>Last Tetanus Shot</label><select value={form.lastTetanus || 'Unknown'} onChange={e => set('lastTetanus', e.target.value)}>
        <option>Unknown</option><option>Less than 5 years ago</option><option>5–10 years ago</option><option>More than 10 years ago</option><option>Never vaccinated</option>
      </select></div>
      <div className="form-field full"><label>Past Vaccination History</label><input type="text" value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)} placeholder="e.g. None" /></div>
      <div className="form-field full"><label>Allergies</label><input type="text" value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. No known allergies" /></div>
      <div className="form-field full"><label>Clinical Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Wound condition, contamination..." /></div>
      <ScheduleSummary service={service} baseDate={form.date} />
    </>
  );

  if (service === 'Pneumonia') return (
    <>
      <div className="form-field full"><label>Age Group <span style={{ color: '#C8151A' }}>*</span> <span style={{ fontWeight: 400, color: '#64748B', fontSize: '.6875rem' }}>(sets the dose schedule)</span></label>
        <select value={form.ageGroup || 'adult'} onChange={e => set('ageGroup', e.target.value)}>
          <option value="adult">Adult / Older child — schedule counts from today</option>
          <option value="infant">Infant / Child series — schedule counts from date of birth</option>
        </select>
      </div>
      {form.ageGroup === 'infant' && (
        <div className="form-field full"><label>Date of Birth <span style={{ color: '#C8151A' }}>*</span></label>
          <input type="date" value={form.dob || ''} max={today()} onChange={e => set('dob', e.target.value)} />
          <span style={{ fontSize: '.6875rem', color: '#64748B', marginTop: 4 }}>
            Required: the childhood series is scheduled by the patient's age, not by the visit date.
          </span>
        </div>
      )}
      <div className="form-field"><label>Vaccine Type</label><select value={form.pneumoVaccine || 'PCV15'} onChange={e => set('pneumoVaccine', e.target.value)}>
        <option>PCV13 (Prevnar 13)</option><option>PCV15 (Vaxneuvance)</option><option>PCV20 (Prevnar 20)</option><option>PPSV23 (Pneumovax)</option>
      </select></div>
      <div className="form-field"><label>Date of Consult</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
      <div className="form-field full"><label>High-Risk Condition</label><select value={form.riskCondition || 'None'} onChange={e => set('riskCondition', e.target.value)}>
        <option>None</option><option>Asthma / COPD</option><option>Diabetes</option><option>Heart disease</option><option>Immunocompromised</option><option>Chronic kidney disease</option><option>Smoker</option><option>Age ≥ 65</option><option>Other</option>
      </select>
      </div>
      <div className="form-field full"><label>Prior Pneumonia Vaccine</label><select value={form.priorPneumo || 'None'} onChange={e => set('priorPneumo', e.target.value)}>
        <option>None</option><option>PCV previously given</option><option>PPSV23 previously given</option><option>Unknown</option>
      </select></div>
      <div className="form-field full"><label>Past Vaccination History</label><input type="text" value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)} placeholder="e.g. None" /></div>
      <div className="form-field full"><label>Allergies</label><input type="text" value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. No known allergies" /></div>
      <div className="form-field full"><label>Clinical Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Respiratory symptoms..." /></div>
      <ScheduleSummary service={service} baseDate={form.date} />
    </>
  );

  return null;
}


/* ─────────────────────────── ADD PATIENT MODAL (MULTI-STEP WIZARD) ─────────────────────────── */
function AddPatientModal({ onClose, onAdd, inventoryItems = [] }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [form, setForm] = useState({
    fname: '', mname: '', lname: '', suffix: '', email: '', age: '', sex: 'Male',
    /* Vitals & birth date — optional, blank means "not recorded" everywhere
       they are displayed rather than a zero or a guess. */
    dob: '', height: '', weight: '', bloodPressure: '',
    barangay: 'San Juan', zone: 'Zone 1', address: 'Zone 1, Brgy. San Juan, Libon, Albay',
    contact: '', service: 'PEP', vaccineBrand: '',
    /* PEP Details */
    placeOfExposure: '', typeOfExposure: 'Bite', sourceOfExposure: 'Stray animal',
    cat: 'Category I', woundWashed: 'Yes', rigGiven: 'No', vaxGiven: 'No',
    genericName: 'Purified Chick Embryo Cell Rabies Vaccine', route: 'IM',
    animal: 'Dog', date: today(), woundLocation: '', woundDepth: 'Superficial', numberOfBites: '1',
    /* History & General */
    pastVaccines: '', allergies: '', notes: '',
    /* Tetanus */
    woundType: 'Laceration', lastTetanus: 'Unknown',
    /* Pneumonia */
    pneumoVaccine: 'PCV15', riskCondition: 'None', priorPneumo: 'None',
    /* Tetanus and pneumococcal run different series for infants; the childhood
       series is scheduled from date of birth rather than the visit date. */
    ageGroup: 'adult',
  });

  const eligibleVaccines = getEligibleVaccinesForService(form.service, inventoryItems);
  const vaccineItems = eligibleVaccines.filter(i => (parseInt(i.stock) || 0) > 0);
  const [saving, setSaving] = useState(false);
  const [stepErrors, setStepErrors] = useState({ fields: [], messages: [] });
  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setStepErrors(prev => prev.fields.length ? { fields: [], messages: [] } : prev);
  };

  const isPep = form.service === 'PEP';

  // Dynamic Step List based on service selection (PEP vs Non-PEP)
  const steps = isPep ? [
    { id: 'identity', label: 'Patient Identity' },
    { id: 'services', label: 'Services' },
    { id: 'pep_details', label: 'PEP Details' },
    { id: 'history', label: 'Medical History' },
    { id: 'schedule', label: 'Vaccination Schedule' },
    { id: 'review', label: 'Review & Confirm' },
  ] : [
    { id: 'identity', label: 'Patient Identity' },
    { id: 'services', label: 'Services' },
    { id: 'history', label: 'Medical History' },
    { id: 'schedule', label: 'Vaccination Schedule' },
    { id: 'review', label: 'Review & Confirm' },
  ];

  // Safeguard index if step list contracts
  const safeStepIndex = Math.min(currentStepIndex, steps.length - 1);
  const currentStep = steps[safeStepIndex];

  // Inline "fill this up" note for the current step. Populated when Next is
  // pressed with required fields empty; cleared as soon as the nurse edits
  // anything or changes step. `fields` drives the red outline on each input.
  const hasFieldError = (k) => stepErrors.fields.includes(k);
  const errStyle = (k) => hasFieldError(k) ? { borderColor: '#C8151A', background: '#FFF5F5' } : undefined;

  const validateStep = () => {
    const fields = [];
    const messages = [];
    if (currentStep.id === 'identity') {
      if (!form.fname.trim()) { fields.push('fname'); messages.push('First Name is required'); }
      if (!form.lname.trim()) { fields.push('lname'); messages.push('Last Name is required'); }
      if (!form.age || Number(form.age) <= 0) { fields.push('age'); messages.push('A valid age is required'); }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!form.email.trim()) { fields.push('email'); messages.push('Email is required for patient app login'); }
      else if (!emailRegex.test(form.email.trim())) { fields.push('email'); messages.push('Enter a valid email address'); }
      if (form.contact && !isValidPHPhone(form.contact)) { fields.push('contact'); messages.push('Enter a valid Philippine mobile number (e.g. 0917 123 4567)'); }
    }
    if (currentStep.id === 'history') {
      const anyFilled = (form.pastVaccines || '').trim() || (form.allergies || '').trim() || (form.notes || '').trim();
      if (!anyFilled) { fields.push('pastVaccines', 'allergies', 'notes'); messages.push('Provide at least one medical history detail (past vaccination, allergy, or notes)'); }
    }
    return { fields, messages };
  };

  const handleNext = () => {
    const result = validateStep();
    if (result.messages.length > 0) {
      setStepErrors(result);
      showToast('Please complete the required fields before proceeding', 'error');
      return;
    }
    setStepErrors({ fields: [], messages: [] });
    if (safeStepIndex < steps.length - 1) {
      setCurrentStepIndex(safeStepIndex + 1);
    }
  };

  const handleBack = () => {
    setStepErrors({ fields: [], messages: [] });
    if (safeStepIndex > 0) {
      setCurrentStepIndex(safeStepIndex - 1);
    }
  };

  const jumpToStepId = (id) => {
    setStepErrors({ fields: [], messages: [] });
    const idx = steps.findIndex(s => s.id === id);
    if (idx !== -1) setCurrentStepIndex(idx);
  };

  // Review-step field: a quiet caption above a normal-weight value — only
  // the section titles stay bold, so this never competes with them.
  const ReviewField = ({ label, value, full }) => (
    <div style={full ? { gridColumn: 'span 2' } : undefined}>
      <div style={{ fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: '#94A3B8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '.8125rem', fontWeight: 500, color: '#1E293B', lineHeight: 1.4 }}>{value}</div>
    </div>
  );

  const ReviewSection = ({ title, icon, onEdit, children }) => (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.875rem', padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: '.78125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 7 }}>
          {icon}
          {title}
        </div>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', color: '#3B50DF', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
          Edit Section
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
        {children}
      </div>
    </div>
  );

  const fullDisplayName = [form.fname, form.mname, form.lname].filter(Boolean).join(' ') + (form.suffix ? `, ${form.suffix}` : '');

  return (
    <div
      className="modal-overlay"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        top: 'max(80px, var(--header-height, 80px))',
        height: 'calc(100vh - max(80px, var(--header-height, 80px)))',
        left: 'var(--sidebar-width, 256px)',
        width: 'calc(100vw - var(--sidebar-width, 256px))',
        paddingTop: '20px',
        paddingBottom: '20px',
        boxSizing: 'border-box',
        transition: 'left 0.4s cubic-bezier(0.22,1,0.36,1), width 0.4s cubic-bezier(0.22,1,0.36,1), top 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}
      onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden m-auto flex flex-col" style={{
        width: '64rem',
        maxWidth: 'min(64rem, calc(100% - 32px))',
        height: '680px',
        maxHeight: 'calc(100vh - 128px)',
        transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}>

        {/* ── Modal Top Header — same light card head as the Add Report pop-up ── */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between" style={{ flexShrink: 0 }}>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Register New Patient</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">Fill out patient registration details step-by-step</p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Persistent Step Indicator Bar ── */}
        <div style={{ padding: '16px 24px 14px', background: '#FFFFFF', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', maxWidth: '56rem', margin: '0 auto' }}>
            {/* Progress line background */}
            <div style={{ position: 'absolute', top: 16, left: 24, right: 24, height: 3, background: '#E2E8F0', zIndex: 1 }} />
            {/* Active progress line fill — green marks the path already completed */}
            <div style={{
              position: 'absolute', top: 16, left: 24,
              width: `${(safeStepIndex / (steps.length - 1)) * 100}%`,
              height: 3, background: '#3B50DF', zIndex: 1, transition: 'width .25s ease'
            }} />

            {steps.map((s, idx) => {
              const isCompleted = idx < safeStepIndex;
              const isCurrent = idx === safeStepIndex;
              return (
                <div key={s.id} onClick={() => { if (idx <= safeStepIndex) setCurrentStepIndex(idx); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2, cursor: idx <= safeStepIndex ? 'pointer' : 'default', minWidth: 70 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.8125rem', fontWeight: 800,
                    background: isCurrent ? '#3B50DF' : (isCompleted ? '#3B50DF' : '#FFFFFF'),
                    color: (isCurrent || isCompleted) ? '#FFFFFF' : '#64748B',
                    border: isCurrent ? '2.5px solid #3B50DF' : (isCompleted ? '2.5px solid #3B50DF' : '2px solid #CBD5E1'),
                    boxShadow: isCurrent ? '0 0 0 4px rgba(59, 80, 223, 0.16)' : '0 2px 4px rgba(0,0,0,0.04)',
                    transition: 'all .2s ease',
                  }}>
                    {isCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div style={{
                    fontSize: '.65rem', fontWeight: isCurrent ? 800 : 600,
                    color: isCurrent ? '#3B50DF' : (isCompleted ? '#0F172A' : '#94A3B8'),
                    marginTop: 6, textAlign: 'center', whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em'
                  }}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Active Step Body (Scrollable Content Area) ── */}
        <div style={{ flex: 1, minHeight: 0, padding: '24px 28px', overflowY: 'auto', background: '#FFFFFF' }}>

          {/* Required-fields note — shown after Next is pressed with gaps */}
          {stepErrors.messages.length > 0 && (
            <div role="alert" style={{ maxWidth: '48rem', margin: '0 auto 16px', padding: '12px 16px', background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: '.75rem', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: '#C8151A', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: '.8125rem', fontWeight: 800, color: '#991B1B' }}>Please fill up the required fields before continuing</div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.75rem', color: '#B91C1C', lineHeight: 1.6 }}>
                  {stepErrors.messages.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* STEP 1: PATIENT IDENTITY */}
          {currentStep.id === 'identity' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Patient Identity</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Enter basic personal information and address of the patient</p>
              </div>

              <div className="form-grid" style={{ gap: 14 }}>
                <div className="form-field"><label>First Name <span style={{ color: '#C8151A' }}>*</span></label>
                  <input type="text" value={form.fname} onChange={e => set('fname', e.target.value)} placeholder="e.g. Juan" style={errStyle('fname')} />
                </div>
                <div className="form-field"><label>Last Name <span style={{ color: '#C8151A' }}>*</span></label>
                  <input type="text" value={form.lname} onChange={e => set('lname', e.target.value)} placeholder="e.g. Dela Cruz" style={errStyle('lname')} />
                </div>
                <div className="form-field"><label>Middle Initial <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: '.6875rem' }}>(optional)</span></label>
                  <input type="text" value={form.mname || ''} onChange={e => set('mname', e.target.value)} placeholder="e.g. P." maxLength={5} />
                </div>
                <div className="form-field"><label>Suffix <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: '.6875rem' }}>(if any)</span></label>
                  <input type="text" value={form.suffix || ''} onChange={e => set('suffix', e.target.value)} placeholder="e.g. Jr., Sr., III" />
                </div>
                <div className="form-field"><label>Age <span style={{ color: '#C8151A' }}>*</span></label>
                  <input type="text" inputMode="numeric" value={form.age} onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 25" style={errStyle('age')} />
                </div>
                <div className="form-field"><label>Sex</label>
                  <select value={form.sex} onChange={e => set('sex', e.target.value)}><option>Male</option><option>Female</option></select>
                </div>
                <div className="form-field"><label>Date of Birth</label>
                  <input type="date" value={form.dob || ''} max={today()} onChange={e => set('dob', e.target.value)} />
                </div>
                <div className="form-field"><label>Blood Pressure</label>
                  <input type="text" value={form.bloodPressure || ''} onChange={e => set('bloodPressure', e.target.value)} placeholder="e.g. 120/80" />
                </div>
                <div className="form-field"><label>Height <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: '.6875rem' }}>(cm)</span></label>
                  <input type="text" inputMode="decimal" value={form.height || ''} onChange={e => set('height', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))} placeholder="e.g. 165" />
                </div>
                <div className="form-field"><label>Weight <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: '.6875rem' }}>(kg)</span></label>
                  <input type="text" inputMode="decimal" value={form.weight || ''} onChange={e => set('weight', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))} placeholder="e.g. 58" />
                </div>
                <div className="form-field full">
                  <label>Email Address <span style={{ color: '#C8151A' }}>*</span> <span style={{ fontWeight: 400, color: '#64748B', fontSize: '.6875rem' }}>(Required for patient mobile app login)</span></label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="patient@gmail.com" style={errStyle('email')} />
                </div>
                <div className="form-field full">
                  <label>Contact Number</label>
                  <input type="text" inputMode="numeric" value={form.contact} onChange={e => set('contact', e.target.value.replace(/[^\d+\s-]/g, ''))} placeholder="+63 9XX XXX XXXX" style={errStyle('contact')} />
                  {form.contact && !isValidPHPhone(form.contact) && (
                    <span style={{ fontSize: '.6875rem', color: '#C8151A', marginTop: 4, display: 'block' }}>Enter a valid Philippine mobile number (e.g. 0917 123 4567)</span>
                  )}
                </div>

                <div className="form-field"><label>Barangay (Libon, Albay) <span style={{ color: '#C8151A' }}>*</span></label>
                  <select value={form.barangay || 'San Juan'} onChange={e => {
                    const b = e.target.value;
                    const z = form.zone || '';
                    const fullAddr = `${z ? z + ', ' : ''}Brgy. ${b}, Libon, Albay`;
                    setForm(f => ({ ...f, barangay: b, address: fullAddr }));
                  }}>
                    {LIBON_BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-field"><label>Zone / Street / Purok</label>
                  <select value={form.zone || ''} onChange={e => {
                    const z = e.target.value;
                    const b = form.barangay || 'San Juan';
                    const fullAddr = `${z ? z + ', ' : ''}Brgy. ${b}, Libon, Albay`;
                    setForm(f => ({ ...f, zone: z, address: fullAddr }));
                  }}>
                    <option value="">— Select zone / purok —</option>
                    {ZONE_OPTIONS.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>

                <div className="form-field full" style={{ marginTop: 2 }}>
                  <label style={{ fontSize: '.71875rem', color: '#64748B', fontWeight: 600 }}>Combined Address Preview (Auto-generated):</label>
                  <input type="text" value={form.address || `Brgy. ${form.barangay || 'San Juan'}, Libon, Albay`} readOnly style={{ background: '#F1F5F9', opacity: 0.95, fontSize: '.8125rem', fontWeight: 600, color: '#334155' }} />
                </div>
              </div>

              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '.625rem', padding: '10px 14px', marginTop: 16, fontSize: '.75rem', color: '#1D4ED8', display: 'flex', gap: 8, alignItems: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span><strong>App Access Notice:</strong> The entered email will be authorized in the mobile app registry so the patient can log in immediately.</span>
              </div>
            </div>
          )}

          {/* STEP 2: SERVICES */}
          {currentStep.id === 'services' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Select Service</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Choose the medical vaccination service category for this patient</p>
              </div>

              <div style={{ marginBottom: 20 }}>
                <ServiceSelector
                  value={form.service}
                  onChange={v => {
                    setForm(f => ({
                      ...f,
                      service: v,
                      vaccineBrand: f.vaccineBrand && isVaccineForService(v, f.vaccineBrand) ? f.vaccineBrand : ''
                    }));
                  }}
                />
              </div>

              {/* Vaccine Brand Selector */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.75rem', padding: '16px 20px', marginTop: 16 }}>
                <div style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#475569', marginBottom: 8 }}>
                  Vaccine Brand Allocation <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748B' }}>(Inventory lookup)</span>
                </div>
                <select
                  value={form.vaccineBrand}
                  onChange={e => set('vaccineBrand', e.target.value)}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: '.875rem', fontWeight: 500, padding: '10px 14px', border: '1.5px solid #CBD5E1', borderRadius: '.625rem', background: '#FFFFFF', color: '#0F172A', outline: 'none' }}
                >
                  <option value="">— Select available vaccine brand from inventory —</option>
                  {vaccineItems.map(item => (
                    <option key={item.id} value={item.name}>{item.name} ({item.stock} {item.unit || 'pcs'} available)</option>
                  ))}
                </select>
                {vaccineItems.length === 0 && (
                  <div style={{ fontSize: '.71875rem', color: '#D97706', marginTop: 6, fontWeight: 500 }}>
                    Notice: No active vaccine stock found in inventory. You can specify a custom brand or add inventory stock later.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: PEP DETAILS (Only shown for PEP service) */}
          {currentStep.id === 'pep_details' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Post-Exposure Prophylaxis (PEP) Details</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Record animal bite exposure context, wound classification, and initial clinical care</p>
              </div>

              <div className="form-grid" style={{ gap: 14 }}>
                <div className="form-field"><label>Date of Exposure / First Vaccination</label>
                  <input type="date" value={form.date || today()} onChange={e => set('date', e.target.value)} />
                </div>
                <div className="form-field"><label>Place of Exposure</label>
                  <select value={form.placeOfExposure || ''} onChange={e => set('placeOfExposure', e.target.value)}>
                    <option value="">— Select place —</option>
                    {PLACE_OF_EXPOSURE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div className="form-field"><label>Type of Exposure</label>
                  <select value={form.typeOfExposure || 'Bite'} onChange={e => set('typeOfExposure', e.target.value)}>
                    <option>Bite</option><option>Scratch</option><option>Saliva Contact</option><option>Non-bite Exposure</option>
                  </select>
                </div>
                <div className="form-field"><label>Source of Exposure</label>
                  <select value={form.sourceOfExposure || 'Stray animal'} onChange={e => set('sourceOfExposure', e.target.value)}>
                    <option>Stray animal</option><option>Domestic pet</option><option>Wild animal</option><option>Unknown source</option>
                  </select>
                </div>

                <div className="form-field"><label>Exposure Category</label>
                  <select value={form.cat || 'Category I'} onChange={e => set('cat', e.target.value)}>
                    <option>Category I</option><option>Category II</option><option>Category III</option>
                  </select>
                </div>
                <div className="form-field"><label>Biting Animal</label>
                  <select value={form.animal || 'Dog'} onChange={e => set('animal', e.target.value)}>
                    <option>Dog</option><option>Cat</option><option>Monkey</option><option>Bat</option><option>Rat</option><option>Other</option>
                  </select>
                </div>

                <div className="form-field"><label>Washing of Bite Wound?</label>
                  <select value={form.woundWashed || 'Yes'} onChange={e => set('woundWashed', e.target.value)}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
                <div className="form-field"><label>RIG (Rabies Immunoglobulin) Given?</label>
                  <select value={form.rigGiven || 'No'} onChange={e => set('rigGiven', e.target.value)}>
                    <option>No</option><option>Yes (ERIG)</option><option>Yes (HRIG)</option>
                  </select>
                </div>

                <div className="form-field"><label>Anti-Rabies Vaccine Given?</label>
                  <select value={form.vaxGiven || 'Yes'} onChange={e => set('vaxGiven', e.target.value)}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
                <div className="form-field"><label>Vaccine Route</label>
                  <select value={form.route || 'IM'} onChange={e => set('route', e.target.value)}>
                    <option value="IM">Intramuscular (IM)</option>
                    <option value="ID">Intradermal (ID)</option>
                  </select>
                </div>

                <div className="form-field"><label>Wound Location</label>
                  <select value={form.woundLocation || ''} onChange={e => set('woundLocation', e.target.value)}>
                    <option value="">— Select location —</option>
                    {WOUND_LOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-field"><label>Wound Depth</label>
                  <select value={form.woundDepth || 'Superficial'} onChange={e => set('woundDepth', e.target.value)}>
                    <option>Superficial</option><option>Deep / Penetrating</option><option>Multiple</option><option>Unknown</option>
                  </select>
                </div>
                <div className="form-field"><label>No. of Bites / Wounds</label>
                  <select value={form.numberOfBites || '1'} onChange={e => set('numberOfBites', e.target.value)}>
                    <option>1</option><option>2</option><option>3</option><option>4+</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 (OR STEP 3 NON-PEP): VACCINATION SCHEDULE */}
          {currentStep.id === 'schedule' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Vaccination Schedule</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Auto-calculated dose regimen based on initial dose date</p>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.75rem', padding: '16px 20px', marginBottom: 20 }}>
                <div className="form-field" style={{ maxWidth: '24rem' }}>
                  <label style={{ fontSize: '.78125rem', fontWeight: 700, color: '#334155' }}>Initial Dose / Exposure Date (D0):</label>
                  <input type="date" value={form.date || today()} onChange={e => set('date', e.target.value)} style={{ padding: '8px 12px' }} />
                </div>
              </div>

              <ScheduleSummary service={form.service} baseDate={form.date || today()} />
            </div>
          )}

          {/* STEP 5 (OR STEP 4 NON-PEP): MEDICAL HISTORY */}
          {currentStep.id === 'history' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Medical History & Clinical Notes</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Record prior vaccinations, known allergies, and clinical observations</p>
              </div>

              <div className="form-grid" style={{ gap: 14 }}>
                <div className="form-field full"><label>Past Vaccination History</label>
                  <select value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)} style={errStyle('pastVaccines')}>
                    <option value="">— Select history —</option>
                    {PAST_VACCINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-field full"><label>Allergies</label>
                  <select value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} style={errStyle('allergies')}>
                    <option value="">— Select allergy —</option>
                    {ALLERGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                {/* Additional Non-PEP Specific Fields */}
                {form.service === 'Tetanus' && (
                  <>
                    <div className="form-field"><label>Wound / Injury Type</label>
                      <select value={form.woundType || 'Laceration'} onChange={e => set('woundType', e.target.value)}>
                        <option>Laceration</option><option>Puncture</option><option>Abrasion</option><option>Burn</option><option>Crush injury</option><option>Other</option>
                      </select>
                    </div>
                    <div className="form-field"><label>Last Tetanus Shot</label>
                      <select value={form.lastTetanus || 'Unknown'} onChange={e => set('lastTetanus', e.target.value)}>
                        <option>Unknown</option><option>Less than 5 years ago</option><option>5–10 years ago</option><option>More than 10 years ago</option><option>Never vaccinated</option>
                      </select>
                    </div>
                  </>
                )}

                {form.service === 'Pneumonia' && (
                  <>
                    <div className="form-field"><label>Vaccine Variant</label>
                      <select value={form.pneumoVaccine || 'PCV15'} onChange={e => set('pneumoVaccine', e.target.value)}>
                        <option>PCV13 (Prevnar 13)</option><option>PCV15 (Vaxneuvance)</option><option>PCV20 (Prevnar 20)</option><option>PPSV23 (Pneumovax)</option>
                      </select>
                    </div>
                    <div className="form-field"><label>High-Risk Condition</label>
                      <select value={form.riskCondition || 'None'} onChange={e => set('riskCondition', e.target.value)}>
                        <option>None</option><option>Asthma / COPD</option><option>Diabetes</option><option>Heart disease</option><option>Immunocompromised</option><option>Chronic kidney disease</option><option>Smoker</option><option>Age ≥ 65</option><option>Other</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="form-field full"><label>Clinical Notes</label>
                  <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Add any relevant observations, lab results, or clinical assessment notes..." rows={3} />
                </div>
              </div>
            </div>
          )}

          {/* FINAL STEP: REVIEW & CONFIRM */}
          {currentStep.id === 'review' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Review & Confirm Registration</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Please review all entered information carefully before creating the patient record</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <ReviewSection title="Patient Identity" onEdit={() => jumpToStepId('identity')}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}>
                  <ReviewField label="Full Name" value={fullDisplayName} />
                  <ReviewField label="Age / Sex" value={`${form.age} y/o (${form.sex})`} />
                  <ReviewField label="Email" value={form.email} />
                  <ReviewField label="Contact" value={form.contact || 'None'} />
                  <ReviewField label="Address" value={form.address} full />
                </ReviewSection>

                <ReviewSection title="Service Category & Vaccine Brand" onEdit={() => jumpToStepId('services')}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}>
                  <ReviewField label="Selected Service" value={form.service} />
                  <ReviewField label="Vaccine Brand" value={form.vaccineBrand || 'Not specified'} />
                </ReviewSection>

                {isPep && (
                  <ReviewSection title="Exposure & PEP Details" onEdit={() => jumpToStepId('pep_details')}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}>
                    <ReviewField label="Date of Exposure" value={form.date || today()} />
                    <ReviewField label="Place of Exposure" value={form.placeOfExposure || 'Not stated'} />
                    <ReviewField label="Exposure Category" value={form.cat} />
                    <ReviewField label="Biting Animal" value={form.animal} />
                    <ReviewField label="Wound Location / Depth" value={`${form.woundLocation || 'N/A'} (${form.woundDepth})`} />
                    <ReviewField label="No. of Bites" value={form.numberOfBites} />
                    <ReviewField label="Wound Washed?" value={form.woundWashed} />
                    <ReviewField label="RIG Given?" value={form.rigGiven} />
                    <ReviewField label="Vaccine Route" value={form.route || 'IM'} />
                  </ReviewSection>
                )}

                <ReviewSection title="Medical History & Notes" onEdit={() => jumpToStepId('history')}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}>
                  <ReviewField label="Past Vaccines" value={form.pastVaccines || 'None stated'} />
                  <ReviewField label="Allergies" value={form.allergies || 'None stated'} />
                  <ReviewField label="Clinical Notes" value={form.notes || 'None'} full />
                </ReviewSection>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.875rem', padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '.78125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      Calculated Schedule
                    </div>
                    <button type="button" onClick={() => jumpToStepId('schedule')} style={{ background: 'none', border: 'none', color: '#3B50DF', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                      Edit Section
                    </button>
                  </div>
                  <ScheduleSummary service={form.service} baseDate={form.date || today()} />
                </div>

              </div>
            </div>
          )}

        </div>

        {/* ── Sticky Wizard Navigation Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3" style={{ flexShrink: 0 }}>
          <button
            type="button"
            onClick={safeStepIndex === 0 ? onClose : handleBack}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-50 transition-colors"
          >
            {safeStepIndex === 0 ? 'Cancel' : '← Back'}
          </button>

          {currentStep.id !== 'review' ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-xl bg-[#3B50DF] text-white text-xs font-bold cursor-pointer hover:bg-indigo-700 shadow-xs transition-colors"
            >
              Next Step →
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => onAdd(form, setSaving)}
              className="px-6 py-2.5 rounded-xl bg-[#3B50DF] text-white text-xs font-bold cursor-pointer hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving Patient Record…' : 'Confirm & Register Patient'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

/* ─────────────────────────── EDIT PATIENT MODAL ─────────────────────────── */
function EditPatientModal({ patient, onClose, onSave, inventoryItems = [] }) {
  const [form, setForm] = useState({
    name: patient.name || '', email: patient.email || '', age: patient.age || '', sex: patient.sex || 'Male',
    dob: patient.dob || '', height: patient.height || '', weight: patient.weight || '', bloodPressure: patient.bloodPressure || '',
    address: patient.address || '', contact: patient.contact || '',
    service: patient.service || 'PEP', vaccineBrand: patient.vaccineBrand || '',
    animal: patient.animal || 'Dog', cat: patient.cat ? `Category ${patient.cat}` : 'Category I',
    date: patient.date || today(),
    woundLocation: patient.woundLocation || '', woundDepth: patient.woundDepth || 'Superficial', numberOfBites: patient.numberOfBites || '1',
    pastVaccines: patient.pastVaccines || '', allergies: patient.allergies || '', notes: patient.notes || '',
    woundType: patient.woundType || 'Laceration', lastTetanus: patient.lastTetanus || 'Unknown',
    pneumoVaccine: patient.pneumoVaccine || 'PCV15', riskCondition: patient.riskCondition || 'None', priorPneumo: patient.priorPneumo || 'None',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isPep = form.service === 'PEP';
  const eligibleVaccines = getEligibleVaccinesForService(form.service, inventoryItems);
  const vaccineItems = eligibleVaccines.filter(i => (parseInt(i.stock) || 0) > 0);
  if (form.vaccineBrand && !vaccineItems.some(item => item.name === form.vaccineBrand)) {
    vaccineItems.unshift({ id: 'current_assigned', name: form.vaccineBrand, stock: '?' });
  }

  // handleEditSave (parent) validates, persists, and closes this modal itself —
  // no local saving/loading state to juggle here.
  function handleSave() {
    if (!form.name.trim()) return;
    onSave(form);
  }

  return (
    <div
      className="admin-modal-overlay fixed z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        top: 'max(80px, var(--header-height, 80px))',
        height: 'calc(100vh - max(80px, var(--header-height, 80px)))',
        left: 'var(--sidebar-width, 256px)',
        width: 'calc(100vw - var(--sidebar-width, 256px))',
        paddingTop: '20px',
        paddingBottom: '20px',
        boxSizing: 'border-box',
        transition: 'left 0.4s cubic-bezier(0.22,1,0.36,1), width 0.4s cubic-bezier(0.22,1,0.36,1), top 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 m-auto flex flex-col"
        style={{
          width: '70rem',
          maxWidth: 'min(70rem, calc(100% - 32px))',
          maxHeight: 'calc(100vh - 128px)',
          transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Light Clean Header Bar (Matching Add Report Style) */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Edit Patient Record</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">{formatTitleCase(patient.name)} · ID: {patient.mrn || patient.id || 'N/A'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Landscape Form Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs font-semibold text-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            {/* LEFT COLUMN: Patient Identity */}
            <div className="space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a1d47] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                  Patient Identity
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Personal details & contact</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block mb-1.5 text-slate-500">Full Name <span style={{ color: '#C8151A' }}>*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Juan Dela Cruz"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Age <span style={{ color: '#C8151A' }}>*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.age}
                    onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="e.g. 25"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Sex</label>
                  <select
                    value={form.sex}
                    onChange={e => set('sex', e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  >
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Date of Birth</label>
                  <input
                    type="date"
                    value={form.dob || ''}
                    max={today()}
                    onChange={e => set('dob', e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Blood Pressure</label>
                  <input
                    type="text"
                    value={form.bloodPressure || ''}
                    onChange={e => set('bloodPressure', e.target.value)}
                    placeholder="e.g. 120/80"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Height (cm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.height || ''}
                    onChange={e => set('height', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
                    placeholder="e.g. 165"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Weight (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.weight || ''}
                    onChange={e => set('weight', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
                    placeholder="e.g. 58"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block mb-1.5 text-slate-500">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="patient@gmail.com"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Contact Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.contact}
                    onChange={e => set('contact', e.target.value.replace(/[^\d+\s-]/g, ''))}
                    placeholder="+63 9XX XXX XXXX"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                  {form.contact && !isValidPHPhone(form.contact) && (
                    <span style={{ fontSize: '.6875rem', color: '#C8151A', marginTop: 4, display: 'block' }}>Enter a valid Philippine mobile number</span>
                  )}
                </div>
                <div>
                  <label className="block mb-1.5 text-slate-500">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                    placeholder="Zone, Brgy., Libon, Albay"
                    className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Service, Exposure & Medical History */}
            <div className="space-y-4">
              {/* Service & Vaccine Brand */}
              <div className="space-y-3 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a1d47] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                    Service & Vaccine Brand
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1.5 text-slate-500">Service</label>
                    <select
                      value={form.service}
                      onChange={e => {
                        const newSvc = e.target.value;
                        setForm(f => ({
                          ...f,
                          service: newSvc,
                          vaccineBrand: f.vaccineBrand && isVaccineForService(newSvc, f.vaccineBrand) ? f.vaccineBrand : ''
                        }));
                      }}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option>PEP</option>
                      <option>PrEP</option>
                      <option>Tetanus</option>
                      <option>Pneumonia</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-slate-500">Vaccine Brand</label>
                    <select
                      value={form.vaccineBrand}
                      onChange={e => set('vaccineBrand', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">— Select brand —</option>
                      {vaccineItems.map(item => (
                        <option key={item.id} value={item.name}>{item.name} ({item.stock} {item.unit || 'pcs'} available)</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* PrEP Information Notice */}
                {form.service === 'PrEP' && (
                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 text-xs text-indigo-900 mt-2">
                    <p className="font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#3B50DF]" />
                      Pre-Exposure Prophylaxis (PrEP)
                    </p>
                    <p className="mt-1 text-slate-600 font-normal leading-relaxed">
                      Preventive rabies immunization schedule before exposure (2 doses: Days 0 and 7). No animal bite exposure details required.
                    </p>
                  </div>
                )}

                {/* PEP Exposure Details */}
                {isPep && (
                  <div className="pt-2 border-t border-slate-200/70 space-y-3">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Exposure Details</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1.5 text-slate-500">Date of Exposure</label>
                        <input
                          type="date"
                          value={form.date}
                          onChange={e => set('date', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Biting Animal</label>
                        <select
                          value={form.animal}
                          onChange={e => set('animal', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>Dog</option><option>Cat</option><option>Monkey</option><option>Bat</option><option>Rat</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Exposure Category</label>
                        <select
                          value={form.cat}
                          onChange={e => set('cat', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>Category I</option><option>Category II</option><option>Category III</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">No. of Bites / Wounds</label>
                        <select
                          value={form.numberOfBites}
                          onChange={e => set('numberOfBites', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>1</option><option>2</option><option>3</option><option>4+</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Wound Location</label>
                        <select
                          value={form.woundLocation || ''}
                          onChange={e => set('woundLocation', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option value="">— Select location —</option>
                          {WOUND_LOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Wound Depth</label>
                        <select
                          value={form.woundDepth}
                          onChange={e => set('woundDepth', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>Superficial</option><option>Deep / Penetrating</option><option>Multiple</option><option>Unknown</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Medical History & Notes */}
              <div className="space-y-3 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a1d47] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                    Medical History & Clinical Notes
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1.5 text-slate-500">Past Vaccination History</label>
                    <select
                      value={form.pastVaccines || ''}
                      onChange={e => set('pastVaccines', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">— Select history —</option>
                      {PAST_VACCINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-slate-500">Allergies</label>
                    <select
                      value={form.allergies || ''}
                      onChange={e => set('allergies', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option value="">— Select allergy —</option>
                      {ALLERGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  {form.service === 'Tetanus' && (
                    <>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Wound / Injury Type</label>
                        <select
                          value={form.woundType}
                          onChange={e => set('woundType', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>Laceration</option><option>Puncture</option><option>Abrasion</option><option>Burn</option><option>Crush injury</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Last Tetanus Shot</label>
                        <select
                          value={form.lastTetanus}
                          onChange={e => set('lastTetanus', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>Unknown</option><option>Less than 5 years ago</option><option>5–10 years ago</option><option>More than 10 years ago</option><option>Never vaccinated</option>
                        </select>
                      </div>
                    </>
                  )}

                  {form.service === 'Pneumonia' && (
                    <>
                      <div>
                        <label className="block mb-1.5 text-slate-500">Vaccine Variant</label>
                        <select
                          value={form.pneumoVaccine}
                          onChange={e => set('pneumoVaccine', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>PCV13 (Prevnar 13)</option><option>PCV15 (Vaxneuvance)</option><option>PCV20 (Prevnar 20)</option><option>PPSV23 (Pneumovax)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1.5 text-slate-500">High-Risk Condition</label>
                        <select
                          value={form.riskCondition}
                          onChange={e => set('riskCondition', e.target.value)}
                          className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                        >
                          <option>None</option><option>Asthma / COPD</option><option>Diabetes</option><option>Heart disease</option><option>Immunocompromised</option><option>Chronic kidney disease</option><option>Smoker</option><option>Age ≥ 65</option><option>Other</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <label className="block mb-1.5 text-slate-500">Clinical Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Add any relevant observations, lab results, or clinical assessment notes..."
                      rows={2}
                      className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800 resize-y"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 bg-white cursor-pointer hover:bg-slate-100 transition-colors shadow-2xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-[#3B50DF] hover:bg-[#2F40B5] text-white cursor-pointer shadow-xs transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── PIN MAP CONFIRM MODAL (LANDSCAPE) ─────────────────────────── */
// ── Duplicate-patient detection for the Add Patient wizard ──────────────
// Compares the form against every loaded record and returns the likely
// matches, strongest first. Email is already enforced unique elsewhere; this
// catches the same person re-registered under a new email or a typo'd name.
const _normName = (v) => (v || '').toLowerCase().replace(/[^a-z]/g, '');
const _digits = (v) => (v || '').replace(/\D/g, '').slice(-10); // PH mobile: last 10 digits
function _levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
function findSimilarPatients(form, patients) {
  const fname = _normName(form.fname);
  const lname = _normName(form.lname);
  const full = fname + lname;
  const contact = _digits(form.contact);
  const dob = (form.dob || '').trim();
  const age = String(form.age || '').trim();
  if (!full) return [];

  const out = [];
  for (const p of patients) {
    const pFull = _normName(p.name);
    const pParts = (p.name || '').split(/[\s,]+/).filter(Boolean);
    const pFirst = _normName(pParts[0]);
    const pLast = _normName(pParts.filter(w => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).slice(-1)[0]);
    const pContact = _digits(p.contact);
    const pDob = (p.dob || '').trim();
    const pAge = String(p.age || '').trim();

    const reasons = [];
    const nameExact = pFirst === fname && pLast === lname;
    const nameClose = !nameExact && fname && lname && _levenshtein(pFirst + pLast, full) <= 2;
    const nameContained = !nameExact && !nameClose && (pFull.includes(full) || full.includes(pFull)) && Math.min(pFull.length, full.length) >= 6;
    if (nameExact) reasons.push('Same name');
    else if (nameClose) reasons.push('Very similar name');
    else if (nameContained) reasons.push('Similar name');
    if (contact && pContact && contact === pContact) reasons.push('Same contact number');
    if (dob && pDob && dob === pDob) reasons.push('Same date of birth');
    else if (age && pAge && age === pAge && (nameExact || nameClose)) reasons.push('Same age');

    // A contact match alone is worth showing; a name match needs no extra.
    if (!reasons.length) continue;
    const strength = (nameExact ? 3 : nameClose ? 2 : nameContained ? 1 : 0) + (reasons.length - 1) * 2;
    out.push({ patient: p, reasons, strength, exact: nameExact && reasons.length >= 2 });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

function DuplicatePatientModal({ form, matches, onProceed, onCancel }) {
  if (!matches?.length) return null;
  const hasExact = matches.some(m => m.exact);
  const newName = [form.fname, form.mname, form.lname].filter(Boolean).map(formatTitleCase).join(' ');
  return createPortal(
    <div className="admin-modal-overlay fixed z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: '#FFFFFF', borderRadius: '1.25rem', width: '40rem', maxWidth: '95vw', boxShadow: '0 24px 64px rgba(26,34,64,.22)', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <div style={{ padding: '16px 24px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#FEF3C7', border: '1px solid #FDE68A', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                {hasExact ? 'Possible Duplicate Patient' : 'Similar Patient Found'}
              </h3>
              <p style={{ fontSize: '.71875rem', color: '#92400E', margin: 0 }}>
                {matches.length === 1 ? 'A record' : `${matches.length} records`} already on file {matches.length === 1 ? 'looks' : 'look'} like <strong>{newName}</strong>. Check before registering again.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} title="Close" aria-label="Close"><X size={16} strokeWidth={2.2} /></button>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '55vh', overflowY: 'auto' }}>
          {matches.map(({ patient: p, reasons, exact }) => (
            <div key={p.id} style={{ border: `1px solid ${exact ? '#FCA5A5' : '#E2E8F0'}`, background: exact ? '#FEF2F2' : '#F8FAFC', borderRadius: '.75rem', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#0F172A' }}>{formatTitleCase(p.name)} <span style={{ fontWeight: 600, color: '#64748B', fontSize: '.75rem' }}>· MRN {p.id || p.mrn || '—'}</span></div>
                <div style={{ fontSize: '.75rem', color: '#475569', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                  <span>{p.age ? `${p.age} yrs` : 'Age —'} · {p.sex || '—'}</span>
                  <span>{p.contact || 'No contact'}</span>
                  <span>{p.email || 'No email'}</span>
                  {p.address && <span>{p.address}</span>}
                  <span>{p.service || 'PEP'} · registered {p.date || '—'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                {reasons.map(r => (
                  <span key={r} style={{ fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', padding: '3px 8px', borderRadius: 999, background: exact ? '#FEE2E2' : '#E0E7FF', color: exact ? '#991B1B' : '#3730A3', whiteSpace: 'nowrap' }}>{r}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>Go Back & Review</button>
          <button
            type="button"
            onClick={onProceed}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer transition-colors"
            style={{ background: hasExact ? '#DC2626' : '#3B50DF' }}
          >
            {hasExact ? 'Register Anyway (New Person)' : 'Register as New Patient'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PinMapConfirmModal({ patient, saving, onConfirm, onCancel }) {
  if (!patient) return null;
  const fullName = formatTitleCase(patient.name);
  const barangayVal = patient.barangay || (patient.address ? (patient.address.match(/Brgy\.\s*([^,]+)/)?.[1] || 'San Juan') : 'San Juan');
  const zoneVal = patient.zone || (patient.address ? patient.address.split(',')[0].replace(/Brgy\..*/, '').trim() : 'Zone 1');
  const locationStr = `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon, Albay`;
  const exposureTypeVal = patient.service === 'PEP' ? `${patient.animal || 'Dog'} Bite` : (patient.service || 'Bite Incident');

  return createPortal(
    <div className="admin-modal-overlay fixed z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '1.25rem',
        width: '52rem',
        maxWidth: '95vw',
        boxShadow: '0 24px 64px rgba(26,34,64,.22)',
        overflow: 'hidden',
        border: '1px solid #E2E8F0',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>Pin Incident to Community Map</h3>
              <p style={{ fontSize: '.71875rem', color: '#64748B', margin: 0 }}>Publish anonymized bite/exposure incident to public health map</p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} title="Close" aria-label="Close">
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Content Body — Landscape Side-by-Side Grid */}
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left Column: Location & Exposure Details */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.75rem', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#475569' }}>
              Incident Location Details
            </div>
            <div>
              <div style={{ fontSize: '.71875rem', color: '#64748B' }}>Barangay & Zone:</div>
              <div style={{ fontSize: '.875rem', fontWeight: 500, color: '#0F172A', marginTop: 2 }}>{locationStr}</div>
            </div>
            <div>
              <div style={{ fontSize: '.71875rem', color: '#64748B' }}>Incident Type:</div>
              <div style={{ fontSize: '.875rem', fontWeight: 500, color: '#0F172A', marginTop: 2 }}>{exposureTypeVal} (Category {patient.cat || 'I'})</div>
            </div>
            <div>
              <div style={{ fontSize: '.71875rem', color: '#64748B' }}>Exposure Date:</div>
              <div style={{ fontSize: '.84375rem', fontWeight: 600, color: '#334155', marginTop: 2 }}>{patient.date || 'Today'}</div>
            </div>
          </div>

          {/* Right Column: Privacy Protection Notice */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.75rem', padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Strict Patient Anonymization
              </div>
              <p style={{ fontSize: '.8125rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                This action pins the exposure coordinates to the public Rabies Incident Heatmap. <strong>No personal identifiers (Name: {fullName}, MRN: {patient.id}, Contact, or Address)</strong> will ever be shared or visible.
              </p>
            </div>
            <div style={{ fontSize: '.71875rem', color: '#059669', fontWeight: 600, marginTop: 12 }}>
              ✓ Fully compliant with Health Privacy Guidelines
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', background: '#FAFAFA', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-outline" onClick={onCancel} style={{ fontWeight: 600 }}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={onConfirm}
            style={{
              background: '#3B50DF', color: '#FFFFFF', fontWeight: 700, padding: '10px 24px',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 2px 8px rgba(59,80,223,0.25)', opacity: saving ? 0.75 : 1,
            }}
          >
            {saving ? 'Pinning Incident…' : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                Confirm & Pin to Map
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


/* ─────────────────────────── VACCINE MODAL ─────────────────────────── */
function VaccineModal({ patientName, patientId, onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [vType, setVType] = useState('');
  const [vLabel, setVLabel] = useState('');
  const [customName, setCustomName] = useState('');
  const [customCount, setCustomCount] = useState(5);
  const [doseRows, setDoseRows] = useState([]);
  const [toast, setToast] = useState({ msg: '', type: '' });

  function showT(msg, type = '') { setToast({ msg, type }); setTimeout(() => setToast({ msg: '', type: '' }), 2800); }

  function buildRows(type, cName, cCount) {
    const labels = type === 'CUSTOM'
      ? Array.from({ length: cCount || 1 }, (_, i) => `Dose ${i + 1}`)
      : (VACCINE_PRESETS[type]?.doses || []);
    setDoseRows(labels.map(n => ({ n, date: today(), s: 'pending' })));
  }

  function selectType(t) {
    setVType(t);
    if (t !== 'CUSTOM') { setVLabel(VACCINE_PRESETS[t].label); buildRows(t); }
  }

  function stepNext() {
    if (step === 1) {
      if (!vType) { showT('Please select a vaccine type', 'error'); return; }
      if (vType === 'CUSTOM') {
        if (!customName.trim()) { showT('Please enter a vaccine name', 'error'); return; }
        setVLabel(customName.trim());
        buildRows('CUSTOM', customName, customCount);
      }
      setStep(2);
    } else if (step === 2) {
      if (doseRows.some(d => !d.date)) { showT('Please fill in all dose dates', 'error'); return; }
      setStep(3);
    }
  }

  function updateRow(i, key, val) {
    setDoseRows(rows => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  }

  function save() {
    onSave(doseRows.map(d => ({ n: d.n, date: d.date, s: d.s })));
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal" style={{ width: '560px' }}>
        <div className="modal-head">
          <h2>Add Vaccination Record</h2>
          <button type="button" className="modal-close" onClick={onClose} title="Close" aria-label="Close">
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {step === 1 && (
          <div>
            <p style={{ fontSize: '.8125rem', color: 'var(--muted)', marginBottom: 14 }}>Select vaccine type for <strong>{patientName}</strong></p>
            <div className="vaccine-types">
              {[
                ['ARV', 'ARV', 'Anti-Rabies Vaccine · 5 doses', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>],
                ['ERIG', 'ERIG', 'Equine Rabies Immunoglobulin · 1 dose', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>],
                ['TT', 'Tetanus Toxoid', 'Anti-Tetanus · 2 doses', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>],
                ['CUSTOM', 'Custom / Other', 'Enter doses manually', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>],
              ].map(([t, name, desc, icon]) => (
                <button key={t} className={`vaccine-type-btn${vType === t ? ' selected' : ''}`} onClick={() => selectType(t)}>
                  <div className="vt-icon">{icon}</div>
                  <div className="vt-name">{name}</div>
                  <div className="vt-desc">{desc}</div>
                </button>
              ))}
            </div>
            {vType === 'CUSTOM' && (
              <>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Vaccine / Treatment Name</label>
                  <input type="text" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g. Wound Irrigation, HRIG…" />
                </div>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Number of Doses</label>
                  <select value={customCount} onChange={e => { const v = parseInt(e.target.value); setCustomCount(v); buildRows('CUSTOM', customName, v); }}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} dose{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={{ fontSize: '.8125rem', color: 'var(--muted)', marginBottom: 14 }}>Set the scheduled date and initial status for each dose.</p>
            <div className="dose-schedule">
              {doseRows.map((d, i) => (
                <div key={i} className="dose-schedule-row">
                  <div className="dose-index">{i + 1}</div>
                  <div style={{ fontSize: '.78125rem', fontWeight: 700 }}>{d.n}</div>
                  <input type="date" value={d.date} onChange={e => updateRow(i, 'date', e.target.value)} />
                  <select value={d.s} onChange={e => updateRow(i, 's', e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="done">Done</option>
                    <option value="miss">Missed</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p style={{ fontSize: '.8125rem', color: 'var(--muted)', marginBottom: 14 }}>Review the vaccination record before saving.</p>
            <div className="summary-block">
              <div className="summary-row"><span className="s-key">Patient No.</span><span className="s-val">{patientId || '—'}</span></div>
            </div>
            <div className="summary-block">
              <h4>Vaccine Details</h4>
              <div className="summary-row"><span className="s-key">Type</span><span className="s-val">{vLabel}</span></div>
              <div className="summary-row"><span className="s-key">Total Doses</span><span className="s-val">{doseRows.length} dose{doseRows.length !== 1 ? 's' : ''}</span></div>
            </div>
            <div className="summary-block">
              <h4>Dose Schedule</h4>
              {doseRows.map((d, i) => (
                <div key={i} className="summary-row">
                  <span className="s-key">{d.n}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{d.date}</span>
                    <span className={`badge ${doseBadgeClass[d.s]}`}>{d.s.charAt(0).toUpperCase() + d.s.slice(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-footer">
          {step > 1 && <button className="btn btn-outline" onClick={() => setStep(s => s - 1)}>← Back</button>}
          <button className="btn btn-outline" onClick={onClose} style={{ marginRight: 'auto' }}>Cancel</button>
          {step < 3 && <button className="btn btn-primary" onClick={stepNext}>Next →</button>}
          {step === 3 && <button className="btn btn-primary" onClick={save}>Save Record</button>}
        </div>
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
      </div>
    </div>
  );
}

/* ─────────────────────────── MEDICAL RECORD DETAIL (DOC-CENTER LAYOUT + DOSE SCHEDULE) ─────────────────────────── */
function MedicalRecordDetail({ patient, records, patients, onBack, onToast, onEdit, onPinMap, isArchiveView = false }) {
  const [patientApts, setPatientApts] = useState([]);
  const [aptsLoading, setAptsLoading] = useState(true);
  const [aptTab, setAptTab] = useState('all'); // 'all' | 'upcoming' | 'completed'
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Profile photo lives on patientAvatars/{mrn} (set from the patient app), fetched
  // only here so list views never pull image data.
  const [avatarDataUrl, setAvatarDataUrl] = useState(null);
  useEffect(() => {
    const mrn = patient?.id || patient?.mrn;
    setAvatarDataUrl(null);
    if (!db || !mrn) return;
    let cancelled = false;
    getDoc(doc(db, 'patientAvatars', mrn))
      .then(snap => { if (!cancelled && snap.exists()) setAvatarDataUrl(snap.data()?.dataUrl || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [patient?.id, patient?.mrn]);

  const r = records.find(x => x.firestoreId === patient.firestoreId || x.name === patient.name);
  const rec = r || { doses: [], reports: [], address: '—', date: patient.date, id: patient.id, age: patient.age, animal: patient.animal, cat: patient.cat };
  const reportsList = r?.reports || patient.reports || [];

  // Sync patient appointments real-time from Firestore /appointments
  useEffect(() => {
    if (!db) { setAptsLoading(false); return; }
    try {
      const q = query(collection(db, 'appointments'), limit(100));
      const unsub = onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pEmail = (patient.email || '').toLowerCase().trim();
        const pName = (patient.name || '').toLowerCase().trim();
        const pMrn = (patient.id || '').toLowerCase().trim();
        const pId = (patient.firestoreId || '').toLowerCase().trim();

        const filtered = list.filter(a => {
          const aEmail = (a.email || '').toLowerCase().trim();
          const aName = (a.name || a.patient || '').toLowerCase().trim();
          const aMrn = (a.mrn || a.patientId || '').toLowerCase().trim();
          return (pEmail && aEmail && aEmail === pEmail) ||
                 (pName && aName && aName === pName) ||
                 (pMrn && aMrn && aMrn === pMrn) ||
                 (pId && aMrn && aMrn === pId);
        });
        setPatientApts(filtered);
        setAptsLoading(false);
      }, (err) => {
        console.error('Error fetching patient appointments:', err);
        setAptsLoading(false);
      });
      return () => unsub();
    } catch (e) {
      console.error(e);
      setAptsLoading(false);
    }
  }, [patient]);

  // Save new clinical report with BP, Vitals & Nurse Notes to Firestore
  async function handleSaveReport(newReport) {
    if (!patient.firestoreId) {
      onToast('Cannot save report — patient has no Firestore ID', 'error');
      return;
    }
    try {
      const updatedReports = [newReport, ...reportsList];
      await updateDoc(doc(db, 'vaccinations', patient.firestoreId), { reports: updatedReports });
      onToast('Clinical report saved successfully', 'success');
      setShowAddReportModal(false);
    } catch (err) {
      console.error('handleSaveReport error:', err);
      onToast('Failed to save clinical report', 'error');
    }
  }

  // Delete clinical report
  async function handleDeleteReport(reportId) {
    if (!patient.firestoreId) return;
    try {
      const updatedReports = reportsList.filter(rep => rep.id !== reportId);
      await updateDoc(doc(db, 'vaccinations', patient.firestoreId), { reports: updatedReports });
      onToast('Report deleted', 'success');
    } catch (err) {
      console.error(err);
      onToast('Failed to delete report', 'error');
    }
  }

  const [archiving, setArchiving] = useState(false);
  async function handleArchiveRecord() {
    if (!patient.firestoreId) return;
    setArchiving(true);
    try {
      const expYear = (new Date().getFullYear()) + 10;
      await updateDoc(doc(db, 'vaccinations', patient.firestoreId), {
        status: 'completed',
        isArchived: true,
        archivedAt: serverTimestamp(),
        retentionExpiryYear: expYear,
      });
      onToast('Patient moved to Archive ✓', 'success');
    } catch (err) {
      console.error('Archive error:', err);
      onToast('Failed to archive record.', 'error');
    } finally {
      setArchiving(false);
    }
  }

  const liveStatus = derivePatientStatus(rec);
  const isCompletedOrArchived = liveStatus === 'completed' || patient.isArchived;

  const filteredApts = patientApts.filter(a => {
    const st = (a.status || '').toLowerCase();
    if (aptTab === 'upcoming') return st !== 'completed' && st !== 'done';
    if (aptTab === 'completed') return st === 'completed' || st === 'done';
    return true;
  });

  const patientPhoto = avatarDataUrl || patient.photoUrl || patient.avatarUrl || patient.profileImage || patient.imageUrl || patient.photo || patient.image || rec.photoUrl || rec.avatarUrl;

  return (
    <div style={{ padding: '20px 24px 36px', maxWidth: '1600px', margin: '0 auto' }}>

      {/* ── TOP ACTION BAR (BACK BUTTON | EXPORT & EDIT BUTTONS) ── */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <button
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 hover:text-[#3B50DF] hover:border-indigo-200 shadow-2xs transition-all cursor-pointer flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Patients List
        </button>

        <div className="flex items-center gap-3">
          {!isArchiveView && !patient.isArchived && isCompletedOrArchived && (
            <button
              onClick={handleArchiveRecord}
              disabled={archiving}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50"
              title="Archive Patient Record"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              Archive
            </button>
          )}

          {isRabiesOrBiteIncident(patient) && (
            <button
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#0F172A] bg-white border border-slate-300 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer flex items-center gap-2"
              onClick={() => onPinMap?.(patient)}
              title="Pin Incident Map"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              Pin Incident Map
            </button>
          )}

          <button
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#0F172A] bg-white border border-slate-300 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer flex items-center gap-2"
            onClick={() => setShowExportModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M22 6l-10 7L2 6" /></svg>
            Export Patient Record
          </button>
          <button
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#3B50DF] hover:bg-indigo-700 shadow-xs transition-all cursor-pointer flex items-center gap-2"
            onClick={() => onEdit?.(r || patient)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            Edit Record
          </button>
        </div>
      </div>

      {/* ── TOP ROW: COMBINED PROFILE, GENERAL INFO & MEDICAL HISTORY CARD WITH DIVIDERS ── */}
      <div className="w-full bg-white rounded-3xl p-6 border border-slate-200/80 ring-1 ring-slate-900/5 shadow-xs hover:shadow-sm transition-all mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch divide-y lg:divide-y-0 lg:divide-x divide-slate-100 h-full">

          {/* Profile Side (3 cols) */}
          <div className="lg:col-span-3 pr-0 lg:pr-6 flex flex-col justify-between items-center text-center">
            <div className="w-full flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center shadow-xs overflow-hidden shrink-0 mb-3 relative">
                {patientPhoto ? (
                  <img
                    src={patientPhoto}
                    alt={patient.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-xl font-extrabold text-[#0A1D47] tracking-tight">{getInitials(patient.name || '?')}</span>
                )}
              </div>

              <h2 className="text-base font-extrabold text-slate-900 leading-tight">{patient.name}</h2>
              <p className="text-xs text-slate-400 font-medium mt-1 truncate max-w-full">{patient.email || 'No email registered'}</p>

              <div className="grid grid-cols-2 gap-3 w-full mt-4 pt-3 border-t border-slate-100">
                <div className="bg-slate-50/80 rounded-xl p-2 text-center border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Appointments</span>
                  <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">{patientApts.length}</span>
                </div>
                <div className="bg-slate-50/80 rounded-xl p-2 text-center border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MRN Code</span>
                  <span className="text-xs font-bold text-slate-900 mt-1 block truncate">{rec.id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* General Info Side (4 cols) */}
          <div className="lg:col-span-4 px-0 lg:px-6 pt-6 lg:pt-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">General Information</h3>
                </div>
                <button
                  onClick={() => onEdit?.(r || patient)}
                  className="w-6 h-6 rounded-full bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                  title="Edit Patient Info"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs font-semibold">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gender / Sex</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">{patient.sex || 'Female'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Birth Date / Age</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    {rec.dob ? `${fmtDate(rec.dob)} · ` : ''}{rec.age ? `${rec.age} yrs old` : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Height / Weight</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    {rec.height ? `${rec.height} cm` : '—'} · {rec.weight ? `${rec.weight} kg` : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Blood Pressure</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">{rec.bloodPressure || '—'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mobile Number</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">{patient.contact || '—'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Address</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block truncate">{rec.address || '—'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Service Category</span>
                  <div className="mt-0.5"><ServiceBadge service={patient.service} /></div>
                </div>

                {(rec.emergencyName || rec.emergencyPhone || rec.guardian || rec.emergencyContact) && (
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Emergency Contact</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 block truncate">
                      {rec.emergencyName
                        ? `${rec.emergencyName}${rec.emergencyRel ? ` (${rec.emergencyRel})` : ''}${rec.emergencyPhone ? ` · ${rec.emergencyPhone}` : ''}`
                        : (rec.guardian || rec.emergencyContact)}
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registration Date</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">{fmtDate(rec.date)}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Live Status</span>
                  <span className="mt-0.5 inline-block">
                    <span className={`badge ${statusBadgeClass[liveStatus] || 'badge-blue'}`}>
                      {liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1)}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Medical History & Exposure Details Side (5 cols) */}
          <div className="lg:col-span-5 pl-0 lg:pl-6 pt-6 lg:pt-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Medical History &amp; Exposure Details</h3>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">Clinical Data</span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs font-semibold text-slate-700">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Exposure Category</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5 block">Cat {patient.cat || '—'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Biting Animal</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5 block">{patient.animal || 'Bite / Scratch'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Wound Location</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5 block truncate">{patient.woundLocation || patient.biteLocation || '—'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vaccine Brand</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5 block truncate">{patient.vaccineBrand || 'Rabipur'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Known Allergies</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block truncate">{patient.allergies || 'None'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Past Vaccines</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block truncate">{patient.pastVaccines || 'None'}</span>
                </div>

                <div className="col-span-2 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Doctor / Nurse Remarks</span>
                  <p className="text-slate-700 font-normal leading-relaxed text-[11.5px] bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 border-l-4 border-l-[#0A1D47]">
                    {rec.notes || 'No custom clinical remarks noted.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── MIDDLE ROW: VACCINATION DOSES (LEFT 6 COLS) & APPOINTMENTS (RIGHT 6 COLS) SIDE-BY-SIDE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-stretch">

        {/* ── LEFT COLUMN (6 COLS): VACCINATION DOSES TRACKER — fixed height, list scrolls ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-blue-100/90 ring-1 ring-blue-500/10 shadow-xs hover:shadow-sm transition-all p-5 sm:p-6 flex flex-col" style={{ height: 440 }}>
          <div className="flex flex-col flex-1 min-h-0">
            {/* Clean Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-blue-50 flex-wrap gap-2 mb-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-6.5 h-6.5 rounded-lg bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" /></svg>
                  </div>
                  <h3 className="text-sm sm:text-[15px] font-bold text-slate-900 tracking-tight">
                    Vaccination Doses
                  </h3>
                  <span className="text-[10.5px] font-bold text-[#3B50DF] bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100/90">
                    {patient.service || 'PEP'} Protocol
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 pl-8">Dose schedule timeline for {patient.name}</p>
              </div>
            </div>

            {/* Dose Timeline List — scrolls inside the fixed-height card */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {(() => {
              const dosesList = (Array.isArray(patient?.doses) && patient.doses.length > 0)
                ? patient.doses
                : (Array.isArray(rec?.doses) && rec.doses.length > 0)
                ? rec.doses
                : [];

              if (dosesList.length === 0) {
                return (
                  <div className="py-4 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">No vaccination doses recorded yet</p>
                    <p className="text-[11px] text-slate-400 font-normal mt-0.5">Doses appear here once the vaccination schedule is recorded.</p>
                  </div>
                );
              }

              const normalizedDoses = dosesList.map((d, i) => {
                const rawSt = String(d.s || d.status || 'pending').toLowerCase();
                const isDone = rawSt === 'done' || rawSt === 'completed' || d.done === true;
                const isMiss = rawSt === 'miss' || rawSt === 'missed' || rawSt === 'overdue' || (!isDone && d.date && d.date < getTodayDateString());
                const label = d.n || d.label || d.dose || d.name || `Dose ${i + 1}`;
                return {
                  ...d,
                  label,
                  n: label,
                  dose: label,
                  isDone,
                  isMiss,
                };
              });

              const nextDoseIndex = normalizedDoses.findIndex(d => !d.isDone);

              return (
                <div className="space-y-1.5">
                  {normalizedDoses.map((d, i) => {
                    const isDone = d.isDone;
                    const isMiss = d.isMiss;
                    const isNext = !isDone && (i === nextDoseIndex);

                    const cardBg = isDone
                      ? 'bg-emerald-50/40 border-emerald-200/80'
                      : isMiss
                      ? 'bg-rose-50/40 border-rose-200/80'
                      : isNext
                      ? 'bg-indigo-50/60 border-[#3B50DF] shadow-2xs ring-1 ring-[#3B50DF]/20'
                      : 'bg-slate-50/60 border-slate-200/70';

                    const badgeBg = isDone
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : isMiss
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : isNext
                      ? 'bg-[#3B50DF] text-white border-indigo-600'
                      : 'bg-slate-200/80 text-slate-600 border-slate-300';

                    const statusLabel = isDone ? 'Completed' : isMiss ? 'Missed' : isNext ? 'Next Due' : 'Scheduled';

                    return (
                      <div
                        key={i}
                        className={`py-2 px-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${cardBg}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Circle Badge Number or Icon */}
                          <div className={`w-6.5 h-6.5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs border ${badgeBg}`}>
                            {isDone ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : isMiss ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            ) : (
                              <span>{i + 1}</span>
                            )}
                          </div>

                          {/* Dose Name & Date */}
                          <div className="min-w-0">
                            <p className="text-xs sm:text-[12.5px] font-bold truncate leading-tight text-slate-900">
                              {d.label}
                            </p>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium mt-0.5">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                              <span>{d.date ? (formatDateShort(d.date) || d.date) : 'Not scheduled'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
                          isDone
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : isMiss
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            : isNext
                            ? 'bg-indigo-50 text-[#3B50DF] border border-indigo-200/80'
                            : 'bg-slate-100/80 text-slate-500 border border-slate-200/70'
                        }`}>
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </div>
          </div>

          {/* Status Legend Footer */}
          {((patient?.doses && patient.doses.length > 0) || (rec?.doses && rec.doses.length > 0)) && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500 flex-wrap gap-2 shrink-0">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completed</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3B50DF]" /> Next Due</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Scheduled</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Missed</span>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN (6 COLS): SYNCED APPOINTMENTS CARD ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-sky-100/90 ring-1 ring-sky-500/10 shadow-xs hover:shadow-sm transition-all overflow-hidden flex flex-col" style={{ height: 440 }}>
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-5 sm:p-6 border-b border-sky-50 bg-sky-50/30 flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-sky-100/80 text-sky-700 border border-sky-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Appointment</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Booked for {patient.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200/70 text-[11px] shadow-2xs">
                  <button
                    onClick={() => setAptTab('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      aptTab === 'all' ? 'bg-[#3B50DF] text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setAptTab('upcoming')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      aptTab === 'upcoming' ? 'bg-[#3B50DF] text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Upcoming
                  </button>
                  <button
                    onClick={() => setAptTab('completed')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      aptTab === 'completed' ? 'bg-[#3B50DF] text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Completed
                  </button>
                </div>
              </div>
            </div>

            {/* Appointments Table — scrolls inside the fixed-height card */}
            <div className="overflow-auto flex-1 min-h-0">
              {aptsLoading ? (
                <div className="py-8 text-center text-xs font-semibold text-slate-400">Loading appointments...</div>
              ) : filteredApts.length === 0 ? (
                <div className="py-8 text-center p-4">
                  <p className="text-xs font-bold text-slate-700">No appointments found</p>
                  <p className="text-[11px] text-slate-400 font-normal mt-0.5">Appointments booked for this patient appear here.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                      <th className="px-5 py-3.5 bg-slate-50">Date</th>
                      <th className="px-5 py-3.5 bg-slate-50">Type</th>
                      <th className="px-5 py-3.5 bg-slate-50">Time</th>
                      <th className="px-5 py-3.5 bg-slate-50">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px] font-medium text-slate-700">
                    {filteredApts.map((apt) => {
                      const statusStr = (apt.status || 'Pending').toLowerCase();
                      const isDone = statusStr === 'completed' || statusStr === 'done';
                      const isPending = statusStr === 'pending';
                      const badgeClass = isDone
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : isPending
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-indigo-50 text-[#3B50DF] border-indigo-200';

                      return (
                        <tr key={apt.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">{fmtDate(apt.date)}</td>
                          <td className="px-5 py-3.5 font-semibold text-slate-800 truncate max-w-[160px]">{apt.type || apt.purpose || 'Vaccination'}</td>
                          <td className="px-5 py-3.5 text-slate-600 font-medium whitespace-nowrap">{apt.time || '10:00 am'}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider inline-block ${badgeClass}`}>
                              {apt.status || 'Scheduled'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SECTION: REPORTS (DOCTOR/NURSE DOSES VITALS & NOTES) ── */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 ring-1 ring-indigo-500/10 shadow-xs hover:shadow-sm transition-all">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Clinical Reports & Nurse Notes
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Logged vitals, wound assessments, and doctor/nurse notes</p>
            </div>
          </div>

          <button
            onClick={() => setShowAddReportModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#3B50DF] hover:bg-indigo-700 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            + Add Reports
          </button>
        </div>

        {reportsList.length === 0 ? (
          <div className="py-10 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 p-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <p className="text-sm font-bold text-slate-700">No clinical reports logged</p>
            <p className="text-xs text-slate-400 font-normal mt-0.5">Click + Add Reports to log BP, Vitals, Injection Route & Observations.</p>
          </div>
        ) : (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {reportsList.map((rep, idx) => (
              <div
                key={rep.id || idx}
                onClick={() => setViewingReport(rep)}
                className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ borderTop: idx === 0 ? 'none' : '1px solid #E2E8F0' }}
              >
                {/* Date column */}
                <div className="w-[86px] shrink-0">
                  <p className="text-[11px] font-bold text-slate-900 tabular-nums leading-tight">{fmtDate(rep.date || rep.createdAt)}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{rep.author || 'Clinical Nurse'}</p>
                </div>

                {/* Title + notes */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-slate-900 truncate">{rep.title || 'Clinical Assessment'}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {rep.notes ? rep.notes : (rep.injectionSite || rep.woundCondition || 'No notes recorded')}
                  </p>
                </div>

                {/* Vitals column */}
                <div className="hidden md:flex items-center gap-4 shrink-0 text-[11px] font-semibold text-slate-600 tabular-nums">
                  {rep.bp && <span><span className="text-slate-400 font-medium">BP</span> {rep.bp}</span>}
                  {rep.pulse && <span><span className="text-slate-400 font-medium">Pulse</span> {rep.pulse}</span>}
                  {rep.temp && <span><span className="text-slate-400 font-medium">Temp</span> {rep.temp}°C</span>}
                </div>

                {/* Row actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setViewingReport(rep); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#3B50DF] hover:bg-indigo-50 transition-colors cursor-pointer"
                    title="View full report"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL 1: ENHANCED ADD REPORT POP-UP CARD ── */}
      {showAddReportModal && (
        <AddReportModal
          patient={patient}
          doses={(Array.isArray(patient?.doses) && patient.doses.length > 0) ? patient.doses : (rec.doses || [])}
          existingReports={reportsList}
          onClose={() => setShowAddReportModal(false)}
          onSave={handleSaveReport}
        />
      )}

      {/* ── MODAL 2: VIEW REPORT DETAIL MODAL ── */}
      {viewingReport && (
        <ViewReportModal
          report={viewingReport}
          patientName={patient.name}
          onClose={() => setViewingReport(null)}
        />
      )}

      {/* ── MODAL 3: EXPORT PATIENT RECORD MODAL (WITH LIVE PREVIEW AUTO-BOUND TO THIS PATIENT) ── */}
      {showExportModal && (
        <ExportReportModal
          patients={patients || records}
          initialPatient={{
            ...patient,
            ...(r || {}),
            doses: (Array.isArray(patient?.doses) && patient.doses.length > 0)
              ? patient.doses
              : (Array.isArray(r?.doses) && r.doses.length > 0)
              ? r.doses
              : (rec?.doses || [])
          }}
          onClose={() => setShowExportModal(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── CLOSE ICON ───────────────────────────
   The modals below all render <X/>; this file uses inline SVGs rather than
   an icon package, so the close glyph is defined here. */
function X({ size = 16, strokeWidth = 2.2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18" /><path d="M6 6l12 12" />
    </svg>
  );
}

/* ─────────────────────────── VITALS ASSESSMENT ───────────────────────────
   Adult reference ranges, used only to surface a reading for a second look
   before it is written to the patient's record. Advisory, never blocking —
   an out-of-range value is often exactly what the nurse means to record. */
function assessVitals({ bp, pulse, temp, woundCondition, adverseEvent }) {
  const flags = [];

  const bpMatch = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(bp || '');
  if (bp && !bpMatch) {
    flags.push({ level: 'warn', field: 'Blood pressure', text: 'Not in systolic/diastolic format (e.g. 120/80)' });
  } else if (bpMatch) {
    const sys = Number(bpMatch[1]), dia = Number(bpMatch[2]);
    if (sys >= 180 || dia >= 120) flags.push({ level: 'high', field: 'Blood pressure', text: 'Hypertensive crisis range — escalate to attending physician' });
    else if (sys >= 140 || dia >= 90) flags.push({ level: 'high', field: 'Blood pressure', text: 'Stage 2 hypertension range (≥140/90)' });
    else if (sys < 90 || dia < 60) flags.push({ level: 'warn', field: 'Blood pressure', text: 'Below normal (<90/60)' });
    else if (sys >= 130 || dia >= 80) flags.push({ level: 'warn', field: 'Blood pressure', text: 'Above normal (≥130/80)' });
  }

  const p = parseFloat(pulse);
  if (pulse && Number.isNaN(p)) {
    flags.push({ level: 'warn', field: 'Pulse', text: 'Not a number' });
  } else if (!Number.isNaN(p)) {
    if (p > 120) flags.push({ level: 'high', field: 'Pulse', text: 'Marked tachycardia (>120 bpm)' });
    else if (p < 50) flags.push({ level: 'high', field: 'Pulse', text: 'Marked bradycardia (<50 bpm)' });
    else if (p > 100) flags.push({ level: 'warn', field: 'Pulse', text: 'Tachycardia (>100 bpm)' });
    else if (p < 60) flags.push({ level: 'warn', field: 'Pulse', text: 'Bradycardia (<60 bpm)' });
  }

  const t = parseFloat(temp);
  if (temp && Number.isNaN(t)) {
    flags.push({ level: 'warn', field: 'Temperature', text: 'Not a number' });
  } else if (!Number.isNaN(t)) {
    if (t >= 39) flags.push({ level: 'high', field: 'Temperature', text: 'High fever (≥39 °C)' });
    else if (t < 35) flags.push({ level: 'high', field: 'Temperature', text: 'Hypothermia (<35 °C)' });
    else if (t >= 37.5) flags.push({ level: 'warn', field: 'Temperature', text: 'Febrile (≥37.5 °C)' });
  }

  if (adverseEvent === 'Severe Reaction (Requires MD Review)') {
    flags.push({ level: 'high', field: 'Adverse event', text: 'Severe reaction logged — requires MD review' });
  }
  if (woundCondition === 'Infected / Purulent Drainage') {
    flags.push({ level: 'high', field: 'Wound condition', text: 'Infected with purulent drainage' });
  }

  return flags;
}

/* ─────────────────────────── CONFIRM REPORT CARD ───────────────────────────
   Review step between the Add Report form and the write to Firestore. A
   clinical report is part of the patient's permanent record, so the whole
   entry is shown back before it is committed. */
function ConfirmReportCard({ patient, report, saving, onBack, onConfirm }) {
  const flags = assessVitals(report);
  const highCount = flags.filter(f => f.level === 'high').length;

  const vitals = [
    { label: 'BP (mmHg)', value: report.bp },
    { label: 'Pulse (bpm)', value: report.pulse },
    { label: 'Temp (°C)', value: report.temp },
    { label: 'Weight (kg)', value: report.weight }
  ];

  const details = [
    { label: 'Where the shot was given', value: report.injectionSite },
    { label: 'Wound condition', value: report.woundCondition },
    { label: 'Adverse event', value: report.adverseEvent },
    { label: 'Attending', value: report.author }
  ];

  return (
    <div
      className="admin-modal-overlay fixed z-[60] flex items-center justify-center p-4 overflow-y-auto"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        top: 'max(80px, var(--header-height, 80px))',
        height: 'calc(100vh - max(80px, var(--header-height, 80px)))',
        left: 'var(--sidebar-width, 256px)',
        width: 'calc(100vw - var(--sidebar-width, 256px))',
        paddingTop: '20px',
        paddingBottom: '20px',
        boxSizing: 'border-box',
        transition: 'left 0.4s cubic-bezier(0.22,1,0.36,1), width 0.4s cubic-bezier(0.22,1,0.36,1), top 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}
      onClick={saving ? undefined : onBack}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm clinical report"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 m-auto flex flex-col"
        style={{ maxHeight: 'calc(100vh - 128px)', transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Confirm Clinical Report</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">
              Review before this is written to {patient.name}&rsquo;s permanent record
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer disabled:opacity-40"
            aria-label="Back to edit"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs font-semibold text-slate-700">
          {/* Report identity */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.75rem', padding: '12px 14px' }}>
            <p className="text-[13px] font-bold text-slate-900 leading-snug">{report.title}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {patient.name} &middot; {fmtDate(report.date)}
            </p>
          </div>

          {/* Vitals */}
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-slate-400 mb-2">Vitals</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {vitals.map(v => (
                <div key={v.label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.625rem', padding: '9px 11px' }}>
                  <p className="text-[10px] text-slate-500 font-medium">{v.label}</p>
                  <p className="text-[13px] font-bold text-slate-900 mt-0.5 tabular-nums">{v.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Administration detail */}
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-slate-400 mb-2">Administration</p>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '.625rem', overflow: 'hidden' }}>
              {details.map((d, i) => (
                <div
                  key={d.label}
                  className="flex items-start justify-between gap-4 px-3 py-2"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #E2E8F0' }}
                >
                  <span className="text-[11px] text-slate-500 font-medium shrink-0">{d.label}</span>
                  <span className="text-[11.5px] font-bold text-slate-800 text-right">{d.value || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-slate-400 mb-2">Observations &amp; notes</p>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '.625rem', padding: '10px 12px' }}>
              {report.notes
                ? <p className="text-[11.5px] font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{report.notes}</p>
                : <p className="text-[11.5px] font-medium text-slate-400">No notes recorded for this entry.</p>}
            </div>
          </div>

          {/* Advisory flags */}
          {flags.length === 0 ? (
            <div style={{ background: 'var(--green-soft)', border: '1px solid #86EFAC', borderRadius: '.625rem', padding: '10px 12px' }}>
              <p className="text-[11.5px] font-bold" style={{ color: '#15803D' }}>
                All recorded vitals fall within normal adult ranges.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[10.5px] uppercase tracking-wider text-slate-400 mb-2">
                Needs a second look ({flags.length})
              </p>
              <div className="space-y-1.5">
                {flags.map((f, i) => {
                  const high = f.level === 'high';
                  return (
                    <div
                      key={i}
                      style={{
                        background: high ? 'var(--red-soft)' : 'var(--orange-soft)',
                        border: `1px solid ${high ? '#FCA5A5' : '#FDE68A'}`,
                        borderRadius: '.625rem',
                        padding: '9px 12px'
                      }}
                    >
                      <p className="text-[11.5px] font-bold" style={{ color: high ? '#B91C1C' : '#B45309' }}>
                        {f.field}: {f.text}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10.5px] font-medium text-slate-400 mt-2">
                {highCount > 0
                  ? 'These readings are unusual. Confirm they are correct — the report saves exactly as shown.'
                  : 'Advisory only. The report saves exactly as shown.'}
              </p>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back to edit
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#3B50DF] text-white font-bold cursor-pointer hover:bg-indigo-700 shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Report stages. doseIndex ties a stage to its position in the patient's dose
   schedule so a stage can be closed off once that dose is finished. */
const REPORT_STAGES = [
  { value: 'Dose 1 (Day 0) Initial Assessment', doseIndex: 0 },
  { value: 'Dose 2 (Day 3) Follow-up', doseIndex: 1 },
  { value: 'Dose 3 (Day 7) Assessment', doseIndex: 2 },
  { value: 'Dose 4 (Day 14) Follow-up', doseIndex: 3 },
  { value: 'Dose 5 (Day 28) Completion', doseIndex: 4 },
  { value: 'Wound Inspection & RIG Admin', doseIndex: null },
  { value: 'General Consultation & Booster', doseIndex: null }
];

const INJECTION_SITES = ['Right arm', 'Left arm', 'Right thigh', 'Left thigh', 'Around the wound', 'Other'];

/* ─────────────────────────── ENHANCED ADD REPORT POP-UP CARD ─────────────────────────── */
function AddReportModal({ patient, doses = [], existingReports = [], onClose, onSave }) {
  // A stage closes once its dose is finished or a report for it already exists,
  // so the same visit cannot be logged twice.
  const stages = REPORT_STAGES.map(s => {
    const alreadyLogged = existingReports.some(rep => rep.title === s.value);
    const dose = s.doseIndex !== null ? doses[s.doseIndex] : null;
    const doseDone = !!dose && (dose.s || dose.status) === 'done';
    return {
      ...s,
      disabled: alreadyLogged || doseDone,
      reason: alreadyLogged ? 'already logged' : doseDone ? 'dose completed' : ''
    };
  });
  const firstOpen = stages.find(s => !s.disabled);

  const [reportType, setReportType] = useState(firstOpen ? firstOpen.value : '');
  const [bp, setBp] = useState('120/80');
  const [pulse, setPulse] = useState('78');
  const [temp, setTemp] = useState('36.6');
  const [weight, setWeight] = useState('');
  const [woundCondition, setWoundCondition] = useState('Clean / Healing Well');
  const [injectionSite, setInjectionSite] = useState('Right arm');
  const [injectionSiteOther, setInjectionSiteOther] = useState('');
  const [adverseEvent, setAdverseEvent] = useState('None / Normal Response');
  const [author, setAuthor] = useState('');
  const [notes, setNotes] = useState('');

  const resolvedSite = injectionSite === 'Other' ? injectionSiteOther.trim() : injectionSite;
  // Submitting the form no longer writes straight to Firestore — it stages the
  // entry for the confirm card, which owns the actual save.
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setPending({
      id: 'rep-' + Date.now(),
      title: reportType,
      bp: bp.trim(),
      pulse: pulse.trim(),
      temp: temp.trim(),
      weight: weight.trim(),
      woundCondition,
      injectionSite: resolvedSite,
      adverseEvent,
      notes: notes.trim(),
      author: author.trim(),
      date: getTodayDateString(),
      createdAt: Date.now()
    });
  }

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(pending);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div
      className="admin-modal-overlay fixed z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        top: 'max(80px, var(--header-height, 80px))',
        height: 'calc(100vh - max(80px, var(--header-height, 80px)))',
        left: 'var(--sidebar-width, 256px)',
        width: 'calc(100vw - var(--sidebar-width, 256px))',
        paddingTop: '20px',
        paddingBottom: '20px',
        boxSizing: 'border-box',
        transition: 'left 0.4s cubic-bezier(0.22,1,0.36,1), width 0.4s cubic-bezier(0.22,1,0.36,1), top 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 m-auto flex flex-col"
        style={{ maxHeight: 'calc(100vh - 128px)', transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Add Clinical Report / Dose Vitals</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">Log vitals, injection route, and clinical observations for {patient.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"><X size={16}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
          {/* Report Stage / Type Dropdown */}
          <div>
            <label className="block mb-1.5 text-slate-500">Report Stage / Assessment Type</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              required
              className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
            >
              {!firstOpen && <option value="">No stage available to log</option>}
              {stages.map(s => (
                <option key={s.value} value={s.value} disabled={s.disabled}>
                  {s.value}{s.reason ? ` — ${s.reason}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Vitals Grid (4 Inputs) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block mb-1 text-slate-500">BP (mmHg)</label>
              <input type="text" value={bp} onChange={e => setBp(e.target.value)} placeholder="120/80" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Pulse (bpm)</label>
              <input type="text" value={pulse} onChange={e => setPulse(e.target.value)} placeholder="78" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Temp (°C)</label>
              <input type="text" value={temp} onChange={e => setTemp(e.target.value)} placeholder="36.6" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Weight (kg)</label>
              <input type="text" value={weight} onChange={e => setWeight(e.target.value)} placeholder="60" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
          </div>

          {/* Injection Site & Wound Condition Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1.5 text-slate-500">Where the shot was given</label>
              <select
                value={injectionSite}
                onChange={e => setInjectionSite(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
              >
                {INJECTION_SITES.map(site => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
              {injectionSite === 'Other' && (
                <input
                  type="text"
                  value={injectionSiteOther}
                  onChange={e => setInjectionSiteOther(e.target.value)}
                  required
                  autoFocus
                  placeholder="Type where the shot was given"
                  className="w-full mt-2 py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]"
                />
              )}
            </div>

            <div>
              <label className="block mb-1.5 text-slate-500">Wound Condition</label>
              <select
                value={woundCondition}
                onChange={e => setWoundCondition(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
              >
                <option value="Clean / Healing Well">Clean / Healing Well</option>
                <option value="Slight Erythema (Redness)">Slight Erythema (Redness)</option>
                <option value="Swollen / Inflamed">Swollen / Inflamed</option>
                <option value="Infected / Purulent Drainage">Infected / Purulent Drainage</option>
                <option value="No Active Wound / Intact Skin">No Active Wound / Intact Skin</option>
              </select>
            </div>
          </div>

          {/* Adverse Event Dropdown & Attending */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1.5 text-slate-500">Adverse Event / Reaction</label>
              <select
                value={adverseEvent}
                onChange={e => setAdverseEvent(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
              >
                <option value="None / Normal Response">None / Normal Response</option>
                <option value="Mild Local Pain & Swelling">Mild Local Pain & Swelling</option>
                <option value="Low-grade Fever / Fatigue">Low-grade Fever / Fatigue</option>
                <option value="Mild Skin Rash / Allergy">Mild Skin Rash / Allergy</option>
                <option value="Severe Reaction (Requires MD Review)">Severe Reaction (Requires MD Review)</option>
              </select>
            </div>

            <div>
              <label className="block mb-1.5 text-slate-500">Attending Doctor / Nurse</label>
              <input type="text" value={author} onChange={e => setAuthor(e.target.value)} required placeholder="Name of doctor or nurse" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
          </div>

          {/* Clinical Notes & Observations */}
          <div>
            <label className="block mb-1 text-slate-500">Doctor / Nurse Observations & Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Record clinical observations, wound dressing details, prescription recommendations, or patient instructions..."
              className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#3B50DF] text-white font-bold cursor-pointer hover:bg-indigo-700 shadow-xs">Review &amp; Save</button>
          </div>
        </form>
      </div>
    </div>

    {pending && (
      <ConfirmReportCard
        patient={patient}
        report={pending}
        saving={saving}
        onBack={() => setPending(null)}
        onConfirm={handleConfirm}
      />
    )}
    </>
  );
}

/* ─────────────────────────── ADD APPOINTMENT MODAL ─────────────────────────── */
function AddAptModal({ patient, onClose, onSave }) {
  const [date, setDate] = useState(getTodayDateString());
  const [time, setTime] = useState('10:00 AM');
  const [type, setType] = useState(patient.service ? `${patient.service} Follow-up Dose` : 'Anti-Rabies Vaccination');
  const [notes, setNotes] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      date,
      time,
      type,
      purpose: type,
      notes,
      comments: notes,
      status: 'Confirmed'
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Add Appointment for {patient.name}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-slate-500">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Time</label>
              <input type="text" value={time} onChange={e => setTime(e.target.value)} required placeholder="10:00 AM" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-slate-500">Treatment / Service Type</label>
            <input type="text" value={type} onChange={e => setType(e.target.value)} required className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
          </div>

          <div>
            <label className="block mb-1 text-slate-500">Appointment Note / Comments</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add comments or instructions for the patient..." className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
          </div>

          <div className="pt-3 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#3B50DF] text-white font-bold cursor-pointer hover:bg-indigo-700 shadow-xs">Book Appointment</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── VIEW REPORT MODAL ─────────────────────────── */
function ViewReportModal({ report, patientName, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{report.title || 'Clinical Report'}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"><X size={16}/></button>
        </div>
        <div className="p-6 space-y-4 text-xs font-medium text-slate-700">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
            <p className="text-slate-500"><strong className="text-slate-800">Patient:</strong> {patientName}</p>
            <p className="text-slate-500"><strong className="text-slate-800">Date:</strong> {fmtDate(report.date || report.createdAt)}</p>
            <p className="text-slate-500"><strong className="text-slate-800">Attending:</strong> {report.author || 'Clinical Nurse'}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">BP</span>
              <span className="text-xs font-extrabold text-[#3B50DF] mt-0.5 block">{report.bp || '—'}</span>
            </div>
            <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Weight</span>
              <span className="text-xs font-extrabold text-emerald-700 mt-0.5 block">{report.weight ? `${report.weight} kg` : '—'}</span>
            </div>
            <div className="p-2.5 bg-amber-50/70 border border-amber-100 rounded-2xl">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Temp</span>
              <span className="text-xs font-extrabold text-amber-700 mt-0.5 block">{report.temp ? `${report.temp} °C` : '—'}</span>
            </div>
          </div>

          <div>
            <span className="block font-bold text-slate-800 mb-1">Clinical Notes & Observations:</span>
            <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 whitespace-pre-wrap">
              {report.notes || 'No detailed clinical notes attached.'}
            </p>
          </div>

          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold cursor-pointer hover:bg-slate-800">Close Report</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── SEND MESSAGE MODAL ─────────────────────────── */
function SendMessageModal({ patient, onClose, onToast }) {
  const [msg, setMsg] = useState(`Hello ${patient.name}, this is a friendly reminder regarding your upcoming vaccination appointment at K&A Anti-Rabies Clinic.`);

  function handleSend(e) {
    e.preventDefault();
    onToast(`Message sent to ${patient.name} (${patient.contact || patient.email || 'SMS'})`, 'success');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Send Message to {patient.name}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"><X size={16}/></button>
        </div>
        <form onSubmit={handleSend} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
          <div>
            <label className="block mb-1 text-slate-500">Recipient</label>
            <input type="text" disabled value={`${patient.name} (${patient.contact || patient.email || 'Mobile SMS'})`} className="w-full py-2 px-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-600" />
          </div>

          <div>
            <label className="block mb-1 text-slate-500">Message Content</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} required className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#3B50DF] text-white font-bold cursor-pointer hover:bg-indigo-700 shadow-xs">Send Follow-up</button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ─────────────────────────── EXPORT REPORT MODAL ─────────────────────────── */
let clinicLogoBase64Cache = CLINIC_LOGO_BASE64;
async function getClinicLogoBase64() {
  if (clinicLogoBase64Cache) return clinicLogoBase64Cache;
  try {
    const res = await fetch('/assets/dashboard/logo-white-nobg.png');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        clinicLogoBase64Cache = reader.result;
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    clinicLogoBase64Cache = CLINIC_LOGO_BASE64;
    return CLINIC_LOGO_BASE64;
  }
}

function ExportReportModal({ patients, onClose, onToast, initialPatient }) {
  const [logoDataUrl, setLogoDataUrl] = useState(clinicLogoBase64Cache || CLINIC_LOGO_BASE64);
  useEffect(() => {
    getClinicLogoBase64().then(b64 => {
      if (b64) setLogoDataUrl(b64);
    });
  }, []);

  const [mode, setMode] = useState(initialPatient ? 'single' : 'bulk'); // 'bulk' | 'single'
  const [period, setPeriod] = useState('monthly');
  const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const PERIODS = [
    { key: 'monthly', label: 'Monthly', desc: 'This calendar month',
      icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="13" x2="8" y2="13" /><line x1="12" y1="13" x2="12" y2="13" /><line x1="16" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="8" y2="17" /><line x1="12" y1="17" x2="12" y2="17" /></svg> },
    { key: 'daily', label: 'Daily', desc: 'Today\'s registrations',
      icon: <svg {...iconProps}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg> },
    { key: 'weekly', label: 'Weekly', desc: 'Last 7 days',
      icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="9" x2="21" y2="9" /></svg> },
    { key: 'yearly', label: 'Yearly', desc: 'This calendar year',
      icon: <svg {...iconProps}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" /></svg> },
  ];

  const fileIcon = <svg {...iconProps}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  const [exportFormat, setExportFormat] = useState('pdf'); // 'xls' | 'pdf'
  const FORMATS = [
    { key: 'xls', label: 'Excel (XLS)' },
    { key: 'pdf', label: 'PDF' },
  ];

  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'completed' | 'overdue' | 'ongoing'
  function statusFilterLabel() {
    if (statusFilter === 'completed') return 'Completed';
    if (statusFilter === 'overdue') return 'Overdue';
    if (statusFilter === 'ongoing') return 'Ongoing';
    return 'All Statuses';
  }

  const [serviceFilter, setServiceFilter] = useState('all'); // 'all' | 'pep' | 'prep' | 'tetanus' | 'pneumonia'
  function serviceFilterLabel() {
    if (serviceFilter === 'pep') return 'PEP (Post-Exposure)';
    if (serviceFilter === 'prep') return 'PrEP (Pre-Exposure)';
    if (serviceFilter === 'tetanus') return 'Anti-Tetano (Tetanus)';
    if (serviceFilter === 'pneumonia') return 'Pneumonia Vaccine';
    return 'All Services';
  }

  // Preview gate — nothing leaves the modal until the user has seen the
  // rendered report. 'form' = pick period/format, 'preview' = review it.
  const [step, setStep] = useState('form');

  // ── Single-patient search — filters the same already-loaded `patients`
  // list the main table searches (that list is capped at the 20 most
  // recent records app-wide; a patient outside that window won't show up
  // here either, same limitation as the table's own search box). ─────────
  const [patientQuery, setPatientQuery] = useState(initialPatient ? formatTitleCase(initialPatient.name) : '');
  const [selectedPatient, setSelectedPatient] = useState(initialPatient || null);

  useEffect(() => {
    if (initialPatient) {
      setSelectedPatient(initialPatient);
      setPatientQuery(formatTitleCase(initialPatient.name || ''));
      setMode('single');
    }
  }, [initialPatient]);
  const matchingPatients = (() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q || selectedPatient) return [];
    return patients.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q) ||
      p.mrn?.toLowerCase().includes(q)
    ).slice(0, 6);
  })();

  // ── Email delivery — shared by both bulk and single-patient modes ──────
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  // The toast renders under the modal's portal, so a send needs its own
  // confirmation inside the card.
  const [sentTo, setSentTo] = useState('');

  async function sendReportEmail(to, subject, html, attachment) {
    const trimmed = to.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      onToast('Enter a valid recipient email address.', 'error');
      return;
    }
    if (!auth.currentUser) {
      onToast('You must be signed in as an administrator to send reports.', 'error');
      return;
    }
    setSending(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch('/api/send-patient-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          to: trimmed, subject, html,
          ...(attachment ? { attachmentBase64: attachment.base64, attachmentFilename: attachment.filename } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        onToast(`Report emailed to ${trimmed}`, 'success');
        setSentTo(trimmed);
        setEmailTo('');
      } else {
        onToast(data?.error || `Failed to send email (${res.status} ${res.statusText})`, 'error');
      }
    } catch (err) {
      console.error('sendReportEmail error:', err);
      onToast(err?.message || 'Network error while sending the email.', 'error');
    } finally {
      setSending(false);
    }
  }

  function getFilteredPatients() {
    const todayStr = getTodayDateString();
    const curParts = todayStr.split('-');
    const curYear = parseInt(curParts[0], 10);
    const curMonth = parseInt(curParts[1], 10);
    const now = new Date();

    return patients.filter(p => {
      const pDateStr = p.date ? String(p.date).split('T')[0] : (p.createdAt?.toDate ? getTodayDateString(p.createdAt.toDate()) : '');
      const raw = p.createdAt?.toDate ? p.createdAt.toDate() : (pDateStr ? new Date(`${pDateStr}T12:00:00`) : null);
      let matchesPeriod = true;
      if (period === 'daily') {
        matchesPeriod = pDateStr === todayStr;
      } else if (period === 'weekly') {
        const msAgo = raw ? now - raw : Infinity;
        matchesPeriod = msAgo >= 0 && msAgo <= 7 * 24 * 60 * 60 * 1000;
      } else if (period === 'monthly') {
        const pYear = pDateStr ? parseInt(pDateStr.slice(0, 4), 10) : (raw ? raw.getFullYear() : null);
        const pMonth = pDateStr ? parseInt(pDateStr.slice(5, 7), 10) : (raw ? raw.getMonth() + 1 : null);
        matchesPeriod = pYear === curYear && pMonth === curMonth;
      } else if (period === 'yearly') {
        const pYear = pDateStr ? parseInt(pDateStr.slice(0, 4), 10) : (raw ? raw.getFullYear() : null);
        matchesPeriod = pYear === curYear;
      } else if (period === 'all') {
        matchesPeriod = true;
      }
      if (!matchesPeriod) return false;

      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const patientStatus = liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';

      if (statusFilter === 'completed') return patientStatus === 'completed';
      if (statusFilter === 'overdue') return patientStatus === 'overdue';
      if (statusFilter === 'ongoing') return patientStatus === 'ongoing';

      if (serviceFilter !== 'all') {
        const s = (p.service || '').trim().toLowerCase();
        if (serviceFilter === 'pep' && s !== 'pep') return false;
        if (serviceFilter === 'prep' && s !== 'prep') return false;
        if (serviceFilter === 'tetanus' && !s.includes('tetan')) return false;
        if (serviceFilter === 'pneumonia' && !s.includes('pneumo')) return false;
      }

      return true;
    });
  }

  function periodLabel() {
    const now = new Date();
    if (period === 'all') return 'All Time (Full Registry)';
    if (period === 'daily') return now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (period === 'weekly') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      return `${from.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (period === 'monthly') return now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    if (period === 'yearly') return String(now.getFullYear());
    return 'All Records';
  }
  // Official Philippine Government / Institutional Rural Health Unit Letterhead
  function letterhead() {
    return `
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;border:none;font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
        <tr>
          <!-- Left: Clinic Logo directly beside Rural Unit text -->
          <td style="vertical-align:middle;padding-right:16px;width:90px;text-align:right;">
            <img src="${logoDataUrl || CLINIC_LOGO_BASE64 || '/assets/dashboard/logo-white-nobg.png'}" alt="K&A Clinic Logo" style="width:90px;height:90px;object-fit:contain;display:block;" />
          </td>
          <!-- Center: Clinic Letterhead Text -->
          <td style="vertical-align:middle;text-align:center;padding:0;">
            <div style="font-size:9.5px;color:#64748B;letter-spacing:0.8px;font-weight:700;text-transform:uppercase;">Municipality of Libon, Province of Albay</div>
            <div style="font-size:16px;font-weight:900;color:#0F172A;letter-spacing:0.5px;margin-top:2px;text-transform:uppercase;">K&amp;A Animal Bite Center</div>
          </td>
          <!-- Right: Matching Counter-balance Spacer so Center Text is 100% Optical Center -->
          <td style="vertical-align:middle;padding-left:16px;width:90px;">
            <div style="width:90px;height:1px;"></div>
          </td>
        </tr>
      </table>
    `;
  }

  // Realistic Microsoft Excel Live Table Preview HTML
  function buildExcelPreviewHtml(rows, periodLabelStr) {
    const serviceCount = {};
    const statusCount = { ongoing: 0, completed: 0, overdue: 0 };
    rows.forEach(p => {
      const svc = p.service || 'PEP';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const st = liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    const headers = ['#', 'Barangay / Address', 'Patient ID', 'Patient Name', 'Age / Sex', 'Contact No.', 'Service', 'Exposure', 'Status', 'Date Registered'];
    const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    const tableRows = rows.length === 0
      ? `<tr><td class="row-num">6</td><td colspan="10" style="text-align:center;padding:16px;color:#64748B;font-style:italic;">No ${statusFilter === 'all' ? '' : statusFilter + ' '}records found for this period.</td></tr>`
      : rows.map((p, idx) => {
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const stLabel = liveSt === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing';
      const rowNum = idx + 6;
      return `<tr>
        <td class="row-num">${rowNum}</td>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${p.barangay || p.address || 'Libon, Albay'}</td>
        <td style="font-weight:bold;color:#0F172A;">${p.id || p.mrn || '—'}</td>
        <td style="font-weight:bold;color:#0F172A;">${formatTitleCase(p.name || '—')}</td>
        <td style="text-align:center;">${p.age || '—'} / ${p.sex || '—'}</td>
        <td>${p.contact || '—'}</td>
        <td style="text-align:center;font-weight:bold;">${p.service || 'PEP'}</td>
        <td style="text-align:center;">${p.cat ? `Cat ${p.cat}` : (p.animal || '—')}</td>
        <td style="text-align:center;font-weight:bold;color:${stLabel === 'Completed' ? '#15803D' : stLabel === 'Overdue' ? '#DC2626' : '#1D4ED8'};">${stLabel.toUpperCase()}</td>
        <td style="text-align:center;">${formatDateNumeric(p.date || p.createdAt)}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><title>Excel Preview</title>
      <style>
        *{box-sizing:border-box;}
        body{font-family:Calibri,'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#FFFFFF;font-size:11px;color:#1E293B;user-select:none;}
        .sheet-container{background:#FFFFFF;overflow-x:auto;padding:0;}
        table.excel-grid{border-collapse:collapse;width:100%;table-layout:fixed;}
        table.excel-grid th, table.excel-grid td{border:1px solid #CBD5E1;padding:6px 9px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        th.col-head{background:#EFF6FF;color:#1D4ED8;font-weight:700;text-align:center;font-size:10px;border:1px solid #CBD5E1;}
        td.row-num{background:#F8FAFC;color:#64748B;font-weight:700;text-align:center;font-size:10px;width:36px;border:1px solid #CBD5E1;}
        .sheet-tabs{background:#F1F5F9;border-top:1px solid #CBD5E1;padding:4px 12px;display:flex;align-items:center;gap:4px;font-size:11px;position:sticky;bottom:0;}
        .tab{background:#FFFFFF;border:1px solid #CBD5E1;border-bottom:none;padding:4px 12px;font-weight:700;color:#1D4ED8;border-top:2px solid #1D4ED8;border-radius:3px 3px 0 0;}
      </style></head><body>

      <div class="sheet-container">
        <table class="excel-grid">
          <thead>
            <tr>
              <th class="col-head" style="width:36px;"></th>
              ${colLetters.map(c => `<th class="col-head">${c}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="row-num">1</td>
              <td colspan="10" style="font-size:13px;font-weight:bold;color:#1D4ED8;background:#EFF6FF;">HEALTH MONITORING &amp; PATIENT REGISTRY REPORT</td>
            </tr>
            <tr>
              <td class="row-num">2</td>
              <td colspan="10" style="color:#475569;background:#F8FAFC;">Period Covered: <strong>${periodLabelStr}</strong> &nbsp;|&nbsp; Status: <strong>${statusFilterLabel()}</strong> &nbsp;|&nbsp; Barangay: All Barangays &nbsp;|&nbsp; Date Generated: ${new Date().toLocaleString('en-PH')}</td>
            </tr>
            <tr>
              <td class="row-num">3</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;">Total Patients: ${rows.length}</td>
              <td colspan="2" style="background:#F1F5F9;font-weight:bold;color:#1D4ED8;">Ongoing: ${statusCount.ongoing || 0}</td>
              <td colspan="3" style="background:#F1F5F9;font-weight:bold;color:#DC2626;">Overdue: ${statusCount.overdue || 0}</td>
              <td colspan="3" style="background:#F1F5F9;font-weight:bold;color:#15803D;">Completed: ${statusCount.completed || 0}</td>
            </tr>
            <tr>
              <td class="row-num">4</td>
              <td colspan="10" style="background:#FFFFFF;height:4px;"></td>
            </tr>
            <tr style="background:#1D4ED8;color:#FFFFFF;font-weight:bold;">
              <td class="row-num" style="background:#F1F5F9;color:#64748B;">5</td>
              ${headers.map(h => `<td style="background:#1D4ED8;color:#FFFFFF;font-weight:bold;text-align:${h === '#' || h === 'Age / Sex' || h === 'Service' || h === 'Exposure' || h === 'Status' || h === 'Date Registered' ? 'center' : 'left'};">${h}</td>`).join('')}
            </tr>
            ${tableRows}
          </tbody>
        </table>
      </div>

      <div class="sheet-tabs">
        <div class="tab">Sheet1</div>
        <span style="color:#64748B;margin-left:8px;">+</span>
        <span style="margin-left:auto;color:#64748B;font-size:10px;">Ready</span>
      </div>

      </body></html>`;
  }

  // Excel HTML Export — formatted structured spreadsheet table
  // Real .xlsx via SheetJS. The old export wrote an HTML table with an .xls
  // extension, which made Excel warn that the format and extension disagree
  // and coerced phone numbers into scientific notation. The on-screen preview
  // (buildExcelPreviewHtml) is unchanged — only the produced file is.
  function exportBulkXLS() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }

    const statusCount = { ongoing: 0, completed: 0, overdue: 0 };
    const statusFor = (p) => {
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      return liveSt === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';
    };
    // Service mix, counted from the same rows the table prints. This was
    // computed and then thrown away before, so the report carried no service
    // breakdown at all.
    const serviceCount = {};
    rows.forEach(p => {
      const st = statusFor(p);
      statusCount[st] = (statusCount[st] || 0) + 1;
      const svc = (p.service || 'Unspecified').trim() || 'Unspecified';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
    });
    const servicePct = (n) => (rows.length ? `${Math.round((n / rows.length) * 1000) / 10}%` : '0%');
    const serviceRows = Object.entries(serviceCount)
      .sort((a, b) => b[1] - a[1])
      .map(([svc, n]) => [svc, n, servicePct(n)]);

    const headers = ['#', 'Barangay / Address', 'Patient ID', 'Patient Name', 'Age', 'Sex', 'Contact No.', 'Service Type', 'Exposure', 'Status', 'Date Registered'];

    // Title block, summary metrics, then the registry table.
    const aoa = [
      ['HEALTH MONITORING & PATIENT REGISTRY REPORT'],
      ['RURAL HEALTH UNIT • ANIMAL BITE TREATMENT CENTER • LIBON, ALBAY'],
      [`Period Covered: ${periodLabel()}`, `Service: ${serviceFilterLabel()}`, `Status: ${statusFilterLabel()}`, `Date Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      ['SUMMARY METRICS'],
      ['Total Patients', rows.length, 'Ongoing', statusCount.ongoing || 0, 'Overdue', statusCount.overdue || 0, 'Completed', statusCount.completed || 0],
      [],
      ['SERVICE BREAKDOWN'],
      ['Service', 'Patients', 'Share'],
      ...serviceRows,
      [],
      headers,
    ];

    const HEADER_ROW = aoa.length - 1; // zero-based index of the header row
    rows.forEach((p, idx) => {
      const st = statusFor(p);
      aoa.push([
        idx + 1,
        p.barangay || p.address || 'Libon, Albay',
        p.id || p.mrn || '—',
        formatTitleCase(p.name || '—'),
        p.age === 0 || p.age ? Number(p.age) : '—',
        (p.sex || '—').toUpperCase(),
        p.contact || '—',
        p.service || 'PEP',
        ((p.service || '').trim().toUpperCase() === 'PEP') ? (p.cat ? `Cat ${p.cat}` : (p.animal || '—')) : '—',
        st.charAt(0).toUpperCase() + st.slice(1),
        formatDateNumeric(p.date || p.createdAt),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Phone numbers and IDs are identifiers, not quantities — forcing them to
    // text is what stops "+639272401450" becoming 6.39272E+11.
    const TEXT_COLUMNS = [2, 6, 10]; // Patient ID, Contact No., Date Registered
    for (let r = HEADER_ROW + 1; r < aoa.length; r++) {
      TEXT_COLUMNS.forEach(c => {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref];
        if (cell) { cell.t = 's'; cell.z = '@'; cell.v = String(cell.v); }
      });
    }

    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 13 }, { wch: 26 }, { wch: 6 }, { wch: 8 },
      { wch: 17 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 15 },
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } },
    ];
    // Header row stays visible while scrolling, and the table gets a filter.
    ws['!freeze'] = { xSplit: 0, ySplit: HEADER_ROW + 1 };
    ws['!autofilter'] = {
      ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: aoa.length - 1, c: headers.length - 1 })}`,
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patient Registry');

    const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
    XLSX.writeFile(wb, `clinic-report-${period}${statusSlug}-${getTodayDateString()}.xlsx`);
    onToast(`Excel report exported (${rows.length} patient${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  const PAGE_1_ROWS = 24;
  const CONT_PAGE_ROWS = 24;

  function chunkPatientsIntoPages(rows) {
    if (!rows || rows.length === 0) return [[]];
    const pages = [];
    pages.push(rows.slice(0, PAGE_1_ROWS));
    let idx = PAGE_1_ROWS;
    while (idx < rows.length) {
      pages.push(rows.slice(idx, idx + CONT_PAGE_ROWS));
      idx += CONT_PAGE_ROWS;
    }
    return pages;
  }

  // Exact Landscape Multi-Page HTML Report with physical cut lines and page breaks (Matching Downloaded PDF Design Exactly)
  function buildBulkReportHtml(rows, logoSrc = CLINIC_LOGO_BASE64) {
    const pages = chunkPatientsIntoPages(rows);
    const totalPages = pages.length;
    const dateGeneratedStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentLogo = logoSrc || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;

    const renderedPagesHtml = pages.map((pageRows, pIdx) => {
      const pageNum = pIdx + 1;
      const startNum = pIdx === 0 ? 0 : PAGE_1_ROWS + (pIdx - 1) * CONT_PAGE_ROWS;

      const tableRows = pageRows.length === 0
        ? `<tr><td colspan="10" style="text-align:center;padding:24px;color:#64748B;font-style:italic;">No ${statusFilter === 'all' ? '' : statusFilter + ' '}records found for this period.</td></tr>`
        : pageRows.map((p, i) => {
            const liveSt = derivePatientStatus(p);
            const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
            const stLabel = liveSt === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing';
            const stColor = liveSt === 'completed' ? '#15803D' : isOverdue ? '#DC2626' : '#1D4ED8';
            const dateStr = formatDateNumeric(p.date || p.createdAt);

            return `
            <tr>
              <td class="col-center">${startNum + i + 1}</td>
              <td class="col-left">${p.barangay || p.address || 'Libon, Albay'}</td>
              <td class="col-left">${p.id || p.mrn || '—'}</td>
              <td class="col-left">${formatTitleCase(p.name || '—')}</td>
              <td class="col-center">${p.age || '—'} / ${p.sex || '—'}</td>
              <td class="col-left">${p.contact || '—'}</td>
              <td class="col-center">${p.service || 'PEP'}</td>
              <td class="col-center">${((p.service || '').trim().toUpperCase() === 'PEP') ? (p.cat ? `Cat ${p.cat}` : (p.animal || '—')) : '—'}</td>
              <td class="col-center" style="font-weight:700;color:${stColor};">${stLabel}</td>
              <td class="col-center">${dateStr}</td>
            </tr>`;
          }).join('');

      const pageHeader = `
        <!-- Minimal Institutional Text Header with Logo on Left (Matches Downloaded PDF Exactly) -->
        <div class="report-header">
          <div class="header-left">
            <img src="${currentLogo}" alt="K&A Clinic Logo" class="header-logo" />
            <div>
              <div class="header-muni">Municipality of Libon, Province of Albay</div>
              <div class="header-brand">K&amp;A ANIMAL BITE CENTER &mdash; HEALTH MONITORING REPORT</div>
              <div class="header-sub">Barangay Summary &mdash; ${periodLabel()}${pIdx > 0 ? ' &bull; Continuation' : ''}</div>
            </div>
          </div>
          <div class="header-right">
            <span>Service: ${serviceFilterLabel()}</span> &nbsp;|&nbsp; <span>Status: ${statusFilterLabel()}</span> &nbsp;|&nbsp; <span>Date: ${dateGeneratedStr}</span>
          </div>
        </div>
        <div class="header-line"></div>
      `;

      const cutSeparator = pIdx > 0
        ? `
          <div class="page-cut-separator">
            <span class="cut-scissors">✂</span>
            <span class="cut-label">Page ${pageNum} of ${totalPages} &mdash; Separate Sheet</span>
          </div>
        `
        : '';

      return `
        ${cutSeparator}
        <div class="report-page" id="page-${pageNum}">
          <div>
            ${pageHeader}
            <table class="report-table">
              <thead>
                <tr>
                  <th style="width:4%;text-align:center;">#</th>
                  <th style="width:15%;text-align:left;">Barangay / Address</th>
                  <th style="width:10%;text-align:left;">Patient ID</th>
                  <th style="width:18%;text-align:left;">Patient Name</th>
                  <th style="width:8%;text-align:center;">Age / Sex</th>
                  <th style="width:13%;text-align:left;">Contact No.</th>
                  <th style="width:7%;text-align:center;">Service</th>
                  <th style="width:7%;text-align:center;">Exposure</th>
                  <th style="width:8%;text-align:center;">Status</th>
                  <th style="width:10%;text-align:center;">Date Registered</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <span>K&amp;A Animal Bite Treatment Center &bull; Rural Health Unit &bull; Confidential Clinical Report</span>
            <span>Page ${pageNum} of ${totalPages}</span>
          </div>
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html><html><head><title>Health Monitoring Report — ${periodLabel()}</title>
    <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;}
      html, body{margin:0;padding:0;font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;background:#EDF0FA;}
      .pages-wrapper{display:flex;flex-direction:column;align-items:center;padding:0 0 4px;}
      .page-cut-separator{width:1060px;display:flex;align-items:center;justify-content:center;gap:12px;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin:18px 0;user-select:none;}
      .page-cut-separator::before, .page-cut-separator::after{content:'';flex:1;border-bottom:2px dashed #CBD5E1;}
      .cut-scissors{font-size:13px;color:#3B50DF;}
      .cut-label{background:#FFFFFF;padding:4px 12px;border-radius:999px;border:1px solid #CBD5E1;box-shadow:0 1px 3px rgba(0,0,0,0.05);}
      .report-page{width:1060px;height:750px;min-height:750px;max-height:750px;background:#FFFFFF;border-radius:6px;border:1px solid #D8DEF0;box-shadow:0 4px 18px rgba(15,23,42,0.10);padding:16px 26px 14px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;margin:0 auto;box-sizing:border-box;}
      
      .report-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;}
      .header-left{display:flex;align-items:center;gap:12px;}
      .header-logo{width:38px;height:38px;object-fit:contain;display:block;flex-shrink:0;}
      .header-muni{font-size:8.5px;color:#64748B;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;}
      .header-brand{font-size:13px;font-weight:900;color:#0F172A;letter-spacing:0.3px;margin:1px 0;text-transform:uppercase;}
      .header-sub{font-size:9.5px;color:#475569;font-weight:600;font-style:italic;}
      .header-right{font-size:8.5px;color:#475569;font-weight:600;text-align:right;white-space:nowrap;}
      .header-line{border-bottom:1.5px solid #0A1D47;margin:4px 0 8px;}

      table.report-table{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;border:1px solid #CBD5E1;}
      table.report-table th, table.report-table td{border:1px solid #CBD5E1;vertical-align:middle;}
      table.report-table th{background:#EFF6FF;color:#000000;font-size:8.5px;font-weight:800;padding:6px 8px;white-space:nowrap;}
      table.report-table td{padding:5.8px 8px;color:#0F172A;font-size:9px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      
      .col-center{text-align:center;}
      .col-left{text-align:left;}

      .footer{font-size:8px;color:#94A3B8;margin-top:auto;padding-top:8px;display:flex;justify-content:space-between;}
      @media print{
        @page{size:A4 landscape;margin:8mm 10mm;}
        html,body{background:#FFFFFF!important;padding:0!important;margin:0!important;}
        .pages-wrapper{display:block!important;padding:0!important;}
        .page-cut-separator{display:none!important;}
        .report-page{width:100%!important;min-height:100vh!important;height:100vh!important;margin:0!important;box-shadow:none!important;border:none!important;border-radius:0!important;padding:8mm 10mm!important;page-break-after:always!important;break-after:page!important;}
        .report-page:last-child{page-break-after:auto!important;break-after:auto!important;}
      }
    </style></head><body>
      <div class="pages-wrapper">
        ${renderedPagesHtml}
      </div>
    </body></html>`;
  }

  function exportPrint() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    const w = window.open('', '_blank');
    w.document.write(buildBulkReportHtml(rows, logoDataUrl || CLINIC_LOGO_BASE64));
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 250);
    onToast(`${period.charAt(0).toUpperCase() + period.slice(1)} report opened for printing`, 'success');
  }

  // Landscape A4 registry export. Deliberately mirrors buildBulkReportHtml:
  // the same chunkPatientsIntoPages() split, the same column proportions, the
  // same header/footer furniture — so the downloaded file matches the preview
  // page for page instead of reflowing to its own rhythm.
  function buildBulkPdf(rows, logoDataUrl = CLINIC_LOGO_BASE64) {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const dateGeneratedStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const logoToUse = logoDataUrl || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;

    const MARGIN = 14;
    const CONTENT_WIDTH = pageWidth - MARGIN * 2;
    // The percentage widths the preview table uses, resolved against the
    // printable width so both render the same column rhythm.
    const COL_PERCENT = [4, 15, 10, 18, 8, 13, 7, 7, 8, 10];
    const COL_ALIGN = ['center', 'left', 'left', 'left', 'center', 'left', 'center', 'center', 'center', 'center'];
    const columnStyles = COL_PERCENT.reduce((acc, pct, i) => {
      acc[i] = {
        halign: COL_ALIGN[i],
        cellWidth: (CONTENT_WIDTH * pct) / 100,
        ...(i === 8 ? { fontStyle: 'bold' } : {}),
      };
      return acc;
    }, {});

    function drawPdfHeader(isContinuation) {
      const hasLogo = Boolean(logoToUse);
      const textX = hasLogo ? 27 : MARGIN;

      if (hasLogo) {
        try {
          doc.addImage(logoToUse, 'PNG', MARGIN, 5.8, 10.5, 10.5);
        } catch (e) {
          console.warn('Could not add logo to PDF:', e);
        }
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('MUNICIPALITY OF LIBON, PROVINCE OF ALBAY', textX, 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('K&A ANIMAL BITE CENTER — HEALTH MONITORING REPORT', textX, 12.5);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Barangay Summary — ${periodLabel()}${isContinuation ? ' • Continuation' : ''}`, textX, 16.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(`Service: ${serviceFilterLabel()}  |  Status: ${statusFilterLabel()}  |  Date: ${dateGeneratedStr}`, pageWidth - MARGIN, 16.8, { align: 'right' });

      doc.setDrawColor(10, 29, 71);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 19.5, pageWidth - MARGIN, 19.5);
    }

    const bodyForChunk = (pageRows, startNum) => pageRows.map((p, i) => {
      const liveSt = derivePatientStatus(p);
      const isOverdue = liveSt !== 'completed' && (liveSt === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      const stLabel = liveSt === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing';
      return [
        startNum + i + 1,
        p.barangay || p.address || 'Libon, Albay',
        p.id || p.mrn || '—',
        formatTitleCase(p.name || '—'),
        `${p.age || '—'} / ${p.sex || '—'}`,
        p.contact || '—',
        p.service || 'PEP',
        ((p.service || '').trim().toUpperCase() === 'PEP') ? (p.cat ? `Cat ${p.cat}` : (p.animal || '—')) : '—',
        stLabel,
        formatDateNumeric(p.date || p.createdAt),
      ];
    });

    // One autoTable call per preview page, so the row that starts page 2 here
    // is the row that starts page 2 there.
    const pages = chunkPatientsIntoPages(rows);
    pages.forEach((pageRows, pIdx) => {
      if (pIdx > 0) doc.addPage();
      drawPdfHeader(pIdx > 0);

      const startNum = pIdx === 0 ? 0 : PAGE_1_ROWS + (pIdx - 1) * CONT_PAGE_ROWS;
      autoTable(doc, {
        startY: 21.5,
        margin: { top: 21.5, bottom: 12, left: MARGIN, right: MARGIN },
        head: [['#', 'Barangay / Address', 'Patient ID', 'Patient Name', 'Age / Sex', 'Contact No.', 'Service', 'Exposure', 'Status', 'Date Registered']],
        body: pageRows.length
          ? bodyForChunk(pageRows, startNum)
          : [[{ content: `No ${statusFilter === 'all' ? '' : statusFilter + ' '}records found for this period.`, colSpan: 10, styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' } }]],
        theme: 'grid',
        headStyles: {
          fillColor: [239, 246, 255],
          textColor: [0, 0, 0],
          fontSize: 7.5,
          fontStyle: 'bold',
          cellPadding: 1.9,
          lineColor: [203, 213, 225],
          lineWidth: 0.1,
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.6,
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.1,
          overflow: 'ellipsize',
          valign: 'middle',
        },
        columnStyles,
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 8) {
            if (data.cell.raw === 'Completed') {
              data.cell.styles.textColor = [21, 128, 61];
            } else if (data.cell.raw === 'Overdue') {
              data.cell.styles.textColor = [220, 38, 38];
            } else {
              data.cell.styles.textColor = [29, 78, 216];
            }
          }
        },
      });
    });

    // Stamping running footers on all pages: "Page X of Y"
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('K&A Animal Bite Treatment Center · Rural Health Unit · Confidential Clinical Report', MARGIN, pageHeight - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
    }

    return doc;
  }

  async function exportBulkPdf() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    const logoToUse = logoDataUrl || clinicLogoBase64Cache || CLINIC_LOGO_BASE64;
    const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
    buildBulkPdf(rows, logoToUse).save(`health-monitoring-report-${period}${statusSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
    onToast(`Landscape PDF exported (${rows.length} patient${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  function runBulkExport() {
    if (exportFormat === 'xls') exportBulkXLS();
    else exportBulkPdf();
  }

  const docType = 'record';
  const [zoomLevel, setZoomLevel] = useState(0.85);
  const [rotation] = useState(0);
  // A single patient record is usually well short of a full page, and a fixed
  // portrait sheet left a band of blank paper under the footer. The sheet is
  // measured from the rendered document instead, so it ends where the
  // content ends. Null until the iframe reports back.
  const [docSheetHeight, setDocSheetHeight] = useState(null);

  function getProtocolLabel(p) {
    const doses = buildDoses(p);
    const doneCount = doses.filter(d => (d.s || d.status) === 'done' || d.done === true).length;
    if (p?.service === 'PEP') {
      const hasERIG = doses.some(d => (d.n || d.label || '').includes('ERIG'));
      return hasERIG ? `ERIG + ARV ${doneCount}-dose series` : (doneCount ? `ARV ${doneCount}-dose series (Days 0, 3, 7, 14, 28)` : 'ARV vaccination series (Days 0, 3, 7, 14, 28)');
    }
    if (p?.service === 'PrEP') return `Rabies PrEP preventive series${doneCount ? ` (${doneCount} dose${doneCount > 1 ? 's' : ''} completed)` : ' (Days 0, 7, 21)'}`;
    if (p?.service === 'Tetanus') return `Anti-Tetanus vaccination${doneCount ? ` (${doneCount} dose${doneCount > 1 ? 's' : ''} completed)` : ''}`;
    if (p?.service === 'Pneumonia') return `Pneumococcal vaccination${doneCount ? ` (${doneCount} dose${doneCount > 1 ? 's' : ''} completed)` : ''}`;
    return `${p?.service || 'Vaccination'} treatment`;
  }

  const PATIENT_HIDDEN_NOTE = 'Wound assessment details are held in your clinical file at K&A Clinic.';

  // ── ONE MODEL, TWO RENDERERS ──────────────────────────────────────────
  // The on-screen preview and the downloaded PDF used to be written out
  // separately and had drifted: the preview carried sections the PDF never
  // printed. Both now render this single description of the record, so what
  // the preview shows is what the file contains.
  function buildMedicalRecordModel(p, audience = 'clinic') {
    const showWoundDetail = audience !== 'patient';
    const doses = buildDoses(p);
    const rawDate = p.date || (p.createdAt?.toDate ? p.createdAt.toDate() : p.createdAt);
    const registered = rawDate
      ? (formatDateLong(rawDate) || formatDateShort(rawDate) || String(rawDate).split('T')[0])
      : (p.date || '—');
    const st = derivePatientStatus(p);
    const isPEP = (p.service || '').trim().toUpperCase() === 'PEP';
    const caseNo = p.firestoreId ? p.firestoreId.slice(0, 8).toUpperCase() : (p.id || '—');

    const admin = [
      ['Date', registered, 'MRN', p.id || p.mrn || '—'],
      ['Account / Case No.', caseNo, 'Ward / Service', `${p.service || 'PEP'} (Animal Bite Clinic)`],
      ['Primary Attending', 'Dr. Francis R. Reyes, MD', 'Status', st.toUpperCase()],
    ];

    const complaintRows = isPEP
      ? [
          ['Presenting Complaint', `Clinical evaluation and post-exposure prophylaxis following exposure to ${p.animal || 'animal'} on ${fmtDate(p.date) || registered}. Assessed as Category ${p.cat || '—'} bite exposure.`],
          ['Exposure Category', `Category ${p.cat || '—'}`],
          ...(showWoundDetail
            ? [['Wound Site / Depth', `${p.woundLocation || '—'} · ${p.woundDepth || '—'} · Bites: ${p.numberOfBites || '1'}`]]
            : [['Wound Assessment', PATIENT_HIDDEN_NOTE]]),
        ]
      : [
          ['Presenting Complaint', `Patient received clinical assessment and vaccination administration under the ${p.service || 'vaccination'} protocol.`],
        ];

    const sections = [
      {
        title: '1. PATIENT DEMOGRAPHICS',
        rows: [
          ['Name', formatTitleCase(p.name)],
          ['Age / Gender', `${p.age || '—'} yrs · ${(p.sex || '—').toUpperCase()}`],
          ['Date of Birth', p.dob ? (formatDateLong(p.dob) || p.dob) : '—'],
          ['Height / Weight', `${p.height ? `${p.height} cm` : '—'} · ${p.weight ? `${p.weight} kg` : '—'}`],
          ['Blood Pressure', p.bloodPressure || '—'],
          ['Contact / Address', `${p.contact || '—'} · ${p.address || '—'}`],
          ['Guarantor / Next of Kin', p.emergencyName
            ? `${p.emergencyName}${p.emergencyRel ? ` (${p.emergencyRel})` : ''}${p.emergencyPhone ? ` · ${p.emergencyPhone}` : ''}`
            : (p.guardian || p.emergencyContact || '—')],
        ],
      },
      {
        title: '2. ENCOUNTER SUMMARY',
        rows: [
          ['Encounter Type', 'Outpatient Clinical Consultation & Prophylaxis'],
          ['Protocol / Reason', isPEP ? `Animal Bite Exposure (${p.animal || 'Animal'} Bite)` : `${p.service || 'Vaccination'} Protocol`],
          ['Registration Date', registered],
          ['Treatment Protocol', getProtocolLabel(p)],
          ['Attending Facility', 'K&A Animal Bite Treatment Center · Municipality of Libon, Province of Albay'],
        ],
      },
      {
        title: '3. CHIEF COMPLAINT & CLINICAL DETAILS',
        rows: complaintRows,
      },
      {
        title: '4. MEDICAL HISTORY',
        rows: [
          ['Past Vaccines', p.pastVaccines || 'None reported'],
          ['Allergies', p.allergies || 'No known allergies'],
        ],
      },
    ];

    const doseRows = doses.map(d => {
      const rawStatus = String(d.status || d.s || 'pending').toLowerCase();
      const isDone = rawStatus === 'done' || rawStatus === 'completed' || d.done === true;
      const isMiss = rawStatus === 'miss' || rawStatus === 'missed' || rawStatus === 'overdue';
      return {
        label: d.label || d.n || d.dose || d.name || 'Dose',
        date: d.date ? (formatDateShort(d.date) || d.date) : '—',
        status: isMiss ? 'Overdue' : isDone ? 'Completed' : 'Scheduled',
        kind: isMiss ? 'miss' : isDone ? 'done' : 'pending',
      };
    });

    const assessment = [
      ['Assessment', st === 'completed'
        ? 'Successfully completed full prescribed post-exposure prophylaxis regimen with no adverse reactions.'
        : 'Ongoing vaccination treatment. Patient is adhering to protocol.'],
      ['Plan & Recommendations', 'Complete remaining scheduled vaccine doses on designated dates. Maintain proper wound care hygiene. Avoid applying irritants or traditional remedies to bite wound. Report any fever, malaise, or neurological symptoms immediately.'],
    ];

    return {
      registered,
      status: st,
      admin,
      sections,
      doseSectionTitle: '5. VACCINATION DOSING SCHEDULE',
      doseRows,
      assessmentTitle: '6. ASSESSMENTS & RECOMMENDATIONS',
      assessment,
      officer: {
        name: 'Dr. Francis R. Reyes, MD',
        license: 'PRC License # 0123456 · Animal Bite Treatment Specialist',
        issued: `Date Issued: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        badge: 'VERIFIED EHR CLINICAL RECORD',
      },
      footer: [
        `Generated by K&A Clinic EHR System · Confidential Patient Information · ${new Date().getFullYear()}`,
        'K&A Animal Bite Center · Municipality of Libon, Province of Albay',
      ],
    };
  }

  const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function medicalRecordBodyHtml(p, audience = 'clinic', logo = (logoDataUrl || CLINIC_LOGO_BASE64)) {
    if (!p) return '<div style="padding:40px;text-align:center;color:#64748B;">No patient record selected.</div>';
    const m = buildMedicalRecordModel(p, audience);

    const CELL = 'padding:4.5px 8px;border:1px solid #CBD5E1;font-size:9.5px;line-height:1.45;';
    const LABEL_CELL = `${CELL}background:#F8FAFC;color:#475569;font-weight:700;width:26%;vertical-align:top;`;
    const VALUE_CELL = `${CELL}color:#0F172A;vertical-align:top;`;
    const statusColor = m.status === 'completed' ? '#15803D' : m.status === 'overdue' ? '#DC2626' : '#1D4ED8';

    // Administrative box: two label/value pairs per row, the same 4-column
    // shape autoTable draws in the PDF.
    const adminRows = m.admin.map(([l1, v1, l2, v2]) => `
      <tr>
        <td style="${LABEL_CELL}width:22%;">${escapeHtml(l1)}</td>
        <td style="${VALUE_CELL}width:28%;">${escapeHtml(v1)}</td>
        <td style="${LABEL_CELL}width:22%;">${escapeHtml(l2)}</td>
        <td style="${VALUE_CELL}width:28%;${l2 === 'Status' ? `font-weight:700;color:${statusColor};` : ''}">${escapeHtml(v2)}</td>
      </tr>`).join('');

    const sectionHtml = (title, rows) => `
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed;">
        <thead>
          <tr><th colspan="2" style="${CELL}background:#0A1D47;color:#FFFFFF;text-align:left;font-weight:700;letter-spacing:.3px;">${escapeHtml(title)}</th></tr>
        </thead>
        <tbody>
          ${rows.map(([label, value]) => `
          <tr>
            <td style="${LABEL_CELL}">${escapeHtml(label)}</td>
            <td style="${VALUE_CELL}">${escapeHtml(value)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    const doseTable = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed;">
        <thead>
          <tr>
            <th style="${CELL}background:#1D4ED8;color:#FFFFFF;text-align:left;font-weight:700;width:40%;">Dose</th>
            <th style="${CELL}background:#1D4ED8;color:#FFFFFF;text-align:left;font-weight:700;width:35%;">Scheduled Date</th>
            <th style="${CELL}background:#1D4ED8;color:#FFFFFF;text-align:left;font-weight:700;width:25%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${m.doseRows.length
            ? m.doseRows.map((d, i) => `
          <tr style="background:${i % 2 ? '#FAFAFC' : '#FFFFFF'};">
            <td style="${VALUE_CELL}">${escapeHtml(d.label)}</td>
            <td style="${VALUE_CELL}">${escapeHtml(d.date)}</td>
            <td style="${VALUE_CELL}font-weight:700;">${escapeHtml(d.status)}</td>
          </tr>`).join('')
            : `<tr><td colspan="3" style="${VALUE_CELL}text-align:center;color:#64748B;">No dose schedule on file.</td></tr>`}
        </tbody>
      </table>`;

    return `
      <div style="font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;font-size:10px;line-height:1.5;padding:20px 24px;background:#FFFFFF;">

        <!-- Institutional letterhead -->
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 4px;border:none;">
          <tr>
            <td style="vertical-align:middle;padding-right:14px;width:62px;text-align:right;">
              <img src="${logo || '/assets/dashboard/logo-white-nobg.png'}" alt="K&A Clinic Logo" style="width:58px;height:58px;object-fit:contain;display:block;" />
            </td>
            <td style="vertical-align:middle;text-align:center;padding:0 6px;">
              <div style="font-size:15px;font-weight:900;color:#0F172A;letter-spacing:0.6px;text-transform:uppercase;">K&amp;A ANIMAL BITE CENTER</div>
              <div style="font-size:8.5px;color:#1D4ED8;font-weight:700;margin-top:2px;">Caring for Life &bull; Animal Bite Treatment &amp; Care</div>
              <div style="font-size:8px;color:#64748B;margin-top:2px;">Municipality of Libon, Province of Albay | Ph: (052) 742-0123 | ka.animalbitecenter@gmail.com</div>
            </td>
            <td style="vertical-align:middle;padding-left:14px;width:62px;">
              <div style="width:62px;height:1px;"></div>
            </td>
          </tr>
        </table>

        <div style="border-top:1.6px solid #0A1D47;border-bottom:.6px solid #0A1D47;height:2px;margin:6px 0 10px;"></div>

        <div style="text-align:center;margin-bottom:10px;">
          <h1 style="margin:0;font-size:13px;font-weight:900;color:#0A1D47;letter-spacing:1px;text-transform:uppercase;">PATIENT MEDICAL REPORT</h1>
        </div>

        <!-- Administrative information -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed;">
          <thead>
            <tr><th colspan="4" style="${CELL}background:#F1F5F9;color:#0A1D47;text-align:center;font-weight:700;letter-spacing:.3px;">ADMINISTRATIVE INFORMATION</th></tr>
          </thead>
          <tbody>${adminRows}</tbody>
        </table>

        ${m.sections.map(s => sectionHtml(s.title, s.rows)).join('')}

        <div style="font-size:9.5px;font-weight:800;color:#0F172A;letter-spacing:.3px;margin:10px 0 4px;">${escapeHtml(m.doseSectionTitle)}</div>
        ${doseTable}

        ${sectionHtml(m.assessmentTitle, m.assessment)}

        <!-- Attending officer & verification -->
        <table style="width:100%;border-collapse:collapse;margin-top:10px;border-top:1px solid #CBD5E1;">
          <tr>
            <td style="padding-top:8px;font-size:9px;color:#334155;vertical-align:bottom;">
              <div><strong>Attending Medical Officer:</strong> ${escapeHtml(m.officer.name)}</div>
              <div style="font-size:8px;color:#64748B;">${escapeHtml(m.officer.license)}</div>
              <div style="font-size:8px;color:#64748B;">${escapeHtml(m.officer.issued)}</div>
            </td>
            <td style="padding-top:8px;text-align:right;vertical-align:bottom;">
              <span style="display:inline-block;padding:3px 8px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:4px;font-size:8px;font-weight:700;color:#1D4ED8;">${escapeHtml(m.officer.badge)}</span>
            </td>
          </tr>
        </table>

        <div style="margin-top:12px;font-size:7.5px;color:#94A3B8;text-align:center;line-height:1.5;">
          ${escapeHtml(m.footer[0])}<br>${escapeHtml(m.footer[1])}
        </div>
      </div>`;
  }

  function buildDocumentHtml(p, type = 'record', audience = 'clinic') {
    if (!p) return '<!DOCTYPE html><html><body><div style="padding:40px;text-align:center;color:#64748B;">No patient selected.</div></body></html>';
    return `<!DOCTYPE html><html><head><title>Patient Medical Report — ${formatTitleCase(p.name || '')}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      /* Browsers drop table fills when printing unless colour adjustment is
         forced, which is what turned the navy section bars pale grey on paper. */
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
      body{font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#FFFFFF;}
      @media print{
        @page{size:A4 portrait;margin:8mm 10mm;}
        html,body{margin:0!important;padding:0!important;background:#FFFFFF!important;}
        /* Keeps the record on one sheet and stops a section splitting across
           the page break. */
        body{zoom:0.88;}
        table{page-break-inside:avoid;break-inside:avoid;}
        tr,td,th{page-break-inside:avoid;break-inside:avoid;}
        thead{display:table-header-group;}
      }
    </style>
    </head><body><div>${medicalRecordBodyHtml(p, audience, logoDataUrl || CLINIC_LOGO_BASE64)}</div></body></html>`;
  }

  // `density` scales the table metrics so a long record can be squeezed onto
  // one sheet — buildDocumentPdf steps through the presets until the whole
  // report fits, matching the preview, which never paginates.
  function drawMedicalRecordPdf(doc, p, audience = 'clinic', logoDataUrl = clinicLogoBase64Cache || CLINIC_LOGO_BASE64, density = { fontSize: 8, cellPadding: 2.5, gap: 4 }) {
    if (!p) return;
    const m = buildMedicalRecordModel(p, audience);
    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', 14, 8, 14, 14);
      } catch (e) {
        console.warn('Could not add logo to single report PDF:', e);
      }
    }

    // Clean institutional header matching report format
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('K&A ANIMAL BITE CENTER', pageWidth / 2, 13, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(29, 78, 216);
    doc.text('Caring for Life · Animal Bite Treatment & Care', pageWidth / 2, 17, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Municipality of Libon, Province of Albay | Ph: (052) 742-0123 | ka.animalbitecenter@gmail.com', pageWidth / 2, 21, { align: 'center' });

    // Double divider line
    doc.setDrawColor(10, 29, 71);
    doc.setLineWidth(0.6);
    doc.line(14, 24, pageWidth - 14, 24);
    doc.setLineWidth(0.2);
    doc.line(14, 25.5, pageWidth - 14, 25.5);

    // Document Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 29, 71);
    doc.text('PATIENT MEDICAL REPORT', pageWidth / 2, 31, { align: 'center' });

    const baseStyles = { fontSize: density.fontSize, cellPadding: density.cellPadding, overflow: 'linebreak', valign: 'top' };
    const GAP = density.gap;
    const labelColumn = { 0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 45 } };

    // Administrative Information Box
    autoTable(doc, {
      startY: 34,
      head: [['ADMINISTRATIVE INFORMATION', '', '', '']],
      body: m.admin,
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [10, 29, 71], fontStyle: 'bold', fontSize: density.fontSize, halign: 'center' },
      styles: baseStyles,
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 35 },
        2: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 35 },
      },
    });

    // Sections 1–4, straight off the shared model so the PDF carries every
    // field the preview shows.
    m.sections.forEach(section => {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + GAP,
        head: [[section.title, '']],
        body: section.rows,
        theme: 'grid',
        headStyles: { fillColor: [10, 29, 71], textColor: 255, fontSize: density.fontSize, fontStyle: 'bold' },
        styles: baseStyles,
        columnStyles: labelColumn,
      });
    });

    // 5. Vaccination Dosing Schedule
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + GAP,
      head: [['Dose', 'Scheduled Date', 'Status']],
      body: m.doseRows.length
        ? m.doseRows.map(d => [d.label, d.date, d.status])
        : [['No dose schedule on file.', '', '']],
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontSize: density.fontSize, fontStyle: 'bold' },
      styles: baseStyles,
      alternateRowStyles: { fillColor: [250, 250, 252] },
    });

    // 6. Assessments & Recommendations
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + GAP,
      head: [[m.assessmentTitle, '']],
      body: m.assessment,
      theme: 'grid',
      headStyles: { fillColor: [10, 29, 71], textColor: 255, fontSize: density.fontSize, fontStyle: 'bold' },
      styles: baseStyles,
      columnStyles: labelColumn,
    });

    // Attending officer & verification. The block is pinned above the footer
    // rather than pushed to a second page — buildDocumentPdf re-renders at a
    // tighter density instead, so the report stays a single sheet.
    const pageHeight = doc.internal.pageSize.getHeight();
    const y = Math.min(doc.lastAutoTable.finalY + 8, pageHeight - 26);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(14, y, pageWidth - 14, y);

    const yText = y + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Attending Medical Officer:', 14, yText);
    const officerLabelWidth = doc.getTextWidth('Attending Medical Officer: ');
    doc.setFont('helvetica', 'normal');
    doc.text(m.officer.name, 14 + officerLabelWidth, yText);

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(m.officer.license, 14, yText + 4);
    doc.text(m.officer.issued, 14, yText + 8);

    // Verified badge, right-aligned against the officer block
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const badgeWidth = doc.getTextWidth(m.officer.badge) + 6;
    const badgeX = pageWidth - 14 - badgeWidth;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(badgeX, yText + 1, badgeWidth, 6, 1, 1, 'FD');
    doc.setTextColor(29, 78, 216);
    doc.text(m.officer.badge, badgeX + 3, yText + 5);

    // Footer on every page
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(m.footer[0], pageWidth / 2, pageHeight - 11, { align: 'center' });
      doc.text(m.footer[1], pageWidth / 2, pageHeight - 7.5, { align: 'center' });
    }
  }

  // Preview and print show the whole record in one continuous sheet, so the
  // download must not split mid-table. Each preset is drawn into a throwaway
  // document; the first that lands on a single page is the one returned, and
  // the tightest is used as-is if even that overflows.
  const PDF_DENSITIES = [
    { fontSize: 8, cellPadding: 2.5, gap: 4 },
    { fontSize: 7.5, cellPadding: 2, gap: 3.5 },
    { fontSize: 7, cellPadding: 1.6, gap: 3 },
    { fontSize: 6.5, cellPadding: 1.2, gap: 2.5 },
    { fontSize: 6, cellPadding: 1, gap: 2 },
  ];

  function buildDocumentPdf(p, type = 'record', audience = 'clinic', logoDataUrl = clinicLogoBase64Cache || CLINIC_LOGO_BASE64) {
    let doc;
    for (let i = 0; i < PDF_DENSITIES.length; i++) {
      doc = new jsPDF();
      drawMedicalRecordPdf(doc, p, audience, logoDataUrl, PDF_DENSITIES[i]);
      if (doc.internal.getNumberOfPages() === 1) return doc;
    }
    return doc;
  }

  function docTypeLabel() {
    return 'Patient Medical Report';
  }

  async function exportSinglePatientPdf(p) {
    if (!p) return;
    const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
    buildDocumentPdf(p, docType, 'clinic', logo).save(`medical-report-${p.id || p.mrn || p.firestoreId || 'patient'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    onToast(`Medical Report exported for ${formatTitleCase(p.name)}`, 'success');
  }

  function printSinglePatientReport(p) {
    if (!p) return;
    const w = window.open('', '_blank');
    if (!w) {
      onToast('Pop-up was blocked. Please allow pop-ups for this site.', 'error');
      return;
    }
    w.document.write(buildDocumentHtml(p, docType, 'clinic'));
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch (e) { console.error('Print error:', e); }
    }, 250);
    onToast(`Medical Report opened for printing — ${formatTitleCase(p.name)}`, 'success');
  }

  // jsPDF 4.x has no 'base64' output type — it returns null, which is how the
  // report used to arrive as an email with no attachment at all. The data URI
  // carries the same bytes with a prefix to strip.
  function pdfToBase64(doc) {
    const uri = doc.output('datauristring');
    const comma = uri.indexOf(',');
    return comma === -1 ? '' : uri.slice(comma + 1);
  }

  // The clinic report used to be mailed as its own rendered HTML page. With a
  // base64 logo on every page that body ran to megabytes and the send silently
  // failed, so the registry now travels as the same PDF the Export button
  // produces, with a short covering note as the body.
  async function emailBulkReportPdf(to) {
    try {
      const rows = getFilteredPatients();
      if (rows.length === 0) {
        onToast('No patients found for this period', 'error');
        return;
      }
      const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
      const base64 = pdfToBase64(buildBulkPdf(rows, logo));
      if (!base64) {
        onToast('Could not generate the PDF report. Please try again.', 'error');
        return;
      }
      const statusSlug = statusFilter !== 'all' ? `-${statusFilter}` : '';
      await sendReportEmail(
        to,
        `K&A Clinic — Health Monitoring Report (${periodLabel()})`,
        `<p>Attached is the K&amp;A Animal Bite Center health monitoring report for <strong>${periodLabel()}</strong>.</p>`
          + `<p>Service: ${serviceFilterLabel()} &bull; Status: ${statusFilterLabel()} &bull; ${rows.length} patient record${rows.length !== 1 ? 's' : ''}.</p>`
          + `<p>&mdash; K&amp;A Animal Bite Center</p>`,
        { base64, filename: `health-monitoring-report-${period}${statusSlug}-${getTodayDateString()}.pdf` }
      );
    } catch (err) {
      console.error('emailBulkReportPdf error:', err);
      onToast('Failed to prepare PDF report for emailing.', 'error');
    }
  }

  async function emailSinglePatientPdf(p, to) {
    if (!p) return;
    try {
      const logo = (await getClinicLogoBase64()) || logoDataUrl || CLINIC_LOGO_BASE64;
      const base64 = pdfToBase64(buildDocumentPdf(p, docType, 'patient', logo));
      if (!base64) {
        onToast('Could not generate the PDF attachment. Please try again.', 'error');
        return;
      }
      await sendReportEmail(
        to,
        `K&A Clinic — Medical Report for ${formatTitleCase(p.name)}`,
        `<p>Dear ${formatTitleCase(p.name)},</p><p>Please find your official patient medical report from K&amp;A Animal Bite Center attached as a PDF.</p><p>&mdash; K&amp;A Animal Bite Center</p>`,
        { base64, filename: `medical-report-${p.id || p.mrn || p.firestoreId || 'patient'}.pdf` }
      );
    } catch (err) {
      console.error('emailSinglePatientPdf error:', err);
      onToast('Failed to prepare patient document for emailing.', 'error');
    }
  }

  // The measured height belongs to one specific rendered document; re-measure
  // rather than briefly showing the previous record's sheet size.
  useEffect(() => { setDocSheetHeight(null); }, [selectedPatient, showEmailInput, mode, exportFormat, period, statusFilter, serviceFilter]);

  const preview = getFilteredPatients();

  // The clinic report is landscape orientation, so the preview sheet turns
  // landscape for bulk exports and stays portrait for a single patient record.
  const isLandscapeSheet = mode === 'bulk';

  // `allow-same-origin` (with scripts still blocked) is what makes the loaded
  // document readable for the height measurement below.
  const previewPane = (html, onMeasure) => (
    <iframe
      title="Report preview"
      sandbox="allow-same-origin"
      srcDoc={html}
      onLoad={onMeasure ? (e) => {
        const body = e.currentTarget.contentDocument?.body;
        if (body) onMeasure(Math.ceil(body.scrollHeight));
      } : undefined}
      style={{ display: 'block', width: '100%', height: '100%', border: 'none', background: '#FFFFFF' }}
    />
  );

  const selectStyle = {
    width: '100%', padding: '9px 12px', fontSize: '.8125rem', fontWeight: 600, color: '#0F172A',
    border: '1px solid #CBD5E1', borderRadius: 12, background: '#FFFFFF', outline: 'none', cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
  };
  const labelStyle = {
    display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155',
    textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6
  };
  const previewPages = mode === 'bulk' ? chunkPatientsIntoPages(preview).length : 1;
  // Width is the paper; height comes from whatever the rendered document
  // actually measured, so a short record has no trailing blank paper and a
  // multi-page report shows every page stacked.
  const sheetWidth = mode === 'bulk' ? 1100 : 820;
  const sheetHeight = mode === 'bulk'
    ? (docSheetHeight || previewPages * 790)
    : Math.min(docSheetHeight || 1060, 1060);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200"
        style={{ width: '1360px', maxWidth: '98vw', height: '92vh', maxHeight: '960px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Card head */}
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
              <h3 className="text-sm font-bold text-slate-900">
                {mode === 'single' ? `Export Patient Record — ${formatTitleCase(selectedPatient?.name || 'Patient')}` : 'Export Clinic Report'}
              </h3>
              <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                {mode === 'single'
                  ? `Official patient medical report for ${formatTitleCase(selectedPatient?.name || 'Patient')}`
                  : 'Download, print, or email official clinic registry reports'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* 2-column split body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT PANEL: settings */}
          <div style={{
            width: '340px', flexShrink: 0, background: '#F7F8FD',
            borderRight: '1px solid #E3E7F5', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto'
          }}>
            {mode === 'bulk' ? (
              <>
                {/* Report Period */}
                <div>
                  <label style={labelStyle}>Report Period</label>
                  <select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
                    <option value="monthly">Monthly (This Calendar Month)</option>
                    <option value="daily">Daily (Today)</option>
                    <option value="weekly">Weekly (Last 7 Days)</option>
                    <option value="yearly">Yearly (This Calendar Year)</option>
                    <option value="all">All Time (Full Registry)</option>
                  </select>
                </div>

                {/* Service / Vaccine */}
                <div>
                  <label style={labelStyle}>Service / Vaccine</label>
                  <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Services</option>
                    <option value="pep">PEP (Post-Exposure Prophylaxis)</option>
                    <option value="prep">PrEP (Pre-Exposure Prophylaxis)</option>
                    <option value="tetanus">Anti-Tetano (Tetanus)</option>
                    <option value="pneumonia">Pneumonia Vaccine</option>
                  </select>
                </div>

                {/* Record Status */}
                <div>
                  <label style={labelStyle}>Record Status</label>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Statuses</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="overdue">Overdue</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                {/* Export Format */}
                <div>
                  <label style={labelStyle}>Export Format</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setExportFormat('pdf')}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        exportFormat === 'pdf' ? 'border-[#3B50DF] bg-[#EEF2FF] shadow-xs ring-1 ring-[#3B50DF]/30' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${exportFormat === 'pdf' ? 'bg-[#3B50DF] text-white' : 'bg-slate-100 text-slate-600'}`}>
                        PDF
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-900">PDF</div>
                        <div className="text-[10px] text-slate-600">Official printout</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('xls')}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        exportFormat === 'xls' ? 'border-[#3B50DF] bg-[#EEF2FF] shadow-xs ring-1 ring-[#3B50DF]/30' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${exportFormat === 'xls' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        XLS
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-900">Excel</div>
                        <div className="text-[10px] text-slate-600">Raw data</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Matching result banner */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs">
                  <span className="font-medium text-slate-600">Matching records:</span>
                  <span className="font-extrabold text-[#3B50DF] bg-[#EEF2FF] px-2.5 py-1 rounded-full border border-[#E0E7FF]">
                    {preview.length} patient{preview.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* Target patient */}
                <div>
                  <label style={labelStyle}>Target Patient Record</label>
                  {selectedPatient ? (
                    <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '.8125rem', fontWeight: 800, color: '#0F172A' }}>
                        {formatTitleCase(selectedPatient.name || '—')}
                      </div>
                      <div style={{ fontSize: '.71875rem', color: '#64748B', marginTop: 2 }}>
                        ID: <strong style={{ color: '#3B50DF' }}>{selectedPatient.id || selectedPatient.mrn || '—'}</strong>
                        {selectedPatient.age ? ` · ${selectedPatient.age} yrs` : ''} · {selectedPatient.sex || '—'}
                      </div>
                      <div style={{ fontSize: '.71875rem', color: '#64748B', marginTop: 4 }}>
                        {selectedPatient.service || 'PEP'} · {selectedPatient.barangay || selectedPatient.address || 'Libon, Albay'}
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.71875rem', color: '#64748B' }}>
                        <span>Exposure / Category:</span>
                        <strong style={{ color: '#0F172A' }}>
                          {((selectedPatient.service || '').trim().toUpperCase() === 'PEP')
                            ? (selectedPatient.cat ? `Category ${selectedPatient.cat}` : (selectedPatient.animal || '—'))
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={patientQuery}
                        onChange={e => setPatientQuery(e.target.value)}
                        placeholder="Search by name, ID, or MRN…"
                        style={{ ...selectStyle, cursor: 'text', fontWeight: 500 }}
                      />
                      {matchingPatients.length > 0 && (
                        <div className="mt-1.5 border border-slate-200 rounded-xl bg-white shadow-lg overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                          {matchingPatients.map(p => (
                            <button
                              key={p.id || p.firestoreId}
                              type="button"
                              onClick={() => { setSelectedPatient(p); setPatientQuery(formatTitleCase(p.name)); }}
                              className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                            >
                              <span className="font-bold text-slate-800">{formatTitleCase(p.name)}</span>
                              <span className="text-slate-400 text-[11px]">{p.id || p.mrn}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Document type — the medical record is the only issued form */}
                <div>
                  <label style={labelStyle}>Document Type</label>
                  <div style={{ ...selectStyle, cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{docTypeLabel()}</span>
                    <span style={{ fontSize: '.6875rem', color: '#64748B', fontWeight: 600 }}>PDF / Print</span>
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
              {mode === 'bulk' ? (
                <>
                  <button
                    type="button"
                    onClick={runBulkExport}
                    disabled={preview.length === 0}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid transparent',
                      background: '#3B50DF', color: '#FFFFFF', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: preview.length === 0 ? 0.5 : 1
                    }}
                  >
                    <Download size={14} />
                    Export {exportFormat === 'xls' ? 'Excel (XLS)' : 'PDF'} ({preview.length})
                  </button>
                  <button
                    type="button"
                    onClick={exportPrint}
                    disabled={preview.length === 0}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#0F172A', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: preview.length === 0 ? 0.5 : 1
                    }}
                  >
                    <Printer size={14} />
                    Print Report
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => exportSinglePatientPdf(selectedPatient)}
                    disabled={!selectedPatient}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid transparent',
                      background: '#3B50DF', color: '#FFFFFF', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: !selectedPatient ? 0.5 : 1
                    }}
                  >
                    <Download size={14} />
                    Export PDF Document
                  </button>
                  <button
                    type="button"
                    onClick={() => printSinglePatientReport(selectedPatient)}
                    disabled={!selectedPatient}
                    style={{
                      width: '100%', height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#0F172A', fontSize: '.8125rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      opacity: !selectedPatient ? 0.5 : 1
                    }}
                  >
                    <Printer size={14} />
                    Print Patient Record
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowEmailInput(v => !v);
                  setSentTo('');
                  if (mode === 'single' && selectedPatient && !emailTo) {
                    setEmailTo(selectedPatient.email || '');
                  }
                }}
                disabled={mode === 'bulk' ? preview.length === 0 : !selectedPatient}
                style={{
                  width: '100%', height: 42, padding: '0 16px', borderRadius: 12,
                  border: showEmailInput ? '1px solid #3B50DF' : '1px solid #CBD5E1',
                  background: showEmailInput ? '#EEF2FF' : '#FFFFFF',
                  color: showEmailInput ? '#3B50DF' : '#0F172A',
                  fontSize: '.8125rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                  opacity: (mode === 'bulk' ? preview.length === 0 : !selectedPatient) ? 0.5 : 1
                }}
              >
                Email Report
              </button>

              {showEmailInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, marginTop: 2 }}>
                  {sentTo && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8 }}>
                      <span style={{ color: '#047857', fontWeight: 800, lineHeight: 1.2 }}>✓</span>
                      <div style={{ fontSize: '.71875rem', color: '#065F46', lineHeight: 1.45 }}>
                        <strong>Sent.</strong> The report was emailed to <strong>{sentTo}</strong>.
                      </div>
                    </div>
                  )}
                  <input
                    type="email"
                    placeholder="Enter recipient email…"
                    value={emailTo}
                    onChange={e => { setEmailTo(e.target.value); setSentTo(''); }}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '.8125rem', border: '1px solid #CBD5E1', borderRadius: 6, outline: 'none', background: '#fff' }}
                  />
                  <button
                    type="button"
                    disabled={sending || !emailTo.trim()}
                    onClick={() =>
                      mode === 'bulk'
                        ? emailBulkReportPdf(emailTo)
                        : emailSinglePatientPdf(selectedPatient, emailTo)
                    }
                    style={{ width: '100%', height: 38, background: '#3B50DF', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', opacity: (sending || !emailTo.trim()) ? 0.6 : 1 }}
                  >
                    {sending ? 'Sending… this can take a few seconds' : 'Send via Email'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: live paper document preview */}
          <div style={{ flex: 1, background: '#EDF0FA', padding: '16px 24px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Viewer toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#FFFFFF', padding: '6px 16px', borderRadius: 12,
              border: '1px solid #E2E8F0',
              color: '#334155', fontSize: '.8125rem', fontWeight: 600,
              boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 16, flexShrink: 0,
              position: 'sticky', top: 0, zIndex: 10
            }}>
              <span style={{ fontSize: '.78125rem', color: '#64748B' }}>
                {previewPages} page{previewPages !== 1 ? 's' : ''}
              </span>

              <div style={{ width: 1, height: 16, background: '#E2E8F0', margin: '0 4px' }} />

              <button type="button" onClick={() => setZoomLevel(z => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom Out">−</button>

              <span style={{ minWidth: 46, textAlign: 'center', fontWeight: 700, color: '#0F172A', background: '#F1F5F9', padding: '2px 8px', borderRadius: 6, fontSize: '.78125rem' }}>
                {Math.round(zoomLevel * 100)}%
              </span>

              <button type="button" onClick={() => setZoomLevel(z => Math.min(1.6, Math.round((z + 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom In">+</button>

              <div style={{ width: 1, height: 16, background: '#E2E8F0', margin: '0 4px' }} />

              <button type="button" onClick={() => setZoomLevel(0.85)} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '.9rem', cursor: 'pointer', padding: '0 4px' }} title="Fit to Page">↕</button>
            </div>

            {/* Paper sheet. The outer box reserves the *scaled* footprint, so
                zooming out shrinks the page inside the panel instead of leaving
                the sheet floating over reserved-but-empty space. The bulk report
                draws its own page chrome (and its own page breaks), so only the
                single-patient document gets a white sheet drawn around it. */}
            <div style={{
              width: `${sheetWidth * zoomLevel}px`,
              height: `${sheetHeight * zoomLevel}px`,
              flexShrink: 0,
              transition: 'width 0.15s ease, height 0.15s ease',
            }}>
              <div style={{
                width: `${sheetWidth}px`,
                height: `${sheetHeight}px`,
                background: isLandscapeSheet ? 'transparent' : '#FFFFFF',
                borderRadius: isLandscapeSheet ? 0 : 6,
                border: isLandscapeSheet ? 'none' : '1px solid #D8DEF0',
                boxShadow: isLandscapeSheet ? 'none' : '0 6px 24px rgba(15,23,42,0.14)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                transform: `scale(${zoomLevel}) ${rotation ? `rotate(${rotation}deg)` : ''}`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease',
              }}>
                {mode === 'bulk' ? (
                  previewPane(
                    exportFormat === 'xls'
                      ? buildExcelPreviewHtml(preview, periodLabel())
                      : buildBulkReportHtml(preview, logoDataUrl),
                    setDocSheetHeight
                  )
                ) : selectedPatient ? (
                  previewPane(
                    buildDocumentHtml(selectedPatient, docType, showEmailInput ? 'patient' : 'clinic'),
                    setDocSheetHeight
                  )
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', color: '#64748B', fontSize: '.875rem' }}>
                    Search and select a patient on the left panel to preview document.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────── FOLLOW-UP NOTIFICATION MODAL ─────────────────────────── */
// Manual send. The same /api/notifications send-followup action also backs the
// automatic due-dose sweep, so both paths produce identical patient-facing
// notifications and identical acknowledgement tracking.
function FollowUpModal({ patient, onClose, onToast }) {
  const PRESETS = [
    { key: 'due', label: 'Dose due reminder', text: 'Your next anti-rabies vaccine dose is due. Please visit K&A Clinic on your scheduled date to stay on track with your treatment.' },
    { key: 'missed', label: 'Missed dose follow-up', text: 'Our records show you missed a scheduled dose. Please visit K&A Clinic as soon as possible so your treatment schedule can be adjusted safely.' },
    { key: 'checkup', label: 'Wound check-up', text: 'Please come in for a follow-up wound assessment at K&A Clinic. Bring your patient record with you.' },
    { key: 'custom', label: 'Custom message', text: '' },
  ];
  const [preset, setPreset] = useState('due');
  const [message, setMessage] = useState(PRESETS[0].text);
  const [sending, setSending] = useState(false);
  // The toast renders under the modal's portal, so a send needs its own
  // confirmation inside the card.
  const [sentTo, setSentTo] = useState('');
  const [sentSuccess, setSentSuccess] = useState(null);

  const pickPreset = (key) => {
    setPreset(key);
    const found = PRESETS.find(x => x.key === key);
    if (found && found.key !== 'custom') setMessage(found.text);
    if (found && found.key === 'custom') setMessage('');
  };

  async function send() {
    if (!message.trim()) { onToast('Enter a message to send.', 'error'); return; }
    setSending(true);
    try {
      const result = await authedPostJson('/api/notifications', {
        action: 'send-followup',
        patientId: patient.firestoreId || patient.id,
        title: 'Follow-up reminder',
        message: message.trim(),
        source: 'manual',
      });
      if (!result?.success) {
        onToast(result?.error || 'Failed to send follow-up.', 'error');
        setSending(false);
        return;
      }
      const parts = [];
      if (result.pushSent > 0) parts.push('app notification');
      if (result.emailed) parts.push('email');
      
      setSentSuccess({
        message: parts.length
          ? `Follow-up notification sent successfully to ${formatTitleCase(patient.name)} via ${parts.join(' and ')}.`
          : `Follow-up notification logged for ${formatTitleCase(patient.name)}.`,
        channels: parts
      });
      onToast(
        parts.length
          ? `Follow-up sent via ${parts.join(' and ')} to ${formatTitleCase(patient.name)}`
          : `Notification saved for ${formatTitleCase(patient.name)}`,
        'success'
      );
    } catch (err) {
      console.error('Follow-up send error:', err);
      onToast('Failed to send follow-up.', 'error');
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>Send Follow-up</h3>
            <p style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.65)', margin: '3px 0 0' }}>
              Notifies {formatTitleCase(patient.name)} in the app and by email
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}>
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {sentSuccess ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', border: '2px solid #86EFAC', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
              Follow-up Sent to Patient!
            </h4>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '14px 18px', maxWidth: 460, margin: '0 auto 18px', textAlign: 'left' }}>
              <p style={{ fontSize: '.875rem', color: '#15803D', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> Delivered to {formatTitleCase(patient.name)}
              </p>
              <p style={{ fontSize: '.75rem', color: '#166534', margin: '4px 0 0', lineHeight: 1.4 }}>
                {sentSuccess.message}
              </p>
            </div>
            <p style={{ fontSize: '.75rem', color: '#64748B', maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.4 }}>
              The patient has received this reminder on their registered channels and can acknowledge it directly in the app.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ padding: '9px 32px', fontSize: '.875rem', fontWeight: 700, borderRadius: 10 }}
            >
              Done
            </button>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted-2)', marginBottom: 8 }}>Message Template</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {PRESETS.map(x => (
                <button key={x.key} type="button" onClick={() => pickPreset(x.key)}
                  style={{
                    padding: '10px 12px', borderRadius: 'var(--r-lg)', textAlign: 'left',
                    border: `1px solid ${preset === x.key ? '#7C3AED' : 'var(--border)'}`,
                    background: 'var(--bg)', boxShadow: preset === x.key ? '0 0 0 3px rgba(200,21,26,0.08)' : 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '.78125rem', fontWeight: preset === x.key ? 700 : 600, color: 'var(--text)',
                  }}
                >
                  {x.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted-2)', marginBottom: 8 }}>Message</div>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); setPreset('custom'); }}
              rows={4}
              placeholder="Write the follow-up message the patient will receive…"
              style={{ width: '100%', padding: '10px 12px', fontSize: '.8125rem', border: '1.5px solid var(--border-2)', borderRadius: 'var(--r-md)', background: '#fff', color: 'var(--text)', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
            />

            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '.625rem', padding: '10px 14px', marginTop: 14, fontSize: '.75rem', color: '#1D4ED8', lineHeight: 1.5 }}>
              The patient gets a push notification in the app and an email
              {patient.email ? ` at ${patient.email}` : ' (no email on file — app only)'}.
              Both include a button to confirm they received it.
            </div>

            <div className="modal-footer" style={{ marginTop: 18 }}>
              <button className="btn btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
              <button className="btn btn-primary" onClick={send} disabled={sending}>
                {sending ? 'Sending…' : 'Send Follow-up'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────── ROOT APP ─────────────────────────── */
export default function App({ initialOpenAddModal = false, onAddModalClosed } = {}) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setModal] = useState(initialOpenAddModal);
  const [editPatient, setEditPatient] = useState(null);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [pinTarget, setPinTarget] = useState(null);
  const [pinning, setPinning] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState(null);

  useEffect(() => {
    if (initialOpenAddModal) {
      setModal(true);
    }
  }, [initialOpenAddModal]);

  const handleCloseAddModal = () => {
    setModal(false);
    if (onAddModalClosed) onAddModalClosed();
  };
  // Inventory items for vaccine brand dropdown
  const [inventoryItems, setInventoryItems] = useState([]);

  async function handlePinToMap(patientToPin) {
    if (!patientToPin) return;
    setPinning(true);
    try {
      const barangayVal = patientToPin.barangay || (patientToPin.address ? (patientToPin.address.match(/Brgy\.\s*([^,]+)/)?.[1] || 'San Juan') : 'San Juan');
      const zoneVal = patientToPin.zone || (patientToPin.address ? patientToPin.address.split(',')[0].replace(/Brgy\..*/, '').trim() : 'Zone 1');
      const locationStr = patientToPin.address || `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon, Albay`;
      const exposureTypeVal = patientToPin.service === 'PEP' ? `${patientToPin.animal || 'Dog'} Bite` : (patientToPin.service || 'Dog Bite');
      const categoryVal = patientToPin.cat ? `Category ${patientToPin.cat}` : 'Category III';
      const exposureDateVal = patientToPin.date || getTodayDateString();

      const { lat, lng } = geocodeLibonAddress(barangayVal, zoneVal);

      // ABSOLUTE ANONYMIZATION — OMIT ALL PATIENT PERSONAL IDENTIFIERS
      await addDoc(collection(db, 'incidents'), {
        location: locationStr,
        address: locationStr,
        barangay: barangayVal,
        zone: zoneVal,
        type: exposureTypeVal,
        category: categoryVal,
        // Kept in step with the manually-pinned shape in incidents.jsx; the
        // note stays generic because the pin carries no patient identifiers.
        description: 'Pinned from a patient record. No identifying details attached.',
        date: exposureDateVal,
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        source: 'patient_record',
        status: 'active',
        pinnedAt: Date.now(),
        createdAt: Date.now(),
      });

      showToast('Incident pinned to public map! ✓', 'success');
      setPinTarget(null);
    } catch (err) {
      console.error('Pin incident error:', err);
      showToast('Failed to pin incident. Please try again.', 'error');
    } finally {
      setPinning(false);
    }
  }

  useEffect(() => {
    const q = query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map((d, i) => ({
        firestoreId: d.id,
        ...d.data(),
        color: AVATAR_COLORS[i % AVATAR_COLORS.length],
      }));
      setPatients(data);
      setSelected(prev => prev ? (data.find(p => p.firestoreId === prev.firestoreId) || prev) : null);
      setLoading(false);
    }, err => {
      console.error('Patients listener error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Listen to inventory for vaccine brand dropdown
  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  function showToast(msg, type = '') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 2800);
  }

  async function getAndIncrementNextMRN() {
    const year = new Date().getFullYear();
    const counterRef = doc(db, 'settings', 'counters');
    let nextSeq = 1;

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        if (!snap.exists()) {
          let highest = 0;
          patients.forEach(p => {
            if (p.id || p.mrn) {
              const raw = String(p.id || p.mrn || '');
              const match = raw.match(/(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > highest) highest = num;
              }
            }
          });
          nextSeq = highest + 1;
          transaction.set(counterRef, { currentYear: year, lastSequence: nextSeq });
        } else {
          const data = snap.data();
          let curYear = data.currentYear || year;
          let lastSeq = data.lastSequence || 0;
          if (curYear !== year) {
            curYear = year;
            lastSeq = 0;
          }
          nextSeq = lastSeq + 1;
          transaction.update(counterRef, { currentYear: curYear, lastSequence: nextSeq });
        }
      });
    } catch (err) {
      console.warn('Counter transaction failed, using local sequence fallback:', err);
      let highest = 0;
      patients.forEach(p => {
        if (p.id || p.mrn) {
          const raw = String(p.id || p.mrn || '');
          const match = raw.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > highest) highest = num;
          }
        }
      });
      nextSeq = highest + 1;
    }

    const seqStr = String(nextSeq).padStart(3, '0');
    return `${year}-${seqStr}`;
  }

  function formatE164(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('09') && cleaned.length === 11) {
      return '+63' + cleaned.slice(1);
    }
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      return '+63' + cleaned;
    }
    if (cleaned.startsWith('639') && cleaned.length === 12) {
      return '+' + cleaned;
    }
    return cleaned;
  }

  // Kept as a thin wrapper so every call site reads the shared definitions.
  function generateDefaultDoses(service, baseDate, opts = {}) {
    return buildInitialDoses(service, { day0: baseDate, dob: opts.dob, ageGroup: opts.ageGroup });
  }


  // Set when the add form matches existing records; the modal either sends
  // the admin back to review or re-enters handleAddPatient with the check
  // skipped.
  const [dupCheck, setDupCheck] = useState(null); // { form, setSaving, matches }

  async function handleAddPatient(form, setSaving, { skipDuplicateCheck = false } = {}) {
    if (!form.fname.trim() || !form.lname.trim()) { showToast('Please fill in first and last name', 'error'); return; }
    if (!form.email.trim()) { showToast('Email is required so the patient can log in to the app', 'error'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) { showToast('Please enter a valid email address', 'error'); return; }
    if (!form.age) { showToast('Age is required', 'error'); return; }
    if (form.ageGroup === 'infant' && !form.dob) {
      showToast('Date of birth is required for the infant/child series — the schedule is counted from it.', 'error');
      return;
    }
    if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number', 'error'); return; }

    const normalEmail = form.email.toLowerCase().trim();

    // Prevent duplicate emails across patient records for patient-app uniqueness
    const existingLocal = patients.find(p => (p.email || '').toLowerCase().trim() === normalEmail);
    if (existingLocal) {
      showToast(`Email "${normalEmail}" is already registered to ${formatTitleCase(existingLocal.name)} (MRN: ${existingLocal.id || existingLocal.mrn || '—'}). Patient records require a unique email for the Patient App.`, 'error');
      return;
    }

    if (!skipDuplicateCheck) {
      const matches = findSimilarPatients(form, patients);
      if (matches.length) {
        setDupCheck({ form, setSaving, matches });
        return;
      }
    }

    if (typeof setSaving === 'function') setSaving(true);

    try {
      // Query authorizedPatients in Firestore to ensure uniqueness across entire database
      const existingEmailSnap = await getDocs(
        query(collection(db, 'authorizedPatients'), where('email', '==', normalEmail), limit(1))
      );
      if (!existingEmailSnap.empty) {
        const existingData = existingEmailSnap.docs[0].data();
        showToast(`Email "${normalEmail}" is already registered in patient records to ${existingData.name || 'another patient'} (MRN: ${existingData.mrn || existingEmailSnap.docs[0].id}). Each patient must have a unique email for the Patient App.`, 'error');
        if (typeof setSaving === 'function') setSaving(false);
        return;
      }

      const caseNo = await getAndIncrementNextMRN();
      const cleanFname = formatTitleCase(form.fname.trim());
      const cleanLname = formatTitleCase(form.lname.trim());
      const cleanMname = form.mname && form.mname.trim() ? formatTitleCase(form.mname.trim()) : '';
      const cleanSuffix = form.suffix ? form.suffix.trim() : '';
      const fullName = [cleanFname, cleanMname, cleanLname].filter(Boolean).join(' ') + (cleanSuffix ? `, ${cleanSuffix}` : '');
      const formattedContact = formatE164(form.contact || '');
      const selectedBarangay = form.barangay || 'San Juan';
      const enteredZone = form.zone || 'Zone 1';
      const baseDate = form.date || today();
      const defaultDoseArray = generateDefaultDoses(form.service || 'PEP', baseDate, { dob: form.dob, ageGroup: form.ageGroup });

      const vaxDoc = {
        id: caseNo,
        mrn: caseNo,
        name: fullName,
        email: normalEmail,
        contact: formattedContact,
        age: form.age || '',
        sex: form.sex || 'Male',
        dob: form.dob || '',
        height: form.height || '',
        weight: form.weight || '',
        bloodPressure: form.bloodPressure || '',
        barangay: selectedBarangay,
        zone: enteredZone,
        address: form.address || `${enteredZone ? enteredZone + ', ' : ''}Brgy. ${selectedBarangay}, Libon, Albay`,
        service: form.service || 'PEP',
        vaccineBrand: form.vaccineBrand || '',
        placeOfExposure: form.placeOfExposure || '',
        typeOfExposure: form.typeOfExposure || '',
        sourceOfExposure: form.sourceOfExposure || '',
        woundWashed: form.woundWashed || 'Yes',
        rigGiven: form.rigGiven || 'No',
        vaxGiven: form.vaxGiven || 'No',
        genericName: form.genericName || '',
        route: form.route || 'IM',
        animal: form.animal || 'Dog',
        cat: (form.cat || 'Category I').replace('Category ', ''),
        date: baseDate,
        notes: form.notes || '',
        pastVaccines: form.pastVaccines || '',
        allergies: form.allergies || '',
        woundLocation: form.woundLocation || '',
        woundDepth: form.woundDepth || '',
        numberOfBites: form.numberOfBites || '',
        woundType: form.woundType || '',
        lastTetanus: form.lastTetanus || '',
        hepaVariant: form.hepaVariant || '',
        riskFactor: form.riskFactor || '',
        priorHepa: form.priorHepa || '',
        pneumoVaccine: form.pneumoVaccine || '',
        ageGroup: form.ageGroup || 'adult',
        riskCondition: form.riskCondition || '',
        priorPneumo: form.priorPneumo || '',
        status: 'ongoing',
        dose: `0/${defaultDoseArray.length}`,
        doses: defaultDoseArray,
        woundImages: [],
        createdAt: serverTimestamp(),
      };

      const authDoc = {
        mrn: caseNo,
        name: fullName,
        email: normalEmail,
        contact: formattedContact,
        authorized: true,
        registered: false,
        uid: null,
        createdAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(db, 'vaccinations', caseNo), vaxDoc),
        setDoc(doc(db, 'authorizedPatients', caseNo), authDoc)
      ]);

      trackEvent('patient_registered');
      showToast(`${fullName} registered and authorized for app login`, 'success');
      handleCloseAddModal();
    } catch (err) {
      console.error('Add patient error:', err);
      const detail = err?.code === 'permission-denied'
        ? 'Your admin account is not authorized to write to Firestore (missing admins/{uid} record). Contact your system administrator.'
        : (err?.message || 'Please try again.');
      showToast(`Failed to register patient — ${detail}`, 'error');
    } finally {
      if (typeof setSaving === 'function') setSaving(false);
    }
  }

  async function handleEditSave(form) {
    if (!form.name || !form.name.trim()) { showToast('Please fill in the patient name', 'error'); return; }
    if (!form.age || Number(form.age) <= 0) { showToast('A valid age is required', 'error'); return; }
    if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number', 'error'); return; }
    const newName = formatTitleCase(form.name.trim());
    const targetId = editPatient.firestoreId;
    const cleanEmail = (form.email || editPatient.email || '').toLowerCase().trim();

    // Prevent assigning an email already registered to another patient
    if (cleanEmail && cleanEmail !== (editPatient.email || '').toLowerCase().trim()) {
      const existingOther = patients.find(
        p => p.firestoreId !== targetId && (p.email || '').toLowerCase().trim() === cleanEmail
      );
      if (existingOther) {
        showToast(`Email "${cleanEmail}" is already registered to ${formatTitleCase(existingOther.name)} (MRN: ${existingOther.id || existingOther.mrn || '—'}). Each patient must have a unique email.`, 'error');
        return;
      }
      try {
        const existingEmailSnap = await getDocs(
          query(collection(db, 'authorizedPatients'), where('email', '==', cleanEmail), limit(1))
        );
        const mrnKey = editPatient.id || editPatient.mrn || targetId;
        if (!existingEmailSnap.empty && existingEmailSnap.docs[0].id !== mrnKey) {
          const existingData = existingEmailSnap.docs[0].data();
          showToast(`Email "${cleanEmail}" is already registered to ${existingData.name || 'another patient'} (MRN: ${existingData.mrn || existingEmailSnap.docs[0].id}). Each patient must have a unique email.`, 'error');
          return;
        }
      } catch (err) {
        console.warn('Email uniqueness check error:', err);
      }
    }

    const updatedData = {
      name: newName, age: form.age || editPatient.age, sex: form.sex || 'Male',
      dob: form.dob || '', height: form.height || '', weight: form.weight || '', bloodPressure: form.bloodPressure || '',
      email: cleanEmail,
      address: form.address || '', contact: formatE164(form.contact || editPatient.contact || ''), service: form.service || 'PEP',
      vaccineBrand: form.vaccineBrand || '',
      animal: form.animal || 'Dog', cat: (form.cat || 'Category I').replace('Category ', ''),
      date: form.date || editPatient.date, notes: form.notes || '',
      pastVaccines: form.pastVaccines || '', allergies: form.allergies || '',
      woundLocation: form.woundLocation || '', woundDepth: form.woundDepth || '', numberOfBites: form.numberOfBites || '',
      woundType: form.woundType || '', lastTetanus: form.lastTetanus || '',
      hepaVariant: form.hepaVariant || '', riskFactor: form.riskFactor || '', priorHepa: form.priorHepa || '',
      pneumoVaccine: form.pneumoVaccine || '', riskCondition: form.riskCondition || '', priorPneumo: form.priorPneumo || '',
    };
    setEditPatient(null);
    showToast('Patient info updated', 'success');
    const mrnKey = editPatient.id || editPatient.mrn || targetId;
    updateDoc(doc(db, 'vaccinations', targetId), updatedData).catch(err => {
      console.error('Edit patient error:', err);
      showToast('Failed to update patient.', 'error');
    });
    if (mrnKey) {
      setDoc(doc(db, 'authorizedPatients', mrnKey), { email: cleanEmail, name: newName }, { merge: true }).catch(() => {});
    }
  }

  // ── One-time (but safe to re-run) sync: back-fills authorizedPatients for
  // any existing patient record that predates that collection — e.g. data
  // added before the Patient App's MRN-based login existed. Idempotent: only
  // creates docs that are missing, never touches already-authorized/registered
  // patients. Only patients whose Firestore doc ID already looks like a real
  // MRN ("<year>-<seq>") can be synced — irregular IDs are reported, not guessed.
  const [syncingAuth, setSyncingAuth] = useState(false);

  async function handleSyncAuthorizedPatients() {
    if (syncingAuth) return;
    setSyncingAuth(true);
    try {
      const authSnap = await getDocs(collection(db, 'authorizedPatients'));
      const alreadyLinked = new Set(authSnap.docs.map(d => d.id));
      const mrnPattern = /^\d{4}-\d{3,}$/;

      let created = 0;
      let skippedNoEmail = 0;
      let skippedIrregularId = 0;

      for (const p of patients) {
        const mrn = p.firestoreId;
        if (!mrn || alreadyLinked.has(mrn)) continue;
        if (!mrnPattern.test(mrn)) { skippedIrregularId++; continue; }
        const email = (p.email || '').toLowerCase().trim();
        if (!email) { skippedNoEmail++; continue; }

        await setDoc(doc(db, 'authorizedPatients', mrn), {
          mrn,
          name: getName(p),
          email,
          contact: p.contact || '',
          authorized: true,
          registered: false,
          uid: null,
          createdAt: serverTimestamp(),
        });
        created++;
      }

      const parts = [`${created} patient(s) linked for app login`];
      if (skippedNoEmail) parts.push(`${skippedNoEmail} skipped (no email on file)`);
      if (skippedIrregularId) parts.push(`${skippedIrregularId} skipped (irregular record ID, needs manual review)`);
      showToast(parts.join(' — '), created > 0 ? 'success' : 'info');
    } catch (err) {
      console.error('Sync authorizedPatients error:', err);
      showToast('Failed to sync patients for app login.', 'error');
    } finally {
      setSyncingAuth(false);
    }
  }

  const [seeding, setSeeding] = useState(false);

  async function handleSeedPatients() {
    if (seeding) return;
    setSeeding(true);
    try {
      const year = new Date().getFullYear();
      const nums = patients.map(p => parseInt((p.id || '').split('-')[1])).filter(n => !isNaN(n));
      let next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      for (const s of SEED_PATIENTS) {
        const caseNo = `${year}-${String(next).padStart(3, '0')}`;
        const fullName = s.fname.trim() + ' ' + s.lname.trim();
        const normalEmail = s.email.toLowerCase().trim();
        const formattedContact = formatE164(s.contact || '');
        await setDoc(doc(db, 'vaccinations', caseNo), {
          id: caseNo, mrn: caseNo, name: fullName, email: normalEmail,
          age: s.age || '', sex: s.sex || 'Male', address: s.address || '', contact: formattedContact,
          service: s.service || 'PEP',
          animal: s.animal || 'Dog', cat: s.cat,
          date: today(), notes: '',
          pastVaccines: '', allergies: '',
          woundLocation: s.woundSite || '', woundDepth: '', numberOfBites: '',
          woundType: s.woundType || '', lastTetanus: '',
          hepaVariant: '', riskFactor: '', priorHepa: '',
          pneumoVaccine: '', riskCondition: '', priorPneumo: '',
          status: s.status || 'ongoing', doses: [], woundImages: [], createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'authorizedPatients', caseNo), {
          mrn: caseNo,
          name: fullName,
          email: normalEmail,
          contact: formattedContact,
          authorized: true,
          registered: false,
          uid: null,
          createdAt: serverTimestamp(),
        });
        next++;
      }
      showToast('100 patients seeded successfully', 'success');
    } catch (err) {
      console.error('Seed error:', err);
      showToast('Seed failed. Check console.', 'error');
    } finally {
      setSeeding(false);
    }
  }

  // These hooks must run on every render regardless of which view is shown
  // below — declaring them after the `if (selected) return` branch violates
  // the Rules of Hooks (React calls a different number of hooks depending on
  // whether a row is selected), which is what made clicking a row to view its
  // record crash/fail silently instead of opening the detail view.
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [caseloadTab, setCaseloadTab] = useState('active'); // 'active' | 'completed' | 'all'
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  async function handleArchivePatient(patient) {
    if (!patient?.firestoreId) return;
    try {
      const expYear = (new Date().getFullYear()) + 10;
      await updateDoc(doc(db, 'vaccinations', patient.firestoreId), {
        status: 'completed',
        isArchived: true,
        archivedAt: serverTimestamp(),
        retentionExpiryYear: expYear,
      });
      showToast(`${getName(patient)} moved to Archive ✓`, 'success');
    } catch (err) {
      console.error('Archive error:', err);
      showToast('Failed to archive patient record.', 'error');
    }
  }

  const [searchFocused, setSearchFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);
  useEffect(() => {
    const handler = e => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selected) {
    const livePatient = patients.find(p => p.firestoreId === selected.firestoreId) || selected;
    return (
      <>
        <style>{globalCSS}</style>
        <MedicalRecordDetail
          patient={livePatient} records={patients} patients={patients}
          onBack={() => setSelected(null)}
          onToast={showToast}
          onPinMap={p => setPinTarget(p)}
          onExport={p => setExportModal(p)}
          onEdit={p => setEditPatient(p)}
          isArchiveView={caseloadTab === 'completed'}
        />
        {editPatient && (
          <EditPatientModal
            patient={editPatient}
            onClose={() => setEditPatient(null)}
            onSave={handleEditSave}
            inventoryItems={inventoryItems}
          />
        )}
        {exportModal && (
          <ExportReportModal
            patients={patients}
            initialPatient={typeof exportModal === 'object' ? exportModal : livePatient}
            onClose={() => setExportModal(false)}
            onToast={showToast}
          />
        )}
        {pinTarget && (
          <PinMapConfirmModal
            patient={pinTarget}
            saving={pinning}
            onConfirm={() => handlePinToMap(pinTarget)}
            onCancel={() => setPinTarget(null)}
          />
        )}
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
      </>
    );
  }

  // "All / Ongoing / Completed" used to be separate tab buttons; folded into
  // the same "Sort by" dropdown as the order options below (still two
  // distinct pieces of state — filter vs sortBy — just one trigger UI).
  const FILTER_OPTIONS = [
    { key: 'all', label: 'All Records' },
    { key: 'ongoing', label: 'Ongoing' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'prep', label: 'PrEP' },
    { key: 'pep', label: 'PEP' },
    { key: 'tetanus', label: 'Anti-Tetano' },
    { key: 'pneumonia', label: 'Pneumonia Vaccine' },
  ];
  const SORT_OPTIONS = [
    { key: 'newest', label: 'Registered (Newest)' },
    { key: 'oldest', label: 'Registered (Oldest)' },
    { key: 'name_asc', label: 'Name (A–Z)' },
    { key: 'mrn_asc', label: 'Patient ID' },
  ];

  const activeCount = patients.filter(p => derivePatientStatus(p) !== 'completed' && !p.isArchived).length;
  const completedCount = patients.filter(p => derivePatientStatus(p) === 'completed' || p.isArchived).length;
  const totalCount = patients.length;

  // Process filtering and sorting
  const processedPatients = patients
    .filter(p => {
      const liveStatus = derivePatientStatus(p);
      if (caseloadTab === 'active') return liveStatus !== 'completed' && !p.isArchived;
      if (caseloadTab === 'completed') return liveStatus === 'completed' || p.isArchived;
      return true;
    })
    .filter(p => {
      if (filter === 'all') return true;
      const liveStatus = derivePatientStatus(p);
      const isOverdue = liveStatus !== 'completed' && (liveStatus === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      if (filter === 'ongoing') return liveStatus !== 'completed' && !isOverdue;
      if (filter === 'overdue') return isOverdue;
      if (filter === 'completed') return liveStatus === 'completed';

      const pSvc = (p.service || 'PEP').toLowerCase();
      if (filter === 'prep') return pSvc === 'prep';
      if (filter === 'pep') return pSvc === 'pep';
      if (filter === 'tetanus' || filter === 'antitetano') return pSvc === 'tetanus';
      if (filter === 'pneumonia') return pSvc === 'pneumonia';

      return liveStatus === filter;
    })
    .filter(p => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.id?.toLowerCase().includes(q) ||
        p.mrn?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.contact?.includes(q) ||
        p.barangay?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) || (b.id || '').localeCompare(a.id || '');
      if (sortBy === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0) || (a.id || '').localeCompare(b.id || '');
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'mrn_asc') return (a.id || '').localeCompare(b.id || '');
      return 0;
    });

  const totalItems = processedPatients.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPatients = processedPatients.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const isAllSelected = paginatedPatients.length > 0 && paginatedPatients.every(p => selectedRows.has(p.firestoreId || p.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRows(new Set());
    } else {
      const next = new Set(selectedRows);
      paginatedPatients.forEach(p => next.add(p.firestoreId || p.id));
      setSelectedRows(next);
    }
  };

  const toggleRow = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedRows(next);
  };

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{ padding: '20px 28px 36px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* ── View Switcher: Patients vs Archive ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => { setCaseloadTab('active'); setCurrentPage(1); }}
            style={{
              padding: '8px 18px',
              borderRadius: 12,
              border: caseloadTab === 'active' ? '1.5px solid #3B50DF' : '1px solid #E2E8F0',
              background: caseloadTab === 'active' ? '#EEF2FF' : '#FFFFFF',
              color: caseloadTab === 'active' ? '#3B50DF' : '#475569',
              fontWeight: caseloadTab === 'active' ? 800 : 600,
              fontSize: '.8125rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: caseloadTab === 'active' ? '0 1px 3px rgba(59,80,223,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all .15s ease'
            }}
          >
            Patients
            {activeCount > 0 && (
              <span style={{
                fontSize: '.6875rem',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 999,
                background: caseloadTab === 'active' ? '#3B50DF' : '#F1F5F9',
                color: caseloadTab === 'active' ? '#FFFFFF' : '#64748B'
              }}>
                {activeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => { setCaseloadTab('completed'); setCurrentPage(1); }}
            style={{
              padding: '8px 18px',
              borderRadius: 12,
              border: caseloadTab === 'completed' ? '1.5px solid #059669' : '1px solid #E2E8F0',
              background: caseloadTab === 'completed' ? '#ECFDF5' : '#FFFFFF',
              color: caseloadTab === 'completed' ? '#059669' : '#475569',
              fontWeight: caseloadTab === 'completed' ? 800 : 600,
              fontSize: '.8125rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: caseloadTab === 'completed' ? '0 1px 3px rgba(5,150,105,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all .15s ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
            Archive
            {completedCount > 0 && (
              <span style={{
                fontSize: '.6875rem',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 999,
                background: caseloadTab === 'completed' ? '#059669' : '#F1F5F9',
                color: caseloadTab === 'completed' ? '#FFFFFF' : '#64748B'
              }}>
                {completedCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Main Clean Table Card Container ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', position: 'relative' }}>

          {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', borderRadius: '16px 16px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA' }}>
            
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 280 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '22rem', minWidth: '16rem' }}>
                <svg
                  style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    opacity: searchFocused ? 1 : .4, stroke: searchFocused ? '#3B50DF' : '#0F172A',
                    pointerEvents: 'none', transition: 'all 0.15s ease'
                  }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, email, MRN, contact..."
                  value={search}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  style={{
                    width: '100%', padding: '8px 12px 8px 34px', fontSize: '.8125rem',
                    border: searchFocused ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                    borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', outline: 'none',
                    boxShadow: searchFocused ? '0 0 0 3.5px rgba(59,80,223,0.18)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                />
              </div>
            </div>

            {/* Filter and Sort — two independent dropdowns & Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div ref={filterMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setFilterMenuOpen(o => !o)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                    fontSize: '.78125rem', fontWeight: 600,
                    border: filter !== 'all' ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                    borderRadius: '.5rem',
                    background: filter !== 'all' ? '#EEF2FF' : '#FFFFFF',
                    color: filter !== 'all' ? '#3B50DF' : '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                  {filter === 'all' ? 'Filter' : (FILTER_OPTIONS.find(o => o.key === filter)?.label || 'Filter')}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {filterMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 205, maxHeight: '380px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                    <div style={{ padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Status
                    </div>
                    {[
                      { key: 'all', label: 'All Records' },
                      { key: 'ongoing', label: 'Ongoing' },
                      { key: 'overdue', label: 'Overdue' },
                    ].map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setFilter(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: filter === opt.key ? '#EEF2FF' : 'transparent', color: filter === opt.key ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: filter === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {filter === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}

                    <div style={{ margin: '4px 0', borderTop: '1px solid #F1F5F9' }} />
                    <div style={{ padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Vaccine / Service
                    </div>
                    {[
                      { key: 'prep', label: 'PrEP (Pre-Exposure)' },
                      { key: 'pep', label: 'PEP (Post-Exposure)' },
                      { key: 'tetanus', label: 'Anti-Tetano (Tetanus)' },
                      { key: 'pneumonia', label: 'Pneumonia Vaccine' },
                    ].map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setFilter(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: filter === opt.key ? '#EEF2FF' : 'transparent', color: filter === opt.key ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: filter === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {filter === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div ref={sortMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setSortMenuOpen(o => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '.78125rem', fontWeight: 600, border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
                  Sort by
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {sortMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 190, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                    {SORT_OPTIONS.map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#334155', fontSize: '.78125rem', fontWeight: sortBy === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {sortBy === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Export Clinic Report Button — Clean White Background (Hidden in Archive) */}
              {caseloadTab !== 'completed' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setExportModal(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.78125rem', fontWeight: 600,
                    padding: '7px 14px', background: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A',
                    borderRadius: '.5rem', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Export Clinic Report
                </button>
              )}

              {/* Add Patient Button — Royal Blue (#3B50DF) */}
              {caseloadTab !== 'completed' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setModal(true)}
                  style={{
                    background: '#3B50DF', color: '#FFFFFF', border: 'none', padding: '7px 16px', borderRadius: '.5rem',
                    fontWeight: 700, fontSize: '.78125rem', display: 'inline-flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 2px 8px rgba(59,80,223,0.25)', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Patient
                </button>
              )}
            </div>

          </div>

          {/* ── Table Area ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <th style={{ padding: '16px 12px 16px 20px', width: '10%', fontWeight: 600, color: '#64748B' }}>Patient ID</th>
                  <th style={{ padding: '16px 12px', width: '16%', fontWeight: 600, color: '#64748B' }}>Name</th>
                  <th style={{ padding: '16px 12px', width: '22%', fontWeight: 600, color: '#64748B' }}>Email</th>
                  <th style={{ padding: '16px 12px', width: '14%', fontWeight: 600, color: '#64748B' }}>Mobile</th>
                  <th style={{ padding: '16px 12px', width: '8%', fontWeight: 600, color: '#64748B' }}>Service</th>
                  <th style={{ padding: '16px 8px', width: '10%', fontWeight: 600, color: '#64748B' }}>Status</th>
                  <th style={{ padding: '16px 12px', width: '10%', fontWeight: 600, color: '#64748B' }}>Submitted On</th>
                  <th style={{ padding: '16px 16px 16px 8px', width: '10%', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>Loading patient records…</td></tr>
                ) : paginatedPatients.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>No {caseloadTab === 'completed' ? 'archived ' : ''}patient records found</td></tr>
                ) : (
                  paginatedPatients.map(p => {
                    const rowId = p.firestoreId || p.id;
                    const isSelectedRow = selectedRows.has(rowId);
                    const liveStatus = derivePatientStatus(p);
                    // Table-only refinement of "ongoing" — doesn't touch derivePatientStatus
                    // itself (that would also change what the Filter dropdown and the
                    // detail-view badge treat as "ongoing"), just reuses vaccination.jsx's
                    // real dose-schedule logic to flag rows that need attention.
                    const isOverdue = liveStatus !== 'completed' && (liveStatus === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
                    const formattedName = formatTitleCase(p.name);

                    return (
                      <tr
                        key={rowId}
                        onClick={() => setSelected(p)}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isSelectedRow ? '#FEF2F2' : '#FFFFFF',
                          transition: 'background .12s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => { if (!isSelectedRow) e.currentTarget.style.background = '#F8FAFC'; }}
                        onMouseLeave={e => { if (!isSelectedRow) e.currentTarget.style.background = '#FFFFFF'; }}
                      >
                        <td style={{ padding: '16px 12px 16px 20px', fontWeight: 500, color: '#64748B', fontSize: '.8125rem' }}>
                          {p.id || p.mrn}
                        </td>
                        <td style={{ padding: '16px 12px', fontWeight: 600, color: '#0F172A', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={formattedName}>
                          {formattedName}
                        </td>
                        <td style={{ padding: '16px 12px', color: '#334155', fontWeight: 400, fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.email || '—'}>
                          {p.email || '—'}
                        </td>
                        <td style={{ padding: '16px 12px', color: '#334155', fontWeight: 400, fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.contact || '—'}>
                          {p.contact || '—'}
                        </td>
                        <td style={{ padding: '16px 12px' }}>
                          <ServiceBadge service={p.service} />
                        </td>
                        <td style={{ padding: '16px 8px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600,
                            whiteSpace: 'nowrap',
                            background: liveStatus === 'completed' ? '#ECFDF5' : isOverdue ? '#FEF2F2' : '#EFF6FF',
                            color: liveStatus === 'completed' ? '#059669' : isOverdue ? '#DC2626' : '#1D4ED8',
                            border: liveStatus === 'completed' ? '1px solid #A7F3D0' : isOverdue ? '1px solid #FCA5A5' : '1px solid #BFDBFE'
                          }}>
                            {liveStatus === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 12px', color: '#64748B', fontWeight: 400, fontSize: '.8125rem', whiteSpace: 'nowrap' }}>
                          {fmtDate(p.date)}
                        </td>
                        <td style={{ padding: '16px 16px 16px 8px', width: '11%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="icon-btn"
                              title="View Patient Record"
                              onClick={() => setSelected(p)}
                              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Edit Patient"
                              onClick={() => setEditPatient(p)}
                              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination Footer ── */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', borderRadius: '0 0 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
            <div style={{ fontSize: '.8125rem', color: '#475569', fontWeight: 600 }}>
              {totalItems === 0 ? '0 of 0' : `${(safePage - 1) * itemsPerPage + 1} to ${Math.min(safePage * itemsPerPage, totalItems)} of ${totalItems}`}
              {selectedRows.size > 0 && <span style={{ marginLeft: 10, color: '#7C3AED', fontWeight: 800 }}>({selectedRows.size} selected)</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
                title="First Page"
                aria-label="First Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage <= 1 ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage > 1) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage > 1) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="5" x2="6" y2="19"/><polyline points="18 19 11 12 18 5"/></svg>
              </button>

              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                title="Previous Page"
                aria-label="Previous Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage <= 1 ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage > 1) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage > 1) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <span style={{ fontSize: '.8125rem', fontWeight: 600, color: '#334155', padding: '0 8px', whiteSpace: 'nowrap' }}>
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                title="Next Page"
                aria-label="Next Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage >= totalPages ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage < totalPages) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage < totalPages) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Last Page"
                aria-label="Last Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage >= totalPages ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage < totalPages) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage < totalPages) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 19 13 12 6 5"/><line x1="18" y1="5" x2="18" y2="19"/></svg>
              </button>
            </div>
          </div>

        </div>
      </div>

      {showModal && <AddPatientModal onClose={handleCloseAddModal} onAdd={handleAddPatient} inventoryItems={inventoryItems} />}
      {dupCheck && (
        <DuplicatePatientModal
          form={dupCheck.form}
          matches={dupCheck.matches}
          onCancel={() => setDupCheck(null)}
          onProceed={() => {
            const { form, setSaving } = dupCheck;
            setDupCheck(null);
            handleAddPatient(form, setSaving, { skipDuplicateCheck: true });
          }}
        />
      )}
      {editPatient && <EditPatientModal patient={editPatient} onClose={() => setEditPatient(null)} onSave={handleEditSave} inventoryItems={inventoryItems} />}
      {followUpTarget && (
        <FollowUpModal
          patient={followUpTarget}
          onClose={() => setFollowUpTarget(null)}
          onToast={showToast}
        />
      )}

      {exportModal && <ExportReportModal patients={patients} initialPatient={typeof exportModal === 'object' ? exportModal : null} onClose={() => setExportModal(false)} onToast={showToast} />}

      {/* Pin Map Confirmation Modal */}
      {pinTarget && (
        <PinMapConfirmModal
          patient={pinTarget}
          saving={pinning}
          onConfirm={() => handlePinToMap(pinTarget)}
          onCancel={() => setPinTarget(null)}
        />
      )}

      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
    </>
  );
}
