import React, { useState, useEffect } from 'react';
import { addDoc, collection, doc } from 'firebase/firestore';
import { db, listen } from '../../lib/firebase';
import { Lock, AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react';

export default function BookingModal({ onClose, currentUser = null, selectedDate = null }) {
  const [step, setStep] = useState('form');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Maintenance mode was removed from Settings; booking is never paused here.
  const maintenanceMode = false;
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('17:00');

  const [form, setForm] = useState({
    name: currentUser?.name || currentUser?.displayName || '',
    phone: currentUser?.contact || currentUser?.phoneNumber || '',
    mrn: currentUser?.mrn || '',
    date: selectedDate || '',
    time: '8:00 AM – 9:00 AM',
    purpose: 'Post-Exposure PEP (Follow-up dose)'
  });

  // Update form when currentUser or selectedDate changes
  useEffect(() => {
    if (currentUser) {
      setForm(prev => ({
        ...prev,
        name: currentUser.name || currentUser.displayName || prev.name,
        phone: currentUser.contact || currentUser.phoneNumber || prev.phone,
        mrn: currentUser.mrn || prev.mrn,
      }));
    }
    if (selectedDate) {
      setForm(prev => ({ ...prev, date: selectedDate }));
    }
  }, [currentUser, selectedDate]);

  // ── Listen to /settings/config in real time ──
  useEffect(() => {
    const unsub = listen(doc(db, 'settings', 'config'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.clinic?.openTime) setOpenTime(d.clinic.openTime);
        if (d.clinic?.closeTime) setCloseTime(d.clinic.closeTime);
      }
    });
    return () => unsub();
  }, []);

  // ── Generate time slots based on openTime and closeTime ──
  const generateTimeSlots = () => {
    const startHour = parseInt(openTime.split(':')[0], 10) || 8;
    const endHour = parseInt(closeTime.split(':')[0], 10) || 17;
    const slots = [];

    for (let h = startHour; h < endHour; h++) {
      const formatH = hour => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const display = hour % 12 === 0 ? 12 : hour % 12;
        return `${display}:00 ${ampm}`;
      };
      slots.push(`${formatH(h)} – ${formatH(h + 1)}`);
    }
    return slots.length > 0 ? slots : ['8:00 AM – 9:00 AM', '9:00 AM – 10:00 AM', '10:00 AM – 11:00 AM', '11:00 AM – 12:00 PM'];
  };

  const timeSlots = generateTimeSlots();

  const weekends = [];
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const label = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    weekends.push({ label, slots: 8, status: 'available' });
    if (weekends.length >= 14) break;
  }

  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 2) e.name = 'Please enter your full name';
    if (!form.phone.trim() || !/^[0-9\s\-+()]{7,}$/.test(form.phone)) e.phone = 'Please enter a valid phone number';
    if (!form.date) e.date = 'Please select a date';
    return e;
  };

  const submit = async () => {
    if (maintenanceMode) {
      setSubmitError('System is currently under maintenance. Appointment booking is temporarily disabled.');
      return;
    }
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    setSubmitError('');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'appointments'), {
        name: (form.name || '').trim(),
        contactNumber: (form.phone || '').trim(),
        patientId: form.mrn || currentUser?.mrn || '',
        patientUid: currentUser?.uid || null,
        date: form.date || '',
        time: form.time || '',
        type: form.purpose || '',
        status: 'pending',
        source: 'online',
        createdAt: Date.now(),
      });
      setStep('success');
    } catch (err) {
      setSubmitError(err?.message || "Something went wrong. Please call us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  const iStyle = (field, isLocked = false) => ({
    width: '100%',
    background: isLocked ? '#F1F5F9' : '#F8FAFC',
    border: `1.5px solid ${errors[field] ? '#EF4444' : 'var(--border)'}`,
    borderRadius: 12,
    padding: '12px 16px',
    fontFamily: "'Plus Jakarta Sans',sans-serif",
    fontSize: '0.875rem',
    color: 'var(--text)',
    outline: 'none',
    transition: 'border-color 0.15s',
    cursor: isLocked ? 'not-allowed' : 'text'
  });

  const isUserLocked = Boolean(currentUser && (currentUser.name || currentUser.displayName));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: 36, boxShadow: '0 30px 80px rgba(0,0,0,0.12)' }}>
        {step === 'form' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Book an Appointment</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, lineHeight: 0 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 20 }}>Operating Hours: {openTime} – {closeTime}</p>

            {/* Verified Patient Banner */}
            {currentUser && (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78125rem', color: '#065F46', fontWeight: 600 }}>
                <ShieldCheck size={18} color="#10B981" style={{ flexShrink: 0 }} />
                <span>Verified Patient Account ({currentUser.mrn || 'Authorized Patient'}) — Contact details pre-filled & locked.</span>
              </div>
            )}

            {/* Maintenance Mode Warning (No Emoji) */}
            {maintenanceMode && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 16px', marginBottom: 24, color: '#991B1B', fontSize: '0.825rem', fontWeight: 700, lineHeight: 1.6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Lock size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>System Under Maintenance</strong><br />
                  Appointment booking is temporarily disabled for system updates. Please check back later or contact the clinic.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name *</label>
                {isUserLocked && <span style={{ fontSize: '0.6875rem', color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={12} /> Locked</span>}
              </div>
              <input type="text" placeholder="Juan dela Cruz" value={form.name} style={iStyle('name', isUserLocked)} disabled={maintenanceMode || isUserLocked} readOnly={isUserLocked}
                onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })); }} />
              {errors.name && <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: 4, fontWeight: 600 }}>{errors.name}</div>}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact Number *</label>
                {isUserLocked && <span style={{ fontSize: '0.6875rem', color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={12} /> Locked</span>}
              </div>
              <input type="tel" placeholder="09XX XXX XXXX" value={form.phone} style={iStyle('phone', isUserLocked)} disabled={maintenanceMode || isUserLocked} readOnly={isUserLocked}
                onChange={e => { setForm(p => ({ ...p, phone: e.target.value })); setErrors(p => ({ ...p, phone: '' })); }} />
              {errors.phone && <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: 4, fontWeight: 600 }}>{errors.phone}</div>}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preferred Date *</label>
              <select value={form.date} style={iStyle('date')} disabled={maintenanceMode} onChange={e => { setForm(p => ({ ...p, date: e.target.value })); setErrors(p => ({ ...p, date: '' })); }}>
                <option value="">Select a date…</option>
                {weekends.map(w => <option key={w.label} value={w.label}>{w.label}</option>)}
              </select>
              {errors.date && <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: 4, fontWeight: 600 }}>{errors.date}</div>}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time Slot</label>
              <select value={form.time} style={iStyle('')} disabled={maintenanceMode} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}>
                {timeSlots.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Purpose</label>
              <select value={form.purpose} style={iStyle('')} disabled={maintenanceMode} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}>
                {['Post-Exposure PEP (Follow-up dose)', 'Pre-Exposure PrEP (New)', 'Booster Dose', 'RIG Administration', 'Wound Assessment', 'Other / Consultation'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            {submitError && (
              <div style={{ fontSize: '0.8rem', color: '#EF4444', marginBottom: 16, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color="#DC2626" />
                <span>{submitError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={onClose} disabled={submitting} style={{ flex: 1, background: 'var(--bg-alt)', color: 'var(--text)', border: '1px solid var(--border)', padding: '13px', borderRadius: 9999, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={submitting || maintenanceMode} style={{ flex: 2, background: maintenanceMode ? '#94A3B8' : 'var(--red)', color: 'white', border: 'none', padding: '13px', borderRadius: 9999, fontSize: '0.875rem', fontWeight: 700, cursor: (submitting || maintenanceMode) ? 'not-allowed' : 'pointer', opacity: (submitting || maintenanceMode) ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {maintenanceMode ? <><Lock size={16} /> System Under Maintenance</> : submitting ? 'Booking…' : 'Confirm Booking'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <CheckCircle2 size={54} color="#10B981" />
            </div>
            <h4 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Appointment Confirmed</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: 8 }}>Your appointment for <strong style={{ color: 'var(--text)' }}>{form.date}</strong> at <strong style={{ color: 'var(--text)' }}>{form.time}</strong> has been recorded.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>Purpose: <strong style={{ color: 'var(--text2)' }}>{form.purpose}</strong><br />We'll see you at K&A Clinic, {form.name.split(' ')[0]}!</p>
            <button onClick={onClose} style={{ width: '100%', background: 'var(--red)', color: 'white', border: 'none', padding: '14px', borderRadius: 9999, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
