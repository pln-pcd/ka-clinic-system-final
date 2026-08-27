import { authedPostJson } from "../lib/apiClient";
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "../lib/firebase";
import { buildDoses } from "./vaccination";
import { formatDateLong as fmtDate } from "../lib/dates";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Toast from "../components/Toast";

/* ─────────────────────────── CSS ─────────────────────────── */
const globalCSS = `
  :root {
    --blue:#3B50DF; --blue-light:#EEF2FF; --blue-soft:#E0E7FF;
    --white:#FFFFFF; --bg:#F4F5F7; --bg-2:#EAECEF;
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
  body{background:#F4F5F7;color:var(--text);}

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
  .modal-overlay{position:fixed;inset:0;background:rgba(26,34,64,.45);z-index:999;display:flex;align-items:flex-start;justify-content:center;padding-top:6vh;overflow-y:auto;backdrop-filter:blur(8px);}
  .modal{background:var(--white);border-radius:1.25rem;padding:28px;width:32.5rem;max-width:95vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(26,34,64,.18);margin-bottom:6vh;}
  .modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;}
  .modal-head h2{font-size:1.0625rem;font-weight:900;}
  .modal-close{width:2rem;height:2rem;border-radius:50%;border:none;background:var(--bg);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;color:var(--muted);transition:background .15s;}
  .modal-close:hover{background:var(--red-soft);color:var(--red);}
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
const today = () => new Date().toISOString().slice(0, 10);
const derivePatientStatus = (patient) => {
  if (patient?.isArchived || patient?.status === 'archived') return 'completed';
  const doses = patient?.doses || [];
  if (doses.length > 0 && patient?.status) return patient.status;
  if (doses.length === 0) return patient?.status || 'ongoing';
  const allDone = doses.every(d => (d.s || d.status) === 'done');
  return allDone ? 'completed' : 'ongoing';
};

const getDOHRetentionYear = (patient) => {
  if (!patient) return new Date().getFullYear() + 10;
  if (patient.retentionExpiryYear) return patient.retentionExpiryYear;
  const dStr = patient.completedDate || patient.date || (patient.createdAt?.toDate ? patient.createdAt.toDate().toISOString().slice(0, 10) : today());
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
    key: 'Hepatitis', label: 'Hepatitis', desc: 'Hepatitis Vaccine', sub: 'Hepa A / B / AB',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    pillClass: 'service-hepa', selClass: 'sel-hepa'
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
function ScheduleSummary({ service, baseDate }) {
  if (!baseDate) return (
    <div style={{ gridColumn: 'span 2', marginTop: 14, padding: '12px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', fontSize: '.75rem', color: 'var(--muted)', textAlign: 'center' }}>
      Select a date above to preview the vaccination schedule.
    </div>
  );

  const addDays = (days) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  let schedule = [];
  if (service === 'PEP' || service === 'PrEP') {
    schedule = [
      { label: 'Dose 1 (Day 0)', date: addDays(0) },
      { label: 'Dose 2 (Day 3)', date: addDays(3) },
      { label: 'Dose 3 (Day 7)', date: addDays(7) },
      { label: 'Dose 4 (Day 14)', date: addDays(14) },
      { label: 'Dose 5 (Day 28)', date: addDays(28) },
    ];
  } else if (service === 'Tetanus') {
    schedule = [
      { label: 'Dose 1 (Day 0)', date: addDays(0) },
      { label: 'Dose 2 (Day 7)', date: addDays(7) },
    ];
  } else {
    schedule = [
      { label: 'Initial Dose (Day 0)', date: addDays(0) }
    ];
  }

  return (
    <div style={{ gridColumn: 'span 2', marginTop: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
      <div style={{ fontSize: '.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px', color: '#475569', marginBottom: 12 }}>Estimated Vaccination Schedule</div>
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
      <ScheduleSummary service={service} baseDate={form.date} />
    </>
  );

  if (service === 'Tetanus') return (
    <>
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

  if (service === 'Hepatitis') return (
    <>
      <div className="form-field"><label>Hepatitis Variant</label><select value={form.hepaVariant || 'Hepatitis B'} onChange={e => set('hepaVariant', e.target.value)}>
        <option>Hepatitis A</option><option>Hepatitis B</option><option>Hepatitis A+B (Combined)</option>
      </select></div>
      <div className="form-field"><label>Date of Consult</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
      <div className="form-field full"><label>Risk Factor</label><select value={form.riskFactor || 'None stated'} onChange={e => set('riskFactor', e.target.value)}>
        <option>None stated</option><option>Healthcare worker</option><option>Travel exposure</option><option>Household contact</option><option>Food handler</option><option>IV drug use history</option><option>Other</option>
      </select></div>
      <div className="form-field full"><label>Prior Hepa Vaccination</label><select value={form.priorHepa || 'None'} onChange={e => set('priorHepa', e.target.value)}>
        <option>None</option><option>Partially vaccinated</option><option>Fully vaccinated (booster only)</option><option>Unknown</option>
      </select></div>
      <div className="form-field full"><label>Past Vaccination History</label><input type="text" value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)} placeholder="e.g. None" /></div>
      <div className="form-field full"><label>Allergies</label><input type="text" value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. No known allergies" /></div>
      <div className="form-field full"><label>Clinical Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Lab results, symptoms..." /></div>
      <ScheduleSummary service={service} baseDate={form.date} />
    </>
  );

  if (service === 'Pneumonia') return (
    <>
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
    /* Hepatitis */
    hepaVariant: 'Hepatitis B', riskFactor: 'None stated', priorHepa: 'None',
    /* Pneumonia */
    pneumoVaccine: 'PCV15', riskCondition: 'None', priorPneumo: 'None',
  });

  const vaccineItems = inventoryItems.filter(i => i.category === 'Vaccine' && (parseInt(i.stock) || 0) > 0);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  const handleNext = () => {
    if (currentStep.id === 'identity') {
      if (!form.fname.trim() || !form.lname.trim()) { showToast('First Name and Last Name are required', 'error'); return; }
      if (!form.age || Number(form.age) <= 0) { showToast('A valid age is required', 'error'); return; }
      if (!form.email.trim()) { showToast('Email is required for app authorization', 'error'); return; }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) { showToast('Please enter a valid email address', 'error'); return; }
      if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number (e.g. 0917 123 4567)', 'error'); return; }
    }
    if (currentStep.id === 'history') {
      const anyFilled = (form.pastVaccines || '').trim() || (form.allergies || '').trim() || (form.notes || '').trim();
      if (!anyFilled) { showToast('Please provide at least one medical history detail before proceeding', 'error'); return; }
    }
    if (safeStepIndex < steps.length - 1) {
      setCurrentStepIndex(safeStepIndex + 1);
    }
  };

  const handleBack = () => {
    if (safeStepIndex > 0) {
      setCurrentStepIndex(safeStepIndex - 1);
    }
  };

  const jumpToStepId = (id) => {
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
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden" style={{
        width: '64rem',
        maxWidth: '95vw',
        height: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
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

          {/* STEP 1: PATIENT IDENTITY */}
          {currentStep.id === 'identity' && (
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy, #1A2240)', margin: 0 }}>Patient Identity</h3>
                <p style={{ fontSize: '.75rem', color: '#64748B', margin: '2px 0 0' }}>Enter basic personal information and address of the patient</p>
              </div>

              <div className="form-grid" style={{ gap: 14 }}>
                <div className="form-field"><label>First Name <span style={{ color: '#C8151A' }}>*</span></label>
                  <input type="text" value={form.fname} onChange={e => set('fname', e.target.value)} placeholder="e.g. Juan" />
                </div>
                <div className="form-field"><label>Last Name <span style={{ color: '#C8151A' }}>*</span></label>
                  <input type="text" value={form.lname} onChange={e => set('lname', e.target.value)} placeholder="e.g. Dela Cruz" />
                </div>
                <div className="form-field"><label>Middle Initial <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: '.6875rem' }}>(optional)</span></label>
                  <input type="text" value={form.mname || ''} onChange={e => set('mname', e.target.value)} placeholder="e.g. P." maxLength={5} />
                </div>
                <div className="form-field"><label>Suffix <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: '.6875rem' }}>(if any)</span></label>
                  <input type="text" value={form.suffix || ''} onChange={e => set('suffix', e.target.value)} placeholder="e.g. Jr., Sr., III" />
                </div>
                <div className="form-field"><label>Age <span style={{ color: '#C8151A' }}>*</span></label>
                  <input type="text" inputMode="numeric" value={form.age} onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 25" />
                </div>
                <div className="form-field"><label>Sex</label>
                  <select value={form.sex} onChange={e => set('sex', e.target.value)}><option>Male</option><option>Female</option></select>
                </div>
                <div className="form-field full">
                  <label>Email Address <span style={{ color: '#C8151A' }}>*</span> <span style={{ fontWeight: 400, color: '#64748B', fontSize: '.6875rem' }}>(Required for patient mobile app login)</span></label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="patient@gmail.com" />
                </div>
                <div className="form-field full">
                  <label>Contact Number</label>
                  <input type="text" inputMode="numeric" value={form.contact} onChange={e => set('contact', e.target.value.replace(/[^\d+\s-]/g, ''))} placeholder="+63 9XX XXX XXXX" />
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
                <ServiceSelector value={form.service} onChange={v => set('service', v)} />
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

                <div className="form-field full"><label>Generic Name</label>
                  <select value={form.genericName || ''} onChange={e => set('genericName', e.target.value)}>
                    <option value="">— Select generic name —</option>
                    {GENERIC_NAME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
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
                  <select value={form.pastVaccines || ''} onChange={e => set('pastVaccines', e.target.value)}>
                    <option value="">— Select history —</option>
                    {PAST_VACCINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-field full"><label>Allergies</label>
                  <select value={form.allergies || ''} onChange={e => set('allergies', e.target.value)}>
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

                {form.service === 'Hepatitis' && (
                  <>
                    <div className="form-field"><label>Hepatitis Variant</label>
                      <select value={form.hepaVariant || 'Hepatitis B'} onChange={e => set('hepaVariant', e.target.value)}>
                        <option>Hepatitis A</option><option>Hepatitis B</option><option>Hepatitis A+B (Combined)</option>
                      </select>
                    </div>
                    <div className="form-field"><label>Risk Factor</label>
                      <select value={form.riskFactor || 'None stated'} onChange={e => set('riskFactor', e.target.value)}>
                        <option>None stated</option><option>Healthcare worker</option><option>Travel exposure</option><option>Household contact</option><option>Food handler</option><option>IV drug use history</option><option>Other</option>
                      </select>
                    </div>
                    <div className="form-field full"><label>Prior Hepa Vaccination</label>
                      <select value={form.priorHepa || 'None'} onChange={e => set('priorHepa', e.target.value)}>
                        <option>None</option><option>Partially vaccinated</option><option>Fully vaccinated (booster only)</option><option>Unknown</option>
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
                    <ReviewField label="Route / Generic" value={`${form.route} - ${form.genericName || 'N/A'}`} full />
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
    address: patient.address || '', contact: patient.contact || '',
    service: patient.service || 'PEP', vaccineBrand: patient.vaccineBrand || '',
    animal: patient.animal || 'Dog', cat: patient.cat ? `Category ${patient.cat}` : 'Category I',
    date: patient.date || today(),
    woundLocation: patient.woundLocation || '', woundDepth: patient.woundDepth || 'Superficial', numberOfBites: patient.numberOfBites || '1',
    pastVaccines: patient.pastVaccines || '', allergies: patient.allergies || '', notes: patient.notes || '',
    woundType: patient.woundType || 'Laceration', lastTetanus: patient.lastTetanus || 'Unknown',
    hepaVariant: patient.hepaVariant || 'Hepatitis B', riskFactor: patient.riskFactor || 'None stated', priorHepa: patient.priorHepa || 'None',
    pneumoVaccine: patient.pneumoVaccine || 'PCV15', riskCondition: patient.riskCondition || 'None', priorPneumo: patient.priorPneumo || 'None',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isPep = form.service === 'PEP';
  const vaccineItems = inventoryItems.filter(i => i.category === 'Vaccine' && (parseInt(i.stock) || 0) > 0);

  // handleEditSave (parent) validates, persists, and closes this modal itself —
  // no local saving/loading state to juggle here.
  function handleSave() {
    if (!form.name.trim()) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 my-8 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
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

        {/* Scrollable Form Body */}
        <div className="p-6 space-y-5 text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
          {/* Patient Identity */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Patient Identity</span>
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

          {/* Service & Vaccine Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Service & Vaccine Brand</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1.5 text-slate-500">Service</label>
                <select
                  value={form.service}
                  onChange={e => set('service', e.target.value)}
                  className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                >
                  <option>PEP</option><option>Tetanus</option><option>Hepatitis</option><option>Pneumonia</option>
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
          </div>

          {/* PEP Exposure Details */}
          {isPep && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Exposure Details</span>
              </div>
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

          {/* Medical History & Notes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Medical History & Notes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
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
              <div className="sm:col-span-2">
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

              {form.service === 'Hepatitis' && (
                <>
                  <div>
                    <label className="block mb-1.5 text-slate-500">Hepatitis Variant</label>
                    <select
                      value={form.hepaVariant}
                      onChange={e => set('hepaVariant', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option>Hepatitis A</option><option>Hepatitis B</option><option>Hepatitis A+B (Combined)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-slate-500">Risk Factor</label>
                    <select
                      value={form.riskFactor}
                      onChange={e => set('riskFactor', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option>None stated</option><option>Healthcare worker</option><option>Travel exposure</option><option>Household contact</option><option>Food handler</option><option>IV drug use history</option><option>Other</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1.5 text-slate-500">Prior Hepa Vaccination</label>
                    <select
                      value={form.priorHepa}
                      onChange={e => set('priorHepa', e.target.value)}
                      className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                    >
                      <option>None</option><option>Partially vaccinated</option><option>Fully vaccinated (booster only)</option><option>Unknown</option>
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
                  rows={3}
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#3B50DF] hover:bg-[#2F40B5] text-white cursor-pointer shadow-xs transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── PIN MAP CONFIRM MODAL (LANDSCAPE) ─────────────────────────── */
function PinMapConfirmModal({ patient, saving, onConfirm, onCancel }) {
  if (!patient) return null;
  const fullName = formatTitleCase(patient.name);
  const barangayVal = patient.barangay || (patient.address ? (patient.address.match(/Brgy\.\s*([^,]+)/)?.[1] || 'San Juan') : 'San Juan');
  const zoneVal = patient.zone || (patient.address ? patient.address.split(',')[0].replace(/Brgy\..*/, '').trim() : 'Zone 1');
  const locationStr = `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon, Albay`;
  const exposureTypeVal = patient.service === 'PEP' ? `${patient.animal || 'Dog'} Bite` : (patient.service || 'Bite Incident');

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }} onClick={e => { if (e.target.classList.contains('modal-overlay')) onCancel(); }}>
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
          <button className="modal-close" onClick={onCancel}>×</button>
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
    </div>
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
        <div className="modal-head"><h2>Add Vaccination Record</h2><button className="modal-close" onClick={onClose}>×</button></div>

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
function MedicalRecordDetail({ patient, records, patients, onBack, onToast, onEdit }) {
  const [patientApts, setPatientApts] = useState([]);
  const [aptsLoading, setAptsLoading] = useState(true);
  const [aptTab, setAptTab] = useState('all'); // 'all' | 'upcoming' | 'completed'
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const r = records.find(x => x.firestoreId === patient.firestoreId || x.name === patient.name);
  const rec = r || { doses: [], reports: [], address: '—', date: patient.date, id: patient.id, age: patient.age, animal: patient.animal, cat: patient.cat };
  const reportsList = r?.reports || patient.reports || [];

  // Sync patient appointments real-time from Firestore /appointments
  useEffect(() => {
    if (!db) { setAptsLoading(false); return; }
    try {
      const q = query(collection(db, 'appointments'));
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
      onToast(`Record archived in DOH Retention Caseload (Valid until ${expYear}) ✓`, 'success');
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

  const patientPhoto = patient.photoUrl || patient.avatarUrl || patient.profileImage || patient.imageUrl || patient.photo || patient.image || rec.photoUrl || rec.avatarUrl;

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
          {isCompletedOrArchived && (
            <button
              onClick={handleArchiveRecord}
              disabled={archiving || patient.isArchived}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 ${
                patient.isArchived
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 cursor-default'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
              }`}
              title="Archive into DOH 10-Year Statutory Retention Caseload"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              {patient.isArchived ? 'Preserved in Caseload ✓' : 'Archive to Retention Caseload'}
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

      {/* ── DOH RETENTION NOTICE BANNER FOR COMPLETED & RETAINED RECORDS ── */}
      {isCompletedOrArchived && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 flex items-start justify-between gap-4 flex-wrap shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200 mt-0.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wide">DOH Statutory Medical Record Retention Compliance</h4>
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Preserved in Caseload (10-Year Statutory Period)
                </span>
              </div>
              <p className="text-[11.5px] text-emerald-900/90 mt-1 leading-relaxed max-w-4xl">
                Pursuant to Philippine DOH Medical Record Retention Guidelines (DOH AO 2012-0012), completed patient post-exposure prophylaxis (PEP) & bite injury encounter records remain preserved intact in the active clinic caseload for a mandatory statutory retention window of at least <strong>10 years</strong> (Preserved active until <strong>{getDOHRetentionYear(rec || patient)}</strong>). Full clinical records remain intact for follow-up review, legal preservation, and medical audits prior to cold-storage archiving.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP ROW: CARD 1 (PROFILE & GENERAL INFO WITH DIVIDER) & CARD 2 (STANDALONE MEDICAL HISTORY) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-stretch">

        {/* ── CARD 1 (LEFT 7 COLS): PROFILE SUMMARY & GENERAL INFORMATION WITH VERTICAL DIVIDER ── */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-indigo-100/90 ring-1 ring-indigo-500/10 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-stretch divide-y sm:divide-y-0 sm:divide-x divide-slate-100 h-full">

            {/* Profile Side (5 cols) */}
            <div className="sm:col-span-5 pr-0 sm:pr-6 flex flex-col justify-between items-center text-center">
              <div className="w-full flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-50 to-slate-100 border-2 border-indigo-100 flex items-center justify-center shadow-xs overflow-hidden shrink-0 mb-3 relative">
                  {patientPhoto ? (
                    <img
                      src={patientPhoto}
                      alt={patient.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <span className="text-xl font-black text-[#3B50DF] tracking-tight">{getInitials(patient.name || '?')}</span>
                  )}
                </div>

                <h2 className="text-base font-extrabold text-slate-900 leading-tight">{patient.name}</h2>
                <p className="text-xs text-slate-400 font-medium mt-1 truncate max-w-full">{patient.email || 'No email registered'}</p>

                <div className="grid grid-cols-2 gap-3 w-full mt-4 pt-3 border-t border-slate-100">
                  <div className="bg-indigo-50/50 rounded-2xl p-2.5 text-center border border-indigo-100/80 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Appointments</span>
                    <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">{patientApts.length}</span>
                  </div>
                  <div className="bg-indigo-50/50 rounded-2xl p-2.5 text-center border border-indigo-100/80 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">MRN Code</span>
                    <span className="text-xs font-extrabold text-[#3B50DF] mt-1 block truncate">{rec.id}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* General Info Side (7 cols) */}
            <div className="sm:col-span-7 sm:pl-6 pt-6 sm:pt-0 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-indigo-50">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 text-[#3B50DF] border border-indigo-100 flex items-center justify-center shrink-0 shadow-2xs">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">General Information</h3>
                  </div>
                  <button
                    onClick={() => onEdit?.(r || patient)}
                    className="w-6 h-6 rounded-full bg-slate-50 text-slate-500 hover:text-[#3B50DF] hover:bg-indigo-50 flex items-center justify-center transition-colors cursor-pointer"
                    title="Edit Patient Info"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs font-semibold">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gender / Sex</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 block">{patient.sex || 'Female'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Birth Date / Age</span>
                    <span className="text-xs font-bold text-slate-800 mt-0.5 block">{rec.age ? `${rec.age} yrs old` : '—'}</span>
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
          </div>
        </div>

        {/* ── CARD 2 (RIGHT 5 COLS): STANDALONE MEDICAL HISTORY & EXPOSURE DETAILS CARD ── */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-teal-100/90 ring-1 ring-teal-500/10 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-teal-50">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center shrink-0 shadow-2xs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">Medical History & Exposure Details</h3>
              </div>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200/80">Clinical Data</span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs font-semibold text-slate-700">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Exposure Category</span>
                <span className="text-xs font-bold text-slate-900 mt-1 block">Cat {patient.cat || '—'}</span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Biting Animal</span>
                <span className="text-xs font-bold text-slate-900 mt-1 block">{patient.animal || 'Bite / Scratch'}</span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Wound Location</span>
                <span className="text-xs font-bold text-slate-900 mt-1 block">{patient.woundLocation || patient.biteLocation || '—'}</span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Vaccine Brand</span>
                <span className="text-xs font-bold text-[#3B50DF] mt-1 block">{patient.vaccineBrand || 'Rabipur'}</span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Known Allergies</span>
                <span className="text-xs font-bold text-slate-800 mt-1 block">{patient.allergies || 'None'}</span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Past Vaccines</span>
                <span className="text-xs font-bold text-slate-800 mt-1 block">{patient.pastVaccines || 'None'}</span>
              </div>

              <div className="col-span-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Doctor / Nurse Remarks</span>
                <p className="text-slate-700 font-normal leading-relaxed text-[11.5px] bg-teal-50/30 p-2.5 rounded-xl border border-teal-100/80 border-l-4 border-l-teal-500">
                  {rec.notes || 'No custom clinical remarks noted.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MIDDLE ROW: VACCINATION DOSES (LEFT 6 COLS) & APPOINTMENTS (RIGHT 6 COLS) SIDE-BY-SIDE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-start">

        {/* ── LEFT COLUMN (6 COLS): COMPACT VACCINATION DOSES TRACKER ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-blue-100/90 ring-1 ring-blue-500/10 shadow-xs hover:shadow-sm transition-all p-5 flex flex-col justify-between">
          <div>
            {/* Clean Compact Header */}
            <div className="flex items-center justify-between pb-3 border-b border-blue-50 flex-wrap gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" /></svg>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900">
                    Vaccination Doses
                  </h3>
                  <span className="text-[9.5px] font-bold text-[#3B50DF] bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100/90">
                    {patient.service || 'PEP'} Protocol
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5 pl-8">Dose schedule timeline for {patient.name}</p>
              </div>
            </div>

            {/* Compact Dose Timeline List */}
            {rec.doses.length === 0 ? (
              <div className="py-5 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-3">
                <p className="text-xs font-bold text-slate-700">No vaccination doses recorded yet</p>
                <p className="text-[11px] text-slate-400 font-normal mt-0.5">Doses appear here once the vaccination schedule is recorded.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {rec.doses.map((d, i) => {
                  const isDone = d.s === 'done';
                  const isMiss = d.s === 'miss';
                  const isNext = !isDone && !isMiss && (i === 0 || rec.doses[i - 1]?.s === 'done' || rec.doses[i - 1]?.s === 'miss');

                  const cardBg = isDone
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : isMiss
                    ? 'bg-rose-50/40 border-rose-200/80'
                    : isNext
                    ? 'bg-indigo-50/60 border-[#3B50DF] shadow-2xs'
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
                      className={`py-1.5 px-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${cardBg}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Circle Badge Number or Icon */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-[10.5px] shrink-0 shadow-2xs border ${badgeBg}`}>
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
                          <p className={`text-[11.5px] font-bold truncate leading-tight ${isDone ? 'text-slate-900 line-through decoration-emerald-500/60' : 'text-slate-900'}`}>
                            {d.n}
                          </p>
                          <div className="flex items-center gap-1 text-[10.5px] text-slate-500 font-medium">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            <span>{d.date}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide shrink-0 ${
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
            )}
          </div>

          {/* Status Legend Footer */}
          {rec.doses.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-semibold text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completed</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3B50DF]" /> Next Due</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Scheduled</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Missed</span>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN (6 COLS): SYNCED APPOINTMENTS CARD ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-sky-100/90 ring-1 ring-sky-500/10 shadow-xs hover:shadow-sm transition-all overflow-hidden h-full flex flex-col justify-between">
          <div>
            <div className="p-4 sm:p-5 border-b border-sky-50 bg-sky-50/30 flex items-center justify-between flex-wrap gap-2">
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

            {/* Appointments Table */}
            <div className="overflow-x-auto">
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
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
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
                          <td className="px-4 py-3 font-bold text-slate-900">{fmtDate(apt.date)}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800 truncate max-w-[120px]">{apt.type || apt.purpose || 'Vaccination'}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">{apt.time || '10:00 am'}</td>
                          <td className="px-4 py-3">
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
          doses={rec.doses}
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
          initialPatient={r || patient}
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
function X({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={saving ? undefined : onBack}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm clinical report"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 my-8"
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
      date: new Date().toISOString().split('T')[0],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 my-8" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Add Clinical Report / Dose Vitals</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">Log vitals, injection route, and clinical observations for {patient.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"><X size={16}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
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
function ExportReportModal({ patients, onClose, onToast, initialPatient }) {
  const [mode, setMode] = useState(initialPatient ? 'single' : 'bulk'); // 'bulk' | 'single'
  const [period, setPeriod] = useState('monthly');
  const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const PERIODS = [
    { key: 'daily', label: 'Daily', desc: 'Today\'s registrations',
      icon: <svg {...iconProps}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg> },
    { key: 'weekly', label: 'Weekly', desc: 'Last 7 days',
      icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="9" x2="21" y2="9" /></svg> },
    { key: 'monthly', label: 'Monthly', desc: 'This calendar month',
      icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="13" x2="8" y2="13" /><line x1="12" y1="13" x2="12" y2="13" /><line x1="16" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="8" y2="17" /><line x1="12" y1="17" x2="12" y2="17" /></svg> },
    { key: 'yearly', label: 'Yearly', desc: 'This calendar year',
      icon: <svg {...iconProps}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" /></svg> },
  ];

  const fileIcon = <svg {...iconProps}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  const [exportFormat, setExportFormat] = useState('pdf'); // 'xls' | 'pdf'
  const FORMATS = [
    { key: 'xls', label: 'Excel (XLS)' },
    { key: 'pdf', label: 'PDF' },
  ];

  // Preview gate — nothing leaves the modal until the user has seen the
  // rendered report. 'form' = pick period/format, 'preview' = review it.
  const [step, setStep] = useState('form');

  // ── Single-patient search — filters the same already-loaded `patients`
  // list the main table searches (that list is capped at the 20 most
  // recent records app-wide; a patient outside that window won't show up
  // here either, same limitation as the table's own search box). ─────────
  const [patientQuery, setPatientQuery] = useState(initialPatient ? formatTitleCase(initialPatient.name) : '');
  const [selectedPatient, setSelectedPatient] = useState(initialPatient || null);
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

  async function sendReportEmail(to, subject, html, attachment) {
    const trimmed = to.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      onToast('Enter a valid recipient email address.', 'error');
      return;
    }
    setSending(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/send-patient-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          to: trimmed, subject, html,
          ...(attachment ? { attachmentBase64: attachment.base64, attachmentFilename: attachment.filename } : {}),
        }),
      });
      const data = await res.json();
      if (data?.success) {
        onToast(`Report emailed to ${trimmed}`, 'success');
        setShowEmailInput(false);
        setEmailTo('');
      } else {
        onToast(data?.error || 'Failed to send the email.', 'error');
      }
    } catch {
      onToast('Network error while sending the email.', 'error');
    } finally {
      setSending(false);
    }
  }

  function getFilteredPatients() {
    const now = new Date();
    return patients.filter(p => {
      const raw = p.createdAt?.toDate ? p.createdAt.toDate() : (p.date ? new Date(p.date + 'T00:00:00') : null);
      if (!raw) return false;
      if (period === 'daily') {
        return raw.toDateString() === now.toDateString();
      } else if (period === 'weekly') {
        const msAgo = now - raw;
        return msAgo >= 0 && msAgo <= 7 * 24 * 60 * 60 * 1000;
      } else if (period === 'monthly') {
        return raw.getFullYear() === now.getFullYear() && raw.getMonth() === now.getMonth();
      } else if (period === 'yearly') {
        return raw.getFullYear() === now.getFullYear();
      }
      return false;
    });
  }

  function periodLabel() {
    const now = new Date();
    if (period === 'daily') return now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (period === 'weekly') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      return `${from.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (period === 'monthly') return now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    if (period === 'yearly') return String(now.getFullYear());
    return '';
  }

  // Shared print/email HTML shell — official Philippine institutional letterhead with clean table layout
  function reportStyles() {
    return `
      *{box-sizing:border-box;}
      body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;padding:0;margin:0;font-size:11.5px;line-height:1.5;background:#FFFFFF;}
      .letterhead-container{border-bottom:2px solid #0F172A;padding-bottom:14px;margin-bottom:16px;}
      .formal-summary{width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #CBD5E1;}
      .formal-summary th{background:#F1F5F9;color:#334155;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:0.5px;padding:8px 12px;border:1px solid #CBD5E1;text-align:center;}
      .formal-summary td{padding:10px 12px;border:1px solid #CBD5E1;text-align:center;font-size:14px;font-weight:800;color:#0F172A;}
      
      .section-title{font-size:10.5px;font-weight:800;margin:18px 0 10px;color:#0F172A;text-transform:uppercase;letter-spacing:0.6px;border-bottom:2px solid #0F172A;padding-bottom:4px;}
      table.data-table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px;border:1px solid #CBD5E1;}
      table.data-table th{background:#F1F5F9;text-align:left;padding:8px 10px;border:1px solid #CBD5E1;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#334155;font-weight:700;}
      table.data-table td{padding:7px 10px;border:1px solid #E2E8F0;vertical-align:middle;color:#1E293B;}
      table.data-table tr:nth-child(even) td{background:#F8FAFC;}
      .status-pill{display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;}
      .status-completed{background:#DCFCE7;color:#15803D;border:1px solid #A7F3D0;}
      .status-ongoing{background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;}
      .footer{font-size:9px;color:#94A3B8;margin-top:24px;border-top:1px solid #E2E8F0;padding-top:10px;display:flex;justify-content:space-between;align-items:center;}
    `;
  }

  // Official Philippine Government / Institutional Letterhead
  function letterhead() {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2px solid #0F172A;margin-bottom:16px;">
        <!-- Left Accreditation Emblem -->
        <div style="width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#F8FAFC;border:1px solid #CBD5E1;flex-shrink:0;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B50DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v12M6 12h12"/>
          </svg>
        </div>

        <!-- Center Official Republic Letterhead Text -->
        <div style="text-align:center;flex:1;padding:0 16px;">
          <div style="font-family:'Times New Roman',Georgia,serif;font-size:10px;font-weight:600;color:#475569;letter-spacing:1.2px;text-transform:uppercase;">Republic of the Philippines</div>
          <div style="font-family:'Times New Roman',Georgia,serif;font-size:18px;font-weight:800;color:#1E293B;margin:2px 0 1px;letter-spacing:-0.01em;">K&amp;A Anti-Rabies Vaccine Clinic</div>
          <div style="font-family:'Segoe UI',sans-serif;font-size:10.5px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;">Animal Bite Treatment Center</div>
          <div style="font-size:9px;color:#64748B;margin-top:3px;font-family:'Segoe UI',sans-serif;">Polangui, Albay &bull; Contact: (052) 486-1220 &bull; Email: knaclinic.ph@gmail.com</div>
        </div>

        <!-- Right Clinic Seal -->
        <div style="width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#0F172A;border:1px solid #0F172A;flex-shrink:0;">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
        </div>
      </div>
    `;
  }

  // Realistic Simple Microsoft Excel Live Preview HTML
  function buildExcelPreviewHtml(rows, periodLabelStr) {
    const serviceCount = {};
    const statusCount = { ongoing: 0, completed: 0 };
    rows.forEach(p => {
      const svc = p.service || 'PEP';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
      const st = derivePatientStatus(p);
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    const headers = ['#', 'Case No.', 'Patient Name', 'Age', 'Sex', 'Address', 'Contact No.', 'Service', 'Status', 'Date Registered'];
    const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    const tableRows = rows.map((p, idx) => {
      const st = derivePatientStatus(p);
      const rowNum = idx + 6;
      return `<tr>
        <td class="row-num">${rowNum}</td>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-weight:bold;color:#0F172A;">${p.id || p.mrn || '—'}</td>
        <td style="font-weight:bold;color:#0F172A;">${formatTitleCase(p.name || '—')}</td>
        <td style="text-align:center;">${p.age || '—'}</td>
        <td style="text-align:center;">${p.sex || '—'}</td>
        <td>${p.address || '—'}</td>
        <td>${p.contact || '—'}</td>
        <td style="text-align:center;font-weight:bold;">${p.service || '—'}</td>
        <td style="text-align:center;font-weight:bold;color:${st === 'completed' ? '#15803D' : '#1D4ED8'};">${st.toUpperCase()}</td>
        <td style="text-align:center;">${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—')}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><title>Excel Preview</title>
      <style>
        *{box-sizing:border-box;}
        body{font-family:Calibri,'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#FFFFFF;font-size:11px;color:#1E293B;user-select:none;}
        .sheet-container{background:#FFFFFF;overflow-x:auto;padding:0;}
        table.excel-grid{border-collapse:collapse;width:100%;table-layout:fixed;}
        table.excel-grid th, table.excel-grid td{border:1px solid #CBD5E1;padding:6px 9px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        th.col-head{background:#F1F5F9;color:#475569;font-weight:700;text-align:center;font-size:10px;border:1px solid #CBD5E1;}
        td.row-num{background:#F1F5F9;color:#64748B;font-weight:700;text-align:center;font-size:10px;width:36px;border:1px solid #CBD5E1;}
        .sheet-tabs{background:#F1F5F9;border-top:1px solid #CBD5E1;padding:4px 12px;display:flex;align-items:center;gap:4px;font-size:11px;position:sticky;bottom:0;}
        .tab{background:#FFFFFF;border:1px solid #CBD5E1;border-bottom:none;padding:4px 12px;font-weight:700;color:#15803D;border-top:2px solid #15803D;border-radius:3px 3px 0 0;}
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
              <td colspan="10" style="font-size:13px;font-weight:bold;color:#0F172A;background:#F8FAFC;">K&amp;A CLINIC — PATIENT REGISTRY REPORT</td>
            </tr>
            <tr>
              <td class="row-num">2</td>
              <td colspan="10" style="color:#475569;background:#F8FAFC;">Report Period: <strong>${periodLabelStr}</strong> &nbsp;|&nbsp; Date Exported: ${new Date().toLocaleString('en-PH')}</td>
            </tr>
            <tr>
              <td class="row-num">3</td>
              <td colspan="3" style="background:#F1F5F9;font-weight:bold;">Total Patients: ${rows.length}</td>
              <td colspan="3" style="background:#F1F5F9;font-weight:bold;color:#1D4ED8;">Ongoing: ${statusCount.ongoing || 0}</td>
              <td colspan="4" style="background:#F1F5F9;font-weight:bold;color:#15803D;">Completed: ${statusCount.completed || 0}</td>
            </tr>
            <tr>
              <td class="row-num">4</td>
              <td colspan="10" style="background:#FFFFFF;height:4px;"></td>
            </tr>
            <tr style="background:#0F172A;color:#FFFFFF;font-weight:bold;">
              <td class="row-num" style="background:#F1F5F9;color:#64748B;">5</td>
              ${headers.map(h => `<td style="background:#0F172A;color:#FFFFFF;font-weight:bold;text-align:${h === '#' || h === 'Age' || h === 'Sex' || h === 'Service' || h === 'Status' || h === 'Date Registered' ? 'center' : 'left'};">${h}</td>`).join('')}
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
  function exportBulkXLS() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    
    const serviceCount = {};
    const statusCount = { ongoing: 0, completed: 0 };
    rows.forEach(p => {
      const svc = p.service || 'PEP';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
      const st = derivePatientStatus(p);
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    const headers = ['#', 'Case No.', 'Patient Name', 'Age', 'Sex', 'Address', 'Contact No.', 'Service Type', 'Status', 'Date Registered'];
    const cols = headers.length;

    const tableRows = rows.map((p, idx) => {
      const st = derivePatientStatus(p);
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      return `<tr style="background-color:${bg};">
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${idx + 1}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;font-weight:bold;">${p.id || p.mrn || '—'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;font-weight:bold;">${formatTitleCase(p.name || '—')}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${p.age || '—'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${p.sex || '—'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;">${p.address || '—'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;">${p.contact || '—'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;font-weight:bold;">${p.service || '—'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;font-weight:bold;color:${st === 'completed' ? '#15803D' : '#1D4ED8'};">${st.toUpperCase()}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—')}</td>
      </tr>`;
    }).join('');

    const svcSummaryRows = Object.entries(serviceCount).map(([svc, cnt]) =>
      `<tr><td style="padding:6px;border:1px solid #CBD5E1;font-weight:bold;">${svc}</td><td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${cnt}</td><td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${((cnt / rows.length) * 100).toFixed(1)}%</td></tr>`
    ).join('');

    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
      <style>
        td,th{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;}
        .brand{font-size:16pt;font-weight:bold;color:#0F172A;}
        .tagline{font-size:9.5pt;color:#475569;}
        .meta{font-size:10pt;color:#334155;}
        th.col{background:#0F172A;color:#FFFFFF;font-weight:bold;text-align:left;padding:8px;}
        th.subcol{background:#334155;color:#FFFFFF;font-weight:bold;text-align:center;padding:6px;}
        .card{background:#F8FAFC;border:1px solid #CBD5E1;font-weight:bold;text-align:center;}
      </style></head><body>
      <table border="0">
        <tr><td class="brand" colspan="${cols}">K&amp;A Clinic &mdash; Anti-Rabies &amp; Animal Bite Center</td></tr>
        <tr><td class="tagline" colspan="${cols}">OFFICIAL CLINICAL PATIENT REPORT &bull; ${periodLabel()}</td></tr>
        <tr><td class="meta" colspan="${cols}">Report Period: ${periodLabel()} | Exported: ${new Date().toLocaleString('en-PH')}</td></tr>
        <tr><td colspan="${cols}"></td></tr>
      </table>
      <table border="1" style="margin-bottom:15px;">
        <tr style="background:#F1F5F9;">
          <th style="background:#F1F5F9;color:#0F172A;font-weight:bold;" colspan="3">SUMMARY METRICS</th>
        </tr>
        <tr>
          <td class="card">Total Patients: ${rows.length}</td>
          <td class="card">Ongoing Cases: ${statusCount.ongoing || 0}</td>
          <td class="card">Completed Cases: ${statusCount.completed || 0}</td>
        </tr>
      </table>
      <br/>
      <table border="1" style="margin-bottom:15px;">
        <thead>
          <tr><th class="subcol">Service Type</th><th class="subcol">Patient Count</th><th class="subcol">% of Total</th></tr>
        </thead>
        <tbody>${svcSummaryRows}</tbody>
      </table>
      <br/>
      <table border="1">
        <thead>
          <tr>${headers.map(h => `<th class="col">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      </body></html>`;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinic-report-${period}-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(`Excel report exported (${rows.length} patient${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  function buildBulkReportHtml(rows) {
    const serviceCount = {};
    const statusCount = { ongoing: 0, completed: 0 };
    rows.forEach(p => {
      const svc = p.service || 'PEP';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
      const st = derivePatientStatus(p);
      statusCount[st] = (statusCount[st] || 0) + 1;
    });
    const svcRows = Object.entries(serviceCount).map(([k, v]) =>
      `<tr><td style="font-weight:bold;">${k}</td><td style="text-align:center;">${v}</td><td style="text-align:center;">${((v / rows.length) * 100).toFixed(1)}%</td></tr>`
    ).join('');
    const tableRows = rows.map((p, i) => {
      const st = derivePatientStatus(p);
      return `
      <tr>
        <td style="text-align:center;color:#64748B;">${i + 1}</td>
        <td style="font-weight:bold;color:#0F172A;">${p.id || p.mrn || '—'}</td>
        <td style="font-weight:bold;color:#0F172A;">${formatTitleCase(p.name || '—')}</td>
        <td style="text-align:center;">${p.age || '—'}</td>
        <td style="text-align:center;">${p.sex || '—'}</td>
        <td style="text-align:center;font-weight:bold;">${p.service || '—'}</td>
        <td style="text-align:center;"><span class="status-pill status-${st}">${st}</span></td>
        <td style="text-align:center;">${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—')}</td>
      </tr>`;
    }).join('');
    return `<!DOCTYPE html><html><head><title>Patient Report — ${periodLabel()}</title>
    <style>${reportStyles()}</style></head><body style="padding:28px 36px;">
    ${letterhead()}
    
    <!-- Inline Metadata Row (Matching user sample format: Label: Underlined Value) -->
    <div style="text-align:center;margin-bottom:14px;font-size:11px;color:#0F172A;line-height:1.8;">
      <strong>Report Period:</strong> <span style="text-decoration:underline;margin-right:16px;">${periodLabel()}</span>
      <strong>Date Exported:</strong> <span style="text-decoration:underline;margin-right:16px;">${new Date().toLocaleString('en-PH')}</span>
      <strong>Total Records:</strong> <span style="text-decoration:underline;">${rows.length} Patients</span>
    </div>

    <!-- Centered Document Title -->
    <div style="text-align:center;font-size:13.5px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:18px;">
      OFFICIAL CLINICAL REGISTRY REPORT
    </div>

    <div class="section-title">Key Registry Metrics</div>
    <table class="formal-summary">
      <thead>
        <tr>
          <th>Total Patients Registered</th>
          <th>Active Ongoing Cases</th>
          <th>Completed Series Cases</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${rows.length}</td>
          <td style="color:#1D4ED8;">${statusCount.ongoing || 0}</td>
          <td style="color:#15803D;">${statusCount.completed || 0}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Summary Breakdown by Service</div>
    <table class="data-table" style="width:auto;min-width:340px;">
      <thead><tr><th>Service Category</th><th style="text-align:center;">Patient Count</th><th style="text-align:center;">Percentage</th></tr></thead>
      <tbody>${svcRows}</tbody>
    </table>

    <div class="section-title">Official Patient Registry</div>
    <table class="data-table">
      <thead><tr><th style="text-align:center;">#</th><th>Case No.</th><th>Patient Name</th><th style="text-align:center;">Age</th><th style="text-align:center;">Sex</th><th style="text-align:center;">Service</th><th style="text-align:center;">Status</th><th style="text-align:center;">Date Registered</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>

    <div class="footer">
      <span>K&amp;A Anti-Rabies &amp; Animal Bite Center &bull; Official Clinical Record</span>
      <span>Page 1 of 1</span>
    </div>
    </body></html>`;
  }

  function exportPrint() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    const w = window.open('', '_blank');
    w.document.write(buildBulkReportHtml(rows));
    w.document.close();
    w.print();
    onToast(`${period.charAt(0).toUpperCase() + period.slice(1)} report opened for printing`, 'success');
  }

  function buildBulkPdf(rows) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const statusCount = { ongoing: 0, completed: 0 };
    rows.forEach(p => {
      const st = derivePatientStatus(p);
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    // Top Republic Letterhead Header
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('REPUBLIC OF THE PHILIPPINES', pageWidth / 2, 12, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(200, 21, 26);
    doc.text('K&A Anti-Rabies Vaccine Clinic', pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text('ANIMAL BITE TREATMENT CENTER', pageWidth / 2, 23, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Polangui, Albay · Tel: (052) 486-1220 · knaclinic.ph@gmail.com', pageWidth / 2, 28, { align: 'center' });

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.8);
    doc.line(14, 31, pageWidth - 14, 31);

    // Inline Metadata
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'normal');
    const metaStr = `Report Period: ${periodLabel()}   |   Exported: ${new Date().toLocaleString('en-PH')}   |   Total Patients: ${rows.length}`;
    doc.text(metaStr, pageWidth / 2, 38, { align: 'center' });

    // Title
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('OFFICIAL CLINICAL PATIENT REGISTRY REPORT', pageWidth / 2, 46, { align: 'center' });

    autoTable(doc, {
      startY: 50,
      head: [['Total Patients Registered', 'Active Ongoing Cases', 'Completed Series Cases']],
      body: [[String(rows.length), String(statusCount.ongoing || 0), String(statusCount.completed || 0)]],
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 8, fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 10, halign: 'center', cellPadding: 4 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['#', 'Case No.', 'Name', 'Age', 'Sex', 'Service', 'Status', 'Date Registered']],
      body: rows.map((p, i) => [i + 1, p.id || p.mrn || '—', formatTitleCase(p.name || '—'), p.age || '—', p.sex || '—', p.service || '—', derivePatientStatus(p).toUpperCase(), p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—')]),
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
    });

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`K&A Anti-Rabies Vaccine Clinic · Confidential Clinical Report · ${new Date().getFullYear()}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    return doc;
  }

  function exportBulkPdf() {
    const rows = getFilteredPatients();
    if (rows.length === 0) { onToast('No patients found for this period', 'error'); return; }
    buildBulkPdf(rows).save(`patient-report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
    onToast(`PDF exported (${rows.length} patient${rows.length !== 1 ? 's' : ''})`, 'success');
  }

  function runBulkExport() {
    if (exportFormat === 'xls') exportBulkXLS();
    else exportBulkPdf();
  }

  const [includeRecord, setIncludeRecord] = useState(true);
  const [includeCertificate, setIncludeCertificate] = useState(false);
  const docType = includeRecord && includeCertificate ? 'both' : includeCertificate ? 'certificate' : 'record';
  const toggleIncludeRecord = () => setIncludeRecord(v => (v && !includeCertificate) ? v : !v);
  const toggleIncludeCertificate = () => setIncludeCertificate(v => (v && !includeRecord) ? v : !v);

  function getProtocolLabel(p) {
    const doses = p.doses || [];
    const doneCount = doses.filter(d => (d.s || d.status) === 'done').length;
    if (p.service === 'PEP') {
      const hasERIG = doses.some(d => (d.n || d.label || '').includes('ERIG'));
      return hasERIG ? `ERIG + ARV ${doneCount}-dose series` : (doneCount ? `ARV ${doneCount}-dose series (Days 0, 3, 7, 14, 28)` : 'ARV vaccination series');
    }
    if (p.service === 'Tetanus') return `Anti-Tetanus vaccination${doneCount ? ` (${doneCount} dose${doneCount > 1 ? 's' : ''} completed)` : ''}`;
    if (p.service === 'Hepatitis') return `Hepatitis vaccination series${doneCount ? ` (${doneCount} dose${doneCount > 1 ? 's' : ''} completed)` : ''}`;
    if (p.service === 'Pneumonia') return `Pneumococcal vaccination${doneCount ? ` (${doneCount} dose${doneCount > 1 ? 's' : ''} completed)` : ''}`;
    return `${p.service || 'Vaccination'} treatment`;
  }

  const PATIENT_HIDDEN_NOTE = 'Wound assessment details are held in your clinical file at K&A Clinic.';

  function medicalRecordBodyHtml(p, audience = 'clinic') {
    const showWoundDetail = audience !== 'patient';
    const doses = p.doses || [];
    const doseRows = doses.map(d => {
      const st = d.s || d.status || 'pending';
      const stColor = st === 'done' ? '#15803D' : st === 'miss' ? '#C8151A' : '#D97706';
      const stBg = st === 'done' ? '#DCFCE7' : st === 'miss' ? '#FEE2E2' : '#FEF3C7';
      return `
      <tr>
        <td style="padding:8px 10px;border:1px solid #CBD5E1;font-weight:700;color:#0F172A;">${d.n || d.label || ''}</td>
        <td style="padding:8px 10px;border:1px solid #CBD5E1;color:#334155;">${d.date || '—'}</td>
        <td style="padding:8px 10px;border:1px solid #CBD5E1;text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;background:${stBg};color:${stColor};">${st === 'miss' ? 'Overdue' : st}</span>
        </td>
      </tr>`;
    }).join('');
    const registered = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—');
    const st = derivePatientStatus(p);

    return `
      <div style="font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;color:#0F172A;font-size:11.5px;line-height:1.5;padding:24px 28px;background:#FFFFFF;border:1px solid #0F172A;">
        ${letterhead()}
        
        <!-- Inline Metadata Row -->
        <div style="text-align:center;margin-bottom:14px;font-size:11px;color:#0F172A;line-height:1.8;">
          <strong>Name:</strong> <span style="text-decoration:underline;margin-right:16px;font-weight:700;">${formatTitleCase(p.name)}</span>
          <strong>Case No:</strong> <span style="text-decoration:underline;margin-right:16px;">${p.id || p.mrn || '—'}</span>
          <strong>Service:</strong> <span style="text-decoration:underline;margin-right:16px;">${p.service || '—'}</span>
          <strong>Status:</strong> <span style="text-decoration:underline;font-weight:700;color:${st === 'completed' ? '#15803D' : '#1D4ED8'};">${st.toUpperCase()}</span>
        </div>

        <!-- Centered Document Title -->
        <div style="text-align:center;font-size:14px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:18px;text-decoration:underline;">
          OFFICIAL PATIENT CLINICAL MEDICAL RECORD
        </div>

        <!-- Section I: Patient Profile & Demographics -->
        <div style="font-size:10.5px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">I. Patient Profile &amp; Demographics</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #CBD5E1;">
          <tr>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;width:20%;border:1px solid #CBD5E1;">Full Name</td>
            <td style="padding:7px 10px;font-weight:700;color:#0F172A;width:30%;border:1px solid #CBD5E1;">${formatTitleCase(p.name)}</td>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;width:20%;border:1px solid #CBD5E1;">Age / Sex</td>
            <td style="padding:7px 10px;font-weight:700;color:#0F172A;width:30%;border:1px solid #CBD5E1;">${p.age || '—'} yrs &bull; ${(p.sex || '—').toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Address</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.address || '—'}</td>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Contact No.</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.contact || '—'}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Email Address</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.email || '—'}</td>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Registration Date</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${registered}</td>
          </tr>
        </table>

        <!-- Section II: Service & Exposure Assessment -->
        <div style="font-size:10.5px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">II. Service &amp; Clinical Details</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #CBD5E1;">
          <tr>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;width:20%;border:1px solid #CBD5E1;">Service Type</td>
            <td style="padding:7px 10px;font-weight:700;color:#0F172A;width:30%;border:1px solid #CBD5E1;">${p.service || '—'}</td>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;width:20%;border:1px solid #CBD5E1;">Vaccine Brand</td>
            <td style="padding:7px 10px;font-weight:700;color:#0F172A;width:30%;border:1px solid #CBD5E1;">${p.vaccineBrand || '—'}</td>
          </tr>
          ${p.service === 'PEP' ? `
          <tr>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Biting Animal</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.animal || '—'}</td>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Exposure Category</td>
            <td style="padding:7px 10px;font-weight:800;color:#B91C1C;border:1px solid #CBD5E1;">Category ${p.cat || '—'}</td>
          </tr>
          <tr>
            ${showWoundDetail ? `
              <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Wound Details</td>
              <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.woundLocation || '—'} (${p.woundDepth || '—'})</td>
            ` : `
              <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Exposure Date</td>
              <td style="padding:7px 10px;border:1px solid #CBD5E1;">${fmtDate(p.date)}</td>
            `}
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">No. of Bites</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.numberOfBites || '—'}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Past Vaccines</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.pastVaccines || '—'}</td>
            <td style="padding:7px 10px;background:#F1F5F9;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Allergies</td>
            <td style="padding:7px 10px;border:1px solid #CBD5E1;">${p.allergies || 'None recorded'}</td>
          </tr>
        </table>

        <!-- Section III: Dose Schedule & Status -->
        <div style="font-size:10.5px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">III. Dose Schedule &amp; Vaccination Status</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #CBD5E1;">
          <thead><tr>
            <th style="background:#F1F5F9;padding:8px 10px;text-align:left;border:1px solid #CBD5E1;font-size:9px;text-transform:uppercase;">Dose Designation</th>
            <th style="background:#F1F5F9;padding:8px 10px;text-align:left;border:1px solid #CBD5E1;font-size:9px;text-transform:uppercase;">Scheduled Administration Date</th>
            <th style="background:#F1F5F9;padding:8px 10px;text-align:center;border:1px solid #CBD5E1;font-size:9px;text-transform:uppercase;">Status</th>
          </tr></thead>
          <tbody>${doseRows || '<tr><td colspan="3" style="padding:10px;border:1px solid #CBD5E1;text-align:center;color:#64748B;">No dose schedule recorded</td></tr>'}</tbody>
        </table>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;padding-top:20px;">
          <div style="text-align:center;">
            <div style="border-top:1.5px solid #0F172A;padding-top:6px;font-size:11px;width:80%;margin:0 auto;">
              <strong>MARIA F. JOHNSON, RN</strong><br>
              <span style="font-size:9.5px;color:#64748B;">Attending Clinic Nurse &bull; PRC Lic. No. 0654321</span>
            </div>
          </div>
          <div style="text-align:center;">
            <div style="border-top:1.5px solid #0F172A;padding-top:6px;font-size:11px;width:80%;margin:0 auto;">
              <strong>DR. FRANCIS R. REYES, MD</strong><br>
              <span style="font-size:9.5px;color:#64748B;">Medical Officer &bull; PRC Lic. No. 0123456</span>
            </div>
          </div>
        </div>

        <div style="margin-top:30px;border-top:1px solid #E2E8F0;padding-top:10px;font-size:9px;color:#94A3B8;text-align:center;">
          K&amp;A Anti-Rabies Vaccine Clinic &bull; Official Confidential Patient Record &bull; ${new Date().getFullYear()}
        </div>
      </div>`;
  }

  function certificateBodyHtml(p) {
    const isCompleted = derivePatientStatus(p) === 'completed';
    const protocol = getProtocolLabel(p);
    const registered = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—');
    const issuedDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
      <div style="font-family:'Times New Roman',Times,Georgia,serif;color:#0F172A;font-size:12.5px;line-height:1.8;background:#FFFFFF;padding:28px 36px;border:2px solid #0F172A;position:relative;">
        ${letterhead()}
        
        <div style="text-align:center;margin:22px 0 20px;">
          <h2 style="font-family:'Times New Roman',Georgia,serif;font-size:18px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;text-decoration:underline;">
            MEDICAL CERTIFICATE
          </h2>
          <div style="font-size:10px;font-weight:700;color:#64748B;letter-spacing:0.5px;text-transform:uppercase;font-family:'Segoe UI',sans-serif;">
            OFFICIAL CLINICAL CERTIFICATION
          </div>
        </div>

        <div style="margin-bottom:18px;font-weight:700;font-size:12px;color:#0F172A;">
          TO WHOM IT MAY CONCERN:
        </div>

        <p style="text-align:justify;text-indent:36px;margin-bottom:16px;">
          THIS IS TO CERTIFY that <strong style="text-decoration:underline;text-transform:uppercase;">${formatTitleCase(p.name)}</strong>, 
          <strong>${p.age || '___'}</strong> years old, <strong>${(p.sex || '___').toUpperCase()}</strong>, 
          residing at <strong>${p.address || '___'}</strong>, has been officially examined, evaluated, and administered 
          medical treatment at <strong>K&amp;A Anti-Rabies Vaccine Clinic</strong> from 
          <strong>${registered}</strong> to <strong>${issuedDate}</strong>.
        </p>

        <p style="text-align:justify;text-indent:36px;margin-bottom:18px;">
          Clinical evaluation indicates treatment for <strong>${p.service === 'PEP' ? `Category ${p.cat || 'III'} Exposure (${p.animal || 'Animal'} Bite)` : (p.service || 'Vaccination')}</strong> 
          under the prescribed protocol: <strong style="text-decoration:underline;">${protocol}</strong>. 
          ${isCompleted ? 'The patient has successfully COMPLETED the full course of post-exposure prophylaxis with no adverse systemic reactions observed.' : 'The patient is currently adhering to the scheduled vaccination dosage protocol.'}
        </p>

        <!-- Formal Assessment Table -->
        <table style="width:100%;border-collapse:collapse;margin:20px 0 24px;font-size:11px;font-family:'Segoe UI',sans-serif;border:1px solid #CBD5E1;">
          <tr style="background:#F8FAFC;">
            <td style="padding:8px 12px;font-weight:700;color:#334155;border:1px solid #CBD5E1;width:30%;">Clinical Diagnosis</td>
            <td style="padding:8px 12px;font-weight:700;color:#0F172A;border:1px solid #CBD5E1;">${p.service === 'PEP' ? `Rabies Exposure (Category ${p.cat || 'III'}), ${p.animal || 'Animal'} Bite` : `${p.service || 'Vaccination'} Protocol`}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Vaccine Regimen</td>
            <td style="padding:8px 12px;color:#0F172A;border:1px solid #CBD5E1;">${p.vaccineBrand || 'Purified Chick Embryo Cell Vaccine (PCECV)'} (${protocol})</td>
          </tr>
          <tr style="background:#F8FAFC;">
            <td style="padding:8px 12px;font-weight:700;color:#334155;border:1px solid #CBD5E1;">Fitness Status</td>
            <td style="padding:8px 12px;font-weight:700;color:${isCompleted ? '#15803D' : '#D97706'};border:1px solid #CBD5E1;">${isCompleted ? 'CLEARED &amp; FIT TO RESUME REGULAR ACTIVITIES' : 'UNDER ONGOING TREATMENT &amp; OBSERVATION'}</td>
          </tr>
        </table>

        <p style="text-indent:36px;margin-bottom:32px;">
          This certification is issued upon the request of the above-named patient for whatever legal, medical, or administrative purpose it may serve.
        </p>

        <!-- Signatures Block -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;font-family:'Segoe UI',sans-serif;">
          <div style="text-align:center;">
            <div style="border-top:1.5px solid #0F172A;padding-top:6px;font-size:11px;width:80%;margin:0 auto;">
              <strong>MARIA F. JOHNSON, RN</strong><br>
              <span style="font-size:9.5px;color:#64748B;">Attending Clinic Nurse</span><br>
              <span style="font-size:9px;color:#94A3B8;">PRC Lic. No. 0654321</span>
            </div>
          </div>
          <div style="text-align:center;">
            <div style="border-top:1.5px solid #0F172A;padding-top:6px;font-size:11px;width:80%;margin:0 auto;">
              <strong>DR. FRANCIS R. REYES, MD</strong><br>
              <span style="font-size:9.5px;color:#64748B;">Attending Physician / Medical Officer</span><br>
              <span style="font-size:9px;color:#94A3B8;">PRC Lic. No. 0123456 &bull; PTR No. 9876543</span>
            </div>
          </div>
        </div>

        <div style="margin-top:24px;padding-top:10px;border-top:1px solid #E2E8F0;text-align:center;font-size:9px;color:#94A3B8;font-family:'Segoe UI',sans-serif;">
          K&amp;A Anti-Rabies Vaccine Clinic &bull; Official Medical Certificate &bull; Issued: ${issuedDate} &bull; Ref ID: ${p.id || p.mrn || '—'}
        </div>
      </div>`;
  }

  function buildDocumentHtml(p, type, audience = 'clinic') {
    const sections = [];
    if (type !== 'certificate') sections.push(`<div>${medicalRecordBodyHtml(p, audience)}</div>`);
    if (type !== 'record') sections.push(`<div style="${type === 'both' ? 'page-break-before:always;margin-top:20px;' : ''}">${certificateBodyHtml(p)}</div>`);
    const titleMap = { record: 'Medical Record', certificate: 'Medical Certificate', both: 'Medical Record & Certificate' };
    return `<!DOCTYPE html><html><head><title>${titleMap[type]} — ${formatTitleCase(p.name)}</title>
    <style>*{box-sizing:border-box;} body{margin:0;padding:0;background:#FFFFFF;} @media print{@page{margin:10mm 15mm;}}</style>
    </head><body>${sections.join('')}</body></html>`;
  }

  function drawMedicalRecordPdf(doc, p, audience = 'clinic') {
    const showWoundDetail = audience !== 'patient';
    const pageWidth = doc.internal.pageSize.getWidth();
    const doses = buildDoses(p);
    const registered = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('K&A Clinic', 14, 12);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text('ANTI-RABIES & ANIMAL BITE CENTER', 14, 17);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('Medical Record', 14, 32);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString('en-PH')}`, 14, 38);

    autoTable(doc, {
      startY: 44,
      body: [
        ['Patient ID', p.id || p.mrn || '—', 'Status', derivePatientStatus(p)],
        ['Name', formatTitleCase(p.name), 'Service', p.service || '—'],
        ['Age / Sex', `${p.age || '—'} yrs · ${p.sex || '—'}`, 'Vaccine Brand', p.vaccineBrand || '—'],
        ['Contact', p.contact || '—', 'Email', p.email || '—'],
        ['Address', p.address || '—', 'Registered', registered],
      ],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105] },
        2: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105] },
      },
    });

    const historyRows = p.service === 'PEP'
      ? [
          ['Biting Animal', p.animal || '—'],
          ['Exposure Category', `Category ${p.cat || '—'}`],
          ...(showWoundDetail
            ? [['Wound Location / Depth', `${p.woundLocation || '—'} (${p.woundDepth || '—'})`]]
            : []),
          ['No. of Bites', p.numberOfBites || '—'],
          ['Past Vaccines', p.pastVaccines || '—'],
          ['Allergies', p.allergies || '—'],
          ...(showWoundDetail ? [] : [['Wound Assessment', PATIENT_HIDDEN_NOTE]]),
        ]
      : [
          ['Past Vaccines', p.pastVaccines || '—'],
          ['Allergies', p.allergies || '—'],
        ];
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Clinical History & Details', '']],
      body: historyRows,
      theme: 'grid',
      headStyles: { fillColor: [185, 28, 28], textColor: 255, fontSize: 8 },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [255, 245, 245], textColor: [127, 29, 29], cellWidth: 60 } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Dose', 'Date', 'Status']],
      body: doses.length
        ? doses.map(d => [d.label, fmtDate(d.date), d.status === 'miss' ? 'Overdue' : d.status.charAt(0).toUpperCase() + d.status.slice(1)])
        : [['No dose schedule on file.', '', '']],
      headStyles: { fillColor: [200, 21, 26], textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
    });

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`K&A Clinic — Confidential Patient Report — ${new Date().getFullYear()}`, 14, doc.internal.pageSize.getHeight() - 10);
  }

  function drawCertificatePdf(doc, p) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const isCompleted = derivePatientStatus(p) === 'completed';
    const protocol = getProtocolLabel(p);
    const registered = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-PH') : (p.date || '—');
    const issuedDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const title = p.service === 'PEP'
      ? `CERTIFICATE OF ${isCompleted ? 'COMPLETED' : 'ONGOING'} ANTI-RABIES VACCINATION`
      : `CERTIFICATE OF ${isCompleted ? 'COMPLETED' : 'ONGOING'} ${(p.service || 'VACCINATION').toUpperCase()} TREATMENT`;

    doc.setDrawColor(200, 21, 26);
    doc.setLineWidth(0.8);
    doc.line(20, 30, pageWidth - 20, 30);

    doc.setTextColor(136, 136, 136);
    doc.setFontSize(8);
    doc.setFont('times', 'normal');
    doc.text('REPUBLIC OF THE PHILIPPINES', pageWidth / 2, 13, { align: 'center' });
    doc.setTextColor(200, 21, 26);
    doc.setFontSize(15);
    doc.setFont('times', 'bold');
    doc.text('K&A Anti-Rabies Vaccine Clinic', pageWidth / 2, 20, { align: 'center' });
    doc.setTextColor(136, 136, 136);
    doc.setFontSize(8);
    doc.setFont('times', 'normal');
    doc.text('Animal Bite Treatment Center', pageWidth / 2, 25, { align: 'center' });

    doc.setTextColor(17, 17, 17);
    doc.setFontSize(12);
    doc.setFont('times', 'bold');
    const titleLines = doc.splitTextToSize(title, pageWidth - 44);
    doc.text(titleLines, pageWidth / 2, 42, { align: 'center' });

    let y = 42 + titleLines.length * 6 + 10;
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    const bodyText = `This is to certify that ${formatTitleCase(p.name)}, ${p.age || '—'} years old, ${p.sex || '—'}, residing at ${p.address || '—'}, ${isCompleted ? 'has successfully completed' : 'is currently undergoing'} the prescribed ${protocol} at K&A Anti-Rabies Vaccine Clinic.`;
    const bodyLines = doc.splitTextToSize(bodyText, pageWidth - 40);
    doc.text(bodyLines, 20, y);
    y += bodyLines.length * 6.5 + 8;

    const rows = [['Patient ID', p.id || p.mrn || '—']];
    if (p.service === 'PEP') {
      rows.push(['Exposure Type', `${p.animal || 'Dog'} Bite`]);
      rows.push(['Wound Category', `Category ${p.cat || '—'}`]);
    }
    rows.push(['Date Registered', registered], ['Date Issued', issuedDate], ['Attending Nurse', 'Maria F. Johnson, RN'], ['Physician / Med. Officer', '___________']);

    autoTable(doc, {
      startY: y,
      body: rows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, font: 'times' },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [250, 250, 250], cellWidth: 60 } },
    });

    y = doc.lastAutoTable.finalY + 14;
    doc.setFontSize(9);
    doc.setFont('times', 'normal');
    doc.setTextColor(85, 85, 85);
    doc.text('This certificate is issued for official purposes.', 20, y);

    y += 24;
    const colWidth = (pageWidth - 40 - 20) / 2;
    doc.setDrawColor(51, 51, 51);
    doc.line(20, y, 20 + colWidth, y);
    doc.line(pageWidth - 20 - colWidth, y, pageWidth - 20, y);
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    doc.setFont('times', 'bold');
    doc.text('Maria F. Johnson, RN', 20 + colWidth / 2, y + 6, { align: 'center' });
doc.text('___________', pageWidth - 20 - colWidth / 2, y + 6, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 102, 102);
    doc.text('Attending Nurse · RN', 20 + colWidth / 2, y + 11, { align: 'center' });
    doc.text('Physician / Medical Officer', pageWidth - 20 - colWidth / 2, y + 11, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(153, 153, 153);
    doc.text(`K&A Anti-Rabies Vaccine Clinic · Issued: ${issuedDate} · Patient ID: ${p.id || p.mrn || '—'}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 12, { align: 'center' });
  }

  function buildDocumentPdf(p, type, audience = 'clinic') {
    const doc = new jsPDF();
    let started = false;
    if (type !== 'certificate') { drawMedicalRecordPdf(doc, p, audience); started = true; }
    if (type !== 'record') {
      if (started) doc.addPage();
      drawCertificatePdf(doc, p);
    }
    return doc;
  }

  function docTypeLabel(type) {
    return type === 'record' ? 'Medical Record' : type === 'certificate' ? 'Medical Certificate' : 'Medical Record & Certificate';
  }

  function exportSinglePatientPdf(p) {
    buildDocumentPdf(p, docType, 'clinic').save(`${docType}-${p.id || p.firestoreId}-${new Date().toISOString().slice(0, 10)}.pdf`);
    onToast(`${docTypeLabel(docType)} exported for ${formatTitleCase(p.name)}`, 'success');
  }

  function printSinglePatientReport(p) {
    const w = window.open('', '_blank');
    w.document.write(buildDocumentHtml(p, docType, 'clinic'));
    w.document.close();
    w.print();
    onToast(`${docTypeLabel(docType)} opened for printing — ${formatTitleCase(p.name)}`, 'success');
  }

  async function emailSinglePatientPdf(p, to) {
    const base64 = buildDocumentPdf(p, docType, 'patient').output('base64');
    const label = docTypeLabel(docType);
    await sendReportEmail(
      to,
      `K&A Clinic — Your ${label}`,
      `<p>Dear ${formatTitleCase(p.name)},</p><p>Please find your ${label.toLowerCase()} from K&amp;A Clinic attached as a PDF.</p><p>&mdash; K&amp;A Anti-Rabies Clinic</p>`,
      { base64, filename: `${docType}-${p.id || p.firestoreId}.pdf` }
    );
  }

  function handleDocTypeChange(val) {
    if (val === 'record') { setIncludeRecord(true); setIncludeCertificate(false); }
    else if (val === 'certificate') { setIncludeRecord(false); setIncludeCertificate(true); }
    else if (val === 'both') { setIncludeRecord(true); setIncludeCertificate(true); }
  }

  const [zoomLevel, setZoomLevel] = useState(0.85);
  const [rotation, setRotation] = useState(0);

  const preview = getFilteredPatients();

  function switchMode(next) {
    setMode(next);
    setShowEmailInput(false);
    setEmailTo('');
  }

  // The clinic report exported as Excel is set up landscape, so the preview
  // sheet turns with it.
  const isLandscapeSheet = mode === 'bulk' && exportFormat === 'xls';

  const previewPane = (html) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <iframe
        title="Report preview"
        sandbox=""
        srcDoc={html}
        style={{ display: 'block', width: '100%', height: '100%', border: 'none', background: '#FFFFFF' }}
      />
    </div>
  );

  return (
    <div
      className="modal-overlay"
      style={{ alignItems: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }}
    >
      <div
        className="modal bg-white rounded-3xl shadow-2xl border border-slate-200"
        style={{ width: '1360px', maxWidth: '98vw', height: '92vh', maxHeight: '960px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >

        {/* Card head — Add Report's shape, carrying a light brand wash so the
            all-white card has somewhere for the eye to land. */}
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
                {initialPatient ? `Export Patient Record — ${formatTitleCase(initialPatient.name)}` : 'Export Clinic Report'}
              </h3>
              <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                {initialPatient ? `Official medical record & certificate for ${formatTitleCase(initialPatient.name)}` : 'Download, print, or email official clinic registry reports'}
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

        {/* Modal 2-Column Split Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT PANEL: Settings Controls */}
          <div style={{
            width: '330px', flexShrink: 0, background: '#F7F8FD',
            borderRight: '1px solid #E3E7F5', padding: '20px 20px',
            display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto'
          }}>
            {mode === 'bulk' ? (
              <>
                {/* Report Period Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    REPORT PERIOD:
                  </label>
                  <select
                    value={period}
                    onChange={e => setPeriod(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: '.8125rem', fontWeight: 600, color: '#0F172A',
                      border: '1px solid #CBD5E1', borderRadius: 12, background: '#FFFFFF', outline: 'none', cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                    }}
                  >
                    <option value="daily">Daily (Today)</option>
                    <option value="weekly">Weekly (Last 7 Days)</option>
                    <option value="monthly">Monthly (This Month)</option>
                    <option value="yearly">Yearly (This Year)</option>
                  </select>
                </div>

                {/* Export Format Selector */}
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
              </>
            ) : (
              <>
                {/* Active Patient Info Card (Fixed to current patient) */}
                <div>
                  <label style={{ display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    TARGET PATIENT RECORD:
                  </label>
                  <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: '.8125rem', fontWeight: 800, color: '#0F172A' }}>
                      {formatTitleCase(selectedPatient?.name || '—')}
                    </div>
                    <div style={{ fontSize: '.71875rem', color: '#64748B', marginTop: 2 }}>
                      MRN: <strong style={{ color: '#3B50DF' }}>{selectedPatient?.id || selectedPatient?.mrn || '—'}</strong> · {selectedPatient?.age ? `${selectedPatient.age} yrs` : ''} · {selectedPatient?.sex || '—'}
                    </div>
                  </div>
                </div>

                {/* Document Type Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '.71875rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    DOCUMENT TYPE:
                  </label>
                  <select
                    value={docType}
                    onChange={e => handleDocTypeChange(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: '.8125rem', fontWeight: 600, color: '#0F172A',
                      border: '1px solid #CBD5E1', borderRadius: 12, background: '#FFFFFF', outline: 'none', cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                    }}
                  >
                    <option value="record">Medical Record</option>
                    <option value="certificate">Medical Certificate</option>
                    <option value="both">Medical Record &amp; Certificate</option>
                  </select>
                </div>
              </>
            )}

            {/* Action Buttons Section (Uniform Dark Navy & Clean Outline Buttons) */}
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
                    Export {exportFormat === 'xls' ? 'Excel (XLS)' : 'PDF'}
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
                    Print Patient Record
                  </button>
                </>
              )}

              {/* Uniform Email Report Button */}
              <button
                type="button"
                onClick={() => {
                  setShowEmailInput(v => !v);
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
                <span>✉️ Email Report</span>
              </button>

              {/* Inline Email Input Panel */}
              {showEmailInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, marginTop: 2 }}>
                  <input
                    type="email"
                    placeholder="Enter recipient email..."
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '.8125rem', border: '1px solid #CBD5E1', borderRadius: 6, outline: 'none', background: '#fff' }}
                  />
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      mode === 'bulk'
                        ? sendReportEmail(emailTo, `K&A Clinic — ${period.charAt(0).toUpperCase() + period.slice(1)} Report (${periodLabel()})`, buildBulkReportHtml(preview))
                        : emailSinglePatientPdf(selectedPatient, emailTo)
                    }
                    style={{ width: '100%', height: 38, background: '#3B50DF', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer' }}
                  >
                    {sending ? 'Sending…' : 'Send via Email'}
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT PANEL: Live Paper Document Preview Workspace (Matches PDF Viewer Reference) */}
          <div style={{ flex: 1, background: '#EDF0FA', padding: '16px 24px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Top Centered Viewer Toolbar — light, to match the card */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#FFFFFF', padding: '6px 16px', borderRadius: 12,
              border: '1px solid #E2E8F0',
              color: '#334155', fontSize: '.8125rem', fontWeight: 600,
              boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 16, flexShrink: 0,
              position: 'sticky', top: 0, zIndex: 10
            }}>
              {/* Page indicator */}
              <span style={{ fontSize: '.78125rem', color: '#64748B' }}>1 / 1</span>

              <div style={{ width: 1, height: 16, background: '#E2E8F0', margin: '0 4px' }} />

              {/* Zoom controls */}
              <button type="button" onClick={() => setZoomLevel(z => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom Out">-</button>

              <span style={{ minWidth: 46, textAlign: 'center', fontWeight: 700, color: '#0F172A', background: '#F1F5F9', padding: '2px 8px', borderRadius: 6, fontSize: '.78125rem' }}>
                {Math.round(zoomLevel * 100)}%
              </span>

              <button type="button" onClick={() => setZoomLevel(z => Math.min(1.6, Math.round((z + 0.1) * 100) / 100))} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', padding: '0 6px' }} title="Zoom In">+</button>

              <div style={{ width: 1, height: 16, background: '#E2E8F0', margin: '0 4px' }} />

              {/* Fit to Page */}
              <button type="button" onClick={() => setZoomLevel(0.85)} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '.9rem', cursor: 'pointer', padding: '0 4px' }} title="Fit to Page">↕</button>

              {/* Rotate Page */}
              <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} style={{ background: 'transparent', border: 'none', color: '#334155', fontSize: '1rem', cursor: 'pointer', padding: '0 4px' }} title="Rotate Page">↻</button>
            </div>

            {/* Paper Sheet Preview Container (Scales as a whole paper sheet!)
                The sheet turns landscape for the Excel export, matching the
                page setup the .xls actually carries. */}
            <div style={{
              width: isLandscapeSheet ? '1060px' : '820px',
              height: isLandscapeSheet ? '760px' : '1060px',
              background: '#FFFFFF', borderRadius: 6,
              border: '1px solid #D8DEF0',
              boxShadow: '0 6px 24px rgba(15,23,42,0.14)',
              overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0,
              transform: `scale(${zoomLevel}) ${rotation ? `rotate(${rotation}deg)` : ''}`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
              marginBottom: zoomLevel < 1
                ? `-${(1 - zoomLevel) * (isLandscapeSheet ? 760 : 1060)}px`
                : `${(zoomLevel - 1) * 200}px`
            }}>
              {mode === 'bulk' ? (
                previewPane(exportFormat === 'xls' ? buildExcelPreviewHtml(preview, periodLabel()) : buildBulkReportHtml(preview))
              ) : selectedPatient ? (
                previewPane(buildDocumentHtml(selectedPatient, docType, showEmailInput ? 'patient' : 'clinic'))
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
      // Partial delivery is normal (no email on file, or no app installed) —
      // report what actually went out rather than a blanket success.
      const parts = [];
      if (result.pushSent > 0) parts.push('app');
      if (result.emailed) parts.push('email');
      onToast(
        parts.length
          ? `Follow-up sent via ${parts.join(' and ')} to ${formatTitleCase(patient.name)}`
          : `Notification saved, but no delivery channel was available for ${formatTitleCase(patient.name)}`,
        parts.length ? 'success' : 'error',
      );
      onClose();
    } catch (err) {
      console.error('Follow-up send error:', err);
      onToast('Failed to send follow-up.', 'error');
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }} onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal" style={{ width: '560px', padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>Send Follow-up</h3>
            <p style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.65)', margin: '3px 0 0' }}>
              Notifies {formatTitleCase(patient.name)} in the app and by email
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>✕</button>
        </div>

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

          <div className="modal-footer">
            <button className="btn btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
            <button className="btn btn-primary" onClick={send} disabled={sending}>
              {sending ? 'Sending…' : 'Send Follow-up'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
      const locationStr = `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon`;
      const exposureTypeVal = patientToPin.service === 'PEP' ? `${patientToPin.animal || 'Dog'} Bite` : (patientToPin.service || 'Dog Bite');
      const categoryVal = patientToPin.cat ? `Category ${patientToPin.cat}` : 'Category III';
      const exposureDateVal = patientToPin.date || new Date().toISOString().split('T')[0];

      const { lat, lng } = geocodeLibonAddress(barangayVal, zoneVal);

      // ABSOLUTE ANONYMIZATION — OMIT ALL PATIENT PERSONAL IDENTIFIERS
      await addDoc(collection(db, 'incidents'), {
        location: locationStr,
        barangay: barangayVal,
        zone: zoneVal,
        type: exposureTypeVal,
        category: categoryVal,
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
    const q = query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc'), limit(20));
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

  function generateDefaultDoses(service, baseDate) {
    const d0 = baseDate || today();
    const addDays = (dStr, days) => {
      const d = new Date(dStr || Date.now());
      if (isNaN(d.getTime())) return dStr;
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    if (service === 'PEP') {
      return [
        { dose: 'Dose 1 (Day 0)', date: d0, status: 'Done', statusText: 'Completed' },
        { dose: 'Dose 2 (Day 3)', date: addDays(d0, 3), status: 'Pending', statusText: 'Scheduled' },
        { dose: 'Dose 3 (Day 7)', date: addDays(d0, 7), status: 'Pending', statusText: 'Scheduled' },
        { dose: 'Dose 4 (Day 14)', date: addDays(d0, 14), status: 'Pending', statusText: 'Scheduled' },
        { dose: 'Dose 5 (Day 28)', date: addDays(d0, 28), status: 'Pending', statusText: 'Scheduled' },
      ];
    }
    if (service === 'PrEP') {
      return [
        { dose: 'Dose 1 (Day 0)', date: d0, status: 'Done', statusText: 'Completed' },
        { dose: 'Dose 2 (Day 7)', date: addDays(d0, 7), status: 'Pending', statusText: 'Scheduled' },
        { dose: 'Dose 3 (Day 21)', date: addDays(d0, 21), status: 'Pending', statusText: 'Scheduled' },
      ];
    }
    if (service === 'Tetanus') {
      return [
        { dose: 'Primary Dose', date: d0, status: 'Done', statusText: 'Completed' },
        { dose: 'Follow-up Booster (1 Month)', date: addDays(d0, 30), status: 'Pending', statusText: 'Scheduled' },
      ];
    }
    if (service === 'Hepatitis') {
      return [
        { dose: 'Dose 1 (Day 0)', date: d0, status: 'Done', statusText: 'Completed' },
        { dose: 'Dose 2 (1 Month)', date: addDays(d0, 30), status: 'Pending', statusText: 'Scheduled' },
        { dose: 'Dose 3 (6 Months)', date: addDays(d0, 180), status: 'Pending', statusText: 'Scheduled' },
      ];
    }
    return [
      { dose: 'Initial Dose', date: d0, status: 'Done', statusText: 'Completed' }
    ];
  }

  async function handleAddPatient(form, setSaving) {
    if (!form.fname.trim() || !form.lname.trim()) { showToast('Please fill in first and last name', 'error'); return; }
    if (!form.email.trim()) { showToast('Email is required so the patient can log in to the app', 'error'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) { showToast('Please enter a valid email address', 'error'); return; }
    if (!form.age) { showToast('Age is required', 'error'); return; }
    if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number', 'error'); return; }

    if (typeof setSaving === 'function') setSaving(true);

    try {
      const caseNo = await getAndIncrementNextMRN();
      const normalEmail = form.email.toLowerCase().trim();
      const cleanFname = formatTitleCase(form.fname.trim());
      const cleanLname = formatTitleCase(form.lname.trim());
      const cleanMname = form.mname && form.mname.trim() ? formatTitleCase(form.mname.trim()) : '';
      const cleanSuffix = form.suffix ? form.suffix.trim() : '';
      const fullName = [cleanFname, cleanMname, cleanLname].filter(Boolean).join(' ') + (cleanSuffix ? `, ${cleanSuffix}` : '');
      const formattedContact = formatE164(form.contact || '');
      const selectedBarangay = form.barangay || 'San Juan';
      const enteredZone = form.zone || 'Zone 1';
      const baseDate = form.date || today();
      const defaultDoseArray = generateDefaultDoses(form.service || 'PEP', baseDate);

      const vaxDoc = {
        id: caseNo,
        mrn: caseNo,
        name: fullName,
        email: normalEmail,
        contact: formattedContact,
        age: form.age || '',
        sex: form.sex || 'Male',
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
        riskCondition: form.riskCondition || '',
        priorPneumo: form.priorPneumo || '',
        status: 'ongoing',
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

  function handleEditSave(form) {
    if (!form.name || !form.name.trim()) { showToast('Please fill in the patient name', 'error'); return; }
    if (!form.age || Number(form.age) <= 0) { showToast('A valid age is required', 'error'); return; }
    if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number', 'error'); return; }
    const newName = formatTitleCase(form.name.trim());
    const targetId = editPatient.firestoreId;
    const updatedData = {
      name: newName, age: form.age || editPatient.age, sex: form.sex || 'Male',
      email: (form.email || editPatient.email || '').toLowerCase().trim(),
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
    updateDoc(doc(db, 'vaccinations', targetId), updatedData).catch(err => {
      console.error('Edit patient error:', err);
      showToast('Failed to update patient.', 'error');
    });
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
      showToast(`${getName(patient)} archived in DOH Retention Caseload (Retained until ${expYear}) ✓`, 'success');
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
    { key: 'all', label: 'All' },
    { key: 'ongoing', label: 'Ongoing' },
    { key: 'completed', label: 'Completed' },
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
      const liveStatus = derivePatientStatus(p);
      return filter === 'all' || liveStatus === filter;
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

        {/* ── Caseload Segmented Tabs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => { setCaseloadTab('active'); setCurrentPage(1); }}
            style={{
              padding: '8px 16px',
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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B50DF', display: 'inline-block' }} />
            Active Caseload
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
          </button>

          <button
            type="button"
            onClick={() => { setCaseloadTab('completed'); setCurrentPage(1); }}
            style={{
              padding: '8px 16px',
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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
            Completed & Retention Caseload (DOH 10-Yr)
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
          </button>

          <button
            type="button"
            onClick={() => { setCaseloadTab('all'); setCurrentPage(1); }}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              border: caseloadTab === 'all' ? '1.5px solid #64748B' : '1px solid #E2E8F0',
              background: caseloadTab === 'all' ? '#F8FAFC' : '#FFFFFF',
              color: caseloadTab === 'all' ? '#0F172A' : '#475569',
              fontWeight: caseloadTab === 'all' ? 800 : 600,
              fontSize: '.8125rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: caseloadTab === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all .15s ease'
            }}
          >
            All Registered Patients
            <span style={{
              fontSize: '.6875rem',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 999,
              background: caseloadTab === 'all' ? '#0F172A' : '#F1F5F9',
              color: caseloadTab === 'all' ? '#FFFFFF' : '#64748B'
            }}>
              {totalCount}
            </span>
          </button>
        </div>

        {/* ── DOH Retention Policy Notice for Completed Records ── */}
        {caseloadTab === 'completed' && (
          <div style={{
            background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)',
            border: '1px solid #A7F3D0',
            borderRadius: 14,
            padding: '12px 16px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: '#D1FAE5',
                color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, border: '1px solid #A7F3D0'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '.78125rem', color: '#065F46', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                    DOH Statutory Medical Record Retention Compliance
                  </strong>
                  <span style={{ fontSize: '.6875rem', fontWeight: 800, background: '#D1FAE5', color: '#047857', padding: '1px 7px', borderRadius: 999, border: '1px solid #6EE7B7' }}>
                    10-Year Statutory Period
                  </span>
                </div>
                <p style={{ fontSize: '.71875rem', color: '#065F46', marginTop: 2, lineHeight: 1.4 }}>
                  Pursuant to Philippine DOH clinical record retention standards (DOH AO 2012-0012), completed patient post-exposure prophylaxis (PEP) encounter records remain preserved intact in the clinic database for a minimum statutory retention window of 10 years before cold-storage archiving.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Clean Table Card Container ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

          {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA' }}>
            
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '.78125rem', fontWeight: 600, border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                  Filter
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {filterMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 30 }}>
                    {FILTER_OPTIONS.map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setFilter(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#334155', fontSize: '.78125rem', fontWeight: filter === opt.key ? 700 : 500, cursor: 'pointer' }}
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
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 190, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 30 }}>
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

              {/* Export Clinic Report Button — Clean White Background */}
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

              {/* Add Patient Button — Royal Blue (#3B50DF) */}
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
            </div>

          </div>

          {/* ── Table Area ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <th style={{ padding: '16px 12px 16px 20px', width: '10%', fontWeight: 600, color: '#64748B' }}>Patient ID</th>
                  <th style={{ padding: '16px 12px', width: '22%', fontWeight: 600, color: '#64748B' }}>Name</th>
                  <th style={{ padding: '16px 12px', width: '14%', fontWeight: 600, color: '#64748B' }}>Email</th>
                  <th style={{ padding: '16px 12px', width: '11%', fontWeight: 600, color: '#64748B' }}>Mobile</th>
                  <th style={{ padding: '16px 12px', width: '8%', fontWeight: 600, color: '#64748B' }}>Service</th>
                  <th style={{ padding: '16px 12px', width: '8%', fontWeight: 600, color: '#64748B' }}>Status</th>
                  {caseloadTab === 'completed' && (
                    <th style={{ padding: '16px 12px', width: '12%', fontWeight: 600, color: '#047857' }}>DOH Retention (10-Yr)</th>
                  )}
                  <th style={{ padding: '16px 12px', width: '10%', fontWeight: 600, color: '#64748B' }}>Submitted On</th>
                  <th style={{ padding: '16px 20px 16px 12px', width: '150px', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={caseloadTab === 'completed' ? 9 : 8} style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>Loading patient records…</td></tr>
                ) : paginatedPatients.length === 0 ? (
                  <tr><td colSpan={caseloadTab === 'completed' ? 9 : 8} style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>No patient records found in this caseload view</td></tr>
                ) : (
                  paginatedPatients.map(p => {
                    const rowId = p.firestoreId || p.id;
                    const isSelectedRow = selectedRows.has(rowId);
                    const liveStatus = derivePatientStatus(p);
                    // Table-only refinement of "ongoing" — doesn't touch derivePatientStatus
                    // itself (that would also change what the Filter dropdown and the
                    // detail-view badge treat as "ongoing"), just reuses vaccination.jsx's
                    // real dose-schedule logic to flag rows that need attention.
                    const isOverdue = liveStatus !== 'completed' && buildDoses(p).some(d => d.status === 'miss');
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
                        <td style={{ padding: '16px 12px', color: '#334155', fontWeight: 400, fontSize: '.8125rem' }}>
                          {p.email || '—'}
                        </td>
                        <td style={{ padding: '16px 12px', color: '#334155', fontWeight: 400, fontSize: '.8125rem' }}>
                          {p.contact || '—'}
                        </td>
                        <td style={{ padding: '16px 12px' }}>
                          <ServiceBadge service={p.service} />
                        </td>
                        <td style={{ padding: '16px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600,
                            background: liveStatus === 'completed' ? '#ECFDF5' : isOverdue ? '#FEF2F2' : '#EFF6FF',
                            color: liveStatus === 'completed' ? '#059669' : isOverdue ? '#DC2626' : '#1D4ED8',
                            border: liveStatus === 'completed' ? '1px solid #A7F3D0' : isOverdue ? '1px solid #FCA5A5' : '1px solid #BFDBFE'
                          }}>
                            {liveStatus === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing'}
                          </span>
                        </td>
                        {caseloadTab === 'completed' && (
                          <td style={{ padding: '16px 12px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: '6px', fontSize: '.6875rem', fontWeight: 700,
                              background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0'
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              Retained ({getDOHRetentionYear(p)})
                            </span>
                          </td>
                        )}
                        <td style={{ padding: '16px 12px', color: '#64748B', fontWeight: 400, fontSize: '.8125rem' }}>
                          {fmtDate(p.date)}
                        </td>
                        <td style={{ padding: '16px 20px 16px 12px', width: '150px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                            {liveStatus === 'completed' && !p.isArchived && (
                              <button
                                type="button"
                                className="icon-btn"
                                title="Archive into DOH Retention Caseload"
                                onClick={() => handleArchivePatient(p)}
                                style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#047857', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
                              </button>
                            )}
                            <button
                              type="button"
                              className="icon-btn"
                              title="Pin Incident Map"
                              onClick={() => setPinTarget(p)}
                              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                            </button>
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
          <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
            <div style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 600 }}>
              Showing {totalItems === 0 ? 0 : (safePage - 1) * itemsPerPage + 1}–{Math.min(safePage * itemsPerPage, totalItems)} of {totalItems} patients
              {selectedRows.size > 0 && <span style={{ marginLeft: 10, color: '#7C3AED', fontWeight: 800 }}>({selectedRows.size} selected)</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                style={{ opacity: safePage <= 1 ? 0.4 : 1, padding: '5px 12px', fontSize: '.75rem', fontWeight: 600 }}
              >
                ← Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setCurrentPage(pg)}
                  style={{
                    width: 28, height: 28, borderRadius: '.375rem', border: '1px solid #CBD5E1',
                    background: safePage === pg ? '#3B50DF' : '#FFFFFF',
                    color: safePage === pg ? '#FFFFFF' : '#334155',
                    fontSize: '.75rem', fontWeight: safePage === pg ? 800 : 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {pg}
                </button>
              ))}

              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                style={{ opacity: safePage >= totalPages ? 0.4 : 1, padding: '5px 12px', fontSize: '.75rem', fontWeight: 600 }}
              >
                Next →
              </button>
            </div>
          </div>

        </div>
      </div>

      {showModal && <AddPatientModal onClose={handleCloseAddModal} onAdd={handleAddPatient} inventoryItems={inventoryItems} />}
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
