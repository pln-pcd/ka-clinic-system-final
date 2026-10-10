import React, { useState, useEffect, useRef, useCallback } from 'react';
import { askGemini } from '../../lib/geminiService';
import { KAI_DISCLAIMER } from '../../lib/studyMode';

/* Inject typing animation keyframes once */
const CHATBOT_STYLE_ID = 'ka-chatbot-styles';
const chatbotCSS = `
@keyframes cbTypingBounce {
  0%,60%,100% { transform: translateY(0); opacity:.4; }
  30% { transform: translateY(-4px); opacity:1; }
}
@keyframes cbPulseGlow {
  0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(52,211,153,0.5); }
  50% { opacity:.85; box-shadow:0 0 0 4px rgba(52,211,153,0); }
}
.cb-no-scrollbar::-webkit-scrollbar { display:none; }
.cb-no-scrollbar { scrollbar-width:none; -ms-overflow-style:none; }
.cb-chip { transition:all 0.18s ease; }
.cb-chip:active { transform:scale(0.95); }
`;

function formatMessageText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [badge, setBadge] = useState(false);
  const [quickShown, setQuickShown] = useState(true);
  const msgsRef = useRef(null);
  // One question in flight at a time (Enter plus a click, or a held Enter key,
  // used to send the same question twice), and the latest transcript for the
  // history, not a copy captured when send() was created.
  const sendingRef = useRef(false);
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  /* Inject styles */
  useEffect(() => {
    if (!document.getElementById(CHATBOT_STYLE_ID)) {
      const s = document.createElement('style');
      s.id = CHATBOT_STYLE_ID;
      s.textContent = chatbotCSS;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (!open) setBadge(true); }, 3000);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages, typing]);

  const now = () => new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const addMsg = useCallback((role, text) => {
    setMessages(m => [...m, { role, text, time: now() }]);
  }, []);

  const toggle = () => {
    if (!open) {
      setBadge(false);
      setMessages(m => {
        if (m.length === 0) {
          return [{ role: 'bot', text: "👋 Hello! I'm KAI, the K&A Clinic assistant. I can help with office hours, booking an appointment, how to reach us, and using the app. I don't give medical advice. How can I help?", time: now() }];
        }
        return m;
      });
    }
    setOpen(o => !o);
  };

  const send = useCallback(async (msg) => {
    const text = (msg || input).trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    const history = messagesRef.current;
    setInput('');
    setQuickShown(false);
    addMsg('user', text);
    setTyping(true);

    try {
      const replyText = await askGemini(text, history);
      addMsg('bot', replyText);
    } catch (err) {
      addMsg('bot', "I'm having trouble connecting right now. Please contact K&A Clinic at +63 912 345 6789, or try again shortly.");
    } finally {
      setTyping(false);
      sendingRef.current = false;
    }
  }, [input, addMsg]);

  const QUICK = [
    ['🕒 Clinic Hours', 'What are your clinic hours and days?'],
    ['📅 Book an Appointment', 'How do I book an appointment?'],
    ['📍 Clinic Location', 'Where is K&A Clinic located?'],
    ['📱 How to Use the App', 'How do I use the patient mobile app?'],
  ];

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        onClick={toggle}
        aria-label="Open K&A Helpdesk Chatbot"
        className="cb-chip"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 9999,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: '0 8px 24px rgba(220,38,38,0.35), 0 2px 6px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          transition: 'all 0.25s cubic-bezier(.34,1.2,.64,1)',
          transform: open ? 'scale(0.9) rotate(90deg)' : 'scale(1) rotate(0deg)',
        }}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {badge && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 12, height: 12, borderRadius: '50%',
                background: '#34D399', border: '2px solid #DC2626',
                animation: 'cbPulseGlow 2s ease infinite',
              }} />
            )}
          </div>
        )}
      </button>

      {/* ── Chat Panel ── */}
      <div style={{
        position: 'fixed',
        bottom: 100,
        right: 28,
        zIndex: 9998,
        width: 380,
        maxWidth: 'calc(100vw - 40px)',
        height: 540,
        maxHeight: 'calc(100vh - 140px)',
        borderRadius: 24,
        background: '#FFFFFF',
        boxShadow: '0 20px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transform: open ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'all' : 'none',
        transition: 'all 0.25s cubic-bezier(.34,1.2,.64,1)',
        transformOrigin: 'bottom right',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 16px 16px 20px',
          background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 50%, #991B1B 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Frosted Avatar Badge */}
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}>
              <img src="/assets/dashboard/logo-white-nobg.png" alt="K&A Clinic" style={{ width: 30, height: 30, objectFit: 'contain', background: '#FFFFFF', borderRadius: '50%' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>KAI · K&A Assistant</div>
              <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, letterSpacing: '0.02em' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#34D399',
                  display: 'inline-block', flexShrink: 0,
                  animation: 'cbPulseGlow 2s ease infinite',
                }} />
                Online · Virtual Assistant
              </div>
            </div>
          </div>
          {/* Close (X) */}
          <button
            onClick={toggle}
            aria-label="Close Chat"
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, cursor: 'pointer', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Persistent assistant disclaimer ── */}
        <div role="note" style={{
          padding: '9px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
          fontSize: '0.6875rem', lineHeight: 1.5, color: '#334155', fontWeight: 500, flexShrink: 0,
        }}>
          {KAI_DISCLAIMER}
        </div>

        {/* ── Messages ── */}
        <div ref={msgsRef} className="cb-no-scrollbar" style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
        }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              {/* Avatar */}
              {m.role === 'user' ? (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: '#E2E8F0', border: '1px solid #CBD5E1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', marginTop: 4,
                }}>👤</div>
              ) : (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: '#FEE2E2', border: '1px solid #FECACA',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.8 2.3A.3.3 0 105 2H4a2 2 0 00-2 2v5a6 6 0 006 6v0a6 6 0 006-6V4a2 2 0 00-2-2h-1a.2.2 0 10.3.3" />
                    <path d="M8 15v1a6 6 0 006 6v0a6 6 0 006-6v-4" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                  </svg>
                </div>
              )}
              <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontSize: '0.8125rem', lineHeight: 1.6,
                    background: m.role === 'user' ? '#DC2626' : '#FFFFFF',
                    color: m.role === 'user' ? '#FFFFFF' : '#1E293B',
                    border: m.role === 'user' ? 'none' : '1px solid #F1F5F9',
                    boxShadow: m.role === 'user' ? '0 2px 8px rgba(220,38,38,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                  dangerouslySetInnerHTML={{ __html: formatMessageText(m.text) }}
                />
                <span style={{ fontSize: '0.625rem', color: '#94A3B8', marginTop: 4, fontWeight: 500, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                  {m.time}
                </span>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {typing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: '#FEE2E2', border: '1px solid #FECACA',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.8 2.3A.3.3 0 105 2H4a2 2 0 00-2 2v5a6 6 0 006 6v0a6 6 0 006-6V4a2 2 0 00-2-2h-1a.2.2 0 10.3.3" />
                  <path d="M8 15v1a6 6 0 006 6v0a6 6 0 006-6v-4" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
              </div>
              <div style={{
                padding: '12px 16px', background: '#FFFFFF', border: '1px solid #F1F5F9',
                borderRadius: '18px 18px 18px 4px', display: 'flex', gap: 5, alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                {[0, 0.15, 0.3].map((delay, i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#94A3B8',
                    display: 'inline-block',
                    animation: `cbTypingBounce 1.2s ${delay}s ease infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Quick Suggestion Chips (Horizontal Scroll) ── */}
        {quickShown && messages.length > 0 && (
          <div
            className="cb-no-scrollbar"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              overflowX: 'auto', padding: '10px 16px',
              background: 'rgba(248,250,252,0.8)',
              borderTop: '1px solid #F1F5F9',
              flexShrink: 0,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {QUICK.map(([label, msg]) => (
              <button
                key={label}
                className="cb-chip"
                onClick={() => send(msg)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap', flexShrink: 0,
                  background: '#FFFFFF', border: '1px solid #E2E8F0',
                  borderRadius: 9999, padding: '7px 14px',
                  fontSize: '0.75rem', fontWeight: 600, color: '#475569',
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#B91C1C'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#475569'; }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Input Container ── */}
        <div style={{ borderTop: '1px solid #F1F5F9', flexShrink: 0, background: '#FFFFFF', padding: '12px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !e.repeat && !e.nativeEvent.isComposing && (e.preventDefault(), send())}
            placeholder="Ask about hours, booking, or the app…"
            style={{
              flex: 1, background: 'rgba(241,245,249,0.8)',
              border: '1px solid #E2E8F0', borderRadius: 9999,
              padding: '10px 16px', fontSize: '0.75rem', color: '#1E293B',
              outline: 'none', transition: 'all 0.2s ease',
            }}
            onFocus={e => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.08)'; }}
            onBlur={e => { e.target.style.background = 'rgba(241,245,249,0.8)'; e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || typing}
            aria-label="Send message"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#DC2626', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(220,38,38,0.25)',
              transition: 'all 0.15s ease',
              opacity: (!input.trim() && !typing) ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (input.trim()) e.currentTarget.style.background = '#B91C1C'; }}
            onMouseLeave={e => e.currentTarget.style.background = '#DC2626'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
