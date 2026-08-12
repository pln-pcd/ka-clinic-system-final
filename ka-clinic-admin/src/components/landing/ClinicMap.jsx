import React, { useRef } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

const ADDRESS = 'San Juan St., Libon, Albay, Philippines';
const MAP_QUERY = encodeURIComponent(ADDRESS);
// Google Maps embed with t=k for Satellite imagery
const SATELLITE_EMBED_URL = `https://maps.google.com/maps?q=${MAP_QUERY}&t=k&z=17&ie=UTF8&iwloc=&output=embed`;

export default function ClinicMap() {
  const pinRef = useRef(null);

  const handleEnter = (e) => {
    e.currentTarget.style.boxShadow = '0 26px 54px rgba(15,23,42,0.18)';
    e.currentTarget.style.transform = 'translateY(-3px)';
  };
  const handleLeave = (e) => {
    e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.10)';
    e.currentTarget.style.transform = 'translateY(0)';
  };

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        width: '100%', maxWidth: '100%', height: 420, minHeight: 340, display: 'flex', flexDirection: 'column',
        borderRadius: 22, overflow: 'hidden', border: '1px solid var(--border)', background: '#0F172A',
        boxShadow: '0 18px 40px rgba(0,0,0,0.10)',
        transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s ease',
      }}
    >
      {/* Branded header strip */}
      <div style={{ background: 'var(--text)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.25)' }}>
            <MapPin size={17} color="#FFFFFF" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.2px' }}>K&amp;A Clinic Location</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>San Juan St., Libon, Albay (Satellite View)</div>
          </div>
        </div>
        <a href={`https://maps.google.com/?q=${MAP_QUERY}&t=k`} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--red)', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, borderRadius: 9999, padding: '7px 16px', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Open Satellite <ExternalLink size={13} />
        </a>
      </div>

      {/* Map viewport — Live Satellite map embed */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#0B101D' }}>
        <iframe
          title="K&A Clinic Location Satellite Map"
          src={SATELLITE_EMBED_URL}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          loading="lazy"
        />

        {/* Floating Location Tag overlay */}
        <div style={{ position: 'absolute', bottom: 12, left: 14, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', display: 'inline-block', boxShadow: '0 0 8px #EF4444' }} />
          <span style={{ fontSize: '0.72rem', color: '#FFFFFF', fontWeight: 700 }}>Libon, Albay Satellite Coverage</span>
        </div>
      </div>
    </div>
  );
}
