import React, { useState } from 'react';
import { Syringe, ShieldCheck, Droplet, Cross, Pill, ClipboardList, ArrowRight, X, Clock, Calendar, UserCheck, Activity } from 'lucide-react';
import { SERVICES } from './constants';

const SERVICE_ICONS = { syringe: Syringe, shield: ShieldCheck, droplet: Droplet, cross: Cross, pill: Pill, clipboard: ClipboardList };

export default function ServicesSection() {
  const [selectedService, setSelectedService] = useState(null);

  return (
    <section id="services" style={{ padding: '56px 48px', background: '#0F172A', position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 76px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Background Soft Red & Navy Aura Effects */}
      <div style={{ position: 'absolute', top: '-15%', left: '-5%', width: '45vw', height: '45vw', background: 'radial-gradient(circle, rgba(227,24,55,0.12) 0%, rgba(15,23,42,0) 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', right: '-5%', width: '35vw', height: '35vw', background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(15,23,42,0) 70%)', pointerEvents: 'none' }} />

      {/* Subtle Dark Mesh Grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '64px 64px', opacity: 0.6, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div className="fade-in-section" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 2, background: '#EF4444', display: 'inline-block', borderRadius: 2 }} />
              WHAT WE OFFER
            </div>
            <h2 style={{ fontSize: 'clamp(1.9rem, 3vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', color: '#FFFFFF', marginBottom: 12 }}>
              Clinical <span style={{ color: '#EF4444' }}>Services.</span>
            </h2>
            <p style={{ fontSize: '0.92rem', color: '#94A3B8', maxWidth: 520, lineHeight: 1.6, fontWeight: 400 }}>
              Comprehensive anti-rabies care from wound management to full prophylaxis — all under one roof.
            </p>
          </div>
          <a href="#faq"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', color: '#FFFFFF', border: '1.5px solid rgba(255,255,255,0.15)', padding: '13px 26px', borderRadius: 9999, fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none', transition: 'all 0.2s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}>
            View FAQs <ArrowRight size={15} />
          </a>
        </div>

        {/* Elevated, Icon-Free Service Cards Grid */}
        <div className="fade-in-section ka-services-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {SERVICES.map((s) => {
            return (
              <div
                key={s.num}
                onClick={() => setSelectedService(s)}
                style={{
                  background: '#1E293B',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 18,
                  padding: '20px 20px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                  e.currentTarget.style.transform = 'translateY(-6px)';
                  e.currentTarget.style.boxShadow = '0 20px 45px rgba(0, 0, 0, 0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
                }}
              >
                {/* Service Title & Description */}
                <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#EF4444', marginBottom: 8, letterSpacing: '-0.3px', lineHeight: 1.3 }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: '0.84rem', color: '#94A3B8', lineHeight: 1.55, fontWeight: 400, marginBottom: 16 }}>
                  {s.desc}
                </p>

                {/* Learn More Action Button */}
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#F1F5F9',
                      padding: '7px 16px',
                      borderRadius: 9999,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    Learn More <ArrowRight size={13} color="#94A3B8" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Landscape Service Detail Pop-Up Modal */}
      {selectedService && (
        <ServiceModal service={selectedService} onClose={() => setSelectedService(null)} />
      )}
    </section>
  );
}

{/* Landscape Structured Clinical Details Modal */}
function ServiceModal({ service, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: 860,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#1E293B',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 24,
          padding: '28px 32px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          position: 'relative',
          animation: 'chatPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header Row (Close Button Only — Clean Widescreen Top Bar) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#94A3B8'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Structured Landscape 2-Column Grid Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20, marginBottom: 24 }}>
          
          {/* Left Column: Overview, Who It's For, Highlights */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Service Overview */}
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={13} color="#EF4444" /> OVERVIEW
              </div>
              <div style={{ fontSize: '0.9rem', color: '#FFFFFF', lineHeight: 1.6, fontWeight: 600 }}>
                {service.desc}
              </div>
            </div>

            {/* Who It's For */}
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px', flex: 1 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={13} color="#EF4444" /> WHO IT'S FOR
              </div>
              <div style={{ fontSize: '0.84rem', color: '#CBD5E1', lineHeight: 1.55 }}>
                {service.target}
              </div>
            </div>
          </div>

          {/* Right Column: When It's Needed, Process & Schedule, Clinical Standards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* When It's Needed */}
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} color="#EF4444" /> WHEN IT'S NEEDED
              </div>
              <div style={{ fontSize: '0.84rem', color: '#CBD5E1', lineHeight: 1.55 }}>
                {service.whenNeeded}
              </div>
            </div>

            {/* Process & Dosage Schedule */}
            {service.schedule && service.schedule.length > 0 && (
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={13} color="#EF4444" /> PROCESS & DOSAGE SCHEDULE
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {service.schedule.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF', display: 'inline-block' }} />
                      <span style={{ fontSize: '0.82rem', color: '#E2E8F0', fontWeight: 500 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical Standards & Biologics */}
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px', flex: 1 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={13} color="#EF4444" /> CLINICAL STANDARDS & BIOLOGICS
              </div>
              <div style={{ fontSize: '0.84rem', color: '#CBD5E1', lineHeight: 1.55 }}>
                {service.specs}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#FFFFFF',
              padding: '10px 24px',
              borderRadius: 9999,
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
