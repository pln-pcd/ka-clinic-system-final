// Branded loading screen: the K&A heart-and-cross logo in white on an indigo
// circle that gently breathes, with a comet-like arc orbiting it. Used for
// full-screen waits such as restoring a signed-in session.
//
//   <BrandLoader label="Restoring your session…" />
//   <BrandLoader fullScreen={false} />   (inline, no page background)
//   <BrandLoader intro={false} />        (skip the draw-in: for a loader
//                                          that follows another one)
//
// Pure CSS/SVG (keyframes in index.css under .kna-brand-loader). The logo's
// single stroke draws itself once on first appearance, then the loop runs.
// prefers-reduced-motion: no orbit or draw-in, only a soft opacity pulse.

// The logo traced from loadinglogo.png as ONE continuous stroke: the curl,
// the left lobe, the point, the right lobe, then down into and around the
// cross. Drawn in a 500×500 space, stroke 13.
const LOGO_PATH =
  'M219 141 C217.5 140.4 214.2 137.8 210 137.5 C205.8 137.2 199.3 137.8 194 139 C188.7 140.2 183.3 142.4 178 145 ' +
  'C172.7 147.6 166.7 150.7 162 154.5 C157.3 158.3 153.5 163.1 150 168 C146.5 172.9 143.4 178.7 141 184 ' +
  'C138.6 189.3 136.6 195.2 135.5 200 C134.4 204.8 134.3 208 134.5 213 C134.7 218 135.2 224.8 136.5 230 ' +
  'C137.8 235.2 139.4 239.3 142 244 C144.6 248.7 150.3 255.7 152 258 L248.5 352.5 L346 254.5 ' +
  'C347.2 252.6 351 247.4 353 243 C355 238.6 356.9 233.2 358 228 C359.1 222.8 359.6 217.3 359.5 212 ' +
  'C359.4 206.7 358.8 201.2 357.5 196 C356.2 190.8 354.6 186.2 352 181 C349.4 175.8 345.7 169.7 342 165 ' +
  'C338.3 160.3 334.7 156.8 330 153 C325.3 149.2 319.3 145.1 314 142.5 C308.7 139.9 303.3 138.6 298 137.5 ' +
  'C292.7 136.4 287.3 135.9 282 136 C276.7 136.1 271 136.8 266 138 C261 139.2 256.3 141.2 252 143.5 ' +
  'C247.7 145.8 243.5 148.6 240 152 C236.5 155.4 233.2 159.7 231 164 C228.8 168.3 227.4 173.7 226.5 178 ' +
  'C225.6 182.3 225.7 185.3 225.5 190 C225.3 194.7 225.5 203.3 225.5 206 ' +
  'H181.5 V251.5 H225.5 V295 H270.5 V251.5 H314 V206 H270.5';

// Orbit geometry (px, in a 168×168 box): circle r=60, a 6px gap, then the
// arc ring (r=72, 8px stroke).
const BOX = 168;
const C = BOX / 2;
const RING_R = 72;
export const BRAND_LOADER_COLOR = '#3B50DF'; // same indigo as BTN.primary

export default function BrandLoader({ label = 'Loading…', fullScreen = true, intro = true, className = '' }) {
  const loader = (
    <div className={`kna-brand-loader flex flex-col items-center ${intro ? '' : 'kna-bl-no-intro'}`} role="status" aria-live="polite">
      <div className="kna-bl-stage" style={{ width: BOX, height: BOX }}>
        <span className="kna-bl-glow" aria-hidden="true" />
        <span className="kna-bl-disc" aria-hidden="true">
          <svg className="kna-bl-logo" viewBox="122 120 250 250" aria-hidden="true">
            <path d={LOGO_PATH} pathLength="1" fill="none" stroke="#FFFFFF" strokeWidth="13"
              strokeLinecap="round" strokeLinejoin="miter" />
          </svg>
        </span>
        {/* The orbit group rotates; inside it the arc starts at the head
            (3 o'clock) and extends backwards, so the dot always leads. */}
        <svg className="kna-bl-orbit" width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
          <g className="kna-bl-spin">
            <circle className="kna-bl-tail" cx={C} cy={C} r={RING_R} fill="none" stroke={BRAND_LOADER_COLOR}
              strokeOpacity="0.4" strokeWidth="8" strokeLinecap="round" transform={`scale(1 -1) translate(0 ${-BOX})`} />
            <circle cx={C + RING_R} cy={C} r="5.5" fill={BRAND_LOADER_COLOR} />
          </g>
        </svg>
      </div>
      {label && <p className="mt-5 text-[13px] font-medium text-slate-500">{label}</p>}
    </div>
  );

  if (!fullScreen) return <div className={className}>{loader}</div>;
  return (
    <div className={`min-h-screen flex items-center justify-center bg-[#F0F4FA] ${className}`}>
      {loader}
    </div>
  );
}
