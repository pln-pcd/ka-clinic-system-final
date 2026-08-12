import React from 'react';
import { Syringe, ShieldCheck, Activity, CheckCircle2 } from 'lucide-react';

const STEP_DATA = [
  {
    step: '1',
    day: 'Day 0',
    title: 'Dose 1 & Assessment',
    desc: 'Wound wash, triage & Dose 1 (+ RIG if Cat III)',
    active: true,
  },
  {
    step: '2',
    day: 'Day 3',
    title: 'Dose 2 Follow-Up',
    desc: 'Second dose for early antibody protection',
    active: false,
  },
  {
    step: '3',
    day: 'Day 7',
    title: 'Dose 3 Booster',
    desc: 'Third dose solidifying immunity response',
    active: false,
  },
  {
    step: '4',
    day: 'Day 14',
    title: 'Dose 4 Follow-Up',
    desc: 'Fourth dose reinforcing long-term defense',
    active: false,
  },
  {
    step: '5',
    day: 'Day 28',
    title: 'Dose 5 & Immunity',
    desc: 'Final dose & vaccination certificate issued',
    active: false,
  },
];

const SERVICE_CARDS = [
  {
    icon: Syringe,
    tag: 'Post-Exposure (PEP)',
    title: 'WHO 5-Dose Essen Protocol',
    desc: 'Full WHO & DOH post-exposure prophylaxis for animal bites and scratches.',
    details: [
      'Standard Essen scheme: Doses on Days 0, 3, 7, 14, and 28',
      'RIG (Equine/Human) infiltrated directly at wound site for Cat III',
      'Administered by licensed clinical nurses following strict cold-chain',
    ],
  },
  {
    icon: ShieldCheck,
    tag: 'Pre-Exposure (PrEP)',
    title: 'Preventive Immunization',
    desc: 'Prophylactic 3-dose series for high-risk workers and frequent animal handlers.',
    details: [
      '3-dose preventive schedule: Given on Days 0, 7, and 21 or 28',
      'Ideal for vets, pet groomers, animal rescuers, & field workers',
      'Simplifies post-bite treatment to just 2 booster doses if exposed later',
    ],
  },
  {
    icon: Activity,
    tag: 'Compliance & Tracking',
    title: 'Dose Adherence System',
    desc: 'Real-time protocol tracking preventing missed doses and treatment drop-offs.',
    details: [
      'Digital patient treatment record logged securely on clinic ledger',
      'Automated SMS & app reminders sent 24 hours before each dose',
      'Official Completion Certificate generated upon final Dose 5',
    ],
  },
];

export default function HowItWorksSection() {
  return (
    <section id="howitworks" style={{ background: '#0F172A', padding: '48px 48px', position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 76px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Background Soft Aura */}
      <div style={{ position: 'absolute', top: '-15%', right: '-5%', width: '45vw', height: '45vw', background: 'radial-gradient(circle, rgba(227,24,55,0.12) 0%, rgba(15,23,42,0) 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', left: '-5%', width: '35vw', height: '35vw', background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(15,23,42,0) 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        
        {/* Main Section Header */}
        <div className="fade-in-section" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 18, height: 2, background: '#EF4444', display: 'inline-block', borderRadius: 2 }} />
            CLINICAL VACCINATION PROTOCOL
          </div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2.3rem)', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2, letterSpacing: '-0.8px', margin: 0 }}>
            From bite to full immunity, <br />
            <span style={{ color: '#EF4444' }}>in five tracked doses.</span>
          </h2>
        </div>

        {/* 5-Step Timeline Grid */}
        <div className="fade-in-section" style={{ background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 22, padding: '22px 20px', backdropFilter: 'blur(12px)', marginBottom: 18, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {STEP_DATA.map((s) => (
              <div
                key={s.day}
                style={{
                  background: s.active ? 'linear-gradient(145deg, rgba(227,24,55,0.18), rgba(30,41,59,0.9))' : 'rgba(15,23,42,0.5)',
                  border: s.active ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 14,
                  padding: '16px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  transition: 'all 0.25s ease',
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = s.active ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.08)';
                }}
              >
                {/* Step Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: s.active ? '#EF4444' : 'rgba(255,255,255,0.08)',
                    color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: s.active ? '0 0 14px rgba(239,68,68,0.5)' : 'none',
                  }}>
                    {s.step}
                  </div>
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', fontWeight: 700,
                    color: s.active ? '#EF4444' : '#94A3B8', letterSpacing: '0.5px',
                    background: s.active ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                    padding: '3px 9px', borderRadius: 9999, border: s.active ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)'
                  }}>
                    {s.day}
                  </span>
                </div>

                {/* Step Title & Detailed Text */}
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 6, lineHeight: 1.3 }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', lineHeight: 1.5, fontWeight: 400 }}>
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 Detailed Protocol Service Cards */}
        <div className="fade-in-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {SERVICE_CARDS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                style={{
                  background: 'rgba(30,41,59,0.5)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  padding: '18px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 11,
                  transition: 'all 0.25s ease',
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
                  e.currentTarget.style.background = 'rgba(30,41,59,0.75)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.background = 'rgba(30,41,59,0.5)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Icon size={19} color="#EF4444" strokeWidth={2.2} />
                  </div>
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 800, color: '#EF4444',
                    textTransform: 'uppercase', letterSpacing: '1px',
                    background: 'rgba(239,68,68,0.08)', padding: '4px 10px',
                    borderRadius: 9999, border: '1px solid rgba(239,68,68,0.15)'
                  }}>
                    {s.tag}
                  </span>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 4, letterSpacing: '-0.2px' }}>
                    {s.title}
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.5, fontWeight: 400, marginBottom: 10 }}>
                    {s.desc}
                  </p>

                  {/* Bulleted Clinical Protocol Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {s.details.map((detail, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <CheckCircle2 size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 3 }} />
                        <span style={{ fontSize: '0.72rem', color: '#CBD5E1', lineHeight: 1.4, fontWeight: 400 }}>
                          {detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}


