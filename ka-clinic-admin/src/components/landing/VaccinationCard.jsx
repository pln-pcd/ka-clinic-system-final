import React, { useEffect, useRef, useState } from 'react';
import { Syringe, Check, Stamp, Paperclip, Calendar } from 'lucide-react';
import { getNextWeekendSlots } from './utils';
import { TEAM } from './constants';

const DOSE_DAYS = ['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'];

const paperGrain = {
  backgroundImage:
    'radial-gradient(rgba(15,23,42,0.05) 0.6px, transparent 0.6px), ' +
    'repeating-linear-gradient(115deg, rgba(15,23,42,0.018) 0px, rgba(15,23,42,0.018) 1px, transparent 1px, transparent 3px)',
  backgroundSize: '3px 3px, auto',
};

export default function VaccinationCard() {
  const wrapRef = useRef(null);
  const cardRef = useRef(null);
  const [stamped, setStamped] = useState(false);
  const physician = TEAM[0];
  const ws = getNextWeekendSlots();
  const slotColor = ws.status === 'available' ? '#10B981' : ws.status === 'limited' ? '#F59E0B' : '#E31837';
  const slotText = ws.status === 'full' ? 'Full' : ws.status === 'limited' ? `${ws.slots} left` : `${ws.slots} slots`;

  useEffect(() => {
    const t = setTimeout(() => setStamped(true), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wrap = wrapRef.current, card = cardRef.current;
    if (reduceMotion || !wrap || !card) return;

    const onMove = (e) => {
      const r = wrap.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotate(-3deg) rotateX(${(-py * 9).toFixed(2)}deg) rotateY(${(px * 11).toFixed(2)}deg)`;
    };
    const onLeave = () => {
      card.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
      card.style.transform = 'rotate(-3deg) rotateX(0deg) rotateY(0deg)';
      setTimeout(() => { if (card) card.style.transition = 'none'; }, 500);
    };
    const onEnter = () => { if (card) card.style.transition = 'none'; };

    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseenter', onEnter);
    wrap.addEventListener('mouseleave', onLeave);
    return () => {
      wrap.removeEventListener('mousemove', onMove);
      wrap.removeEventListener('mouseenter', onEnter);
      wrap.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', maxWidth: 540, perspective: 1400, padding: '40px 32px 52px' }}>
      {/* Stacked page edges behind the card — suggests a booklet, not a single flat panel */}
      <div style={{ position: 'absolute', inset: '40px 32px 52px', borderRadius: 20, background: '#F1EDE3', border: '1px solid rgba(15,23,42,0.08)', transform: 'rotate(-7deg) translate(7px, 11px)', boxShadow: '0 12px 28px rgba(15,23,42,0.08)' }} />
      <div style={{ position: 'absolute', inset: '40px 32px 52px', borderRadius: 20, background: '#F7F3EA', border: '1px solid rgba(15,23,42,0.08)', transform: 'rotate(-5deg) translate(4px, 6px)', boxShadow: '0 12px 28px rgba(15,23,42,0.06)' }} />

      <div
        ref={cardRef}
        style={{
          position: 'relative',
          zIndex: 1,
          background: '#FBF8F2',
          borderRadius: 20,
          border: '1px solid rgba(15,23,42,0.10)',
          boxShadow: '0 34px 70px rgba(15,23,42,0.18), 0 10px 24px rgba(15,23,42,0.08)',
          transform: 'rotate(-3deg)',
          transformStyle: 'preserve-3d',
          animation: 'paperSettle 0.9s 0.15s cubic-bezier(0.16,1,0.3,1) both',
          overflow: 'hidden',
          ...paperGrain,
        }}
      >
        {/* Header band */}
        <div style={{ background: 'var(--text)', padding: '22px 28px 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.25)' }}>
            <Syringe size={22} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.5px' }}>K&amp;A Anti-Rabies Vaccine Clinic</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 3 }}>Animal Bite Treatment Record</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '26px 28px 28px' }}>
          {/* Type of Prophylaxis */}
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.3px', marginBottom: 12 }}>
            Type of Prophylaxis
          </div>
          <div style={{ display: 'flex', gap: 26, marginBottom: 24, fontFamily: "'DM Mono',monospace" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 19, height: 19, borderRadius: 4, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check size={13} color="#FFFFFF" strokeWidth={3} />
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>Post-Exposure (PEP)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 19, height: 19, borderRadius: 4, border: '1.5px solid rgba(15,23,42,0.35)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)' }}>Pre-Exposure (PrEP)</span>
            </div>
          </div>

          {/* Dose schedule table */}
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.3px', marginBottom: 10 }}>
            WHO 5-Dose Schedule
          </div>
          <div style={{ border: '1px solid rgba(15,23,42,0.14)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
              {DOSE_DAYS.map(d => (
                <div key={d} style={{ background: 'var(--text)', color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', padding: '9px 2px', borderRight: '1px solid rgba(255,255,255,0.12)' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
              {DOSE_DAYS.map((d, i) => (
                <div key={d} style={{ height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: i < 4 ? '1px dashed rgba(15,23,42,0.14)' : 'none', borderTop: '1px solid rgba(15,23,42,0.10)', position: 'relative' }}>
                  {i === 0 ? (
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--red)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: stamped ? 0.9 : 0, mixBlendMode: 'multiply',
                      animation: stamped ? 'stampIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
                    }}>
                      <Check size={20} color="var(--red)" strokeWidth={3} />
                    </div>
                  ) : (
                    <span style={{ width: 20, height: 1, background: 'rgba(15,23,42,0.2)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Signature + seal */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28 }}>
            <div style={{ maxWidth: 220 }}>
              <svg width="132" height="34" viewBox="0 0 132 34" fill="none" style={{ display: 'block', marginBottom: 3 }}>
                <path d="M2,25 C11,7 18,29 27,14 C34,2 43,27 54,16 C62,8 70,23 81,12 C90,4 99,20 111,10 C115,7 120,11 123,8" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.75" />
              </svg>
              <div style={{ borderTop: '1px solid rgba(15,23,42,0.3)', paddingTop: 6 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>{physician.name}, MD</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Attending Physician</div>
              </div>
            </div>

            {/* Official seal */}
            <div style={{ position: 'relative', width: 98, height: 98, flexShrink: 0, mixBlendMode: 'multiply', transform: 'rotate(-6deg)' }}>
              <svg viewBox="0 0 100 100" width="98" height="98">
                <defs>
                  <path id="sealRing" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" />
                </defs>
                <circle cx="50" cy="50" r="46" fill="none" stroke="var(--red)" strokeWidth="1.4" strokeDasharray="2.2 3" opacity="0.55" />
                <circle cx="50" cy="50" r="37" fill="none" stroke="var(--red)" strokeWidth="1" opacity="0.4" />
                <text fontSize="6.4" fontWeight="700" fill="var(--red)" opacity="0.8" letterSpacing="1.2">
                  <textPath href="#sealRing" startOffset="2%">K&amp;A CLINIC • OFFICIAL RECORD •</textPath>
                </text>
              </svg>
              <Stamp size={28} color="var(--red)" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.85 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Paper tag — clinic open status */}
      <div style={{
        position: 'absolute', zIndex: 2, top: 6, left: 6, background: '#FDFBF6',
        border: '1px solid rgba(15,23,42,0.12)', borderRadius: 9, padding: '10px 15px 10px 12px',
        boxShadow: '0 12px 28px rgba(15,23,42,0.12)', transform: 'rotate(-4deg)',
        animation: 'float1 4s ease-in-out infinite', display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <Paperclip size={15} color="var(--muted)" style={{ transform: 'rotate(35deg)', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Clinic Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
            Open Today
          </div>
        </div>
      </div>

      {/* Paper tag — weekend slots */}
      <div style={{
        position: 'absolute', zIndex: 2, bottom: 14, right: 2, background: '#FDFBF6',
        border: '1px solid rgba(15,23,42,0.12)', borderRadius: 9, padding: '11px 17px',
        boxShadow: '0 12px 28px rgba(15,23,42,0.12)', transform: 'rotate(3deg)',
        animation: 'float2 5s ease-in-out infinite', display: 'flex', alignItems: 'center', gap: 11,
      }}>
        <Calendar size={18} color="var(--red)" style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 1 }}>Weekend Slots</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.9rem', fontWeight: 700, color: slotColor }}>{slotText} · {ws.label}</div>
        </div>
      </div>
    </div>
  );
}
