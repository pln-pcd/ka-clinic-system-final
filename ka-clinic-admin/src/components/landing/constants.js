export const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  :root {
    --red: #E31837; 
    --red-dark: #C41228; 
    --red-mid: #D3122A;
    --red-dim: rgba(227, 24, 55, 0.08); 
    --red-glow: rgba(227, 24, 55, 0.20);
    --green2: #10B981; 
    --green2-dim: rgba(16, 185, 129, 0.10); 
    --green2-glow: rgba(16, 185, 129, 0.18);
    --bg-light: #FFFFFF; 
    --bg-alt: #F8FAFC; 
    --card: #FFFFFF; 
    --card2: #F8FAFC; 
    --card3: #F1F5F9;
    --border: #E2E8F0; 
    --border2: #CBD5E1; 
    --border3: rgba(227, 24, 55, 0.25);
    --text: #0F172A; 
    --text2: #334155; 
    --muted: #64748B; 
    --subtle: #F1F5F9;
    --green: #10B981;
    --amber: #F59E0B;
    --blue: #3B82F6;

    --navy: #0F172A;
    --navy2: #1B2843;
    --navy3: #223154;
    --navy-border: rgba(255,255,255,0.10);
    --navy-text2: rgba(226,232,240,0.72);
    --navy-muted: rgba(226,232,240,0.52);
  }

  html { scroll-behavior: smooth; }
  body { font-family: 'Plus Jakarta Sans', 'Outfit', sans-serif; background: var(--bg-light); color: var(--text); overflow-x: hidden; line-height: 1.6; }
  
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #F1F5F9; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
  @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes typingBounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-5px);opacity:1} }
  @keyframes chatPop { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes paperSettle { from{opacity:0;transform:rotate(-9deg) translateY(36px) scale(0.95)} to{opacity:1;transform:rotate(-3deg) translateY(0) scale(1)} }
  @keyframes stampIn { 0%{opacity:0;transform:scale(2.4) rotate(-16deg)} 55%{opacity:0.9;transform:scale(0.88) rotate(2deg)} 78%{transform:scale(1.05) rotate(-2deg)} 100%{opacity:0.9;transform:scale(1) rotate(0deg)} }

  .fade-in-section { opacity: 0; transform: translateY(24px); transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
  .fade-in-section.visible { opacity: 1; transform: translateY(0); }

  .ka-nav-link { font-size:0.875rem; font-weight:600; color:var(--text2); text-decoration:none; transition:all 0.2s; letter-spacing:-0.1px; }
  .ka-nav-link:hover { color:var(--red); }

  .ka-cal-day:hover { transform: scale(1.04); }
  select option { background: #FFFFFF; color: #0F172A; }

  /* Grid items default to a content-based minimum width that can force a 1fr track wider than its
     container when a descendant has nowrap text (e.g. the map's address line) — this lets tracks
     actually shrink to the space they're given instead of overflowing it. */
  .ka-about-grid > div { min-width: 0; }

  .ka-mobile-toggle { display: none; }
  .ka-nav-pill { transition: all 0.2s ease; }

  @media (max-width: 860px) {
    .hidden-mobile { display: none !important; }
    .ka-mobile-toggle { display: inline-flex !important; }

    #hero { padding: 100px 24px 48px !important; }
    .ka-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
    .ka-hero-visual { margin-top: 8px !important; }
    .ka-hero-trust { flex-wrap: wrap !important; }
    .ka-hero-contact-divider { display: none !important; }

    .ka-howitworks-steps { overflow-x: auto; padding-bottom: 6px; mask-image: linear-gradient(90deg, black 88%, transparent 100%); -webkit-mask-image: linear-gradient(90deg, black 88%, transparent 100%); }
    .ka-howitworks-services { grid-template-columns: 1fr !important; }
    .ka-howitworks-services > div { border-left: none !important; border-top: 1px solid var(--navy-border); padding-left: 0 !important; padding-top: 24px !important; }
    .ka-howitworks-services > div:first-child { border-top: none; padding-top: 0 !important; }

    #about, #services, #howitworks, #stats { padding: 72px 24px !important; }
    .ka-about-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
    .ka-mission-vision { grid-template-columns: 1fr !important; }

    .ka-stats-grid { grid-template-columns: repeat(2,1fr) !important; row-gap: 28px !important; column-gap: 0 !important; }
    .ka-stats-grid > div { border-right: none !important; padding-right: 0 !important; padding-left: 0 !important; }
    .ka-stats-grid > div:nth-child(2n) { padding-left: 20px !important; border-left: 1px solid var(--border) !important; }

    .ka-services-grid { grid-template-columns: repeat(2,1fr) !important; }
  }

  @media (max-width: 560px) {
    .ka-services-grid { grid-template-columns: 1fr !important; }
    .ka-stats-grid { grid-template-columns: 1fr !important; }
    .ka-stats-grid > div:nth-child(2n) { border-left: none !important; padding-left: 0 !important; }
  }
`;

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const SERVICES = [
  {
    num: '01',
    icon: 'syringe',
    tag: 'Emergency Care',
    title: 'Post-Exposure Prophylaxis (PEP)',
    desc: 'WHO-standard 5-dose active immunization protocol for animal bite and scratch victims.',
    target: 'Anyone bitten, scratched, or exposed to saliva of dogs, cats, bats, or rabies-suspect animals.',
    whenNeeded: 'Immediately after exposure (Day 0). Do not delay seeking medical care.',
    schedule: ['Day 0 (Initial dose)', 'Day 3 (2nd dose)', 'Day 7 (3rd dose)', 'Day 14 (4th dose)', 'Day 28 (5th dose)'],
    specs: 'WHO/DOH purified Vero-cell rabies vaccine (PVRV). Intramuscular administration with strict cold-chain assurance.',
    highlights: ['100% WHO Protocol Compliant', 'Automated Dose Reminders', 'Digital ABT Card Issued']
  },
  {
    num: '02',
    icon: 'shield',
    tag: 'Preventive Defense',
    title: 'Pre-Exposure Prophylaxis (PrEP)',
    desc: 'Preventive 3-dose series for high-risk individuals: vets, animal handlers, travelers, and field workers.',
    target: 'Veterinarians, pet groomers, animal rescuers, lab researchers, wildlife officers, and frequent travelers.',
    whenNeeded: 'Proactively before any animal exposure occurs.',
    schedule: ['Day 0 (1st dose)', 'Day 7 (2nd dose)', 'Day 21 or 28 (3rd dose)'],
    specs: 'Eliminates requirement for Rabies Immunoglobulin (RIG) if exposed later, reducing post-bite treatment to just 2 booster doses (Days 0 & 3).',
    highlights: ['Long-Term Antibody Defense', 'Simplified Future Post-Bite Care', 'High-Risk Occupation Essential']
  },
  {
    num: '03',
    icon: 'droplet',
    tag: 'Category III Care',
    title: 'Rabies Immunoglobulin (RIG)',
    desc: 'Passive antibody therapy infiltrated directly into Category III bite wounds for instant neutralization.',
    target: 'Patients with Category III exposures (deep transdermal bites, multiple wounds, bites on head/neck/hands).',
    whenNeeded: 'Administered on Day 0 alongside the first dose of PEP.',
    schedule: ['Single Day 0 infiltration around wound margins', 'Remaining volume injected IM'],
    specs: 'Equine Rabies Immunoglobulin (ERIG) or Human Rabies Immunoglobulin (HRIG). Weight-adjusted dosage providing instant antibodies before vaccine response matures.',
    highlights: ['Immediate Neutralizing Antibodies', 'Direct Wound Margin Infiltration', 'Weight-Calculated Dosing']
  },
  {
    num: '04',
    icon: 'cross',
    tag: 'First Response',
    title: 'Wound Care & Debridement',
    desc: 'Professional surgical wound cleaning, antiseptic irrigation, and sterile dressing for bite injuries.',
    target: 'All patients presenting with animal bites, punctures, lacerations, or scratches.',
    whenNeeded: 'First step upon clinic arrival after an animal bite.',
    schedule: ['15-min continuous soap & water wash', 'Povidone-iodine / Antiseptic flush', 'Sterile dressing'],
    specs: 'Physical removal of viral particles. Primary suturing is strictly avoided unless surgically essential to prevent viral entrapment.',
    highlights: ['15-Minute Mechanical Wash', 'Antiseptic & Debridement Care', 'Infection Prevention']
  },
  {
    num: '05',
    icon: 'pill',
    tag: 'Co-Infection Defense',
    title: 'Anti-Tetanus Immunization',
    desc: 'Tetanus Toxoid vaccine & Tetanus Immunoglobulin (TIG) protection co-administered with rabies care.',
    target: 'Animal bite patients with dirty, punctured, or contaminated wounds.',
    whenNeeded: 'Evaluated during initial triage alongside rabies PEP.',
    schedule: ['Tetanus Toxoid (TT / Td booster)', 'TIG (250 IU) for contaminated/deep wounds'],
    specs: 'Neutralizes Clostridium tetani toxin risk from animal mouth flora and soil exposure.',
    highlights: ['Dual Infection Shield', 'Tetanus Toxoid Booster', 'TIG Antibodies for Deep Wounds']
  },
  {
    num: '06',
    icon: 'clipboard',
    tag: 'Official Records',
    title: 'Clearance & Certification',
    desc: 'Official DOH-standard completion certificates, digital dose records, and PhilHealth billing.',
    target: 'Patients completing their vaccination protocol or requiring official medical proof.',
    whenNeeded: 'Issued upon completion of the full PEP or PrEP course.',
    schedule: ['Digital ABT Card issued on Day 0', 'Official Completion Certificate on final dose'],
    specs: 'Stamped with clinical registry seal, attending physician signature, and PhilHealth accreditation code.',
    highlights: ['DOH Compliant Certificate', 'PhilHealth Benefit Billing', 'Digital App Record Sync']
  },
];

export const STATS = [
  ['5,800+', 'Patients Served', 'users'],
  ['10 yrs', 'In Operation', 'award'],
  ['7 days', 'Open Weekly', 'clock'],
  ['98%', 'Completion Rate', 'target'],
];

export const MISSION_VISION = [
  { icon: 'target', label: 'Our Mission', text: 'Deliver WHO-protocol rabies prophylaxis without delay — every bite assessed, every dose recorded, every patient followed through to completion.' },
  { icon: 'eye', label: 'Our Vision', text: 'A community where no animal bite ends in rabies, through fast triage, complete dose adherence, and a clinic door that never turns a patient away.' },
];

export const TEAM = [
  { init: 'A', name: 'Dr. Andrei James D. Ronatay', role: 'Lead Physician · M.D.', detail: 'M.D. · Head Physician & Clinic Lead specializing in rabies post-exposure prophylaxis' },
  { init: 'M', name: 'Marilou L. Parce, RN', role: 'Staff Nurse', detail: 'RN · Licensed Staff Nurse specializing in PEP vaccine administration and wound care' },
  { init: 'S', name: 'Sheila Bolante, RN', role: 'Staff Nurse', detail: 'RN · Licensed Staff Nurse dedicated to patient triage, immunization, and clinical safety' },
  { init: 'D', name: 'Dahrren May F. Velasco, RN', role: 'Staff Nurse', detail: 'RN · Licensed Staff Nurse specializing in vaccine cold-chain logistics and patient tracking' },
  { init: 'E', name: 'Elizabeth Cruz, RN', role: 'Staff Nurse', detail: 'RN · Licensed Staff Nurse specializing in post-bite wound debridement and follow-up care' },
];

export const FAQ_ITEMS = [
  { q:'What should I do immediately after an animal bite?', a:'Immediately wash the wound with soap and water for at least 15 minutes. Apply an antiseptic if available. Come to our clinic as soon as possible — do not wait. We are open 7 days a week and walk-ins are welcome for emergency PEP.' },
  { q:'How many vaccine doses are required for PEP?', a:'The standard WHO-recommended PEP schedule is 5 doses: given on Days 0, 3, 7, 14, and 28. Previously vaccinated individuals may only need 2 doses. Our team will assess your case and prescribe the appropriate regimen.' },
  { q:'Why are appointments only on weekends?', a:'Scheduled appointments (for pre-exposure prophylaxis, booster doses, and elective follow-ups) are held on Saturdays and Sundays for your convenience. Emergency walk-ins for animal bite victims are accepted all week, every day.' },
  { q:'Is the rabies vaccine covered by PhilHealth?', a:'Yes, K&A Clinic is PhilHealth accredited. Animal bite treatment packages may be covered under your benefits. Please bring your PhilHealth ID and Member Data Record (MDR) when visiting.' },
  { q:'Can children receive the rabies vaccine here?', a:'Absolutely. There is no minimum age for rabies PEP. Children receive the same vaccine with weight-adjusted RIG dosing. A parent or legal guardian must be present for patients under 18 years old.' },
  { q:'Who can use the Patient App?', a:'The Patient App is exclusively for registered patients with a valid Medical Record Number (MRN) issued by K&A Clinic. It is designed for personal vaccination schedule tracking, wound recovery monitoring, digital medical records access, and direct communication with clinic staff. It is not intended for general public sign-up without an existing patient record.' },
];

