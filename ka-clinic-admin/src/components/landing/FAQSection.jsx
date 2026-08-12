import React, { useState } from 'react';
import SectionLabel from './SectionLabel';
import { FAQ_ITEMS } from './constants';
import { ShieldAlert, Phone, MapPin, Plus, Minus, HelpCircle } from 'lucide-react';

export default function FAQSection() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" style={{ padding: '56px 48px', background: '#0B101D', position: 'relative', overflow: 'hidden', color: '#FFFFFF', minHeight: 'calc(100vh - 76px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Deep Navy Technical Mesh Grid & Glow Overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '20%', left: '15%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 64, alignItems: 'start' }}>
          
          {/* LEFT COLUMN: TITLE & CONTACT INFO */}
          <div className="fade-in-section">
            <SectionLabel>FAQ & HELP CENTER</SectionLabel>
            <h2 style={{ fontSize: 'clamp(1.9rem, 3vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', color: '#FFFFFF', marginBottom: 12 }}>
              Common <span style={{ color: '#EF4444' }}>Questions.</span>
            </h2>
            <p style={{ fontSize: '0.92rem', color: '#94A3B8', maxWidth: 480, lineHeight: 1.6, marginBottom: 22, fontWeight: 400 }}>
              Everything you need to know about rabies exposure, weekend appointments, clinic location, and vaccine protocols.
            </p>

            {/* Quick Information Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  icon: <ShieldAlert size={18} color="#EF4444" />,
                  title: 'Daily Walk-In Emergency Triage',
                  desc: 'Immediate priority care for active animal bite exposures Monday through Sunday, 8:00 AM – 5:00 PM.'
                },
                {
                  icon: <Phone size={18} color="#EF4444" />,
                  title: 'Direct Appointment & Hotline',
                  desc: '+63 912 345 6789 · Call for weekend appointment booking and medical assistance.'
                },
                {
                  icon: <MapPin size={18} color="#EF4444" />,
                  title: 'Clinic Location & Operating Hours',
                  desc: 'San Juan St., Libon, Albay · Open daily Mon–Sun from 8:00 AM to 5:00 PM.'
                },
              ].map(c => (
                <div key={c.title} style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(8px)'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2
                  }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>{c.title}</div>
                    <div style={{ fontSize: '0.77rem', color: '#94A3B8', fontWeight: 400, lineHeight: 1.45 }}>{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: DARK ACCORDION LIST */}
          <div className="fade-in-section" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={i} style={{
                  background: isOpen ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${isOpen ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: isOpen ? '0 10px 30px rgba(239, 68, 68, 0.12)' : 'none'
                }}>
                  <button onClick={() => setOpen(isOpen ? null : i)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      padding: '13px 18px',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: isOpen ? '#FFFFFF' : '#CBD5E1',
                      textAlign: 'left',
                      gap: 16
                    }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <HelpCircle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
                      {item.q}
                    </span>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: isOpen ? '#EF4444' : 'rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.2s ease'
                    }}>
                      {isOpen ? <Minus size={13} color="#FFFFFF" /> : <Plus size={13} color="#94A3B8" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: '0 18px 14px 43px',
                      fontSize: '0.82rem',
                      color: '#94A3B8',
                      lineHeight: 1.6,
                      fontWeight: 400,
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      paddingTop: 12,
                      animation: 'fadeIn 0.25s ease both'
                    }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
