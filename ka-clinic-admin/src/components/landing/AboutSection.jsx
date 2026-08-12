import React from 'react';
import { Target, Eye } from 'lucide-react';
import SectionLabel from './SectionLabel';
import ClinicMap from './ClinicMap';
import { MISSION_VISION } from './constants';

const MV_ICONS = { target: Target, eye: Eye };

const STAT_ITEMS = [
  {
    num: '5,800+',
    label: 'Patients Served',
    desc: 'Bite & exposure cases successfully treated',
  },
  {
    num: '10 yrs',
    label: 'In Operation',
    desc: 'Continuous WHO-standard care since 2016',
  },
  {
    num: '7 days',
    label: 'Open Weekly',
    desc: 'Daily walk-ins & weekend booking slots',
  },
  {
    num: '98%',
    label: 'Completion Rate',
    desc: 'Patients completing full 5-dose protocol',
  },
];

export default function AboutSection() {
  return (
    <section id="about" style={{ background: '#FFFFFF', position: 'relative', overflow: 'hidden', padding: '90px 48px 80px', borderTop: '1px solid var(--border)' }}>
      {/* Subtle Technical Mesh Grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#F1F5F9 1px,transparent 1px),linear-gradient(90deg,#F1F5F9 1px,transparent 1px)', backgroundSize: '64px 64px', opacity: 0.6, pointerEvents: 'none' }} />
      
      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        
        {/* Top Grid: Map on Left, About Text & Mission/Vision on Right */}
        <div className="ka-about-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center', marginBottom: 40 }}>

          {/* Left: branded map */}
          <div className="fade-in-section" style={{ width: '100%' }}>
            <ClinicMap />
          </div>

          {/* Right: heading, copy, and mission/vision */}
          <div className="fade-in-section" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <SectionLabel>ABOUT THE CLINIC</SectionLabel>
            <h2 style={{ fontSize: 'clamp(2.2rem, 3.5vw, 3.2rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', color: 'var(--text)', marginBottom: 20 }}>
              Dedicated to <br />
              <span style={{ color: 'var(--red)' }}>Community Safety.</span>
            </h2>
            
            <p style={{ fontSize: '1rem', color: 'var(--muted)', maxWidth: 520, lineHeight: 1.8, marginBottom: 20, fontWeight: 400 }}>
              K&A Anti-Rabies Vaccine Clinic has been protecting the community since 2016. We provide WHO-approved rabies biologics administered by trained health professionals.
            </p>

            {/* Mission / Vision */}
            <div className="ka-mission-vision" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {MISSION_VISION.map(mv => {
                const Icon = MV_ICONS[mv.icon];
                return (
                  <div key={mv.label}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--red-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Icon size={18} color="var(--red)" strokeWidth={2.2} />
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{mv.label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.65, fontWeight: 400 }}>{mv.text}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* 4 Stat Cards placed DIRECTLY below the Map & About section with no gap */}
        <div className="fade-in-section ka-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 }}>
          {STAT_ITEMS.map((item) => (
            <div
              key={item.label}
              style={{
                background: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: '24px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'default',
                boxShadow: '0 6px 20px rgba(15,23,42,0.03)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 16px 36px rgba(227,24,55,0.1)';
                e.currentTarget.style.borderColor = 'rgba(227,24,55,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,23,42,0.03)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {/* Top red accent indicator line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 24,
                  right: 24,
                  height: 3,
                  borderRadius: '0 0 4px 4px',
                  background: 'linear-gradient(90deg, var(--red) 0%, rgba(227,24,55,0.2) 100%)',
                  opacity: 0.85,
                }}
              />

              {/* Main Card Content */}
              <div style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
                <div
                  style={{
                    fontSize: 'clamp(1.8rem, 2.4vw, 2.2rem)',
                    fontWeight: 800,
                    color: 'var(--text)',
                    letterSpacing: '-1px',
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {item.num}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px', marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5, fontWeight: 400 }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
