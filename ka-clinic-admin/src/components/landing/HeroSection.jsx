import React from 'react';
import { Phone, Mail, MapPin, BadgeCheck } from 'lucide-react';
import VaccinationCard from './VaccinationCard';
import { TEAM } from './constants';

const CONTACT_DETAILS = [
  { Icon: Phone, label: 'Phone', value: '+63 912 345 6789', href: 'tel:+639123456789' },
  { Icon: Mail, label: 'Email', value: 'contact@kaclinic.ph', href: 'mailto:contact@kaclinic.ph' },
  { Icon: MapPin, label: 'Address', value: 'San Juan St., Libon, Albay' },
];

export default function HeroSection() {
  return (
    <section id="hero" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 'calc(76px + 32px) 48px 40px', background: '#FFFFFF', boxSizing: 'border-box' }}>
      {/* Background Soft Red Ribbon / Aura Effects */}
      <div style={{ position: 'absolute', top: '-15%', right: '-10%', width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(227,24,55,0.06) 0%, rgba(255,255,255,0) 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(15,23,42,0.04) 0%, rgba(255,255,255,0) 70%)', pointerEvents: 'none' }} />

      {/* Subtle Mesh Grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#F1F5F9 1px,transparent 1px),linear-gradient(90deg,#F1F5F9 1px,transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%,black 20%,transparent 100%)', opacity: 0.6, pointerEvents: 'none' }} />

      <div className="ka-hero-grid" style={{ maxWidth: 1240, width: '100%', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 40, alignItems: 'center', position: 'relative', zIndex: 1 }}>
        {/* Left Text Content */}
        <div style={{ animation: 'fadeUp 0.8s ease both' }}>
          <h1 style={{ fontSize: 'clamp(2.4rem, 3.8vw, 3.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-1.2px', color: 'var(--text)', marginBottom: 16 }}>
            Your Shield <br />
            Against <span style={{ color: 'var(--red)' }}>Rabies.</span>
            <span style={{ fontSize: '0.45em', fontWeight: 600, letterSpacing: '0px', color: 'var(--muted)', display: 'block', marginTop: 8, fontFamily: "'Plus Jakarta Sans',sans-serif", textTransform: 'none' }}>
              Expert care, fast response, and WHO-standard prophylaxis.
            </span>
          </h1>

          <p style={{ fontSize: '0.98rem', color: 'var(--muted)', maxWidth: 500, lineHeight: 1.7, fontWeight: 400, marginBottom: 22 }}>
            K&A Anti-Rabies Vaccine Clinic provides professional post-exposure prophylaxis, pre-exposure vaccination, and wound management — keeping our community safe, every day.
          </p>

          {/* Contact details — quick reference for phone, email, and address */}
          <div className="ka-hero-contact" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 24 }}>
            {CONTACT_DETAILS.map(({ Icon, label, value, href }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <div className="ka-hero-contact-divider" style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />}
                <a href={href} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--red-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} color="var(--red)" />
                  </div>
                  <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{value}</div>
                  </div>
                </a>
              </React.Fragment>
            ))}
          </div>

          {/* Call action — the hero's sole CTA now that Book Appointment lives in the navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <a href="tel:+639123456789"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--navy)', color: '#FFFFFF', padding: '13px 26px', borderRadius: 9999, fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none', boxShadow: '0 8px 24px rgba(15,23,42,0.22)', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
              <Phone size={16} fill="#FFFFFF" /> Call (02) 8123-4567
            </a>
          </div>

          {/* Trust strip: real credentials + care-team avatars */}
          <div className="ka-hero-trust" style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BadgeCheck size={18} color="var(--red)" strokeWidth={2.2} />
              <div style={{ lineHeight: 1.25 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text)' }}>DOH-Licensed · PhilHealth-Accredited</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 500 }}>98% dose-completion rate</div>
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />
            <a href="#team" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              <div style={{ display: 'flex' }}>
                {TEAM.map((m, i) => (
                  <div key={m.name} style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#E31837,#C41228)', border: '2px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: '#FFFFFF', marginLeft: i === 0 ? 0 : -8, boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                    {m.init}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text2)' }}>Meet Our Care Team →</span>
            </a>
          </div>
        </div>

        {/* Right Graphic — the patient's own anti-rabies vaccination card */}
        <div className="ka-hero-visual" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
          <VaccinationCard />

          {/* Floating stat badge */}
          <div style={{
            position: 'absolute', zIndex: 3, left: '2%', bottom: '4%',
            width: 110, height: 110, borderRadius: '50%',
            background: 'linear-gradient(150deg,var(--navy),var(--navy2))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: '4px solid #FFFFFF', boxShadow: '0 16px 36px rgba(15,23,42,0.28)',
            animation: 'float1 3.4s ease-in-out infinite', textAlign: 'center', padding: 6,
          }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>10<span style={{ color: 'var(--red)' }}>+</span></div>
            <div style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3 }}>Years in<br />Operation</div>
          </div>
        </div>
      </div>
    </section>
  );
}
