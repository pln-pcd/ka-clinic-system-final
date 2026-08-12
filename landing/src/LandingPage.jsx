import { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "./firebase";

/* ── CSS Variables & Styles injected globally ── */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600&family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --red: #B8121A; --red-dark: #8f0d13; --red-mid: #c42028; --red-bright: #EF4444;
    --red-dim: rgba(184,18,26,0.12); --red-glow: rgba(220,38,38,0.35);
    --green2: #10C978; --green2-dim: rgba(16,201,120,0.12); --green2-glow: rgba(16,201,120,0.20);
    --dark: #0C1210; --dark2: #101A16; --card: #141C18; --card2: #192018; --card3: #1A2520;
    --border: rgba(255,255,255,0.08); --border2: rgba(255,255,255,0.14); --border3: rgba(16,201,120,0.22);
    --text: #EDF5F0; --text2: #C8C7CE; --muted: rgba(200,199,206,0.55); --subtle: rgba(255,255,255,0.04);
    --green: #1fad56; --amber: #d4943a; --blue: #4a7ccc;
  }
  html { scroll-behavior: smooth; }
  body { font-family: 'Outfit', sans-serif; background: var(--dark); color: var(--text); overflow-x: hidden; line-height: 1.6; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--dark); }
  ::-webkit-scrollbar-thumb { background: rgba(16,201,120,0.25); border-radius: 3px; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
  @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  .fade-in-section { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .fade-in-section.visible { opacity: 1; transform: translateY(0); }
  .ka-nav-tab { font-size:0.8125rem;font-weight:500;color:var(--text2);text-decoration:none;transition:all 0.22s ease;padding:7px 18px;border-radius:9999px;display:inline-block;white-space:nowrap; }
  .ka-nav-tab:hover { color:#FFFFFF; background:rgba(255,255,255,0.06); }
  .ka-nav-tab.active { color:#FFFFFF; background:linear-gradient(135deg, #EF4444, #B8121A); font-weight:600; box-shadow:0 4px 14px var(--red-glow); }
  .ka-cal-day:hover { transform: scale(1.04); }
  select option { background: #1A2520; color: #EDF5F0; }
`;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const SERVICES = [
  { num:'01', icon:'💉', title:'Rabies Vaccination Series',   desc:'WHO-standard multi-dose immunization schedule for animal bite and scratch victims. Administered on Days 0, 3, 7, 14, and 28.' },
  { num:'02', icon:'🛡️', title:'Immunization & Protection',  desc:'Prophylaxis series for high-risk individuals: veterinarians, animal handlers, field workers, and frequent travelers.' },
  { num:'03', icon:'🩸', title:'RIG Biologic Therapy',        desc:'Rabies Immunoglobulin therapy for Category III exposures — infiltrated directly at the wound site for immediate protection.' },
  { num:'04', icon:'🩹', title:'Professional Wound Care',    desc:'Expert wound cleaning, thorough debridement, and antiseptic treatment following animal encounters.' },
  { num:'05', icon:'💊', title:'Immunity Boosters',          desc:'Periodic booster doses for previously vaccinated individuals — ensuring strong long-term defense against rabies.' },
  { num:'06', icon:'📋', title:'Bite & Wound Assessment',     desc:'Clinical evaluation of wound severity, category classification, and personalized care plan recommendation.' },
];

const TEAM = [
  { init:'K', name:'Dr. Karen Reyes',    role:'Medical Director',    detail:'MD, MPH · 14 years in infectious disease and public health' },
  { init:'M', name:'Nurse Maria Santos', role:'Head Nurse',          detail:'RN · Specialized in vaccination administration and wound care management' },
  { init:'J', name:'Dr. Jose Mendoza',   role:'Attending Physician', detail:'MD · Expert in rabies prophylaxis protocols and RIG therapy' },
  { init:'A', name:'Nurse Ana Cruz',     role:'Vaccine Coordinator', detail:'RN · Manages vaccine scheduling, cold chain, and patient follow-ups' },
];

const FAQ_ITEMS = [
  { q:'What should I do immediately after an animal bite or scratch?',  a:'Immediately wash the wound with soap and water for at least 15 minutes. Apply an antiseptic if available. Come to K&A Clinic as soon as possible — walk-ins are welcome Monday to Friday for immediate vaccination care.' },
  { q:'How many vaccine doses are required?',                            a:'The standard WHO-recommended schedule is 5 doses: given on Days 0, 3, 7, 14, and 28. Previously vaccinated individuals may require fewer doses. Our clinical team will assess your case and prescribe the appropriate regimen.' },
  { q:'Why are appointment bookings on weekends?',                      a:'Scheduled weekend appointments (Saturdays and Sundays) provide convenience for follow-up doses and consultations. Walk-in patients seeking immediate vaccination are welcomed Monday through Friday, 8:00 AM – 5:00 PM.' },
  { q:'Is the rabies vaccine covered by PhilHealth?',                   a:'Yes, K&A Clinic is PhilHealth accredited. Animal bite treatment packages may be covered under your benefits. Please bring your PhilHealth ID and Member Data Record (MDR) when visiting.' },
  { q:'Can children receive the rabies vaccine here?',                  a:'Absolutely. There is no minimum age for rabies vaccination. Children receive the same vaccine with weight-adjusted RIG dosing. A parent or legal guardian must be present for patients under 18 years old.' },
  { q:'What documents do I need to bring?',                             a:'For first visits: valid ID and PhilHealth card (if applicable). For follow-up doses: your Treatment Record / Animal Bite Treatment (ABT) card. The K&A app also stores your digital records for easy access.' },
];

const KB = {
  schedule:   { keys:['hours','open','close','time','when open','when close','operating','walk-in','days','weekday','weekend','monday','tuesday','wednesday','thursday','friday','saturday','sunday'], ans:'🏥 <strong>K&A Clinic Operating Information:</strong><br>• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)<br>• Immediate Walk-ins: Accepted Monday – Friday<br>• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)<br>• Address: San Juan St., Libon, Albay' },
  book:       { keys:['book','appointment','slot','reserve','register','sign up'], ans:'To book a weekend appointment, click the <strong>"Book Appointment"</strong> button at the top of the page. Slots are available Saturday & Sunday, 8AM–12PM. You can also call us at <strong>(02) 8123-4567</strong>.' },
  pep:        { keys:['pep','post-exposure','vaccine dose','dose schedule','injection','how many shot','how many dose','treatment schedule','next dose','next shot'], ans:'💉 <strong>DOH Anti-Rabies Vaccination Protocols:</strong><br>• Vaccination Essen Scheme: 5 Doses on Day 0 (Bite/Consultation Date), Day 3, Day 7, Day 14, and Day 28.<br>• Category III Bites: Requires ERIG/HRIG on Day 0 alongside Dose 1.<br>• Pre-exposure Prophylaxis: 3 Doses on Day 0, Day 7, and Day 21/28.' },
  firstaid:   { keys:['bitten','scratched','first aid','what to do','dog bite','cat scratch','cat bite','animal bite','wound','bite'], ans:'🧼 <strong>Immediate First Aid for Animal Bites/Scratches:</strong><br>1. Wash the wound thoroughly with clean running water and soap for at least 15 minutes.<br>2. Apply antiseptic (povidone-iodine or 70% alcohol).<br>3. Seek medical evaluation at K&A Clinic immediately.<br>⚠️ Do NOT apply garlic, coins, or traditional concoctions.' },
  cost:       { keys:['cost','price','fee','how much','payment','charge','expensive','bayad'], ans:'Vaccine pricing varies depending on the biologic brand used. We accept PhilHealth for covered treatments. For current pricing and to verify your coverage, please call us at <strong>(02) 8123-4567</strong>.' },
  location:   { keys:['where','address','location','find','map','directions','albay','libon'], ans:'We are located at <strong>San Juan St., Libon, Albay, Philippines</strong>. You can click our contact location card to view Google Maps or call <strong>(02) 8123-4567</strong>.' },
  contact:    { keys:['contact','call','phone','email','reach','facebook','message'], ans:'You can reach us directly at:<br>• Phone: <strong>(02) 8123-4567</strong><br>• Email: <strong>karabies@clinic.ph</strong><br>• Facebook: <strong>/KAAntiRabiesClinic</strong><br><br>We are available Monday to Sunday, 8:00 AM – 5:00 PM.' },
  app:        { keys:['app','download','mobile','android','ios','apple','play store','reminder','records','track'], ans:'Download the <strong>K&A Clinic App</strong> for vaccine reminders, digital medical records, easy appointment booking, and an in-app chatbot. Available soon on App Store and Google Play.' },
  rig:        { keys:['rig','immunoglobulin','category 3','category iii'], ans:'Rabies Immunoglobulin (RIG) is given for Category III exposures — deep wounds, bites on the head/neck, or multiple bites. It is infiltrated directly at the wound site on Day 0 alongside the first vaccine dose.' },
  philhealth: { keys:['philhealth','insurance','coverage','covered'], ans:'Yes, K&A Clinic is PhilHealth accredited. Please bring your PhilHealth ID and MDR on your first visit. Our staff will assist you with the accreditation process.' },
};

function getBotReply(msg) {
  const lower = msg.toLowerCase();
  const priorityOrder = ['schedule','firstaid','pep','book','cost','location','contact','app','rig','philhealth'];
  for (const key of priorityOrder) {
    const data = KB[key];
    if (data && data.keys.some(k => lower.includes(k))) return { found:true, text:data.ans };
  }
  for (const [key, data] of Object.entries(KB)) {
    if (!priorityOrder.includes(key) && data.keys.some(k => lower.includes(k))) return { found:true, text:data.ans };
  }
  return { found:false, text:null };
}

function getSlotData(year, month, day) {
  const seed = year * 10000 + month * 100 + day;
  const rand = ((seed * 16807) % 2147483647) / 2147483647;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(year, month, day); d.setHours(0,0,0,0);
  if (d < today) return { status:'past', slots:0 };
  const dow = d.getDay();
  if (dow !== 0 && dow !== 6) return { status:'walkin', slots:0 };
  const maxSlots = 12, booked = Math.floor(rand * (maxSlots + 1)), remaining = maxSlots - booked;
  if (remaining === 0) return { status:'full', slots:0 };
  if (remaining <= 3) return { status:'limited', slots:remaining };
  return { status:'available', slots:remaining };
}

function getNextWeekendSlots() {
  const today = new Date();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (d.getDay() === 6) {
      const data = getSlotData(d.getFullYear(), d.getMonth(), d.getDate());
      const label = `Saturday ${d.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`;
      return { ...data, label };
    }
  }
  return { status:'full', slots:0, label:'This Saturday' };
}

function useFadeIn(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll('.fade-in-section');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold:0.1 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [ref]);
}

function SectionLabel({ children }) {
  return (
    <div style={{fontSize:'0.625rem',fontWeight:500,textTransform:'uppercase',letterSpacing:3,color:'var(--green2)',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
      <span style={{width:24,height:1,background:'var(--green2)',opacity:0.7,display:'inline-block'}} />{children}
    </div>
  );
}

function WaveDivider({ fill, path }) {
  const d = path || "M0,30 C200,60 400,0 600,30 C800,60 1000,0 1200,30 C1320,45 1400,20 1440,30 L1440,60 L0,60 Z";
  return (
    <div style={{position:'absolute',bottom:-2,left:0,right:0,overflow:'hidden',lineHeight:0,pointerEvents:'none',height:62}}>
      <svg viewBox="0 0 1440 60" preserveAspectRatio="none" style={{display:'block',width:'100%',height:'100%'}}>
        <path d={d} fill={fill} />
      </svg>
    </div>
  );
}

/* ── Floating Navbar matching Photo Reference ── */
function Nav({ onBook, onAdminClick, activeTab, setActiveTab }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const tabs = [
    { id: 'hero', label: 'Home' },
    { id: 'services', label: 'Services' },
    { id: 'about', label: 'About' },
    { id: 'calendar', label: 'Schedule' },
    { id: 'team', label: 'Team' },
    { id: 'app', label: 'App' },
    { id: 'faq', label: 'Contact' },
  ];

  return (
    <>
      <header style={{position:'fixed',top:0,left:0,right:0,zIndex:900,transition:'all 0.3s ease'}}>
        {/* Glowing Top Accent Line */}
        <div style={{height:3,background:'linear-gradient(90deg, #8f0d13 0%, #EF4444 50%, #8f0d13 100%)',boxShadow:'0 0 12px rgba(239,68,68,0.6)'}} />
        
        <nav style={{
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          padding:'0 40px',
          height:74,
          background: scrolled ? 'rgba(10, 14, 12, 0.96)' : 'rgba(12, 18, 16, 0.88)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}>
          
          {/* Upper Left Logo */}
          <div onClick={onAdminClick} style={{display:'flex',alignItems:'center',gap:12,textDecoration:'none',cursor:'pointer'}}>
            <div style={{
              width:42, height:42, borderRadius:10,
              background:'linear-gradient(135deg,#c42028,#8f0d13)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Cormorant Garamond',serif", color:'white', fontSize:'1.2rem', fontWeight:700,
              boxShadow:'0 4px 20px rgba(184,18,26,0.4)', flexShrink:0,
              border:'1px solid rgba(255,255,255,0.15)'
            }}>K</div>
            <div>
              <div style={{fontSize:'0.975rem',fontWeight:700,color:'var(--text)',letterSpacing:'0.2px'}}>K&A Clinic</div>
              <div style={{fontSize:'0.575rem',color:'var(--green2)',letterSpacing:'1.4px',textTransform:'uppercase',fontWeight:500}}>Anti-Rabies Center</div>
            </div>
          </div>

          {/* Centered Floating Pill Navigation Bar (Photo Reference Design) */}
          <div style={{
            background: 'rgba(20, 26, 24, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '9999px',
            padding: '4px 6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)'
          }}>
            {tabs.map(t => {
              const isActive = activeTab === t.id;
              return (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  onClick={() => setActiveTab(t.id)}
                  className={`ka-nav-tab ${isActive ? 'active' : ''}`}
                >
                  {t.label}
                </a>
              );
            })}
          </div>

          {/* Upper Right Action Buttons & Direct Contact */}
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {/* Quick Contact Button */}
            <a href="tel:028123456" style={{
              display:'flex',alignItems:'center',gap:8,
              background:'rgba(16,201,120,0.08)',
              border:'1px solid rgba(16,201,120,0.25)',
              padding:'8px 16px',borderRadius:9999,
              color:'var(--green2)',fontSize:'0.8rem',fontWeight:600,
              textDecoration:'none',transition:'all 0.2s'
            }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(16,201,120,0.16)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(16,201,120,0.08)';}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:'var(--green2)',animation:'pulse 2s ease infinite',display:'inline-block'}} />
              📞 (02) 8123-4567
            </a>

            <button onClick={onAdminClick}
              style={{background:'transparent',color:'var(--muted)',border:'1px solid var(--border)',padding:'8px 16px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.8rem',fontWeight:500,cursor:'pointer',transition:'all 0.2s',letterSpacing:'0.4px',display:'flex',alignItems:'center',gap:6}}
              onMouseEnter={e=>{e.currentTarget.style.color='var(--text)';e.currentTarget.style.borderColor='var(--border2)';}}
              onMouseLeave={e=>{e.currentTarget.style.color='var(--muted)';e.currentTarget.style.borderColor='var(--border)';}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Admin
            </button>

            <button onClick={onBook}
              style={{background:'var(--red)',color:'white',border:'none',padding:'9px 20px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.8rem',fontWeight:600,cursor:'pointer',transition:'all 0.2s',letterSpacing:'0.4px',boxShadow:'0 4px 18px var(--red-glow)'}}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--red-mid)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='var(--red)';}}>
              Book Appointment
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileOpen && (
        <div style={{position:'fixed',top:74,left:0,right:0,zIndex:899,background:'rgba(12,18,16,0.98)',backdropFilter:'blur(20px)',borderBottom:'1px solid var(--border)',padding:'16px 24px 24px',animation:'slideDown 0.2s ease both'}}>
          {tabs.map(t => (
            <a key={t.id} href={`#${t.id}`} onClick={()=>{setActiveTab(t.id);setMobileOpen(false);}} style={{display:'block',padding:'12px 0',fontSize:'1rem',fontWeight:500,color:'var(--text2)',textDecoration:'none',borderBottom:'1px solid var(--border)'}}>{t.label}</a>
          ))}
          <a href="tel:028123456" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginTop:16,background:'rgba(16,201,120,0.1)',border:'1px solid rgba(16,201,120,0.3)',color:'var(--green2)',padding:'12px',borderRadius:8,fontSize:'0.9rem',fontWeight:600,textDecoration:'none'}}>
            📞 Call (02) 8123-4567
          </a>
          <button onClick={()=>{onAdminClick();setMobileOpen(false);}} style={{width:'100%',marginTop:8,background:'transparent',color:'var(--muted)',border:'1px solid var(--border)',padding:'12px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.9rem',fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
            Admin Login
          </button>
          <button onClick={()=>{onBook();setMobileOpen(false);}} style={{width:'100%',marginTop:8,background:'var(--red)',color:'white',border:'none',padding:'12px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.9rem',fontWeight:600,cursor:'pointer'}}>Book Appointment</button>
        </div>
      )}
    </>
  );
}

function Hero({ onBook }) {
  const ws = getNextWeekendSlots();
  const slotColor = ws.status==='available'?'var(--green)':ws.status==='limited'?'var(--amber)':'var(--red)';
  const slotText  = ws.status==='full'?'Full':ws.status==='limited'?`${ws.slots} left`:`${ws.slots} slots`;

  return (
    <section id="hero" style={{minHeight:'100vh',display:'flex',alignItems:'center',position:'relative',overflow:'hidden',padding:'0 48px 80px'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 70% 55% at 65% 25%,rgba(184,18,26,0.10) 0%,transparent 65%),radial-gradient(ellipse 40% 40% at 15% 75%,rgba(16,201,120,0.05) 0%,transparent 60%)'}} />
      <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',backgroundSize:'48px 48px',maskImage:'radial-gradient(ellipse 90% 90% at 50% 50%,black 20%,transparent 100%)'}} />

      <div style={{position:'relative',zIndex:1,maxWidth:720,paddingTop:130,animation:'fadeUp 0.8s ease both'}}>
        {/* Status Badge */}
        <div style={{display:'inline-flex',alignItems:'center',gap:9,background:'rgba(16,201,120,0.08)',border:'1px solid rgba(16,201,120,0.25)',borderRadius:9999,padding:'6px 18px',fontSize:'0.675rem',fontWeight:600,color:'var(--green2)',textTransform:'uppercase',letterSpacing:2,marginBottom:28}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'var(--green2)',animation:'pulse 2s ease infinite',flexShrink:0,display:'inline-block'}} />
          Now Accepting Appointments & Walk-Ins
        </div>

        {/* Hero Title */}
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(3rem,5vw,4.8rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:24,fontWeight:600}}>
          Your Shield<br/>Against <em style={{color:'var(--red)',fontStyle:'italic',fontWeight:400}}>Rabies.</em>
          <span style={{fontSize:'0.52em',fontWeight:400,letterSpacing:1.2,color:'var(--green2)',fontStyle:'normal',display:'block',marginTop:10,fontFamily:"'Outfit',sans-serif",textTransform:'uppercase'}}>Comprehensive Immunization & Clinical Care</span>
        </h1>

        {/* Hero Paragraph (Cleaned up wording) */}
        <p style={{fontSize:'1.05rem',color:'var(--muted)',maxWidth:540,lineHeight:1.8,marginBottom:36,fontWeight:300}}>
          K&A Anti-Rabies Vaccine Clinic provides professional rabies vaccination, wound care management, and full immunization protection — protecting our community every day.
        </p>

        {/* Hero CTA buttons */}
        <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',marginBottom:48}}>
          <a href="#calendar" onClick={onBook} style={{background:'var(--red)',color:'white',padding:'14px 34px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.9rem',fontWeight:600,letterSpacing:'0.5px',boxShadow:'0 6px 24px var(--red-glow)',transition:'all 0.22s',display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Book Weekend Slot
          </a>
          <a href="tel:028123456" style={{background:'rgba(16,201,120,0.1)',color:'var(--green2)',border:'1px solid rgba(16,201,120,0.3)',padding:'14px 28px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.9rem',fontWeight:600,letterSpacing:'0.4px',transition:'all 0.22s',display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            📞 Call (02) 8123-4567
          </a>
        </div>

        {/* EMPHASIZED HERO CONTACT CARD */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(20, 28, 24, 0.95), rgba(16, 22, 19, 0.95))',
          border: '1px solid rgba(16, 201, 120, 0.22)',
          borderRadius: 14,
          padding: '20px 24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          backdropFilter: 'blur(12px)'
        }}>
          <div>
            <div style={{fontSize:'0.65rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.2px',fontWeight:500,marginBottom:4}}>Direct Hotline</div>
            <a href="tel:028123456" style={{fontSize:'0.95rem',fontWeight:700,color:'var(--green2)',textDecoration:'none',display:'inline-block'}}>(02) 8123-4567</a>
            <div style={{fontSize:'0.65rem',color:'var(--text2)',marginTop:2}}>Tap to call now</div>
          </div>
          <div style={{borderLeft:'1px solid var(--border)',paddingLeft:16}}>
            <div style={{fontSize:'0.65rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.2px',fontWeight:500,marginBottom:4}}>Clinic Location</div>
            <div style={{fontSize:'0.85rem',fontWeight:600,color:'var(--text)',lineHeight:1.3}}>San Juan St., Libon, Albay</div>
            <a href="#about" style={{fontSize:'0.65rem',color:'var(--green2)',textDecoration:'none',marginTop:2,display:'inline-block'}}>View Map & Directions →</a>
          </div>
          <div style={{borderLeft:'1px solid var(--border)',paddingLeft:16}}>
            <div style={{fontSize:'0.65rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.2px',fontWeight:500,marginBottom:4}}>Clinic Hours</div>
            <div style={{fontSize:'0.85rem',fontWeight:600,color:'var(--text)'}}>8:00 AM – 5:00 PM</div>
            <div style={{fontSize:'0.65rem',color:'var(--text2)',marginTop:2}}>Open 7 Days a Week</div>
          </div>
        </div>

        {/* Metrics Row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:24,marginTop:40,paddingTop:28,borderTop:'1px solid var(--border)',animation:'fadeUp 0.8s 0.2s ease both'}}>
          {[
            ['5,800+','Patients Served','Community Reach'],
            ['10 yrs','In Operation','Clinical Experience'],
            ['7 days','Open Weekly','Always Accessible'],
            ['98%','Completion Rate','Protocol Adherence']
          ].map(([n,l,sub]) => (
            <div key={l} style={{display:'flex',flexDirection:'column'}}>
              <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:4}}>{sub}</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:'2.2rem',fontWeight:800,color:'var(--text)',letterSpacing:'-1.2px',lineHeight:1}}>{n}</div>
              <div style={{fontSize:'0.825rem',color:'var(--muted)',fontWeight:600,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Status Widgets */}
      <div style={{position:'absolute',right:0,top:0,bottom:0,width:'40%',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',animation:'fadeUp 0.8s 0.15s ease both'}}>
        <div style={{position:'absolute',right:48,top:160,background:'rgba(16,24,20,0.92)',border:'1px solid var(--border2)',borderRadius:12,padding:'16px 22px',boxShadow:'0 20px 60px rgba(0,0,0,0.6)',backdropFilter:'blur(12px)',animation:'float1 4s ease-in-out infinite',minWidth:190}}>
          <div style={{width:30,height:30,borderRadius:8,background:'rgba(16,201,120,0.12)',border:'1px solid rgba(16,201,120,0.25)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green2)" strokeWidth="2.2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div style={{fontSize:'0.575rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.8px',marginBottom:6}}>Today's Status</div>
          <div style={{fontSize:'0.9rem',fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:'var(--green2)',boxShadow:'0 0 8px var(--green2)',animation:'pulse 2s ease infinite',display:'inline-block'}} />Clinic Open Today
          </div>
        </div>

        <div style={{position:'absolute',right:200,bottom:180,background:'rgba(16,24,20,0.92)',border:'1px solid var(--border2)',borderRadius:12,padding:'16px 22px',boxShadow:'0 20px 60px rgba(0,0,0,0.6)',backdropFilter:'blur(12px)',animation:'float2 5s ease-in-out infinite',minWidth:190}}>
          <div style={{fontSize:'0.575rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.8px',marginBottom:6}}>Weekend Slots</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:'1.45rem',fontWeight:600,color:slotColor,lineHeight:1}}>{slotText}</div>
          <div style={{fontSize:'0.625rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:1,marginTop:4}}>Available {ws.label}</div>
        </div>
      </div>

      <WaveDivider fill="var(--dark2)" />
    </section>
  );
}

/* ── EMPHASIZED CONTACT & ABOUT SECTION ── */
function About() {
  return (
    <section id="about" style={{background:'var(--dark2)',position:'relative'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'100px 48px 120px',position:'relative',zIndex:1}}>
        <div style={{display:'grid',gridTemplateColumns:'1.1fr 0.9fr',gap:56,alignItems:'start'}}>
          
          <div className="fade-in-section">
            <SectionLabel>About & Contact</SectionLabel>
            <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.4rem,4vw,3.3rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:18,fontWeight:600}}>
              Dedicated to<br/>Community Safety
            </h2>
            <p style={{fontSize:'0.95rem',color:'var(--muted)',maxWidth:500,lineHeight:1.85,marginBottom:40,fontWeight:300}}>
              K&A Anti-Rabies Vaccine Clinic has been protecting the community since 2016. We provide DOH-licensed and WHO-approved rabies biologics administered by trained health professionals.
            </p>

          </div>

          {/* Location & Hours Visual Card */}
          <div className="fade-in-section" style={{background:'var(--card2)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',boxShadow:'0 30px 80px rgba(0,0,0,0.5)'}}>
            <div style={{width:'100%',background:'linear-gradient(160deg,var(--card2),var(--card3))',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:'48px 32px'}}>
              <div style={{width:54,height:54,borderRadius:'50%',background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.6rem',animation:'bounce 2s ease-in-out infinite'}}>
                🏥
              </div>
              <div style={{fontSize:'0.75rem',color:'var(--green2)',textTransform:'uppercase',letterSpacing:'1.8px',fontWeight:600}}>Operating Hours & Schedule</div>
              <div style={{fontSize:'1rem',fontWeight:600,color:'var(--text)',textAlign:'center',maxWidth:280,lineHeight:1.5}}>
                San Juan St., Libon, Albay,<br/>Philippines
              </div>
              
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:16,width:'100%'}}>
                {[
                  ['Mon – Fri','8:00 AM – 5:00 PM','Walk-ins Accepted'],
                  ['Saturday','8:00 AM – 12:00 PM','By Appointment'],
                  ['Sunday','8:00 AM – 12:00 PM','By Appointment'],
                  ['Holidays','Open for Care','Call Ahead'],
                ].map(([d,t,note]) => (
                  <div key={d} style={{background:'rgba(16,201,120,0.04)',border:'1px solid rgba(16,201,120,0.12)',borderRadius:8,padding:'10px 14px'}}>
                    <div style={{fontSize:'0.7rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:2}}>{d}</div>
                    <div style={{fontSize:'0.8rem',fontWeight:600,color:'var(--text)',fontFamily:"'DM Mono',monospace"}}>{t}</div>
                    <div style={{fontSize:'0.65rem',color:'var(--green2)',marginTop:3}}>{note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
      <WaveDivider fill="var(--dark)" path="M0,30 C200,60 400,0 600,30 C800,60 1000,0 1200,30 C1320,45 1400,20 1440,30 L1440,60 L0,60 Z" />
    </section>
  );
}

/* ── CLINICAL SERVICES SECTION ── */
function Services() {
  return (
    <section id="services" style={{position:'relative'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'100px 48px 120px'}}>
        <div className="fade-in-section">
          <SectionLabel>What We Offer</SectionLabel>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.4rem,4vw,3.3rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:18,fontWeight:600}}>Clinical Services</h2>
          <p style={{fontSize:'0.95rem',color:'var(--muted)',maxWidth:520,lineHeight:1.85,marginBottom:56,fontWeight:300}}>
            Comprehensive anti-rabies care from wound assessment to full immunization regimens — all administered under strict clinical protocols.
          </p>
        </div>
        <div className="fade-in-section" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24}}>
          {SERVICES.map(s => (
            <div key={s.num} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:'36px 30px',transition:'all 0.25s',cursor:'default',position:'relative',overflow:'hidden'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.transform='translateY(-5px)';e.currentTarget.style.boxShadow='0 24px 48px rgba(0,0,0,0.45)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none';}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:'0.7rem',color:'var(--green2)',opacity:0.6,marginBottom:20,letterSpacing:1}}>{s.num}</div>
              <span style={{fontSize:'2rem',marginBottom:18,display:'block'}}>{s.icon}</span>
              <div style={{fontSize:'1rem',fontWeight:600,color:'var(--text)',marginBottom:12,letterSpacing:'0.1px'}}>{s.title}</div>
              <div style={{fontSize:'0.825rem',color:'var(--muted)',lineHeight:1.75,fontWeight:300}}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <WaveDivider fill="var(--dark2)" path="M0,40 C300,10 600,55 900,25 C1100,8 1280,45 1440,30 L1440,60 L0,60 Z" />
    </section>
  );
}

/* ── CALENDAR & APPOINTMENT SCHEDULE ── */
function Calendar({ onBook }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push({ day: daysInPrev - firstDay + 1 + i, type:'other' });
  for (let d = 1; d <= daysInMonth; d++) {
    const slot = getSlotData(year, month, d);
    const isToday = new Date(year,month,d).getTime() === today.getTime();
    cells.push({ day:d, type:'current', slot, isToday });
  }

  const canGoPrev = !(year === now.getFullYear() && month === now.getMonth());
  const prevMonth = () => { if (!canGoPrev) return; if (month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); };

  const sBg  = {past:'rgba(255,255,255,0.03)',walkin:'rgba(74,124,204,0.07)',available:'rgba(31,173,86,0.08)',limited:'rgba(212,148,58,0.1)',full:'rgba(184,18,26,0.07)'};
  const sBdr = {past:'var(--border)',walkin:'rgba(74,124,204,0.15)',available:'rgba(31,173,86,0.2)',limited:'rgba(212,148,58,0.25)',full:'rgba(184,18,26,0.2)'};

  return (
    <section id="calendar" style={{background:'var(--dark2)',position:'relative'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'100px 48px 120px'}}>
        <div className="fade-in-section">
          <SectionLabel>Availability</SectionLabel>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.4rem,4vw,3.3rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:18,fontWeight:600}}>Appointment Schedule</h2>
          <p style={{fontSize:'0.95rem',color:'var(--muted)',maxWidth:520,lineHeight:1.85,marginBottom:56,fontWeight:300}}>
            Scheduled appointments on Saturdays and Sundays. Walk-ins accepted daily for immediate care.
          </p>
        </div>

        <div className="fade-in-section" style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.4)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 32px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--text)',letterSpacing:'-0.2px'}}>{MONTHS[month]} {year}</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={prevMonth} disabled={!canGoPrev} style={{width:34,height:34,background:'var(--subtle)',border:'1px solid var(--border)',borderRadius:8,cursor:canGoPrev?'pointer':'not-allowed',display:'flex',alignItems:'center',justifyContent:'center',color:canGoPrev?'var(--muted)':'rgba(255,255,255,0.1)',opacity:canGoPrev?1:0.4,transition:'all 0.15s'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button onClick={nextMonth} style={{width:34,height:34,background:'var(--subtle)',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--muted)',transition:'all 0.15s'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:20,padding:'14px 32px',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
            {[['var(--green)','Available'],['var(--amber)','Limited'],['var(--red)','Full'],['var(--blue)','Walk-in only'],['rgba(255,255,255,0.15)','Past']].map(([c,l]) => (
              <div key={l} style={{display:'flex',alignItems:'center',gap:7,fontSize:'0.775rem',color:'var(--muted)'}}>
                <div style={{width:10,height:10,borderRadius:3,background:c}} />{l}
              </div>
            ))}
          </div>

          <div style={{padding:'0 32px'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:0}}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i) => (
                <div key={d} style={{padding:'14px 0',textAlign:'center',fontSize:'0.75rem',fontWeight:600,color:i===0||i===6?'var(--green2)':'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>{d}</div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8,paddingBottom:28}}>
              {cells.map((cell,i) => {
                if (cell.type==='other') return (
                  <div key={i} style={{minHeight:68,background:'rgba(255,255,255,0.01)',borderRadius:8,display:'flex',alignItems:'flex-start',justifyContent:'flex-end',padding:'8px 10px',border:'1px solid rgba(255,255,255,0.02)'}}>
                    <span style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.12)'}}>{cell.day}</span>
                  </div>
                );
                const {slot,isToday} = cell;
                const clickable = slot.status==='available'||slot.status==='limited';
                const dotColor = {available:'var(--green)',limited:'var(--amber)',full:'var(--red)',walkin:'var(--blue)'}[slot.status];
                return (
                  <div key={i} className="ka-cal-day"
                    style={{minHeight:68,background:sBg[slot.status]||'transparent',borderRadius:8,display:'flex',flexDirection:'column',padding:'8px 10px',border:isToday?'1.5px solid var(--green2)':`1px solid ${sBdr[slot.status]||'var(--border)'}`,transition:'all 0.2s',cursor:clickable?'pointer':'default',position:'relative',overflow:'hidden'}}
                    onClick={()=>clickable&&onBook()}
                    title={slot.status==='walkin'?'Walk-in only (Mon–Fri)':slot.status==='past'?'Past date':slot.status==='full'?'Fully booked':slot.status==='limited'?`${slot.slots} slots left — click to book`:`${slot.slots} slots available — click to book`}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'auto'}}>
                      <span style={{fontSize:'0.75rem',fontWeight:isToday?700:500,color:isToday?'var(--green2)':'var(--text2)'}}>{cell.day}</span>
                      {dotColor&&<span style={{width:6,height:6,borderRadius:'50%',background:dotColor,display:'inline-block'}} />}
                    </div>
                    {slot.status==='available'&&<span style={{fontSize:'0.55rem',color:'var(--green)',marginTop:4,fontWeight:600}}>{slot.slots} slots</span>}
                    {slot.status==='limited'&&<span style={{fontSize:'0.55rem',color:'var(--amber)',marginTop:4,fontWeight:600}}>{slot.slots} left</span>}
                    {slot.status==='walkin'&&<span style={{fontSize:'0.5rem',color:'var(--blue)',marginTop:4}}>Walk-in</span>}
                    {slot.status==='full'&&<span style={{fontSize:'0.5rem',color:'var(--red)',marginTop:4}}>Full</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{padding:'16px 32px',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,fontSize:'0.825rem',color:'var(--muted)'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>
            <span><strong style={{color:'var(--text)'}}>Walk-ins accepted Mon–Fri</strong> for immediate vaccination care. For scheduled weekend appointments, select any available Saturday or Sunday slot.</span>
          </div>

          <div style={{padding:'20px 32px',borderTop:'1px solid var(--border)'}}>
            <button onClick={onBook}
              style={{width:'100%',background:'var(--red)',color:'white',border:'none',padding:'14px 28px',borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:'0.9rem',fontWeight:600,cursor:'pointer',letterSpacing:'0.5px',boxShadow:'0 4px 24px var(--red-glow)',transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:9}}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--red-mid)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='var(--red)';}}>
              Book an Appointment
            </button>
          </div>
        </div>
      </div>
      <WaveDivider fill="var(--dark)" path="M0,20 C240,55 500,8 740,38 C960,60 1200,10 1440,35 L1440,60 L0,60 Z" />
    </section>
  );
}

/* ── TEAM SECTION ── */
function Team() {
  return (
    <section id="team" style={{position:'relative'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'100px 48px 120px'}}>
        <div className="fade-in-section">
          <SectionLabel>Our Professionals</SectionLabel>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.4rem,4vw,3.3rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:18,fontWeight:600}}>Meet the Team</h2>
          <p style={{fontSize:'0.95rem',color:'var(--muted)',maxWidth:520,lineHeight:1.85,marginBottom:56,fontWeight:300}}>Licensed and experienced health professionals dedicated to protecting you and your family.</p>
        </div>
        <div className="fade-in-section" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20}}>
          {TEAM.map(m => (
            <div key={m.name} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:'30px 24px',textAlign:'center',transition:'all 0.25s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border3)';e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow='0 20px 40px rgba(0,0,0,0.4)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none';}}>
              <div style={{width:54,height:54,borderRadius:'50%',background:'linear-gradient(135deg,var(--red),var(--red-dark))',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Cormorant Garamond',serif",fontSize:'1.45rem',fontWeight:700,color:'white',margin:'0 auto 16px',border:'2px solid rgba(184,18,26,0.4)'}}>{m.init}</div>
              <div style={{fontSize:'0.975rem',fontWeight:700,color:'var(--text)',marginBottom:5}}>{m.name}</div>
              <div style={{fontSize:'0.7rem',color:'var(--green2)',textTransform:'uppercase',letterSpacing:'1px',fontWeight:600,marginBottom:10}}>{m.role}</div>
              <div style={{fontSize:'0.785rem',color:'var(--muted)',lineHeight:1.6,fontWeight:300}}>{m.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <WaveDivider fill="var(--dark2)" path="M0,25 C200,55 450,5 700,35 C900,55 1150,10 1440,30 L1440,60 L0,60 Z" />
    </section>
  );
}

/* ── MOBILE APP SECTION ── */
function AppSection() {
  const [toast, setToast] = useState('');
  const showToast = store => { setToast(`${store} coming soon! 🚀`); setTimeout(()=>setToast(''),3000); };
  return (
    <section id="app" style={{background:'var(--dark2)',position:'relative'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'100px 48px 120px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'start'}}>
          <div className="fade-in-section">
            <SectionLabel>Mobile App</SectionLabel>
            <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.4rem,4vw,3.3rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:18,fontWeight:600}}>Your Vaccine<br/>Companion App</h2>
            <p style={{fontSize:'0.95rem',color:'var(--muted)',lineHeight:1.85,marginBottom:40,fontWeight:300}}>Download the K&A Clinic app to manage your vaccine schedule, get reminders, and chat with our team — anytime, anywhere.</p>
            <div style={{display:'flex',flexDirection:'column',gap:20,marginBottom:40}}>
              {[
                {icon:<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,title:'Smart Vaccine Reminders',desc:'Never miss a dose. Get push notifications for your next vaccine schedule with personalized timing.'},
                {icon:<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,title:'Digital Medical Records',desc:'Access your complete vaccination history, wound assessments, and treatment documents at any time.'},
                {icon:<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,title:'In-App AI Chatbot',desc:'Get instant answers about your treatment, doses, and side effects. Escalates to real nurses when needed.'},
                {icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,title:'Easy Appointment Booking',desc:'Book, reschedule, or cancel weekend appointments directly from your phone in seconds.'},
              ].map(({icon,title,desc}) => (
                <div key={title} style={{display:'flex',alignItems:'flex-start',gap:16}}>
                  <div style={{width:38,height:38,borderRadius:8,background:'rgba(16,201,120,0.08)',border:'1px solid rgba(16,201,120,0.15)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green2)" strokeWidth="2.2" strokeLinecap="round">{icon}</svg>
                  </div>
                  <div>
                    <div style={{fontSize:'0.9rem',fontWeight:600,color:'var(--text)',marginBottom:4}}>{title}</div>
                    <div style={{fontSize:'0.825rem',color:'var(--muted)',lineHeight:1.65,fontWeight:300}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              {['App Store','Google Play'].map(store => (
                <button key={store} onClick={()=>showToast(store)}
                  style={{background:'var(--card)',border:'1px solid var(--border2)',borderRadius:10,padding:'12px 20px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',transition:'all 0.2s',fontFamily:"'Outfit',sans-serif"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border3)';e.currentTarget.style.transform='translateY(-2px)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.transform='translateY(0)';}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--text)"><path d={store==='App Store'?"M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z":"M3.18 23.76A2 2 0 012 22V2a2 2 0 011.18-1.8L14.45 12 3.18 23.76zm17.44-7.24l-3.24-1.89-3.04 3.04 6.28 3.65a2 2 0 000-4.8zm0-8.96a2 2 0 000 4.8l3.24-1.89-3.28-1.91-3-1.73 3-3.04 3 1.77zM5.41.75L17.38 7.5l-3.04 3.04L3.18.24A2 2 0 015.41.75z"}/></svg>
                  <div style={{textAlign:'left'}}>
                    <div style={{fontSize:'0.6rem',color:'var(--muted)',display:'block'}}>{store==='App Store'?'Download on the':'Get it on'}</div>
                    <div style={{fontSize:'0.875rem',fontWeight:600,color:'var(--text)'}}>{store}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="fade-in-section" style={{display:'flex',justifyContent:'center',alignItems:'center'}}>
            <div style={{width:240,background:'var(--card)',border:'1px solid var(--border2)',borderRadius:32,padding:20,boxShadow:'0 40px 100px rgba(0,0,0,0.7)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:16,fontSize:'0.6rem',color:'var(--muted)'}}><span>9:41</span><span>●●●</span></div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                <div style={{width:36,height:36,borderRadius:12,background:'linear-gradient(135deg,var(--red),var(--red-dark))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem'}}>💉</div>
                <div style={{fontSize:'0.875rem',fontWeight:700,color:'var(--text)'}}>K&A Clinic</div>
              </div>
              {[['var(--red)','Dose 3 Reminder','Tomorrow at 8:00 AM · K&A Clinic'],['var(--green)','Dose 2 Completed ✓','Recorded · March 1, 2026'],['var(--amber)','Slot filling fast','Sunday Mar 15 · 4 slots left']].map(([c,t,s]) => (
                <div key={t} style={{background:'var(--card2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',marginBottom:10,display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:c,marginTop:4,flexShrink:0,display:'inline-block'}} />
                  <div>
                    <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text)'}}>{t}</div>
                    <div style={{fontSize:'0.65rem',color:'var(--muted)'}}>{s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {toast&&<div style={{position:'fixed',bottom:100,left:'50%',transform:'translateX(-50%)',background:'var(--card2)',border:'1px solid var(--border2)',borderRadius:12,padding:'14px 24px',fontSize:'0.875rem',color:'var(--text)',fontWeight:600,zIndex:9999,textAlign:'center',whiteSpace:'nowrap',boxShadow:'0 8px 32px rgba(0,0,0,0.6)',animation:'slideDown 0.2s ease both'}}>{toast}</div>}
      <WaveDivider fill="var(--dark)" path="M0,25 C200,55 450,5 700,35 C900,55 1150,10 1440,30 L1440,60 L0,60 Z" />
    </section>
  );
}

/* ── FAQ & DIRECT CONTACT ASSISTANCE ── */
function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" style={{position:'relative'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'100px 48px 120px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'start'}}>
          <div className="fade-in-section">
            <SectionLabel>FAQ & Support</SectionLabel>
            <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.4rem,4vw,3.3rem)',lineHeight:1.08,letterSpacing:'-0.5px',color:'var(--text)',marginBottom:18,fontWeight:600}}>Common Questions</h2>
            <p style={{fontSize:'0.95rem',color:'var(--muted)',maxWidth:500,lineHeight:1.85,marginBottom:40,fontWeight:300}}>
              Have a question not listed here? Contact us directly by phone or use our live chatbot assistant.
            </p>
            
            {/* EMPHASIZED FAQ CONTACT HIGHLIGHT CARDS */}
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <a href="tel:028123456" style={{textDecoration:'none'}}>
                <div style={{background:'var(--card)',border:'1px solid var(--border3)',borderRadius:12,padding:'18px 20px',display:'flex',alignItems:'center',gap:14,transition:'all 0.2s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--green2)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border3)'}>
                  <div style={{fontSize:'1.3rem'}}>📞</div>
                  <div>
                    <div style={{fontSize:'0.95rem',fontWeight:700,color:'var(--green2)'}}>(02) 8123-4567</div>
                    <div style={{fontSize:'0.75rem',color:'var(--muted)'}}>Mon–Sun · 8:00 AM – 5:00 PM · Direct Hotline</div>
                  </div>
                </div>
              </a>

              <a href="mailto:karabies@clinic.ph" style={{textDecoration:'none'}}>
                <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px',display:'flex',alignItems:'center',gap:14,transition:'all 0.2s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border2)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{fontSize:'1.3rem'}}>✉️</div>
                  <div>
                    <div style={{fontSize:'0.9rem',fontWeight:700,color:'var(--text)'}}>karabies@clinic.ph</div>
                    <div style={{fontSize:'0.75rem',color:'var(--muted)'}}>Inquiries & Follow-up Support</div>
                  </div>
                </div>
              </a>
            </div>
          </div>

          <div className="fade-in-section" style={{display:'flex',flexDirection:'column',gap:10}}>
            {FAQ_ITEMS.map((item,i) => (
              <div key={i} style={{background:'var(--card)',border:`1px solid ${open===i?'var(--border2)':'var(--border)'}`,borderRadius:12,overflow:'hidden',transition:'border-color 0.2s'}}>
                <button onClick={()=>setOpen(open===i?null:i)}
                  style={{width:'100%',background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 20px',fontFamily:"'Outfit',sans-serif",fontSize:'0.9rem',fontWeight:500,color:'var(--text)',textAlign:'left',gap:12}}>
                  {item.q}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{flexShrink:0,transition:'transform 0.25s',transform:open===i?'rotate(45deg)':'rotate(0)'}}>
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                {open===i&&(
                  <div style={{padding:'0 20px 18px',fontSize:'0.825rem',color:'var(--muted)',lineHeight:1.75,fontWeight:300,borderTop:'1px solid var(--border)',animation:'slideDown 0.2s ease both'}}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <WaveDivider fill="var(--dark2)" path="M0,30 C280,60 560,0 840,35 C1060,60 1260,15 1440,25 L1440,60 L0,60 Z" />
    </section>
  );
}

/* ── FOOTER SECTION ── */
function Footer({ onBook }) {
  return (
    <footer style={{background:'var(--dark2)',borderTop:'1px solid var(--border)',padding:'60px 48px 40px'}}>
      <div style={{maxWidth:1160,margin:'0 auto',display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:48,marginBottom:48}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <div style={{width:36,height:36,borderRadius:8,background:'linear-gradient(145deg,var(--red-mid),var(--red-dark))',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontFamily:"'Cormorant Garamond',serif",fontSize:'1.1rem',fontWeight:700}}>K</div>
            <div>
              <div style={{fontSize:'0.95rem',fontWeight:700,color:'var(--text)'}}>K&A Anti-Rabies Vaccine Clinic</div>
              <div style={{fontSize:'0.625rem',color:'var(--green2)',textTransform:'uppercase',letterSpacing:'1.5px',fontWeight:500}}>Protecting Lives Since 2016</div>
            </div>
          </div>
          <p style={{fontSize:'0.825rem',color:'var(--muted)',lineHeight:1.75,maxWidth:300,fontWeight:300}}>DOH-licensed, PhilHealth-accredited clinic providing WHO-protocol rabies immunization and care to our community every day.</p>
        </div>
        {[
          {title:'Quick Links', links:[['Home','#hero'],['Services','#services'],['About Us','#about'],['Schedule','#calendar'],['Our Team','#team'],['Mobile App','#app'],['Contact','#faq']]},
          {title:'Services',   links:[['Vaccination Series','#services'],['Immunization Defense','#services'],['RIG Therapy','#services'],['Wound Care','#services'],['Booster Shots','#services'],['Bite Assessment','#services']]},
          {title:'Contact',    links:[['(02) 8123-4567','tel:028123456'],['karabies@clinic.ph','mailto:karabies@clinic.ph'],['San Juan St., Libon, Albay','#about'],['Mon–Fri 8AM–5PM','#'],['Sat–Sun 8AM–12PM','#']]},
        ].map(col => (
          <div key={col.title}>
            <div style={{fontSize:'0.725rem',fontWeight:600,color:'var(--text)',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:16}}>{col.title}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {col.links.map(([label,href]) => (
                <a key={label} href={href} style={{fontSize:'0.825rem',color:'var(--muted)',textDecoration:'none',transition:'color 0.2s',fontWeight:300}}
                  onMouseEnter={e=>e.target.style.color='var(--green2)'}
                  onMouseLeave={e=>e.target.style.color='var(--muted)'}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{borderTop:'1px solid var(--border)',paddingTop:24,display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:1160,margin:'0 auto'}}>
        <div style={{fontSize:'0.775rem',color:'var(--muted)'}}>© 2026 K&A Anti-Rabies Vaccine Clinic. All rights reserved.</div>
        <button onClick={onBook}
          style={{background:'var(--red)',color:'white',border:'none',padding:'10px 22px',borderRadius:6,fontFamily:"'Outfit',sans-serif",fontSize:'0.825rem',fontWeight:600,cursor:'pointer',letterSpacing:'0.4px',transition:'all 0.2s',boxShadow:'0 4px 16px var(--red-glow)'}}
          onMouseEnter={e=>e.currentTarget.style.background='var(--red-mid)'}
          onMouseLeave={e=>e.currentTarget.style.background='var(--red)'}>
          Book Appointment
        </button>
      </div>
    </footer>
  );
}

/* ── BOOKING MODAL ── */
function BookingModal({ onClose }) {
  const [step,       setStep]       = useState('form');
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [form,   setForm]   = useState({ name:'', phone:'', date:'', time:'8:00 AM – 9:00 AM', purpose:'Rabies Vaccination Series (Follow-up dose)' });
  
  const weekends = [];
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (d.getDay()===0||d.getDay()===6) {
      const slot = getSlotData(d.getFullYear(), d.getMonth(), d.getDate());
      if (slot.status !== 'full') {
        const label = d.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
        weekends.push({label, slots:slot.slots, status:slot.status});
        if (weekends.length>=8) break;
      }
    }
  }

  const validate = () => {
    const e = {};
    if (!form.name.trim()||form.name.trim().length<2) e.name='Please enter your full name';
    if (!form.phone.trim()||!/^[0-9\s\-+()]{7,}$/.test(form.phone)) e.phone='Please enter a valid phone number';
    if (!form.date) e.date='Please select a date';
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    setSubmitError('');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'appointments'), {
        name: (form.name || '').trim(),
        contactNumber: (form.phone || '').trim(),
        date: form.date || '',
        time: form.time || '',
        type: form.purpose || '',
        status: 'pending',
        source: 'online',
        createdAt: Date.now(),
      });
      setStep('success');
    } catch (err) {
      setSubmitError(err?.message || "Something went wrong. Please call us at (02) 8123-4567 instead.");
    } finally {
      setSubmitting(false);
    }
  };

  const iStyle = (field) => ({width:'100%',background:'rgba(255,255,255,0.04)',border:`1.5px solid ${errors[field]?'rgba(200,21,26,0.5)':'var(--border)'}`,borderRadius:8,padding:'10px 13px',fontFamily:"'Outfit',sans-serif",fontSize:'0.875rem',color:'var(--text)',outline:'none',transition:'border-color 0.15s'});

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(8px)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--card2)',border:'1px solid var(--border2)',borderRadius:16,width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',padding:32,boxShadow:'0 40px 100px rgba(0,0,0,0.8)'}}>
        {step==='form' ? (
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.6rem',fontWeight:600,color:'var(--text)'}}>Book an Appointment</h3>
              <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',padding:4,lineHeight:0}} onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p style={{fontSize:'0.8rem',color:'var(--muted)',marginBottom:24}}>Appointments available Saturdays & Sundays · 8:00 AM – 12:00 PM</p>
            {[{label:'Full Name *',key:'name',type:'text',ph:'Juan dela Cruz'},{label:'Contact Number *',key:'phone',type:'tel',ph:'09XX XXX XXXX'}].map(({label,key,type,ph})=>(
              <div key={key} style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'var(--text2)',marginBottom:6}}>{label}</label>
                <input type={type} placeholder={ph} value={form[key]} style={iStyle(key)}
                  onChange={e=>{setForm(p=>({...p,[key]:e.target.value}));setErrors(p=>({...p,[key]:''}));}}
                  onFocus={e=>{if(!errors[key])e.target.style.borderColor='rgba(200,21,26,0.4)';}} onBlur={e=>{if(!errors[key])e.target.style.borderColor='var(--border)';}} />
                {errors[key]&&<div style={{fontSize:'0.7rem',color:'#f87171',marginTop:4}}>{errors[key]}</div>}
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'var(--text2)',marginBottom:6}}>Preferred Date *</label>
              <select value={form.date} style={iStyle('date')} onChange={e=>{setForm(p=>({...p,date:e.target.value}));setErrors(p=>({...p,date:''}));}}>
                <option value="">Select a date…</option>
                {weekends.map(w=><option key={w.label} value={w.label}>{w.label} {w.status==='limited'?`(${w.slots} slots left)`:`(${w.slots} slots)`}</option>)}
              </select>
              {errors.date&&<div style={{fontSize:'0.7rem',color:'#f87171',marginTop:4}}>{errors.date}</div>}
            </div>
            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'var(--text2)',marginBottom:6}}>Time Slot</label>
              <select value={form.time} style={iStyle('')} onChange={e=>setForm(p=>({...p,time:e.target.value}))}>
                {['8:00 AM – 9:00 AM','9:00 AM – 10:00 AM','10:00 AM – 11:00 AM','11:00 AM – 12:00 PM'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:24}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'var(--text2)',marginBottom:6}}>Purpose</label>
              <select value={form.purpose} style={iStyle('')} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))}>
                {['Rabies Vaccination Series (Follow-up dose)','New Patient Immunization','Immunity Booster Dose','RIG Biologic Therapy','Clinical Wound Assessment','General Consultation'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            {submitError && <div style={{fontSize:'0.75rem',color:'#f87171',marginBottom:14,background:'rgba(200,21,26,0.08)',border:'1px solid rgba(200,21,26,0.25)',borderRadius:8,padding:'10px 12px'}}>{submitError}</div>}
            <div style={{display:'flex',gap:10}}>
              <button onClick={onClose} disabled={submitting} style={{flex:1,background:'transparent',color:'var(--muted)',border:'1px solid var(--border)',padding:'11px',borderRadius:9,fontFamily:"'Outfit',sans-serif",fontSize:'0.875rem',cursor:submitting?'not-allowed':'pointer',transition:'all 0.15s',opacity:submitting?0.6:1}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.color='var(--text)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--muted)';}}>Cancel</button>
              <button onClick={submit} disabled={submitting} style={{flex:2,background:'var(--red)',color:'white',border:'none',padding:'11px',borderRadius:9,fontFamily:"'Outfit',sans-serif",fontSize:'0.875rem',fontWeight:600,cursor:submitting?'not-allowed':'pointer',boxShadow:'0 4px 20px var(--red-glow)',transition:'all 0.15s',opacity:submitting?0.7:1}}
                onMouseEnter={e=>!submitting&&(e.currentTarget.style.background='var(--red-mid)')} onMouseLeave={e=>!submitting&&(e.currentTarget.style.background='var(--red)')}>{submitting?'Booking…':'Confirm Booking'}</button>
            </div>
          </>
        ) : (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:'3rem',marginBottom:16}}>✅</div>
            <h4 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.6rem',fontWeight:600,color:'var(--text)',marginBottom:10}}>Appointment Confirmed!</h4>
            <p style={{fontSize:'0.875rem',color:'var(--muted)',lineHeight:1.7,marginBottom:8}}>Your appointment for <strong style={{color:'var(--text)'}}>{form.date}</strong> at <strong style={{color:'var(--text)'}}>{form.time}</strong> has been recorded.</p>
            <p style={{fontSize:'0.8rem',color:'var(--muted)',lineHeight:1.7,marginBottom:24}}>Purpose: <strong style={{color:'var(--text2)'}}>{form.purpose}</strong><br/>We'll see you at K&A Clinic, {form.name.split(' ')[0]}!</p>
            <div style={{background:'rgba(31,173,86,0.06)',border:'1px solid rgba(31,173,86,0.15)',borderRadius:10,padding:'12px 16px',marginBottom:24,fontSize:'0.8rem',color:'rgba(31,173,86,0.9)',textAlign:'left'}}>📌 Please bring a valid ID and PhilHealth card (if applicable) on your appointment day.</div>
            <button onClick={onClose} style={{width:'100%',background:'var(--red)',color:'white',border:'none',padding:'12px',borderRadius:9,fontFamily:"'Outfit',sans-serif",fontSize:'0.875rem',fontWeight:600,cursor:'pointer',boxShadow:'0 4px 20px var(--red-glow)'}}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── AI CHATBOT COMPONENT ── */
const DOH_SYSTEM_INSTRUCTION = `
You are the official AI Health Assistant for K&A Anti-Rabies Clinic located at San Juan St., Libon, Albay, Philippines.
Your responses MUST adhere strictly to the Philippine Department of Health (DOH) Anti-Rabies Vaccination Guidelines and clinic policies.

CRITICAL RULES FOR INTENT DISAMBIGUATION:
- Rule 1: If the user asks about 'hours', 'schedule', 'opening time', 'when open', 'clinic schedule', 'operating hours', 'what time', or 'when close', ALWAYS answer with K&A Clinic's physical operating hours (8:00 AM – 5:00 PM, Monday to Sunday) and walk-in/appointment availability.
- Rule 2: Explain the 5-dose Day 0, 3, 7, 14, 28 vaccination scheme if asked about 'vaccine doses', 'schedule', 'injection intervals', or 'treatment schedule'.
- Rule 3: Do not use emergency or preventive labels; keep descriptions clinical and patient-friendly.

CATEGORY A — CLINIC OPERATING HOURS & LOCATION:
🏥 K&A Clinic Operating Information:
• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)
• Immediate Walk-ins: Accepted Monday – Friday
• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)
• Address: San Juan St., Libon, Albay

CATEGORY B — VACCINATION TREATMENT PROTOCOLS:
💉 DOH Anti-Rabies Vaccination Protocols:
• Essen Scheme: 5 Doses on Day 0 (Bite/Consultation Date), Day 3, Day 7, Day 14, and Day 28.
• Category III Exposures: Requires ERIG/HRIG on Day 0 alongside Dose 1.
• Pre-exposure Series: 3 Doses on Day 0, Day 7, and Day 21/28.

CATEGORY C — ANIMAL BITE FIRST AID:
🧼 Immediate First Aid:
1. Wash wound with soap and running water for 15+ minutes.
2. Apply antiseptic (povidone-iodine or 70% alcohol).
3. Seek medical evaluation at K&A Clinic immediately.
⚠️ Do NOT apply garlic, coins, or traditional concoctions.
`;

async function fetchGeminiLanding(prompt, history = []) {
  const apiKey = "AQ.Ab8RN6KyXd8sLzw7bUJnfzLna_zJ5R4c-GxfdljjcShIEcySZg";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const contents = [
    { role: 'user', parts: [{ text: DOH_SYSTEM_INSTRUCTION }] },
    ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.html || m.text || '' }] })),
    { role: 'user', parts: [{ text: prompt }] }
  ];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });
    if (res.ok) {
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) return txt.trim();
    }
  } catch (e) {
    console.warn('Gemini fetch error:', e);
  }
  
  const q = prompt.toLowerCase();
  if (['hour','opening time','when open','when close','close time','operating','walk-in','location','address','where'].some(kw => q.includes(kw))) {
    return "🏥 K&A Clinic Operating Information:\n• Operating Hours: 8:00 AM – 5:00 PM (Monday to Sunday)\n• Walk-in Vaccination: Accepted Monday – Friday\n• Scheduled Appointments: Saturdays & Sundays (8:00 AM – 12:00 PM)\n• Address: San Juan St., Libon, Albay\n• Hotline: (02) 8123-4567";
  }
  if (['first aid','bitten','scratched','what to do','dog bite','cat scratch'].some(kw => q.includes(kw))) {
    return "🧼 Immediate First Aid for Animal Bites/Scratches:\n1. Wash wound with soap and running water for 15+ minutes.\n2. Apply antiseptic (povidone-iodine or 70% alcohol).\n3. Seek medical evaluation at K&A Clinic immediately.\n⚠️ Do NOT apply garlic, coins, or traditional concoctions.";
  }
  if (['dose','essen','how many injection','how many shot','next shot','next dose'].some(kw => q.includes(kw))) {
    return "💉 DOH Anti-Rabies Vaccination Protocols:\n• Essen Scheme: 5 Doses on Day 0, Day 3, Day 7, Day 14, Day 28.\n• Category III Exposures: ERIG/HRIG on Day 0 alongside Dose 1.\n• Pre-exposure Series: 3 Doses on Day 0, Day 7, and Day 21/28.";
  }
  if (['book','appointment','reserve','slot'].some(kw => q.includes(kw))) {
    return "📅 To book an appointment, click the \"Book Appointment\" button on our website or call us at (02) 8123-4567. Weekend slots (Sat & Sun, 8AM–12PM) are available.";
  }
  return "👋 Hello! I'm the K&A Health Assistant. I can help with rabies first aid, vaccination schedules, clinic operating hours, and appointment booking. How can I help you?";
}

function Chatbot() {
  const [open,       setOpen]       = useState(false);
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [typing,     setTyping]     = useState(false);
  const [badge,      setBadge]      = useState(false);
  const [quickShown, setQuickShown] = useState(true);
  const msgsRef = useRef(null);

  useEffect(() => {
    const id = 'ka-chatbot-kf';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = `
@keyframes cbTypingBounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
@keyframes cbPulseGlow{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,0.5)}50%{opacity:.85;box-shadow:0 0 0 4px rgba(52,211,153,0)}}
.cb-no-scrollbar::-webkit-scrollbar{display:none}
.cb-no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}
.cb-chip{transition:all 0.18s ease}.cb-chip:active{transform:scale(0.95)}
`;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => { const t=setTimeout(()=>{if(!open)setBadge(true);},3000); return ()=>clearTimeout(t); }, [open]);
  useEffect(() => { if(msgsRef.current)msgsRef.current.scrollTop=msgsRef.current.scrollHeight; }, [messages,typing]);

  const now = () => new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  const formatMessage = (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  };

  const addMsg = useCallback((role,html) => { setMessages(m=>[...m,{role,html,time:now()}]); }, []);

  const toggle = () => {
    if (!open) {
      setBadge(false);
      setMessages(m => {
        if (m.length === 0) {
          return [{ role: 'bot', html: formatMessage("👋 Hello! I'm the K&A Health Assistant. I can answer questions about rabies first aid, vaccination schedules, and clinic services. Call us anytime at (02) 8123-4567 or ask your question here!"), time: now() }];
        }
        return m;
      });
    }
    setOpen(o => !o);
  };

  const send = useCallback(async (msg) => {
    const text = (msg||input).trim(); if (!text) return;
    setInput(''); setQuickShown(false); addMsg('user', formatMessage(text)); setTyping(true);
    const replyText = await fetchGeminiLanding(text, messages);
    setTyping(false);
    addMsg('bot', formatMessage(replyText));
  }, [input, messages, addMsg]);

  const QUICK = [['🕒 Operating Hours','What are the clinic\'s operating hours and location?'],['💉 Vaccine Doses','What is the 5-dose vaccination schedule?'],['🧼 Bite First Aid','What is the immediate first aid for a dog or cat bite?'],['📅 Book Appointment','How do I book an appointment at K&A Clinic?'],['📞 Contact Info','What is the clinic hotline number?']];

  const stethSvg = (color, size=14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.8 2.3A.3.3 0 105 2H4a2 2 0 00-2 2v5a6 6 0 006 6v0a6 6 0 006-6V4a2 2 0 00-2-2h-1a.2.2 0 10.3.3" />
      <path d="M8 15v1a6 6 0 006 6v0a6 6 0 006-6v-4" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  );

  return (
    <>
      {!open && (
        <button onClick={toggle} aria-label="Open Chat Assistant"
          style={{position:'fixed',bottom:24,right:24,zIndex:850,width:56,height:56,borderRadius:'50%',background:'linear-gradient(135deg,var(--red),#991B1B)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px var(--red-glow), 0 2px 8px rgba(0,0,0,0.1)',transition:'all 0.2s cubic-bezier(.34,1.2,.64,1)'}}
          onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.08)';e.currentTarget.style.boxShadow='0 12px 32px var(--red-glow), 0 4px 12px rgba(0,0,0,0.15)';}}
          onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 8px 24px var(--red-glow), 0 2px 8px rgba(0,0,0,0.1)';}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          {badge&&<div style={{position:'absolute',top:-2,right:-2,width:18,height:18,background:'#10B981',borderRadius:'50%',border:'2.5px solid var(--dark,#111)',fontSize:'0.6rem',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800}}>1</div>}
        </button>
      )}

      <div style={{position:'fixed',bottom:24,right:24,zIndex:900,width:380,maxWidth:'92vw',height:540,background:'var(--card2,#1a1a2e)',border:'1px solid var(--border2,#2a2a3e)',borderRadius:24,boxShadow:'0 32px 80px rgba(0,0,0,0.7)',display:'flex',flexDirection:'column',overflow:'hidden',transform:open?'translateY(0) scale(1)':'translateY(20px) scale(0.95)',opacity:open?1:0,pointerEvents:open?'all':'none',transition:'all 0.25s cubic-bezier(.34,1.2,.64,1)',transformOrigin:'bottom right'}}>

        <div style={{padding:'16px 16px 16px 20px',background:'linear-gradient(135deg,var(--red,#DC2626),#B91C1C,#991B1B)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(255,255,255,0.2)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 2px 8px rgba(0,0,0,0.1)'}}>
              {stethSvg('#FFFFFF', 20)}
            </div>
            <div>
              <div style={{fontSize:'0.9375rem',fontWeight:800,color:'#FFFFFF',letterSpacing:'-0.01em'}}>K&A Health Assistant</div>
              <div style={{fontSize:'0.6875rem',color:'rgba(255,255,255,0.75)',display:'flex',alignItems:'center',gap:6,fontWeight:500,letterSpacing:'0.02em'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'#34D399',display:'inline-block',flexShrink:0,animation:'cbPulseGlow 2s ease infinite'}} />
                Online · Hotline: (02) 8123-4567
              </div>
            </div>
          </div>
          <button onClick={toggle} aria-label="Close Chat"
            style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'50%',width:32,height:32,cursor:'pointer',color:'white',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.25)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div ref={msgsRef} className="cb-no-scrollbar" style={{flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden',padding:16,display:'flex',flexDirection:'column',gap:14}}>
          {messages.map((m,i) => (
            <div key={i} style={{display:'flex',gap:8,alignItems:m.role==='user'?'flex-end':'flex-start',flexDirection:m.role==='user'?'row-reverse':'row'}}>
              {m.role==='user' ? (
                <div style={{width:30,height:30,borderRadius:'50%',flexShrink:0,background:'rgba(255,255,255,0.08)',border:'1px solid var(--border,#333)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',marginTop:4}}>👤</div>
              ) : (
                <div style={{width:30,height:30,borderRadius:'50%',flexShrink:0,background:'rgba(220,38,38,0.15)',border:'1px solid rgba(220,38,38,0.25)',display:'flex',alignItems:'center',justifyContent:'center',marginTop:4,boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                  {stethSvg('#DC2626')}
                </div>
              )}
              <div style={{maxWidth:'85%',display:'flex',flexDirection:'column'}}>
                <div style={{
                  padding:'12px 14px',
                  borderRadius:m.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',
                  fontSize:'0.8125rem',lineHeight:1.6,
                  background:m.role==='user'?'var(--red,#DC2626)':m.role==='escalate'?'rgba(59,130,246,0.15)':'var(--card3,#222)',
                  color:m.role==='user'?'#FFFFFF':m.role==='escalate'?'#93c5fd':'var(--text,#e8e8e8)',
                  border:m.role==='bot'?'1px solid var(--border,#333)':m.role==='escalate'?'1px solid rgba(59,130,246,0.25)':'none',
                  boxShadow:m.role==='user'?'0 2px 8px rgba(220,38,38,0.2)':'0 1px 3px rgba(0,0,0,0.06)'
                }} dangerouslySetInnerHTML={{__html:m.html}} />
                <span style={{fontSize:'0.625rem',color:'var(--muted,#888)',marginTop:4,fontWeight:500,textAlign:m.role==='user'?'right':'left'}}>{m.time}</span>
              </div>
            </div>
          ))}
          {typing&&(
            <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
              <div style={{width:30,height:30,borderRadius:'50%',flexShrink:0,background:'rgba(220,38,38,0.15)',border:'1px solid rgba(220,38,38,0.25)',display:'flex',alignItems:'center',justifyContent:'center',marginTop:4}}>
                {stethSvg('#DC2626')}
              </div>
              <div style={{padding:'12px 16px',background:'var(--card3,#222)',border:'1px solid var(--border,#333)',borderRadius:'18px 18px 18px 4px',display:'flex',gap:5,alignItems:'center',boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                {[0,0.15,0.3].map((delay,i) => <span key={i} style={{width:6,height:6,borderRadius:'50%',background:'var(--muted,#888)',animation:`cbTypingBounce 1.2s ${delay}s ease infinite`,display:'inline-block'}} />)}
              </div>
            </div>
          )}
        </div>

        {quickShown&&messages.length>0&&(
          <div className="cb-no-scrollbar" style={{display:'flex',alignItems:'center',gap:8,overflowX:'auto',padding:'10px 16px',borderTop:'1px solid var(--border,#333)',flexShrink:0,WebkitOverflowScrolling:'touch'}}>
            {QUICK.map(([label,msg]) => (
              <button key={label} className="cb-chip" onClick={()=>send(msg)}
                style={{display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap',flexShrink:0,background:'var(--subtle,rgba(255,255,255,0.04))',border:'1px solid var(--border,#333)',borderRadius:9999,padding:'7px 14px',fontFamily:"'Outfit',sans-serif",fontSize:'0.75rem',fontWeight:600,color:'var(--muted,#999)',cursor:'pointer',boxShadow:'0 1px 2px rgba(0,0,0,0.08)'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--red,#DC2626)';e.currentTarget.style.background='rgba(220,38,38,0.08)';e.currentTarget.style.color='var(--text,#e8e8e8)';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border,#333)';e.currentTarget.style.background='var(--subtle,rgba(255,255,255,0.04))';e.currentTarget.style.color='var(--muted,#999)';}}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div style={{padding:12,borderTop:'1px solid var(--border,#333)',flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),send())}
            placeholder="Ask about rabies care or K&A Clinic…"
            style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border,#333)',borderRadius:9999,padding:'10px 16px',fontFamily:"'Outfit',sans-serif",fontSize:'0.75rem',color:'var(--text,#e8e8e8)',outline:'none',transition:'all 0.2s ease'}}
            onFocus={e=>{e.target.style.background='rgba(255,255,255,0.06)';e.target.style.borderColor='var(--red,#DC2626)';e.target.style.boxShadow='0 0 0 3px rgba(220,38,38,0.12)';}}
            onBlur={e=>{e.target.style.background='rgba(255,255,255,0.04)';e.target.style.borderColor='var(--border,#333)';e.target.style.boxShadow='none';}} />
          <button onClick={()=>send()} disabled={!input.trim()&&!typing} aria-label="Send message"
            style={{width:36,height:36,borderRadius:'50%',background:'var(--red,#DC2626)',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,boxShadow:'0 4px 12px var(--red-glow,rgba(220,38,38,0.3))',transition:'all 0.15s ease',opacity:(!input.trim()&&!typing)?0.5:1}}
            onMouseEnter={e=>{if(input.trim())e.currentTarget.style.background='var(--red-mid,#B91C1C)';}}
            onMouseLeave={e=>e.currentTarget.style.background='var(--red,#DC2626)'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </>
  );
}

/* ── MAIN LANDING PAGE EXPORT ── */
export default function LandingPage({ onAdminClick }) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('hero');
  const pageRef = useRef(null);

  useFadeIn(pageRef);

  useEffect(() => {
    const id = 'ka-landing-styles';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = globalStyles;
      document.head.appendChild(s);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  useEffect(() => {
    const fn = e => { if (e.key==='Escape'&&bookingOpen) setBookingOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [bookingOpen]);

  /* Scroll position tracking for dynamic navbar active tab highlight */
  useEffect(() => {
    const sections = ['hero', 'services', 'about', 'calendar', 'team', 'app', 'faq'];
    const handleScroll = () => {
      const scrollPos = window.scrollY + 180;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el && el.offsetTop <= scrollPos) {
          setActiveTab(sections[i]);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={pageRef} style={{fontFamily:"'Outfit',sans-serif",background:'var(--dark)',color:'var(--text)',overflowX:'hidden',lineHeight:1.6}}>
      <Nav
        onBook={() => setBookingOpen(true)}
        onAdminClick={onAdminClick}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      <Hero onBook={() => setBookingOpen(true)} />
      <About />
      <Services />
      <Calendar onBook={() => setBookingOpen(true)} />
      <Team />
      <AppSection />
      <FAQ />
      <Footer onBook={() => setBookingOpen(true)} />
      <Chatbot />
      {bookingOpen && <BookingModal onClose={() => setBookingOpen(false)} />}
    </div>
  );
}