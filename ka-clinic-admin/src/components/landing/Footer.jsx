import React from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer style={{background:'var(--bg-alt)',borderTop:'1px solid var(--border)',padding:'22px 48px 10px'}}>
      <div style={{maxWidth:1240,margin:'0 auto',display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:20,marginBottom:14}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:6}}>
            <div style={{width:20,height:20,borderRadius:6,background:'linear-gradient(135deg,#E31837,#C41228)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:'0.55rem',fontWeight:800}}>K&A</div>
            <div>
              <div style={{fontSize:'0.75rem',fontWeight:800,color:'var(--text)'}}>K&A Clinic</div>
              <div style={{fontSize:'0.5rem',color:'var(--red)',textTransform:'uppercase',letterSpacing:'1.1px',fontWeight:700}}>Protecting Lives Since 2016</div>
            </div>
          </div>
          <p style={{fontSize:'0.7rem',color:'var(--muted)',lineHeight:1.45,maxWidth:300,fontWeight:400}}>
            DOH-licensed, PhilHealth-accredited clinic providing WHO-protocol rabies prevention and treatment to our community every day.
          </p>
        </div>

        <div>
          <div style={{fontSize:'0.6rem',fontWeight:800,color:'var(--text)',textTransform:'uppercase',letterSpacing:'1.1px',marginBottom:8}}>Quick Links</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {[['About','#about'],['Services','#services'],['Schedule','#calendar'],['Our Team','#team'],['Mobile App','#app'],['FAQ','#faq']].map(([label,href]) => (
              <a key={label} href={href} style={{fontSize:'0.7rem',color:'var(--muted)',textDecoration:'none',transition:'color 0.2s',fontWeight:500}}
                onMouseEnter={e=>e.target.style.color='var(--red)'}
                onMouseLeave={e=>e.target.style.color='var(--muted)'}>
                {label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <div style={{fontSize:'0.6rem',fontWeight:800,color:'var(--text)',textTransform:'uppercase',letterSpacing:'1.1px',marginBottom:8}}>Services</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {[['Post-Exposure PEP','#services'],['Pre-Exposure PrEP','#services'],['RIG Administration','#services'],['Wound Management','#services'],['Booster Shots','#services'],['Bite Assessment','#services']].map(([label,href]) => (
              <a key={label} href={href} style={{fontSize:'0.7rem',color:'var(--muted)',textDecoration:'none',transition:'color 0.2s',fontWeight:500}}
                onMouseEnter={e=>e.target.style.color='var(--red)'}
                onMouseLeave={e=>e.target.style.color='var(--muted)'}>
                {label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <div style={{fontSize:'0.6rem',fontWeight:800,color:'var(--text)',textTransform:'uppercase',letterSpacing:'1.1px',marginBottom:8}}>Direct Contact</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:'0.7rem',color:'var(--muted)'}}>
            <a href="tel:+639123456789" style={{color:'var(--text)',textDecoration:'none',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
              <Phone size={11} color="#E31837" /> +63 912 345 6789
            </a>
            <a href="mailto:contact@kaclinic.ph" style={{color:'var(--muted)',textDecoration:'none',display:'flex',alignItems:'center',gap:6}}>
              <Mail size={11} color="#E31837" /> contact@kaclinic.ph
            </a>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <MapPin size={11} color="#E31837" /> San Juan St., Libon, Albay
            </div>
          </div>
        </div>
      </div>

      <div style={{borderTop:'1px solid var(--border)',paddingTop:10,display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:1240,margin:'0 auto'}}>
        <div style={{fontSize:'0.65rem',color:'var(--muted)',fontWeight:500}}>© 2026 K&A Anti-Rabies Vaccine Clinic. All rights reserved.</div>
        <a href="tel:+639123456789"
          style={{background:'var(--red)',color:'white',border:'none',padding:'5px 14px',borderRadius:9999,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:'0.68rem',fontWeight:700,cursor:'pointer',boxShadow:'0 4px 14px var(--red-glow)',transition:'all 0.2s',display:'flex',alignItems:'center',gap:6,textDecoration:'none'}}
          onMouseEnter={e=>e.currentTarget.style.background='var(--red-dark)'}
          onMouseLeave={e=>e.currentTarget.style.background='var(--red)'}>
          <Phone size={11} /> Call Clinic Desk
        </a>
      </div>
    </footer>
  );
}
