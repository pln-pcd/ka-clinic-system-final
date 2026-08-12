import React from 'react';
import SectionLabel from './SectionLabel';
import { TEAM } from './constants';
import { Stethoscope, UserCheck } from 'lucide-react';

export default function TeamSection() {
  const doctor = TEAM[0];
  const nurses = TEAM.slice(1);

  return (
    <section id="team" style={{ padding: '52px 48px', background: '#FFFFFF', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 76px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Subtle background grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#F1F5F9 1px,transparent 1px),linear-gradient(90deg,#F1F5F9 1px,transparent 1px)', backgroundSize: '64px 64px', opacity: 0.5, pointerEvents: 'none' }} />
      
      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        
        {/* Section Header */}
        <div className="fade-in-section" style={{ textAlign: 'center', marginBottom: 28 }}>
          <SectionLabel>OUR PROFESSIONALS</SectionLabel>
          <h2 style={{ fontSize: 'clamp(1.9rem, 3vw, 2.5rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', color: 'var(--text)', marginBottom: 10 }}>
            Meet the <span style={{ color: 'var(--red)' }}>Team.</span>
          </h2>
          <p style={{ fontSize: '0.92rem', color: 'var(--muted)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6, fontWeight: 400 }}>
            Licensed medical doctors and registered nurses dedicated to providing fast, professional rabies care.
          </p>
        </div>

        <div className="fade-in-section" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* FEATURED LEAD PHYSICIAN CARD (CENTERED ALIGNMENT) */}
          <div style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF5F5 100%)',
            border: '1.5px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 18,
            padding: '20px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.05)',
            transition: 'all 0.2s ease',
            maxWidth: 480,
            margin: '0 auto',
            width: '100%'
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = '#EF4444'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)'; }}
          >
            {/* Centered Doctor Avatar */}
            <div style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #EF4444, #DC2626)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(239, 68, 68, 0.28)',
              marginBottom: 10,
              flexShrink: 0
            }}>
              <span style={{
                fontSize: '1.25rem',
                fontWeight: 900,
                color: '#FFFFFF',
                lineHeight: 1,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%'
              }}>
                {doctor.init}
              </span>
            </div>

            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', marginBottom: 3 }}>
              {doctor.name}
            </div>

            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#EF4444', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 9999, padding: '3px 12px', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Stethoscope size={11} color="#EF4444" /> {doctor.role}
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              {doctor.detail}
            </p>
          </div>

          {/* REGISTERED STAFF NURSES GRID */}
          <div>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <UserCheck size={13} color="#64748B" /> REGISTERED STAFF NURSES
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {nurses.map(m => (
                <div key={m.name} style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: '18px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.02)'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.02)'; }}>
                  
                  {/* Centered Nurse Avatar */}
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1E293B, #0F172A)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 9,
                    boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
                    flexShrink: 0
                  }}>
                    <span style={{
                      fontSize: '1.02rem',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      lineHeight: 1,
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%'
                    }}>
                      {m.init}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>
                    {m.name}
                  </div>

                  <div style={{ fontSize: '0.64rem', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 800, marginBottom: 6 }}>
                    {m.role}
                  </div>

                  <div style={{ fontSize: '0.77rem', color: 'var(--muted)', lineHeight: 1.45, fontWeight: 400 }}>
                    {m.detail}
                  </div>

                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
