import React from 'react';
import { Sparkles, Heart } from 'lucide-react';

/**
 * Animated Nurse Character Mascot for the Nurse Registration / Accept Invite card.
 * Features:
 * - Fluid SVG vector character with clinic scrub, nurse cap, stethoscope & clipboard
 * - CSS keyframe animations: arm waving, eyes blinking, gentle breathing/floating
 * - Reactive speech bubble responding to user's registration progress
 */
export default function AnimatedNurseCharacter({ name = '', status = 'valid', isReady = false }) {
  const firstName = name.trim().split(/\s+/)[0];

  let speechText = 'Welcome to K&A Clinic! 👋';
  let badgeIcon = '👋';

  if (status === 'success') {
    speechText = "Welcome to the team! 🎉";
    badgeIcon = '🎉';
  } else if (isReady) {
    speechText = "Ready to activate your account! ✨";
    badgeIcon = '✨';
  } else if (firstName) {
    speechText = `Hi, Nurse ${firstName}! 👋`;
    badgeIcon = '🩺';
  }

  return (
    <div className="relative flex flex-col items-center select-none group">
      {/* Speech Bubble */}
      <div className="animate-speech-pop -mb-1 z-20 transition-all duration-300">
        <div className="relative px-3.5 py-1.5 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[0_8px_24px_rgba(0,0,0,0.3)] text-white text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-xs">{badgeIcon}</span>
          <span className="tracking-wide text-blue-50 drop-shadow-xs">{speechText}</span>
          {/* Bubble tail */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] border-t-white/20" />
        </div>
      </div>

      {/* Nurse Character SVG */}
      <div className="relative w-36 h-40 sm:w-40 sm:h-44 transition-transform duration-300 group-hover:scale-105">
        <svg
          viewBox="0 0 160 175"
          className="w-full h-full drop-shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="nurseScrub" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="60%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#0e2a6d" />
            </linearGradient>

            <linearGradient id="nurseHair" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#312e81" />
              <stop offset="50%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <linearGradient id="nurseSkin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffedd5" />
              <stop offset="100%" stopColor="#fed7aa" />
            </linearGradient>

            <linearGradient id="nurseCap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>

            <linearGradient id="stethoMetal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>

            <linearGradient id="badgeGlow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Ambient Glow behind Character */}
          <circle cx="80" cy="85" r="55" fill="url(#badgeGlow)" filter="blur(14px)" />

          {/* Floating Medical Sparkles */}
          <g className="animate-nurse-sparkle-1" opacity="0.9">
            {/* Top-right sparkle */}
            <path d="M136 26 L138 20 L140 26 L146 28 L140 30 L138 36 L136 30 L130 28 Z" fill="#fbbf24" />
            {/* Left medical cross */}
            <path d="M22 36 v10 M17 41 h10" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          <g className="animate-nurse-sparkle-2" opacity="0.85">
            {/* Right medical cross */}
            <path d="M140 76 v8 M136 80 h8" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />
            {/* Small star */}
            <circle cx="26" cy="74" r="2.5" fill="#f472b6" />
          </g>

          {/* ── WHOLE CHARACTER BODY (Gentle Breathing/Floating Bob) ── */}
          <g className="animate-nurse-bob">
            {/* Back Hair & Ponytail */}
            <circle cx="80" cy="68" r="33" fill="url(#nurseHair)" />
            {/* Left Ponytail */}
            <ellipse cx="44" cy="74" rx="14" ry="18" fill="url(#nurseHair)" />
            {/* Hair Tie */}
            <ellipse cx="49" cy="66" rx="4" ry="6" fill="#3b82f6" />

            {/* Neck */}
            <rect x="73" y="88" width="14" height="16" rx="5" fill="url(#nurseSkin)" />

            {/* ── Torso & Scrub Uniform ── */}
            <path
              d="M38 170 L48 106 Q64 96 73 98 L80 114 L87 98 Q96 96 112 106 L122 170 Z"
              fill="url(#nurseScrub)"
            />

            {/* Scrub V-Neck Collar */}
            <path
              d="M68 97 L80 116 L92 97"
              stroke="#ffffff"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Inner Undershirt */}
            <path d="M74 100 L80 108 L86 100 Z" fill="#ffffff" />

            {/* Nurse ID Badge on Pocket */}
            <g transform="translate(52, 122)">
              <rect x="0" y="0" width="16" height="22" rx="3" fill="#ffffff" shadow="sm" />
              <rect x="2" y="2" width="12" height="10" rx="1.5" fill="#0284c7" />
              <rect x="2" y="14" width="10" height="2" rx="1" fill="#cbd5e1" />
              <rect x="2" y="18" width="7" height="2" rx="1" fill="#e2e8f0" />
              {/* Badge Clip */}
              <rect x="6" y="-3" width="4" height="4" rx="1" fill="#94a3b8" />
            </g>

            {/* ── Stethoscope ── */}
            {/* Rubber Tube Loop around Neck */}
            <path
              d="M66 99 Q61 114 65 128 Q70 142 80 144 Q89 144 94 130 Q97 115 94 99"
              stroke="url(#stethoMetal)"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
            {/* Metal Chest Piece (Bell) */}
            <circle cx="80" cy="144" r="6" fill="#f8fafc" stroke="#64748b" strokeWidth="2" />
            <circle cx="80" cy="144" r="3.2" fill="#38bdf8" />

            {/* ── Left Arm (Holding Medical Chart / Clipboard) ── */}
            <g>
              {/* Sleeve */}
              <path d="M48 106 L34 122 L45 130 L55 116 Z" fill="url(#nurseScrub)" />
              {/* Forearm */}
              <path d="M36 122 L38 144 L48 142 L45 126 Z" fill="url(#nurseSkin)" />
              {/* Medical Clipboard */}
              <g transform="translate(26, 128) rotate(-8)">
                <rect x="0" y="0" width="18" height="26" rx="2.5" fill="#0284c7" />
                <rect x="1.5" y="3" width="15" height="21" rx="1.5" fill="#ffffff" />
                {/* Metal Clip */}
                <rect x="5" y="-2" width="8" height="4" rx="1" fill="#94a3b8" />
                {/* Checklist lines with checkmarks */}
                <line x1="4" y1="7" x2="13" y2="7" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="4" y1="12" x2="14" y2="12" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="4" y1="16" x2="12" y2="16" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="4" y1="20" x2="10" y2="20" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
              </g>
              {/* Hand holding clipboard */}
              <circle cx="39" cy="142" r="5" fill="url(#nurseSkin)" />
            </g>

            {/* ── Head & Facial Features ── */}
            <ellipse cx="80" cy="72" rx="26" ry="25" fill="url(#nurseSkin)" />

            {/* Ears */}
            <circle cx="54" cy="72" r="4.5" fill="url(#nurseSkin)" />
            <circle cx="106" cy="72" r="4.5" fill="url(#nurseSkin)" />

            {/* Rosy Blush on Cheeks */}
            <ellipse cx="65" cy="78" rx="5" ry="3" fill="#f472b6" opacity="0.6" />
            <ellipse cx="95" cy="78" rx="5" ry="3" fill="#f472b6" opacity="0.6" />

            {/* Nose */}
            <path d="M79 74 Q80 77 81 76" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />

            {/* Smile */}
            <path
              d="M74 81 Q80 88 86 81"
              stroke="#be123c"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="#f43f5e"
            />
            {/* Smile Tooth Highlight */}
            <path d="M77 82 Q80 84 83 82" fill="#ffffff" />

            {/* ── Eyes (Animated Blinking) ── */}
            <g className="animate-nurse-blink">
              {/* Left Eye */}
              <ellipse cx="68" cy="69" rx="4.5" ry="6" fill="#0f172a" />
              <circle cx="69.5" cy="67" r="2.2" fill="#ffffff" />
              <circle cx="66.5" cy="71.5" r="1.1" fill="#ffffff" />
              {/* Upper Eyelash */}
              <path d="M63 67 Q68 62 73 67" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />

              {/* Right Eye */}
              <ellipse cx="92" cy="69" rx="4.5" ry="6" fill="#0f172a" />
              <circle cx="93.5" cy="67" r="2.2" fill="#ffffff" />
              <circle cx="90.5" cy="71.5" r="1.1" fill="#ffffff" />
              {/* Upper Eyelash */}
              <path d="M87 67 Q92 62 97 67" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />

              {/* Eyebrows */}
              <path d="M64 61 Q68 58 73 60" stroke="#1e1b4b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <path d="M87 60 Q92 58 96 61" stroke="#1e1b4b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </g>

            {/* ── Front Hair / Bangs ── */}
            <path
              d="M55 64 Q64 48 80 50 Q96 48 105 64 Q94 56 80 58 Q66 56 55 64 Z"
              fill="url(#nurseHair)"
            />
            {/* Bang Strands */}
            <path d="M62 58 Q68 68 70 63" stroke="#312e81" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M98 58 Q92 68 90 63" stroke="#312e81" strokeWidth="2" strokeLinecap="round" fill="none" />

            {/* ── Nurse Cap with Red Cross ── */}
            <g transform="translate(0, -2)">
              {/* Cap Shape */}
              <path
                d="M58 50 C63 35 97 35 102 50 C96 47 64 47 58 50 Z"
                fill="url(#nurseCap)"
                stroke="#e2e8f0"
                strokeWidth="1.2"
              />
              {/* Cap Fold Line */}
              <path d="M62 48 Q80 44 98 48" stroke="#cbd5e1" strokeWidth="1" fill="none" />

              {/* Red Medical Cross */}
              <g transform="translate(80, 42)">
                <rect x="-2" y="-6" width="4" height="12" rx="1.2" fill="#ef4444" />
                <rect x="-6" y="-2" width="12" height="4" rx="1.2" fill="#ef4444" />
              </g>
            </g>

            {/* ── Right Arm: Animated Waving Hand ── */}
            <g className="animate-nurse-wave">
              {/* Upper Sleeve */}
              <path d="M106 104 L124 108 L126 122 L112 118 Z" fill="url(#nurseScrub)" />
              {/* Arm extending upward */}
              <path
                d="M118 110 L132 82 L140 86 L124 116 Z"
                fill="url(#nurseSkin)"
              />
              {/* Waving Hand */}
              <g transform="translate(136, 78)">
                {/* Palm */}
                <ellipse cx="0" cy="0" rx="6" ry="6.5" fill="url(#nurseSkin)" />
                {/* Thumb */}
                <ellipse cx="-4" cy="2" rx="2.5" ry="3.5" fill="url(#nurseSkin)" transform="rotate(-30 -4 2)" />
                {/* Fingers */}
                <rect x="-4" y="-10" width="2.5" height="7" rx="1.2" fill="url(#nurseSkin)" />
                <rect x="-1" y="-12" width="2.6" height="8.5" rx="1.2" fill="url(#nurseSkin)" />
                <rect x="2" y="-11" width="2.5" height="7.8" rx="1.2" fill="url(#nurseSkin)" />
                <rect x="5" y="-8" width="2.2" height="5.5" rx="1.1" fill="url(#nurseSkin)" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
