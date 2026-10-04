// Pieces the Patients feature files share: page CSS, the live status rule,
// service types and badge, the close icon, and the lazily loaded export dialog.
import { Dog, ShieldCheck, Syringe, Wind } from 'lucide-react';
import { lazyModal } from '../../components/LazyModal';


/* ─────────────────────────── CSS ─────────────────────────── */
export const globalCSS = `
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
  .service-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
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
  .tab-btn{padding:5px 13px;border-radius:var(--r-sm);border:1px solid #E5E7EB;background:#F9FAFB;font-size:.78125rem;font-weight:600;font-family:inherit;color:#4B5563;cursor:pointer;transition:all .13s;}
  .tab-btn:hover{background:#F3F4F6;color:#111827;}
  .tab-btn.on{background:#6366F1;color:#fff;border-color:#6366F1;}

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
  .modal{background:var(--white);border-radius:1.25rem;padding:28px;width:32.5rem;max-width:min(32.5rem, calc(100% - 32px));max-height:calc(100vh - 130px);overflow-y:auto;box-shadow:0 20px 60px rgba(26,34,64,.18);transition:all 0.4s cubic-bezier(0.22,1,0.36,1);}
  .modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;}
  .modal-head h2{font-size:1.0625rem;font-weight:900;}
  .modal-close{width:2rem;height:2rem;border-radius:50%;border:1px solid #E2E8F0;background:#FFFFFF;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748B;transition:all .15s ease;box-shadow:0 1px 2px rgba(0,0,0,0.04);}
  .modal-close:hover{background:#FEE2E2;color:#DC2626;border-color:#FECACA;}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .form-field{display:flex;flex-direction:column;gap:6px;}
  .form-field.full{grid-column:span 2;}
  .form-field label{font-size:.75rem;font-weight:700;color:var(--muted);}
  .form-field input,.form-field select,.form-field .kna-select,.form-field textarea{font-family:inherit;font-size:.8125rem;font-weight:500;padding:9px 12px;border:1.5px solid var(--border);border-radius:.625rem;background:var(--bg);color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s;}
  .form-field input:focus,.form-field select:focus,.form-field .kna-select:focus,.form-field textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(200,21,26,.10);background:#fff;}
  .form-field textarea{resize:vertical;min-height:70px;}

  /* Add Patient wizard — same field language as Edit Patient Record: grey
     semibold labels, white inputs with a 1px slate border and rounded-xl
     corners, and each step's fields grouped in one light card. Service
     choices use the single accent instead of a colour per service. */
  .apw .form-field label{font-size:.75rem;font-weight:600;color:#64748B;}
  .apw .form-field input,.apw .form-field select,.apw .form-field .kna-select,.apw .form-field textarea{padding:8px 12px;border:1px solid #CBD5E1;border-radius:.75rem;background:#FFFFFF;color:#1E293B;font-weight:500;}
  .apw .form-field input:focus,.apw .form-field select:focus,.apw .form-field .kna-select:focus,.apw .form-field textarea:focus{border-color:#3B50DF;box-shadow:0 0 0 3px rgba(59,80,223,.12);}
  .apw .form-field input[readonly]{background:#F1F5F9;}
  .apw .apw-section{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:16px;}
  /* Steps keep a sensible width on large screens (no overly wide fields). */
  .apw .apw-step{max-width:64rem;margin:0 auto;}
  .apw .apw-step.apw-step-wide{max-width:none;}
  /* Labelled groups: small heading on the left, a 4-column field grid on
     the right, a hairline between groups. Stacked on narrow screens. */
  .apw .apw-groups{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;}
  .apw .apw-pad{padding:16px 20px;}
  .apw .apw-group{display:grid;grid-template-columns:168px minmax(0,1fr);gap:10px 24px;padding:12px 20px;}
  .apw .apw-group + .apw-group{border-top:1px solid #E2E8F0;}
  .apw .apw-group-stacked{grid-template-columns:minmax(0,1fr);}
  .apw .apw-group-head h4{font-size:.8125rem;font-weight:600;color:#0F172A;margin:6px 0 0;}
  .apw .apw-group-head p{font-size:.6875rem;color:#64748B;margin-top:2px;line-height:1.4;}
  .apw .apw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 16px;align-items:start;}
  .apw .apw-grid-2{grid-template-columns:repeat(2,minmax(0,1fr));}
  .apw .apw-grid .span-2{grid-column:span 2;}
  .apw .apw-grid .span-3{grid-column:span 3;}
  .apw .apw-grid .span-all{grid-column:1 / -1;}
  .apw .apw-req{color:#C8151A;margin-left:1px;}
  .apw .apw-opt{font-weight:400;color:#94A3B8;font-size:.6875rem;margin-left:2px;}
  .apw .apw-help{font-size:11px;line-height:16px;color:#94A3B8;}
  .apw .form-field .kna-field-error{margin-top:-2px;}
  .apw .form-field .apw-help{margin-top:-2px;}
  .apw .apw-note{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;line-height:1.45;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:.625rem;padding:8px 12px;}
  .apw .apw-note svg{flex-shrink:0;margin-top:1px;}
  .apw .apw-history{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start;}
  .apw .apw-summary{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:1rem;padding:14px 16px;}
  .apw .apw-summary h4{font-size:.8125rem;font-weight:600;color:#0F172A;margin:0;}
  .apw .apw-summary > p{font-size:.6875rem;color:#64748B;margin:2px 0 10px;}
  .apw .apw-summary dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;font-size:12px;margin:0;}
  .apw .apw-summary dt{color:#64748B;}
  .apw .apw-summary dd{margin:0;color:#0F172A;font-weight:500;text-align:right;overflow-wrap:anywhere;}
  .apw .apw-link{margin-top:12px;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#3B50DF;background:none;border:none;cursor:pointer;padding:0;}
  .apw .apw-link:hover{text-decoration:underline;}
  .apw .apw-schedule{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start;}
  .apw .apw-review{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;}
  @media (max-width: 900px){
    .apw .apw-group{grid-template-columns:minmax(0,1fr);}
    .apw .apw-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
    .apw .apw-grid .span-3{grid-column:1 / -1;}
    .apw .apw-history,.apw .apw-schedule,.apw .apw-review{grid-template-columns:minmax(0,1fr);}
  }
  .apw .service-select-btn{border:1px solid #E2E8F0;background:#FFFFFF;}
  .apw .service-select-btn:hover{border-color:#94A3B8;background:#F8FAFC;}
  .apw .service-select-btn[class*=" sel-"]{border-color:#3B50DF;background:#EEF2FF;box-shadow:0 0 0 1px #3B50DF inset;}
  .apw .service-select-btn .ss-label{font-weight:600;}
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
  .dose-schedule-row input[type=date],.dose-schedule-row select,.dose-schedule-row .kna-select{font-family:inherit;font-size:.78125rem;font-weight:500;padding:7px 10px;border:1.5px solid var(--border);border-radius:.5625rem;background:var(--white);color:var(--text);outline:none;width:100%;transition:border-color .15s;}
  .dose-schedule-row input[type=date]:focus,.dose-schedule-row select:focus,.dose-schedule-row .kna-select:focus{border-color:var(--blue);}

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

export const derivePatientStatus = (patient) => {
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

/* ─────────────────────────── SERVICE CONFIG ─────────────────────────── */
// icon: Lucide component; tint: the icon circle; when / schedule: shown on
// the Register wizard's service cards.
export const SERVICE_TYPES = [
  {
    key: 'PEP', label: 'PEP', desc: 'Post-Exposure Prophylaxis', sub: 'After animal bite',
    icon: Dog, tint: 'bg-rose-50 text-rose-600',
    when: 'After a bite, scratch or saliva exposure from an animal.',
    schedule: '4 sessions · Day 0, 3, 7, 28',
    pillClass: 'service-pep', selClass: 'sel-pep'
  },
  {
    key: 'PrEP', label: 'PrEP', desc: 'Pre-Exposure Prophylaxis', sub: 'Before exposure',
    icon: ShieldCheck, tint: 'bg-indigo-50 text-[#3B50DF]',
    when: 'Before any exposure, for people at high risk (vets, animal handlers).',
    schedule: '2 doses · Day 0, 7',
    pillClass: 'service-prep', selClass: 'sel-prep'
  },
  {
    key: 'Tetanus', label: 'Anti-Tetanus', desc: 'Tetanus Toxoid (TT)', sub: 'Wound / injury',
    icon: Syringe, tint: 'bg-amber-50 text-amber-600',
    when: 'For wounds and injuries, or to complete a tetanus series.',
    schedule: '3 doses · 0, 1 mo, 6 mo',
    pillClass: 'service-tetanus', selClass: 'sel-tetanus'
  },
  {
    key: 'Pneumonia', label: 'Pneumonia', desc: 'Pneumococcal Vaccine', sub: 'PCV / PPSV23',
    icon: Wind, tint: 'bg-sky-50 text-sky-600',
    when: 'Pneumococcal protection for older and high-risk adults.',
    schedule: 'Single dose · adults',
    pillClass: 'service-pneumonia', selClass: 'sel-pneumonia'
  },
];

/* ─────────────────────────── SERVICE BADGE ─────────────────────────── */
export function ServiceBadge({ service }) {
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

/* ─────────────────────────── CLOSE ICON ───────────────────────────
   The Patients modals all render <X/>; these files use inline SVGs rather than
   an icon package, so the close glyph is defined here. */

export function X({ size = 16, strokeWidth = 2.2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18" /><path d="M6 6l12 12" />
    </svg>
  );
}

// The export dialog carries the PDF and Excel libraries and the embedded logo,
// so its code is downloaded the first time someone opens it.
export const ExportReportModal = lazyModal(() => import('./ExportReportModal'), 'ExportReportModal');
