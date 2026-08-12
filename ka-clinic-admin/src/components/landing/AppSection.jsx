import React, { useState } from 'react';
import SectionLabel from './SectionLabel';
import { Bell, ShieldCheck, MessageSquare, Calendar, ChevronLeft, CreditCard, Lock, Eye, ArrowRight, Download } from 'lucide-react';

export default function AppSection() {
  const [toast, setToast] = useState('');
  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(''), 3500); };

  return (
    <section id="app" style={{
      background: '#0B101D',
      backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
      backgroundSize: '60px 60px',
      padding: '56px 48px',
      position: 'relative',
      overflow: 'hidden',
      minHeight: 'calc(100vh - 76px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }}>
      {/* Subtle Red & Blue Ambient Glow Filters */}
      <div style={{ position: 'absolute', top: '50%', left: '18%', transform: 'translate(-50%, -50%)', width: 550, height: 550, background: 'radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '25%', right: '12%', width: 450, height: 450, background: 'radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 64, alignItems: 'center' }}>
          
          {/* LEFT COLUMN: Phone Mockup with K&A Clinic App Login Screen & Faint Background Watermarks */}
          <div className="fade-in-section" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
              position: 'relative',
              width: 280,
              background: 'linear-gradient(165deg, #1E293B 0%, #0F172A 100%)',
              borderRadius: 42,
              padding: '14px 12px',
              boxShadow: '0 40px 100px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(255, 255, 255, 0.12) inset',
              transform: 'rotate(-1.5deg)',
              transition: 'all 0.3s ease'
            }}>
              {/* Phone Hardware Side Buttons */}
              <span style={{ position: 'absolute', left: -3, top: 85, width: 3, height: 28, borderRadius: '2px 0 0 2px', background: '#334155' }} />
              <span style={{ position: 'absolute', left: -3, top: 122, width: 3, height: 40, borderRadius: '2px 0 0 2px', background: '#334155' }} />
              <span style={{ position: 'absolute', right: -3, top: 110, width: 3, height: 50, borderRadius: '0 2px 2px 0', background: '#334155' }} />

              {/* Phone Screen Container */}
              <div style={{ position: 'relative', background: 'linear-gradient(180deg, #FFF5F5 0%, #FFFFFF 100%)', borderRadius: 30, overflow: 'hidden', paddingTop: 30 }}>

                {/* Dynamic Island / Notch */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 94, height: 20, background: '#0F172A', borderRadius: '0 0 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 10 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#334155' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0F172A', border: '1.5px solid #334155' }} />
                </div>

                {/* Faint Background Watermark Elements from Screenshot */}
                {/* Top-Left Faint Medical Cross emblem */}
                <div style={{ position: 'absolute', top: 30, left: -20, opacity: 0.05, pointerEvents: 'none', color: '#EF4444' }}>
                  <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor"><path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/></svg>
                </div>

                {/* Bottom-Left Faint EKG Line watermark */}
                <div style={{ position: 'absolute', bottom: 10, left: -10, opacity: 0.06, pointerEvents: 'none', color: '#EF4444' }}>
                  <svg width="160" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>

                {/* App Screen Content: K&A Patient Login Screen */}
                <div style={{ padding: '4px 14px 14px', position: 'relative', zIndex: 2 }}>

                  {/* Top Bar with Back Button & Battery */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <ChevronLeft size={14} color="#0F172A" />
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#D97706' }}>| 6</span>
                  </div>

                  {/* K&A Clinic Heart Logo & Header */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: '#FFFFFF',
                      border: '2px solid #FFE4E6',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      boxShadow: '0 8px 20px rgba(227, 24, 55, 0.12)',
                      marginBottom: 6
                    }}>
                      {/* Heart Logo with Pets Icon */}
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="#E31837">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#0F172A', letterSpacing: '0.5px' }}>
                      K&A CLINIC
                    </div>
                    <div style={{ fontSize: '0.5rem', fontWeight: 800, color: '#E31837', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      ANTI-RABIES CARE SYSTEM
                    </div>
                  </div>

                  {/* Sign In White Card */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: 18,
                    padding: '14px 13px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #F1F5F9'
                  }}>
                    <div style={{ textAlign: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>
                        Sign in to Your Account
                      </div>
                      <div style={{ fontSize: '0.58rem', color: '#64748B', lineHeight: 1.3 }}>
                        Enter your details below to access your medical records.
                      </div>
                    </div>

                    {/* MRN Input */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: '0.56rem', fontWeight: 700, color: '#334155', marginBottom: 3 }}>
                        Medical Record Number (MRN)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '6px 10px' }}>
                        <CreditCard size={13} color="#94A3B8" />
                        <span style={{ fontSize: '0.62rem', color: '#94A3B8' }}>Medical Record Number (MRN)</span>
                      </div>
                    </div>

                    {/* Password Input */}
                    <div style={{ marginBottom: 5 }}>
                      <label style={{ display: 'block', fontSize: '0.56rem', fontWeight: 700, color: '#334155', marginBottom: 3 }}>
                        Password
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '6px 10px' }}>
                        <Lock size={13} color="#94A3B8" />
                        <span style={{ fontSize: '0.62rem', color: '#94A3B8', flex: 1 }}>Password</span>
                        <Eye size={13} color="#94A3B8" />
                      </div>
                    </div>

                    {/* Forgot Password Link */}
                    <div style={{ textAlign: 'right', marginBottom: 10 }}>
                      <span style={{ fontSize: '0.56rem', color: '#0284C7', fontWeight: 700, cursor: 'pointer' }}>
                        Forgot password?
                      </span>
                    </div>

                    {/* Primary Sign In Button */}
                    <div style={{
                      background: '#E31837',
                      color: '#FFFFFF',
                      borderRadius: 10,
                      padding: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: 6,
                      marginBottom: 8,
                      boxShadow: '0 4px 12px rgba(227, 24, 55, 0.25)',
                      cursor: 'pointer'
                    }}>
                      Sign In <ArrowRight size={13} color="#FFFFFF" />
                    </div>

                    {/* Sign Up Link */}
                    <div style={{ textAlign: 'center', fontSize: '0.58rem', color: '#64748B', marginBottom: 8 }}>
                      New Patient? <strong style={{ color: '#E31837' }}>Sign up</strong>
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                      <span style={{ fontSize: '0.52rem', color: '#94A3B8', fontWeight: 600 }}>Don't have an (MRN) Yet</span>
                      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                    </div>

                    {/* Guest Button */}
                    <div style={{
                      background: '#FFF1F2',
                      border: '1px solid #FECDD3',
                      color: '#E31837',
                      borderRadius: 10,
                      padding: '7px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: 6,
                      marginBottom: 8,
                      cursor: 'pointer'
                    }}>
                      Continue as a Guest <ArrowRight size={13} color="#E31837" />
                    </div>

                    {/* Footer Link */}
                    <div style={{ textAlign: 'center', fontSize: '0.54rem', color: '#64748B' }}>
                      Having trouble? <strong style={{ color: '#E31837' }}>Contact Us</strong>
                    </div>

                  </div>

                </div>

                {/* Bottom Home Indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6, background: '#FFFFFF' }}>
                  <span style={{ width: 84, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: App Features & Professional Direct APK Download Button */}
          <div className="fade-in-section">
            <SectionLabel>MOBILE APP</SectionLabel>
            <h2 style={{ fontSize: 'clamp(1.9rem, 3vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', color: '#FFFFFF', marginBottom: 12 }}>
              Your Vaccine <br />
              <span style={{ color: '#EF4444' }}>Companion App.</span>
            </h2>
            <p style={{ fontSize: '0.92rem', color: '#94A3B8', lineHeight: 1.6, marginBottom: 18, fontWeight: 400 }}>
              Download the K&A Clinic app to manage your vaccine schedule, get reminders, and chat with our team — anytime, anywhere. Full access is reserved for registered patients with a valid Medical Record Number (MRN) issued by K&A Clinic, for personal recovery and dose tracking.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
              {[
                { icon: <Bell size={17} color="#EF4444" />, title: 'Smart Vaccine Reminders', desc: 'Never miss a dose. Get push notifications for your next vaccine schedule with personalized timing.' },
                { icon: <ShieldCheck size={17} color="#EF4444" />, title: 'Digital Medical Records', desc: 'Access your complete vaccination history, wound assessments, and treatment documents at any time.' },
                { icon: <MessageSquare size={17} color="#EF4444" />, title: 'In-App AI Chatbot', desc: 'Get instant answers about your treatment, doses, and side effects. Escalates to real nurses when needed.' },
                { icon: <Calendar size={17} color="#EF4444" />, title: 'Easy Appointment Booking', desc: 'Book, reschedule, or cancel weekend appointments directly from your phone in seconds.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', lineHeight: 1.5, fontWeight: 400 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Simple & Compact APK Download Button */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={() => showToast('Downloading K&A Clinic APK... 🚀')}
                style={{
                  background: '#EF4444',
                  border: 'none',
                  borderRadius: 12,
                  padding: '11px 22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                  color: '#FFFFFF',
                  fontSize: '0.92rem',
                  fontWeight: 800
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#DC2626';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 18px rgba(239, 68, 68, 0.45)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#EF4444';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.35)';
                }}>
                <Download size={18} color="#FFFFFF" />
                <span>Download APK</span>
              </button>
            </div>

          </div>

        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: '#EF4444', color: 'white', borderRadius: 9999, padding: '14px 28px', fontSize: '0.875rem', fontWeight: 700, zIndex: 9999, boxShadow: '0 10px 30px rgba(239,68,68,0.4)', animation: 'slideDown 0.2s ease both' }}>{toast}</div>}
    </section>
  );
}
