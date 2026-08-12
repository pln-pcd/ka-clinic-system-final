import React from 'react';
import { Lock, KeyRound, ShieldAlert, X } from 'lucide-react';

export default function AuthRequiredModal({ onClose, onOpenMRNAuth, onOpenPhoneAuth }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        zIndex: 1200,
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
          maxWidth: 480,
          padding: 32,
          boxShadow: '0 30px 80px rgba(0,0,0,0.18)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Close Button */}
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
            color: '#64748B',
            transition: 'all 0.15s'
          }}
        >
          <X size={18} />
        </button>

        {/* Header with Lock Icon (No Emojis) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: '#FEF2F2',
              border: '1px solid #FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Lock className="w-5 h-5 text-red-600" size={20} color="#DC2626" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.3 }}>
              Existing Patient Access Only
            </h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
              Official MRN Required
            </span>
          </div>
        </div>

        {/* Body Text */}
        <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, marginBottom: 24 }}>
          Appointment booking is exclusively reserved for registered patients with an official Medical Record Number (MRN).
        </p>

        {/* Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <button
            onClick={onOpenMRNAuth}
            style={{
              width: '100%',
              background: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 12,
              padding: '13px 18px',
              fontSize: '0.875rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
              transition: 'background 0.15s'
            }}
          >
            <KeyRound size={16} /> Enter Assigned MRN to Sign In
          </button>
        </div>

        {/* First-Time Patient Walk-In Notice */}
        <div
          style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start'
          }}
        >
          <ShieldAlert size={20} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.78125rem', color: '#92400E', lineHeight: 1.5 }}>
            <strong style={{ display: 'block', marginBottom: 2, color: '#B45309' }}>
              First-Time Patient Directive (Walk-in Required):
            </strong>
            First-time bite victims must walk in directly Monday through Friday (8:00 AM – 5:00 PM) at the Libon, Albay clinic for their Day 0 consultation and initial MRN assignment. Online booking is restricted to existing patients.
          </div>
        </div>
      </div>
    </div>
  );
}
