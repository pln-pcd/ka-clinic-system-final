import React, { useState, useEffect } from 'react';
import { Lock, Menu, X } from 'lucide-react';

const PRIMARY_LINKS = [
  { id: 'hero', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'services', label: 'Services' },
  { id: 'calendar', label: 'Appointment' },
  { id: 'app', label: 'App' },
  { id: 'team', label: 'Team' },
  { id: 'faq', label: 'FAQs' },
];

const ALL_SECTION_IDS = PRIMARY_LINKS.map(l => l.id);

export default function Navbar({ onAdminClick }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('hero');

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const sections = ALL_SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    sections.forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  const pillStyle = (isActive) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: '0.825rem', fontWeight: 700, letterSpacing: '-0.1px',
    color: isActive ? '#FFFFFF' : 'var(--text2)',
    background: isActive ? 'linear-gradient(135deg,var(--red),var(--red-dark))' : 'transparent',
    boxShadow: isActive ? '0 4px 14px var(--red-glow)' : 'none',
    padding: '9px 18px', borderRadius: 9999, textDecoration: 'none',
    cursor: 'pointer', whiteSpace: 'nowrap', border: 'none',
    fontFamily: "'Plus Jakarta Sans',sans-serif",
  });

  return (
    <>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px', height: 76, background: scrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #E2E8F0', transition: 'all 0.3s' }}>

        {/* Logo */}
        <div onClick={onAdminClick} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#E31837,#C41228)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans',sans-serif", color: 'white', fontSize: '1.1rem', fontWeight: 800, boxShadow: '0 4px 16px rgba(227,24,55,0.3)', flexShrink: 0 }}>K&A</div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px' }}>K&A Clinic</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--red)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700 }}>Anti-Rabies Center</div>
          </div>
        </div>

        {/* Centered floating pill nav */}
        <div className="hidden-mobile" style={{
          display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 1, minWidth: 0,
          background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 9999,
          padding: '5px 6px', boxShadow: '0 2px 10px rgba(15,23,42,0.03)',
        }}>
          {PRIMARY_LINKS.map(l => (
            <a key={l.id} href={`#${l.id}`} className="ka-nav-pill" style={pillStyle(active === l.id)}>{l.label}</a>
          ))}
        </div>

        {/* Right actions */}
        <div className="hidden-mobile" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onAdminClick}
            style={{
              background: 'var(--red)',
              color: '#FFFFFF',
              border: 'none',
              padding: '10px 22px',
              borderRadius: 9999,
              fontFamily: "'Plus Jakarta Sans',sans-serif",
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '-0.1px',
              boxShadow: '0 6px 18px var(--red-glow)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap'
            }}
            title="Admin Login"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-dark)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
            <Lock size={14} color="#FFFFFF" />
            Admin Login
          </button>
        </div>

        <button className="ka-mobile-toggle" onClick={() => setMobileOpen(o => !o)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          style={{ display: 'none', width: 40, height: 40, borderRadius: 10, background: 'transparent', border: '1.5px solid var(--border)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)', flexShrink: 0 }}>
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      {mobileOpen && (
        <div style={{ position: 'fixed', top: 76, left: 0, right: 0, zIndex: 899, background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', padding: '20px 24px 28px', animation: 'slideDown 0.2s ease both', maxHeight: 'calc(100vh - 76px)', overflowY: 'auto' }}>
          {PRIMARY_LINKS.map(l => (
            <a key={l.id} href={`#${l.id}`} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '12px 0', fontSize: '1rem', fontWeight: 600, color: active === l.id ? 'var(--red)' : 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}>{l.label}</a>
          ))}
          <button onClick={() => { onAdminClick(); setMobileOpen(false); }} style={{ width: '100%', marginTop: 16, background: 'var(--red)', color: '#FFFFFF', border: 'none', padding: '13px', borderRadius: 9999, fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 6px 18px var(--red-glow)' }}>
            <Lock size={15} color="#FFFFFF" />
            Admin Login
          </button>
        </div>
      )}
    </>
  );
}
