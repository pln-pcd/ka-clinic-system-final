import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
  Img,
  staticFile,
} from "remotion";
import { Cursor } from "../components/Cursor";
import {
  FONT,
  LANDING,
  LOGIN,
  LOGIN_SLIDES,
  ASSETS,
} from "../tokens";

// ─── Timing constants (frames @ 30fps) ───────────────────────────────────────
// Scene 1.1 total: 660 frames = 22 seconds
const T = {
  // Landing page phase
  landingIn:      0,    // page fades in
  cursorEnter:    20,   // cursor appears
  cursorToBtn:    55,   // cursor starts moving toward Admin Login button
  btnHover:       100,  // cursor arrives at button (hover state)
  btnClick:       115,  // click starts
  btnClickEnd:    125,  // click ends
  // Crossfade to login
  toLoginStart:   130,
  loginVisible:   165,
  // Email field
  emailFocus:     200,
  emailTypeStart: 210,
  emailTypeEnd:   262,  // 8 chars typed (admin@ka), 6.5 frames each
  // Password field
  passFocus:      270,
  passTypeStart:  280,
  passTypeEnd:    330,  // 8 dots typed
  // Remember Me
  checkboxMove:   340,
  checkboxClick:  358,
  checkboxDone:   368,
  // Login button
  loginBtnMove:   375,
  loginBtnClick:  392,
  loginBtnClickEnd:400,
  // Loading spinner on login button
  loadingEnd:     440,
  // OTP step fade in
  otpIn:          440,
  otpVisible:     468,
  otpCursorMove:  475,
  // OTP digits typed  (6 digits × 15 frames each = 90 frames)
  otpType0:       485,
  otpType1:       500,
  otpType2:       515,
  otpType3:       530,
  otpType4:       545,
  otpType5:       558,
  otpLoading:     565,
  // Success overlay
  successIn:      575,
  successHold:    600,
  // Fade out entire scene
  fadeOut:        640,
  end:            660,
};

// Typed email string — character-by-character reveal
const EMAIL_CHARS = "admin@kaclinic.ph".split("");
const OTP_DIGITS  = ["4","8","2","9","1","7"];

// ─── Easing shortcuts ────────────────────────────────────────────────────────
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const easeInOut = Easing.bezier(0.4, 0, 0.2, 1);

function lerp(frame: number, a: number, b: number, va: number, vb: number) {
  return interpolate(frame, [a, b], [va, vb], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
}

// ─── SVG Icons (matching lucide-react used in real code) ─────────────────────
const LockIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const SparklesIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const CheckIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 12 4 16"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const KeyIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="m21 2-9.6 9.6"/>
    <path d="m15.5 7.5 3 3L22 7l-3-3"/>
  </svg>
);
const Loader2Icon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
    style={{ animation: "spin 1s linear infinite" }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);
const ArrowRightIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);
const ShieldCheckIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

// ─── Landing Page Navbar ──────────────────────────────────────────────────────
const NAV_LINKS = ["Home","About","Services","Appointment","App","Team","FAQs"];

const LandingNavbar: React.FC<{ btnHovered: boolean }> = ({ btnHovered }) => (
  <div style={{
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    height: 76, display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 48px",
    background: "rgba(255,255,255,0.96)", backdropFilter: "blur(20px)",
    borderBottom: `1px solid ${LANDING.border}`,
    fontFamily: FONT,
  }}>
    {/* Logo */}
    <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `linear-gradient(135deg,${LANDING.red},${LANDING.redDark})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "white", fontSize: "1.05rem", fontWeight: 800,
        boxShadow: `0 4px 16px ${LANDING.redGlow}`, flexShrink: 0,
      }}>K&A</div>
      <div>
        <div style={{ fontSize: "1rem", fontWeight: 800, color: LANDING.text, letterSpacing: "-0.2px" }}>K&A Clinic</div>
        <div style={{ fontSize: "0.6rem", color: LANDING.red, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700 }}>Anti-Rabies Center</div>
      </div>
    </div>

    {/* Centered pill nav */}
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      background: "#F8FAFC", border: `1px solid ${LANDING.border}`, borderRadius: 9999,
      padding: "5px 6px",
    }}>
      {NAV_LINKS.map((label, i) => (
        <div key={label} style={{
          display: "inline-flex", alignItems: "center",
          fontSize: "0.825rem", fontWeight: 700, letterSpacing: "-0.1px",
          color: i === 0 ? "#FFFFFF" : LANDING.text2,
          background: i === 0 ? `linear-gradient(135deg,${LANDING.red},${LANDING.redDark})` : "transparent",
          padding: "9px 18px", borderRadius: 9999, cursor: "pointer",
          fontFamily: FONT,
        }}>{label}</div>
      ))}
    </div>

    {/* Admin Login button */}
    <button style={{
      background: btnHovered ? LANDING.redDark : LANDING.red,
      color: "#FFFFFF", border: "none",
      padding: "10px 22px", borderRadius: 9999,
      fontFamily: FONT, fontSize: "0.85rem", fontWeight: 700,
      cursor: "pointer",
      boxShadow: `0 6px 18px ${LANDING.redGlow}`,
      display: "inline-flex", alignItems: "center", gap: 8,
      transform: btnHovered ? "translateY(-1px)" : "translateY(0)",
      transition: "all 0.2s",
    }}>
      <LockIcon />
      Admin Login
    </button>
  </div>
);

// ─── Landing Page Hero Section ────────────────────────────────────────────────
const LandingHero: React.FC = () => (
  <div style={{
    position: "absolute", top: 76, left: 0, right: 0, bottom: 0,
    background: "#FFFFFF",
    display: "flex", alignItems: "center",
    padding: "32px 48px 40px",
    fontFamily: FONT,
  }}>
    {/* Subtle grid mesh */}
    <div style={{
      position: "absolute", inset: 0,
      backgroundImage: "linear-gradient(#F1F5F9 1px,transparent 1px),linear-gradient(90deg,#F1F5F9 1px,transparent 1px)",
      backgroundSize: "64px 64px",
      opacity: 0.6, pointerEvents: "none",
    }} />
    {/* Red radial glow top-right */}
    <div style={{
      position: "absolute", top: "-15%", right: "-10%",
      width: "55vw", height: "55vw",
      background: "radial-gradient(circle, rgba(227,24,55,0.06) 0%, rgba(255,255,255,0) 70%)",
      pointerEvents: "none",
    }} />

    <div style={{ maxWidth: 1240, width: "100%", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 40, alignItems: "center", position: "relative", zIndex: 1 }}>
      {/* Left: text */}
      <div>
        <h1 style={{ fontSize: "3.6rem", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-1.2px", color: LANDING.text, marginBottom: 16 }}>
          Your Shield <br />Against <span style={{ color: LANDING.red }}>Rabies.</span>
          <span style={{ fontSize: "0.45em", fontWeight: 600, color: LANDING.muted, display: "block", marginTop: 8 }}>
            Expert care, fast response, and WHO-standard prophylaxis.
          </span>
        </h1>
        <p style={{ fontSize: "0.98rem", color: LANDING.muted, maxWidth: 500, lineHeight: 1.7, marginBottom: 22 }}>
          K&A Anti-Rabies Vaccine Clinic provides professional post-exposure prophylaxis, pre-exposure vaccination, and wound management — keeping our community safe, every day.
        </p>

        {/* Contact strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 24 }}>
          {[
            { label: "Phone", value: "+63 912 345 6789" },
            { label: "Email", value: "contact@kaclinic.ph" },
            { label: "Address", value: "San Juan St., Libon, Albay" },
          ].map(({ label, value }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <div style={{ width: 1, height: 28, background: LANDING.border }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(227,24,55,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={LANDING.red} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    {i === 0 && <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>}
                    {i === 1 && <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>}
                    {i === 2 && <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>}
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", color: LANDING.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: LANDING.text }}>{value}</div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: LANDING.navy, color: "#FFF", padding: "13px 26px", borderRadius: 9999, fontSize: "0.875rem", fontWeight: 700, boxShadow: "0 8px 24px rgba(15,23,42,0.22)" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="#FFF" stroke="#FFF" strokeWidth={0}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Call (02) 8123-4567
          </div>
        </div>

        {/* Trust strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, paddingTop: 20, borderTop: `1px solid ${LANDING.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={LANDING.red} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: LANDING.text }}>DOH-Licensed · PhilHealth-Accredited</div>
              <div style={{ fontSize: "0.68rem", color: LANDING.muted, fontWeight: 500 }}>98% dose-completion rate</div>
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: LANDING.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex" }}>
              {["RN","DM","AV","JS"].map((init, i) => (
                <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${LANDING.red},${LANDING.redDark})`, border: "2px solid #FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 800, color: "#FFF", marginLeft: i === 0 ? 0 : -8 }}>{init}</div>
              ))}
            </div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: LANDING.text2 }}>Meet Our Care Team →</span>
          </div>
        </div>
      </div>

      {/* Right: vaccination card placeholder */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Simplified vaccination card visual */}
        <div style={{ width: 360, height: 240, borderRadius: 20, background: "linear-gradient(135deg,#0F172A,#1B2843)", boxShadow: "0 32px 64px rgba(15,23,42,0.35)", padding: 28, color: "white", position: "relative", fontFamily: FONT }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Republic of the Philippines · K&A Anti-Rabies Clinic</div>
          <div style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 6 }}>Anti-Rabies Vaccination Record</div>
          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>Patient: Juan dela Cruz · DOB: Mar 15, 1990</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {["Day 0","Day 3","Day 7","Day 14"].map((d, i) => (
              <div key={d} style={{ background: i < 2 ? `rgba(227,24,55,0.3)` : "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>{d}</div>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: i < 2 ? LANDING.red : "rgba(255,255,255,0.15)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {i < 2 && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><polyline points="20 6 9 12 4 16"/></svg>}
                </div>
              </div>
            ))}
          </div>
          {/* Floating badge */}
          <div style={{ position: "absolute", left: -20, bottom: -20, width: 90, height: 90, borderRadius: "50%", background: `linear-gradient(150deg,${LANDING.navy},${LANDING.navy2})`, border: "4px solid #FFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 6, boxShadow: "0 16px 36px rgba(15,23,42,0.28)" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#FFF", lineHeight: 1 }}>10<span style={{ color: LANDING.red }}>+</span></div>
            <div style={{ fontSize: "0.48rem", color: "rgba(255,255,255,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 3 }}>Years in<br/>Operation</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── Login Floating Card (right side of login screen) ─────────────────────────
interface LoginCardProps {
  frame: number;
  emailTyped: string;
  passwordDots: number;
  rememberMeChecked: boolean;
  isLoading: boolean;
  showOtp: boolean;
  otpTyped: string;
  otpLoading: boolean;
  emailFocused: boolean;
  passFocused: boolean;
  otpFocused: boolean;
}

const LoginCard: React.FC<LoginCardProps> = ({
  emailTyped, passwordDots, rememberMeChecked, isLoading,
  showOtp, otpTyped, otpLoading,
  emailFocused, passFocused, otpFocused,
}) => {
  const inputBase: React.CSSProperties = {
    width: "100%", background: "#F8FAFC", border: `1.5px solid #E2E8F0`,
    padding: "12px 16px", borderRadius: 12,
    fontSize: 14, color: LOGIN.inputText,
    fontFamily: FONT, fontWeight: 500, outline: "none",
    boxSizing: "border-box",
  };
  const inputFocused: React.CSSProperties = {
    ...inputBase,
    background: "#FFFFFF",
    border: `1.5px solid ${LOGIN.inputFocusBorder}`,
    boxShadow: `0 0 0 4px ${LOGIN.inputFocusRing}`,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700,
    color: LOGIN.headingColor, marginBottom: 6, fontFamily: FONT,
  };
  const gradientBtn: React.CSSProperties = {
    width: "100%",
    background: `linear-gradient(to right, ${LOGIN.btnFrom}, ${LOGIN.btnVia}, ${LOGIN.btnTo})`,
    color: "#FFFFFF", border: "none",
    padding: "14px 24px", borderRadius: 9999,
    fontSize: 14, fontWeight: 700, letterSpacing: "0.5px",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontFamily: FONT,
    boxShadow: LOGIN.btnShadow,
    boxSizing: "border-box",
  };

  if (showOtp) {
    return (
      <div>
        {/* OTP header icon */}
        <div style={{ width: 48, height: 48, borderRadius: 16, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "#0e2a6d" }}>
          <KeyIcon />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: LOGIN.headingColor, margin: "0 0 4px", fontFamily: FONT, letterSpacing: "-0.5px" }}>
          Verification Code
        </h2>
        <p style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, marginBottom: 24, fontFamily: FONT }}>
          We sent a 6-digit code to <strong style={{ color: LOGIN.headingColor }}>a***@kaclinic.ph</strong>.
        </p>

        {/* OTP input — single monospace field matching real code */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            ...otpFocused ? inputFocused : inputBase,
            textAlign: "center", fontFamily: "monospace",
            fontSize: 26, fontWeight: 700, letterSpacing: "0.35em",
            color: LOGIN.otpText, padding: "14px 16px",
            borderRadius: 16,
            minHeight: 60, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {otpTyped.length > 0 ? otpTyped : <span style={{ color: LOGIN.otpPlaceholder, fontFamily: "monospace", letterSpacing: "0.35em" }}>000000</span>}
          </div>
        </div>

        {/* Remember device notice (rememberMe was checked) */}
        <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748B", marginBottom: 20, fontFamily: FONT }}>
          <span style={{ color: "#059669" }}><ShieldCheckIcon /></span>
          Remember this device for 30 days.
        </p>

        {/* Verify & Continue button */}
        <button style={{ ...gradientBtn, opacity: otpLoading || otpTyped.length < 6 ? 0.65 : 1 }}>
          {otpLoading ? <Loader2Icon /> : (
            <>Verify &amp; Continue <ArrowRightIcon /></>
          )}
        </button>

        {/* Footer links */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: LOGIN.linkBlue, fontFamily: FONT }}>Resend code</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: LOGIN.linkMuted, fontWeight: 600, fontFamily: FONT }}>
            <ChevronLeftIcon /> Back to login
          </span>
        </div>
      </div>
    );
  }

  // Standard login form
  return (
    <div>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: LOGIN.headingColor, margin: "0 0 4px", fontFamily: FONT, letterSpacing: "-0.5px" }}>
        Welcome Back!
      </h2>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24, fontFamily: FONT }}>
        Log in to access your clinic portal and records.
      </p>

      {/* Email field */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Email</label>
        <div style={emailFocused ? inputFocused : inputBase}>
          <span style={{ color: emailTyped ? LOGIN.inputText : LOGIN.inputPlaceholder, fontFamily: FONT }}>
            {emailTyped || "Input your email"}
          </span>
          {emailFocused && (
            <span style={{ display: "inline-block", width: 2, height: 14, background: LOGIN.btnTo, marginLeft: 1, verticalAlign: "middle", animation: "blink 1s step-end infinite" }} />
          )}
        </div>
      </div>

      {/* Password field */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Password</label>
        <div style={{ position: "relative" }}>
          <div style={{
            ...(passFocused ? inputFocused : inputBase),
            paddingRight: 44,
          }}>
            <span style={{ color: passwordDots > 0 ? LOGIN.inputText : LOGIN.inputPlaceholder, fontFamily: FONT, letterSpacing: passwordDots > 0 ? "0.25em" : "normal" }}>
              {passwordDots > 0 ? "●".repeat(passwordDots) : "Input your password"}
            </span>
            {passFocused && passwordDots > 0 && (
              <span style={{ display: "inline-block", width: 2, height: 14, background: LOGIN.btnTo, marginLeft: 1, verticalAlign: "middle" }} />
            )}
          </div>
          <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }}>
            <EyeOffIcon />
          </span>
        </div>
      </div>

      {/* Remember Me + Forgot Password row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
          {/* Custom checkbox exactly matching real code */}
          <div style={{
            width: 16, height: 16, borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: rememberMeChecked ? LOGIN.checkboxBg : "#FFFFFF",
            border: `1.5px solid ${rememberMeChecked ? LOGIN.checkboxBorder : "#CBD5E1"}`,
            transition: "all 0.15s",
            flexShrink: 0,
          }}>
            {rememberMeChecked && <CheckIcon size={10} />}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", fontFamily: FONT }}>Remember Me</span>
        </label>
        <span style={{ fontSize: 12, fontWeight: 600, color: LOGIN.linkBlue, fontFamily: FONT }}>Forgot Password?</span>
      </div>

      {/* Login button */}
      <button style={{ ...gradientBtn, opacity: isLoading ? 0.8 : 1 }}>
        {isLoading ? <Loader2Icon /> : "Login"}
      </button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <div style={{ flex: 1, borderTop: "1px solid #F1F5F9" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", background: "rgba(239,246,255,0.7)", border: "1px solid rgba(219,234,254,0.8)", padding: "3px 12px", borderRadius: 9999, letterSpacing: "0.5px", fontFamily: FONT }}>
          Clinic Staff Portal
        </span>
        <div style={{ flex: 1, borderTop: "1px solid #F1F5F9" }} />
      </div>

      {/* Bottom prompt */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "#64748B", fontFamily: FONT }}>
          Don't have an account?{" "}
          <span style={{ fontWeight: 700, color: LOGIN.linkBlue }}>Contact Manager</span>
        </p>
      </div>
    </div>
  );
};

// ─── Login Screen (full) ──────────────────────────────────────────────────────
interface LoginScreenProps {
  frame: number;
  fadeIn: number;
}
const LoginScreen: React.FC<LoginScreenProps> = ({ frame, fadeIn }) => {
  // Derived state from frame
  const lf = frame; // local frame (0 = when login screen starts)

  // Email typed chars
  const emailProgress = interpolate(lf, [T.emailTypeStart - T.toLoginStart, T.emailTypeEnd - T.toLoginStart], [0, EMAIL_CHARS.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const emailTyped = EMAIL_CHARS.slice(0, Math.floor(emailProgress)).join("");

  // Password dots (1 dot every 6.25 frames)
  const passProgress = interpolate(lf, [T.passTypeStart - T.toLoginStart, T.passTypeEnd - T.toLoginStart], [0, 8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const passwordDots = Math.floor(passProgress);

  // Focus states
  const emailFocused = lf >= (T.emailFocus - T.toLoginStart) && lf < (T.passFocus - T.toLoginStart);
  const passFocused  = lf >= (T.passFocus - T.toLoginStart) && lf < (T.checkboxMove - T.toLoginStart);
  const otpFocused   = lf >= (T.otpCursorMove - T.toLoginStart);

  const rememberMeChecked = lf >= (T.checkboxDone - T.toLoginStart);
  const isLoading   = lf >= (T.loginBtnClickEnd - T.toLoginStart) && lf < (T.otpIn - T.toLoginStart);
  const showOtp     = lf >= (T.otpVisible - T.toLoginStart);

  // OTP digits
  const otpDigitCount = Math.max(0, ...OTP_DIGITS.map((_, i) => {
    const typeFrame = T[`otpType${i}` as keyof typeof T] as number;
    return lf >= (typeFrame - T.toLoginStart) ? i + 1 : 0;
  }));
  const otpTyped = OTP_DIGITS.slice(0, otpDigitCount).join("");
  const otpLoading = lf >= (T.otpLoading - T.toLoginStart);

  const currentSlide = LOGIN_SLIDES[0]; // show first slide statically for demo

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: LOGIN.bg,
      fontFamily: FONT,
      opacity: fadeIn,
    }}>
      {/* ── Background: login photo (first image) ── */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <Img
          src={staticFile("login/1.jpg")}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
        />
        {/* Gradient overlay — from-[#060e24]/90 via-[#091b42]/60 to-[#071333]/85 */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(6,14,36,0.92) 0%, rgba(9,27,66,0.62) 45%, rgba(7,19,51,0.87) 100%)" }} />
        {/* Ambient glows */}
        <div style={{ position: "absolute", top: -100, left: -100, width: 520, height: 520, background: LOGIN.glow1, borderRadius: "50%", filter: "blur(120px)" }} />
        <div style={{ position: "absolute", bottom: -100, left: "33%", width: 440, height: 440, background: LOGIN.glow2, borderRadius: "50%", filter: "blur(140px)" }} />
        <div style={{ position: "absolute", top: "25%", right: 40, width: 400, height: 400, background: LOGIN.glow3, borderRadius: "50%", filter: "blur(110px)" }} />
        {/* Grid texture */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "linear-gradient(to right,#60a5fa 1px,transparent 1px),linear-gradient(to bottom,#60a5fa 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
      </div>

      {/* ── Header ── */}
      <header style={{ position: "relative", zIndex: 20, width: "100%", padding: "32px 56px 0", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", border: "1px solid rgba(219,234,254,0.9)", boxSizing: "border-box" }}>
            <Img src={staticFile("logo-white-nobg.png")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px", display: "block", lineHeight: 1, fontFamily: FONT }}>K&A Clinic</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.5px", color: "white", textTransform: "uppercase", display: "block", marginTop: 2 }}>Rabies &amp; Bite Center</span>
          </div>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 9999, background: LOGIN.backBtn, backdropFilter: "blur(8px)", border: `1px solid ${LOGIN.backBtnBorder}`, color: "rgba(219,234,254,0.9)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
          <ChevronLeftIcon /> Back to Website
        </button>
      </header>

      {/* ── Main split layout ── */}
      <main style={{ position: "relative", zIndex: 20, width: "100%", maxWidth: 1280, margin: "0 auto", padding: "32px 56px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 64, boxSizing: "border-box", height: "calc(100% - 112px)" }}>

        {/* Left hero copy */}
        <div style={{ width: "50%", maxWidth: 560 }}>
          {/* Blue pill badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 9999, background: "rgba(23,37,84,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(96,165,250,0.3)", color: "#7DD3FC", fontSize: 12, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 20 }}>
            <SparklesIcon /><span>{currentSlide.tag}</span>
          </div>
          {/* Headline */}
          <h1 style={{ fontSize: 48, fontWeight: 800, color: "white", letterSpacing: "-1px", lineHeight: 1.12, marginBottom: 16, fontFamily: FONT }}>
            {currentSlide.headline.split("\n").map((line, i) => (
              <React.Fragment key={i}>{line}{i < currentSlide.headline.split("\n").length - 1 && <br />}</React.Fragment>
            ))}
          </h1>
          {/* Desc */}
          <p style={{ color: "rgba(186,230,253,0.8)", fontSize: 15, lineHeight: 1.7, marginBottom: 32, fontFamily: FONT }}>
            {currentSlide.desc}
          </p>
          {/* Carousel dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {LOGIN_SLIDES.map((_, i) => (
              <div key={i} style={{ height: 8, borderRadius: 9999, background: i === 0 ? LOGIN.dotActive : LOGIN.dotInactive, width: i === 0 ? 40 : 10, boxShadow: i === 0 ? "0 0 14px rgba(56,189,248,0.8)" : "none", transition: "all 0.3s" }} />
            ))}
          </div>
        </div>

        {/* Right floating card */}
        <div style={{ flexShrink: 0, width: 460 }}>
          <div style={{
            background: LOGIN.cardBg, borderRadius: LOGIN.cardRadius,
            boxShadow: LOGIN.cardShadow, border: `1px solid ${LOGIN.cardBorder}`,
            padding: "44px 44px",
          }}>
            <LoginCard
              frame={lf}
              emailTyped={emailTyped}
              passwordDots={passwordDots}
              rememberMeChecked={rememberMeChecked}
              isLoading={isLoading}
              showOtp={showOtp}
              otpTyped={otpTyped}
              otpLoading={otpLoading}
              emailFocused={emailFocused}
              passFocused={passFocused}
              otpFocused={otpFocused}
            />
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, padding: "0 56px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "rgba(186,230,253,0.5)", fontFamily: FONT }}>
        <span>© 2026 K&A Animal Bite Center. All rights reserved.</span>
        <div style={{ display: "flex", gap: 16, color: "rgba(186,230,253,0.6)", fontWeight: 500 }}>
          <span>HIPAA &amp; DOH Compliant</span>
          <span>·</span>
          <span>Authorized Access Only</span>
        </div>
      </footer>
    </div>
  );
};

// ─── Success Overlay ──────────────────────────────────────────────────────────
const SuccessOverlay: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div style={{
    position: "absolute", inset: 0, zIndex: 50,
    background: LOGIN.successBg,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
    opacity,
  }}>
    {/* Spinner ring — matching real code exactly */}
    <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTop: "2px solid rgba(255,255,255,0.80)", animation: "spin 1s linear infinite" }} />
    <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(186,230,253,0.8)", fontFamily: FONT }}>
      Opening your dashboard…
    </p>
  </div>
);

// ─── Main Scene ───────────────────────────────────────────────────────────────
export const Scene_AdminLoginFlow: React.FC = () => {
  const frame = useCurrentFrame();

  // ── Phase visibility ──
  const showLanding = frame < T.toLoginStart + 30;
  const loginFadeIn = interpolate(frame, [T.toLoginStart, T.loginVisible], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const landingFadeOut = interpolate(frame, [T.toLoginStart, T.loginVisible], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });

  // ── Cursor position ──
  // Landing phase: cursor moves from bottom-right → Admin Login button (top-right of navbar)
  const cursorOpacity = interpolate(frame, [T.cursorEnter, T.cursorEnter + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Admin Login button approximate position at 1920×1080: x≈1740, y≈38
  const cursorX = interpolate(frame, [T.cursorEnter, T.cursorToBtn, T.btnHover, T.btnClick], [1700, 1700, 1742, 1742], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const cursorY = interpolate(frame, [T.cursorEnter, T.cursorToBtn, T.btnHover, T.btnClick], [820, 820, 36, 36], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // Login phase cursor: email field, password, checkbox, login button, OTP field
  // Email field center approx: x≈1430, y≈465 (right card: left=1400, width=460, card starts ~x=1380)
  // Card is at: main padding 56px, right side card left≈1920-56-460=1404
  const cardLeft = 1920 - 56 - 460;
  const cardCenterX = cardLeft + 230;
  const emailFieldY = 460;
  const passFieldY = 535;
  const checkboxX = cardLeft + 16 + 4;
  const checkboxY = 603;
  const loginBtnY = 648;
  const otpFieldY = 475;

  const loginCursorX = interpolate(frame, [
    T.loginVisible, T.emailFocus, T.passFocus,   T.checkboxMove, T.checkboxClick, T.loginBtnMove, T.loginBtnClick, T.otpCursorMove,
  ], [
    cardCenterX,    cardCenterX,  cardCenterX,   checkboxX,      checkboxX,       cardCenterX,    cardCenterX,     cardCenterX,
  ], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const loginCursorY = interpolate(frame, [
    T.loginVisible, T.emailFocus, T.passFocus,    T.checkboxMove, T.checkboxClick, T.loginBtnMove, T.loginBtnClick, T.otpCursorMove,
  ], [
    emailFieldY + 60, emailFieldY, passFieldY,   checkboxY,      checkboxY,       loginBtnY,      loginBtnY,       otpFieldY,
  ], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const inLoginPhase = frame >= T.loginVisible && frame < T.successIn;
  const activeCursorX = frame < T.loginVisible ? cursorX : loginCursorX;
  const activeCursorY = frame < T.loginVisible ? cursorY : loginCursorY;
  const clicking = (frame >= T.btnClick && frame < T.btnClickEnd) || (frame >= T.loginBtnClick && frame < T.loginBtnClickEnd) || (frame >= T.checkboxClick && frame < T.checkboxDone);

  // Button hover state on landing
  const btnHovered = frame >= T.btnHover && frame < T.toLoginStart;

  // ── Success overlay opacity ──
  const successOpacity = interpolate(frame, [T.successIn, T.successIn + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Scene fade-out ──
  const sceneOpacity = interpolate(frame, [T.fadeOut, T.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: "hidden", opacity: sceneOpacity }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      {/* ── Landing Page ── */}
      {showLanding && (
        <div style={{ position: "absolute", inset: 0, opacity: landingFadeOut }}>
          <LandingNavbar btnHovered={btnHovered} />
          <LandingHero />
        </div>
      )}

      {/* ── Login Screen ── */}
      {frame >= T.toLoginStart && frame < T.successIn + 5 && (
        <LoginScreen frame={frame - T.toLoginStart} fadeIn={loginFadeIn} />
      )}

      {/* ── Success Overlay ── */}
      {frame >= T.successIn && (
        <SuccessOverlay opacity={successOpacity} />
      )}

      {/* ── Cursor (hidden during success overlay) ── */}
      {frame < T.successIn && (
        <Cursor
          x={activeCursorX}
          y={activeCursorY}
          clicking={clicking}
          opacity={cursorOpacity}
        />
      )}
    </AbsoluteFill>
  );
};
