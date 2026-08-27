import { useEffect, useRef, useState } from "react";

/**
 * AdminLandingPage — the staff/admin gateway for K&A Anti-Rabies Clinic.
 *
 * This is deliberately NOT the patient marketing page (LandingPage.jsx).
 * Audience: nurses, doctors, and clinic admins arriving before they sign
 * into the operations dashboard. Job: get them signed in quickly, while
 * feeling like a live clinical tool rather than a brochure.
 *
 * Usage (mirrors the existing landing/src/App.jsx pattern):
 *
 *   import AdminLandingPage from "./AdminLandingPage.jsx";
 *   const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5173";
 *
 *   function AdminApp() {
 *     const goToDashboard = () => { window.location.href = ADMIN_URL; };
 *     return <AdminLandingPage onEnterDashboard={goToDashboard} />;
 *   }
 *
 * The sign-in fields below are presentational only — wire handleSubmit
 * to your real Firebase auth call, or leave the default behavior, which
 * simply forwards to onEnterDashboard() so this page can ship today and
 * grow into a real inline auth form later without changing its shape.
 */

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  .kap-root, .kap-root *, .kap-root *::before, .kap-root *::after {
    box-sizing: border-box; margin: 0; padding: 0;
  }
  .kap-root {
    --ink: #10141C;
    --ink2: #161C27;
    --paper: #F5F6F8;
    --card: #FFFFFF;
    --red: #C4212C;
    --red-dark: #9C1A23;
    --red-dim: rgba(196,33,44,0.14);
    --teal: #0F8177;
    --teal-dim: rgba(15,129,119,0.16);
    --line-ink: rgba(238,241,245,0.12);
    --line-paper: #E3E6EB;
    --text-ink: #EEF1F5;
    --text-ink-muted: rgba(238,241,245,0.60);
    --text-paper: #151B24;
    --text-paper-muted: #5B6672;
    font-family: 'Inter', sans-serif;
    background: var(--paper);
    color: var(--text-paper);
    min-height: 100vh;
    line-height: 1.55;
  }
  .kap-root [data-mono] { font-family: 'DM Mono', monospace; }
  .kap-root [data-display] { font-family: 'Fraunces', serif; }

  .kap-root a, .kap-root button { font-family: inherit; }
  .kap-root :focus-visible {
    outline: 2px solid var(--teal);
    outline-offset: 3px;
    border-radius: 6px;
  }

  @keyframes kap-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.78); }
  }
  @keyframes kap-rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .kap-dot { animation: kap-pulse 2.4s ease-in-out infinite; }
  .kap-rise { animation: kap-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }

  @media (prefers-reduced-motion: reduce) {
    .kap-dot, .kap-rise { animation: none !important; }
  }

  .kap-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.9fr);
    min-height: 100vh;
  }
  @media (max-width: 900px) {
    .kap-grid { grid-template-columns: 1fr; }
  }

  .kap-input {
    width: 100%;
    background: #FBFBFC;
    border: 1px solid var(--line-paper);
    border-radius: 10px;
    padding: 13px 14px;
    font-size: 0.9375rem;
    color: var(--text-paper);
    transition: border-color 0.16s ease, background 0.16s ease;
  }
  .kap-input::placeholder { color: #9AA3AF; }
  .kap-input:focus {
    border-color: var(--teal);
    background: #FFFFFF;
  }

  .kap-btn-primary {
    width: 100%;
    background: var(--red);
    color: #FFFFFF;
    border: none;
    border-radius: 10px;
    padding: 13px 18px;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.16s ease, transform 0.16s ease;
  }
  .kap-btn-primary:hover { background: var(--red-dark); transform: translateY(-1px); }
  .kap-btn-primary:active { transform: translateY(0); }

  .kap-strip-item { display: flex; align-items: center; gap: 9px; white-space: nowrap; }
  .kap-strip-sep { width: 1px; height: 14px; background: var(--line-ink); flex: none; }
`;

function LiveOpsStrip() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      data-mono
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        rowGap: 10,
        fontSize: "0.6875rem",
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "var(--text-ink-muted)",
        border: "1px solid var(--line-ink)",
        borderRadius: 999,
        padding: "10px 18px",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span className="kap-strip-item">
        <span
          className="kap-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--teal)",
            display: "inline-block",
            flex: "none",
          }}
        />
        System status — Operational
      </span>
      <span className="kap-strip-sep" />
      <span className="kap-strip-item">Today — {dateLabel}</span>
      <span className="kap-strip-sep" />
      <span className="kap-strip-item">Records — Synced</span>
    </div>
  );
}

export default function AdminLandingPage({
  onEnterDashboard = () => {},
  clinicName = "K&A Anti-Rabies Clinic",
  clinicAddress = "San Juan St., Libon, Albay",
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    // Presentational default: forward straight to the dashboard, where the
    // existing admin OTP/password flow takes over. Swap this for a real
    // Firebase call if you want auth to happen inline on this page instead.
    onEnterDashboard({ email, password });
  };

  return (
    <div className="kap-root">
      <style>{globalStyles}</style>

      <div className="kap-grid">
        {/* ── Left: ink panel — brand, mission line, live ops strip ── */}
        <div
          style={{
            background: "linear-gradient(155deg, var(--ink) 0%, var(--ink2) 100%)",
            color: "var(--text-ink)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "clamp(28px, 5vw, 72px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* subtle corner mark, purely atmospheric */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -120,
              right: -120,
              width: 320,
              height: 320,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(196,33,44,0.16) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          <header
            className="kap-rise"
            style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "var(--red)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Fraunces, serif",
                fontWeight: 600,
                fontSize: "1rem",
                color: "#fff",
                flex: "none",
              }}
            >
              K+A
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, letterSpacing: 0.2 }}>
                {clinicName}
              </div>
              <div
                data-mono
                style={{
                  fontSize: "0.625rem",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "var(--text-ink-muted)",
                  marginTop: 2,
                }}
              >
                Staff Portal
              </div>
            </div>
          </header>

          <div
            className="kap-rise"
            style={{
              position: "relative",
              maxWidth: 560,
              marginTop: "clamp(40px, 8vw, 0px)",
              animationDelay: "0.08s",
            }}
          >
            <div
              data-mono
              style={{
                fontSize: "0.6875rem",
                letterSpacing: 2.5,
                textTransform: "uppercase",
                color: "var(--red)",
                marginBottom: 18,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ width: 22, height: 1, background: "var(--red)", display: "inline-block" }} />
              Operations Dashboard
            </div>
            <h1
              data-display
              style={{
                fontSize: "clamp(2.1rem, 4.2vw, 3.1rem)",
                fontWeight: 500,
                lineHeight: 1.12,
                letterSpacing: -0.5,
                marginBottom: 20,
              }}
            >
              Every case, every dose,<br />tracked from Day&nbsp;0.
            </h1>
            <p
              style={{
                fontSize: "1rem",
                color: "var(--text-ink-muted)",
                maxWidth: 440,
                marginBottom: 36,
              }}
            >
              Sign in to manage patient records, PEP schedules, and exposure
              cases across the clinic — built for the people running the
              front desk, not the people booking it.
            </p>
            <LiveOpsStrip />
          </div>

          <footer
            className="kap-rise"
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 16,
              flexWrap: "wrap",
              fontSize: "0.75rem",
              color: "var(--text-ink-muted)",
              animationDelay: "0.16s",
            }}
          >
            <span>{clinicAddress}</span>
            <span data-mono>DOH-Certified ABTC</span>
          </footer>
        </div>

        {/* ── Right: paper panel — sign-in card ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(28px, 5vw, 56px)",
          }}
        >
          <div
            className="kap-rise"
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--card)",
              border: "1px solid var(--line-paper)",
              borderRadius: 18,
              padding: "36px 32px",
              boxShadow: "0 1px 2px rgba(16,20,28,0.04), 0 16px 40px rgba(16,20,28,0.06)",
              animationDelay: "0.1s",
            }}
          >
            <h2
              data-display
              style={{
                fontSize: "1.5rem",
                fontWeight: 500,
                letterSpacing: -0.2,
                marginBottom: 6,
              }}
            >
              Sign in
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-paper-muted)",
                marginBottom: 28,
              }}
            >
              Access your clinic's operations dashboard.
            </p>

            <form ref={formRef} onSubmit={handleSubmit}>
              <label
                htmlFor="kap-email"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-paper-muted)",
                  marginBottom: 6,
                }}
              >
                Staff email
              </label>
              <input
                id="kap-email"
                type="email"
                required
                autoComplete="username"
                placeholder="you@kaclinic.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="kap-input"
                style={{ marginBottom: 16 }}
              />

              <label
                htmlFor="kap-password"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-paper-muted)",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                id="kap-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="kap-input"
                style={{ marginBottom: 22 }}
              />

              <button type="submit" className="kap-btn-primary" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in to dashboard"}
                {!submitting && (
                  <span aria-hidden="true" style={{ fontSize: "1rem", lineHeight: 1 }}>
                    →
                  </span>
                )}
              </button>
            </form>

            <div
              style={{
                marginTop: 20,
                paddingTop: 20,
                borderTop: "1px solid var(--line-paper)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.8125rem",
              }}
            >
              <a
                href="#forgot-password"
                style={{ color: "var(--teal)", fontWeight: 500, textDecoration: "none" }}
              >
                Forgot password?
              </a>
              <span data-mono style={{ fontSize: "0.6875rem", color: "#9AA3AF" }}>
                v1.0
              </span>
            </div>

            <p
              style={{
                marginTop: 24,
                fontSize: "0.75rem",
                color: "#9AA3AF",
                lineHeight: 1.5,
              }}
            >
              This portal is for authorized clinic staff only. New account?
              Ask your clinic administrator to send you an invite.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
