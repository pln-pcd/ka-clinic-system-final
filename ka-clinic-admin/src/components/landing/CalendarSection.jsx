import { Phone, Mail, MapPin, Clock, Calendar as CalendarIcon, AlertCircle, CheckCircle2, Lock, ShieldAlert, X, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MONTHS } from './constants';
import { getSlotData, getNextWeekendSlots } from './utils';

// Status metadata for details
const STATUS_META = {
  available:       { label: 'Weekend Slots Open', color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
  full:            { label: 'Weekend Fully Booked', color: '#EF4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)' },
  closed:          { label: 'Closed for Appointments (Weekdays)', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  schedule_closed: { label: 'Schedule Closed by Clinic', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' },
  past:            { label: 'Past Date', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' },
};

const normStatus = (st) => (st === 'limited' ? 'available' : st);

const CONTACT_ITEMS = [
  { Icon: Mail,   label: 'dr.kaclinic@gmail.com', href: 'mailto:dr.kaclinic@gmail.com' },
  { Icon: Phone,  label: '+63 912 345 6789', href: 'tel:+639123456789' },
  { Icon: MapPin, label: 'San Juan St., Libon, Albay', href: null },
  { Icon: Clock,  label: '8:00 AM – 5:00 PM (Saturdays & Sundays)', href: null },
];

export default function CalendarSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [closures, setClosures] = useState([]);
  const [closurePopup, setClosurePopup] = useState(null); // { title, dateStr, reason, slots }

  // Live Firestore listener for active schedule closures
  useEffect(() => {
    try {
      const q = query(collection(db, 'scheduleClosures'), where('active', '==', true));
      return onSnapshot(q, snap => {
        setClosures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, err => console.warn('Public closures listener error:', err));
    } catch (e) {
      console.warn('Closures query init error:', e);
    }
  }, []);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: daysInPrev - firstDay + 1 + i, type: 'other' });
  for (let d = 1; d <= daysInMonth; d++) {
    const rawSlot = getSlotData(year, month, d);
    const isToday = new Date(year, month, d).getTime() === today.getTime();
    const dateObj = new Date(year, month, d);
    const dateStr = dateObj.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // Check active schedule closures
    const matchingClosures = closures.filter(c => c.startDate <= dateKey && dateKey <= (c.endDate || c.startDate));
    const fullDayClosure = matchingClosures.find(c => c.type === 'day');
    const slotClosures = matchingClosures.filter(c => c.type === 'slots');

    let slot = { ...rawSlot, dateKey };
    if (rawSlot.isWeekend) {
      if (fullDayClosure) {
        slot = { status: 'schedule_closed', slots: 0, isWeekend: true, closure: fullDayClosure, dateKey };
      } else if (slotClosures.length > 0) {
        const closedSlots = Array.from(new Set(slotClosures.flatMap(c => c.slots || [])));
        if (closedSlots.length >= 8) {
          slot = { status: 'schedule_closed', slots: 0, isWeekend: true, closure: slotClosures[0], dateKey };
        } else {
          slot.closedSlots = closedSlots;
          slot.partialClosure = slotClosures[0];
        }
      }
    }

    cells.push({ day: d, dateStr, dateKey, type: 'current', slot, isToday });
  }

  const canGoPrev = !(year === now.getFullYear() && month === now.getMonth());
  const prevMonth = () => { if (!canGoPrev) return; if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const handleCellClick = (cell) => {
    if (cell.slot.status === 'schedule_closed') {
      setClosurePopup({
        title: 'Appointments closed',
        dateStr: cell.dateStr,
        reason: cell.slot.closure?.reason || 'The clinic schedule is closed on this date.',
        slots: cell.slot.closure?.slots || [],
      });
      return;
    }
    setSelectedDate({
      dateStr: cell.dateStr,
      dateKey: cell.dateKey,
      status: cell.slot.status,
      slots: cell.slot.slots,
      isWeekend: cell.slot.isWeekend,
      closedSlots: cell.slot.closedSlots,
      partialClosure: cell.slot.partialClosure,
    });
  };

  const jumpToNextAvailable = () => {
    setClosurePopup(null);
    const check = new Date();
    for (let i = 1; i <= 60; i++) {
      const d = new Date(check);
      d.setDate(check.getDate() + i);
      const day = d.getDay();
      if (day === 0 || day === 6) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const match = closures.find(c => c.startDate <= k && k <= (c.endDate || c.startDate) && c.type === 'day');
        if (!match) {
          setYear(d.getFullYear());
          setMonth(d.getMonth());
          const dateStr = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
          setSelectedDate({
            dateStr,
            dateKey: k,
            status: 'available',
            slots: 8,
            isWeekend: true,
          });
          break;
        }
      }
    }
  };

  const selStatus = selectedDate ? normStatus(selectedDate.status) : null;
  const selMeta = selStatus ? STATUS_META[selStatus] : null;

  return (
    <section id="calendar" style={{ background: '#FFFFFF', padding: '100px 48px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
      {/* Subtle Technical Mesh Grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#F1F5F9 1px,transparent 1px),linear-gradient(90deg,#F1F5F9 1px,transparent 1px)', backgroundSize: '64px 64px', opacity: 0.6, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        
        {/* Section Header */}
        <div className="fade-in-section" style={{ marginBottom: 28 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 18, height: 2, background: '#EF4444', display: 'inline-block', borderRadius: 2 }} />
            WEEKEND CLINIC SLOTS
          </div>
          <h2 style={{ fontSize: 'clamp(2.2rem, 3.5vw, 3.2rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', color: 'var(--text)', marginBottom: 12 }}>
            Appointment <span style={{ color: '#EF4444' }}>Schedule.</span>
          </h2>
          <p style={{ fontSize: '0.98rem', color: 'var(--muted)', maxWidth: 660, lineHeight: 1.7, fontWeight: 400 }}>
            Interactive weekend booking schedule. Select any date to inspect slot availability for <strong style={{ color: '#EF4444', fontWeight: 800 }}>Saturdays & Sundays (8:00 AM – 12:00 PM)</strong>. Book your scheduled follow-up doses, pre-exposure prophylaxis (PrEP), or consultation slots online or via direct hotline.
          </p>
        </div>        {/* Creative Landscape 2-Column Grid — Left: Info & Phone Booking, Right: Interactive Calendar */}
        <div className="fade-in-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
          
          {/* LEFT COLUMN: 24/7 Emergency Policy & Ultra-Compact Contacts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* 24/7 Emergency Policy Card — Compact & Refined */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '12px 16px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.03)',
            }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={13} color="#EF4444" /> 24/7 EMERGENCY POLICY
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.45, fontWeight: 600 }}>
                Emergency PEP walk-in patients with active animal bites are prioritized <strong style={{ color: '#EF4444', fontWeight: 800 }}>daily (Mon–Sun)</strong>.
              </div>
            </div>

            {/* Direct Phone Booking & Smaller Compact Contacts Card */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '14px 16px',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div>
                <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={12} color="#EF4444" /> DIRECT APPOINTMENT BOOKING
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.3 }}>
                  You may book an appointment by calling this number:
                </div>
              </div>

              {/* Compact Phone Action Pill */}
              <a
                href="tel:+639123456789"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  color: '#EF4444',
                  fontWeight: 800,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Phone size={13} color="#FFFFFF" />
                </div>
                <div>
                  <div style={{ fontSize: '0.56rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    DIRECT HOTLINE
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#EF4444', letterSpacing: '-0.2px' }}>
                    +63 912 345 6789
                  </div>
                </div>
              </a>

              {/* Ultra-Compact Clinic Details Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 2 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 1 }}>
                  CLINIC DETAILS & INQUIRIES
                </div>

                {/* Email Row Card */}
                <a href="mailto:dr.kaclinic@gmail.com"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10, textDecoration: 'none', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563EB'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Mail size={12} style={{ color: '#2563EB' }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 700 }}>dr.kaclinic@gmail.com</span>
                </a>

                {/* Address Row Card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MapPin size={12} style={{ color: '#EF4444' }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 700 }}>San Juan St., Libon, Albay</span>
                </div>

                {/* Hours Row Card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Clock size={12} style={{ color: '#10B981' }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 700 }}>8:00 AM – 5:00 PM (Sat & Sun)</span>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Creative Professional Widescreen Calendar & Simple Colors Slot Indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Calendar Container */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>

              {/* Top Weekend Notice Bar */}
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', borderBottom: '1px solid rgba(239, 68, 68, 0.12)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                  Weekend Appointments Only: <span style={{ color: '#EF4444', fontWeight: 800 }}>Saturdays & Sundays (8:00 AM – 5:00 PM)</span>
                </div>
              </div>

              {/* Month Header Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: '#FFFFFF' }}>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                  {MONTHS[month]} {year}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={prevMonth} disabled={!canGoPrev} style={{ width: 28, height: 28, background: 'var(--subtle)', border: '1px solid var(--border)', borderRadius: 8, cursor: canGoPrev ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: canGoPrev ? 'var(--text)' : '#CBD5E1', opacity: canGoPrev ? 1 : 0.4, transition: 'all 0.15s' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button onClick={nextMonth} style={{ width: 28, height: 28, background: 'var(--subtle)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', transition: 'all 0.15s' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </div>

              {/* Status Legend Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)', flexWrap: 'wrap' }}>
                {[
                  ['#10B981', 'Open (Sat & Sun)'],
                  ['#EF4444', 'Fully Booked'],
                  ['#94A3B8', 'Closed (Weekdays)'],
                  ['#CBD5E1', 'Past Date']
                ].map(([c, l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: 'var(--text2)' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}
                  </div>
                ))}
              </div>

              {/* Expanded Landscape Grid */}
              <div style={{ padding: '8px 14px 14px', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 6 }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                    const isWeekendCol = i === 0 || i === 6;
                    return (
                      <div key={d} style={{ minWidth: 0, padding: '5px 0', textAlign: 'center', fontSize: '0.68rem', fontWeight: 800, color: isWeekendCol ? '#EF4444' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px', background: isWeekendCol ? 'rgba(239, 68, 68, 0.04)' : 'transparent', borderRadius: 6 }}>
                        {d} {isWeekendCol && <span style={{ fontSize: '0.58rem', opacity: 0.8 }}>✦</span>}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
                  {cells.map((cell, i) => {
                    if (cell.type === 'other') return (
                      <div key={i} style={{ minWidth: 0, minHeight: 40, background: '#F8FAFC', borderRadius: 9, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '6px 8px', border: '1px solid #F1F5F9', opacity: 0.5 }}>
                        <span style={{ fontSize: '0.7rem', color: '#CBD5E1', fontWeight: 600 }}>{cell.day}</span>
                      </div>
                    );

                    const { slot, isToday, dateStr } = cell;
                    const st = normStatus(slot.status);
                    const isSelected = selectedDate && selectedDate.dateStr === dateStr;
                    const meta = STATUS_META[st] || STATUS_META.closed;

                    const cellBorder = isSelected
                      ? '2px solid #2563EB'
                      : isToday
                        ? '2px solid #EF4444'
                        : `1px solid ${meta.border}`;
                    const cellRing = isSelected ? '0 0 0 3px rgba(37,99,235,0.16)' : 'none';

                    return (
                      <div key={i} className="ka-cal-day"
                        style={{
                          minWidth: 0,
                          minHeight: 40,
                          background: meta.bg,
                          borderRadius: 9,
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '5px 7px',
                          border: cellBorder,
                          boxShadow: cellRing,
                          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                        onClick={() => handleCellClick(cell)}
                        title="Click to view date details"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'auto' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: isToday ? 900 : 700, color: isSelected ? '#2563EB' : isToday ? '#EF4444' : 'var(--text)' }}>
                            {cell.day}
                          </span>
                          {st === 'available' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />}
                          {st === 'full' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />}
                          {st === 'schedule_closed' && <Lock size={11} color="#D97706" />}
                          {st === 'closed' && <Lock size={10} color="#94A3B8" />}
                        </div>

                        {st === 'available' && (
                          <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#10B981', marginTop: 2 }}>
                            {slot.slots} slots open
                          </span>
                        )}
                        {st === 'full' && (
                          <span style={{ fontSize: '0.54rem', fontWeight: 800, color: '#EF4444', marginTop: 2 }}>
                            Fully Booked
                          </span>
                        )}
                        {st === 'schedule_closed' && (
                          <span style={{ fontSize: '0.54rem', fontWeight: 700, color: '#D97706', marginTop: 2 }}>
                            Closed
                          </span>
                        )}
                        {st === 'closed' && (
                          <span style={{ fontSize: '0.54rem', fontWeight: 600, color: '#94A3B8', marginTop: 2 }}>
                            Closed
                          </span>
                        )}
                        {st === 'past' && (
                          <span style={{ fontSize: '0.54rem', fontWeight: 600, color: '#94A3B8', marginTop: 2 }}>
                            Past
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SIMPLE COLORS DYNAMIC SLOT INDICATOR BAR BELOW THE CALENDAR */}
            {selectedDate ? (
              selectedDate.isWeekend || selStatus === 'available' || selStatus === 'full' ? (
                <div style={{
                  background: '#FFFFFF',
                  border: `1px solid ${selStatus === 'available' ? '#10B981' : '#EF4444'}`,
                  borderRadius: 14,
                  padding: '9px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                }}>
                  {selStatus === 'available' ? (
                    <CheckCircle2 size={16} color="#10B981" style={{ flexShrink: 0 }} />
                  ) : (
                    <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0 }} />
                  )}
                  <div style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 800 }}>{selectedDate.dateStr}:</strong>{' '}
                    {selStatus === 'available' ? (
                      <span>
                        <strong style={{ color: '#10B981', fontWeight: 800 }}>{selectedDate.slots} Appointment Slots Open</strong> (30–45 mins per slot · 8:00 AM – 5:00 PM)
                      </span>
                    ) : (
                      <span>
                        <strong style={{ color: '#EF4444', fontWeight: 800 }}>Fully Booked</strong> (Emergency Rabies PEP walk-ins prioritized daily)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* Weekday Clicked Indicator — Simple Colors Walk-Ins Only */
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 14,
                  padding: '9px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                }}>
                  <Lock size={16} color="#64748B" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 800 }}>{selectedDate.dateStr}:</strong>{' '}
                    <strong style={{ color: '#64748B', fontWeight: 700 }}>Closed for Scheduled Appointments</strong> — Walk-ins only for emergency Rabies PEP.
                  </div>
                </div>
              )
            ) : (
              /* Default Simple Colors Prompt */
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}>
                <Clock size={16} color="#64748B" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.4, fontWeight: 500 }}>
                  <strong style={{ color: 'var(--text)', fontWeight: 800 }}>Slot Inspector:</strong> Click any weekend date on the grid to view 30–45 min appointment slots, or click any weekday date for walk-in policy.
                </div>
              </div>
            )}

        </div>

      </div>

      {/* K&A Custom Styled Schedule Closure Popup Modal */}
      {closurePopup && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setClosurePopup(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'scaleIn 0.2s ease-out',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {closurePopup.title || 'Appointments closed'}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0', fontWeight: 600 }}>
                    {closurePopup.dateStr}{closurePopup.slots && closurePopup.slots.length > 0 ? ` (${closurePopup.slots.join(', ')})` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClosurePopup(null)}
                style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Highlighted Quote Box */}
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  Message from K&amp;A Clinic
                </div>
                <div style={{ fontSize: '0.85rem', color: '#78350F', fontWeight: 600, lineHeight: 1.5, fontStyle: 'italic' }}>
                  &ldquo;{closurePopup.reason}&rdquo;
                </div>
              </div>

              {/* Helper line */}
              <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.45, background: '#F8FAFC', borderRadius: 12, padding: '10px 14px', border: '1px solid #E2E8F0' }}>
                Please choose another date or time. Walk-ins are accepted <strong style={{ color: '#0F172A' }}>Mon–Fri, 8 AM–5 PM</strong>.
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '14px 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              <button
                type="button"
                onClick={jumpToNextAvailable}
                style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>Show next available</span>
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setClosurePopup(null)}
                style={{ padding: '9px 18px', borderRadius: 12, border: 'none', background: '#3B50DF', color: '#FFFFFF', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Pick another date
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
