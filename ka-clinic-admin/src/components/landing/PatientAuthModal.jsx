import React, { useState } from 'react';
import { KeyRound, UserCheck, X, ShieldCheck, AlertCircle } from 'lucide-react';

// Real backend-verified email OTP: /api/send-otp and /api/verify-otp (see
// /api at the repo root) own code generation, Gmail SMTP email delivery, and
// Firestore-backed attempt/expiry tracking via the Admin SDK. This modal
// only calls those two endpoints — it never touches Firestore directly.
export default function PatientAuthModal({ onClose, onSuccess }) {
  const [step, setStep] = useState('input'); // 'input' or 'otp'
  const [mrnInput, setMrnInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  const handleMRNLookup = async () => {
    const mrnTrimmed = mrnInput.trim();
    if (!mrnTrimmed) {
      setError('Please enter your Medical Record Number (MRN).');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrn: mrnTrimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'MRN record not found or not authorized. Please contact the clinic for registration.');
        setLoading(false);
        return;
      }

      setMaskedEmail(data.maskedEmail || '');
      setStep('otp');
    } catch (err) {
      console.error('MRN lookup error:', err);
      setError('Failed to verify MRN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpInput || otpInput.trim().length < 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrn: mrnInput.trim(), enteredCode: otpInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid verification code.');
        setLoading(false);
        return;
      }

      const patient = data.patient || {};
      const verifiedUser = {
        mrn: patient.mrn || mrnInput.trim(),
        name: patient.name || 'Verified Patient',
        email: patient.email || '',
        contact: patient.contact || '',
        isVerifiedPatient: true,
        uid: patient.uid || null,
      };
      onSuccess(verifiedUser);
    } catch (err) {
      console.error('OTP verification error:', err);
      setError('Failed to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 24,
          width: '100%',
          maxWidth: 440,
          padding: 32,
          boxShadow: '0 30px 80px rgba(0,0,0,0.18)',
          position: 'relative'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: '#F1F5F9',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748B'
          }}
        >
          <X size={18} />
        </button>

        {step === 'input' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <KeyRound size={20} color="#2563EB" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Patient MRN Login
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Verify your identity to reserve slots
                </span>
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 16,
                  color: '#991B1B',
                  fontSize: '0.78125rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
                Medical Record Number (MRN) *
              </label>
              <input
                type="text"
                placeholder="e.g. 2026-001"
                value={mrnInput}
                onChange={e => setMrnInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.875rem',
                  outline: 'none',
                  fontWeight: 600
                }}
              />
              <span style={{ fontSize: '0.71875rem', color: '#94A3B8', marginTop: 4, display: 'block' }}>
                Given by clinic staff during your first consult or PEP dose.
              </span>
            </div>

            <button
              onClick={handleMRNLookup}
              disabled={loading}
              style={{
                width: '100%',
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 12,
                padding: '13px',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12
              }}
            >
              <UserCheck size={16} /> {loading ? 'Verifying...' : 'Verify Record'}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: '#ECFDF5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ShieldCheck size={20} color="#10B981" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Email OTP Verification
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Code sent to {maskedEmail || 'your registered email'}
                </span>
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 16,
                  color: '#991B1B',
                  fontSize: '0.78125rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
                Enter 6-Digit Email Code
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={otpInput}
                onChange={e => setOtpInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1.5px solid #10B981',
                  fontSize: '1.25rem',
                  letterSpacing: '6px',
                  textAlign: 'center',
                  outline: 'none',
                  fontWeight: 800
                }}
              />
            </div>

            <button
              onClick={handleVerifyOTP}
              disabled={loading}
              style={{
                width: '100%',
                background: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 12,
                padding: '13px',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <ShieldCheck size={16} /> {loading ? 'Authorizing Session...' : 'Confirm & Proceed to Booking'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
