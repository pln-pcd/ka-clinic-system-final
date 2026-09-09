// Generates the launcher icons from assets/logo-white-nobg.png.
//
// Android masks an adaptive icon's foreground to a shape the launcher chooses
// (circle, squircle, rounded square) and only the middle ~66% of the canvas is
// guaranteed to survive. The source logo fills its own square edge to edge, so
// using it directly as the foreground put the heart's outer curve outside that
// safe zone and the launcher cropped it — the "cut off" logo on the home
// screen. These outputs pad the mark into the safe zone instead.
//
// Run: node scripts/build-app-icons.js
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS = path.join(__dirname, '..', 'assets');
const SOURCE = path.join(ASSETS, 'logo-white-nobg.png');
const CANVAS = 1024;

// Bilinear sample of the source at a normalized position, so the mark stays
// smooth when scaled rather than showing nearest-neighbour stair-stepping.
function sampleBilinear(src, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, src.width - 1);
  const y1 = Math.min(y0 + 1, src.height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const p00 = src.data[(y0 * src.width + x0) * 4 + c];
    const p10 = src.data[(y0 * src.width + x1) * 4 + c];
    const p01 = src.data[(y1 * src.width + x0) * 4 + c];
    const p11 = src.data[(y1 * src.width + x1) * 4 + c];
    const top = p00 + (p10 - p00) * fx;
    const bottom = p01 + (p11 - p01) * fx;
    out[c] = top + (bottom - top) * fy;
  }
  return out;
}

// `scale` is the fraction of the canvas the logo occupies; `background` is
// either null (transparent) or an [r,g,b] triple.
function render({ scale, background }) {
  const src = PNG.sync.read(fs.readFileSync(SOURCE));
  const out = new PNG({ width: CANVAS, height: CANVAS });

  const target = Math.round(CANVAS * scale);
  const offset = Math.round((CANVAS - target) / 2);
  const ratio = src.width / target;

  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4;
      const bg = background || [0, 0, 0];
      out.data[i] = bg[0];
      out.data[i + 1] = bg[1];
      out.data[i + 2] = bg[2];
      out.data[i + 3] = background ? 255 : 0;

      const sx = (x - offset) * ratio;
      const sy = (y - offset) * ratio;
      if (sx < 0 || sy < 0 || sx > src.width - 1 || sy > src.height - 1) continue;

      const [r, g, b, a] = sampleBilinear(src, sx, sy);
      const alpha = a / 255;
      if (alpha <= 0) continue;

      // Source over whatever is already there (the background or transparency).
      const baseAlpha = out.data[i + 3] / 255;
      const outAlpha = alpha + baseAlpha * (1 - alpha);
      out.data[i] = Math.round((r * alpha + out.data[i] * baseAlpha * (1 - alpha)) / outAlpha);
      out.data[i + 1] = Math.round((g * alpha + out.data[i + 1] * baseAlpha * (1 - alpha)) / outAlpha);
      out.data[i + 2] = Math.round((b * alpha + out.data[i + 2] * baseAlpha * (1 - alpha)) / outAlpha);
      out.data[i + 3] = Math.round(outAlpha * 255);
    }
  }
  return PNG.sync.write(out);
}

const outputs = [
  // Adaptive foreground: 60% keeps the whole mark inside the 66% safe circle
  // with a little breathing room, on transparency over the white background
  // colour app.json sets.
  { file: 'icon-foreground.png', scale: 0.6, background: null },
  // Legacy/iOS icon: opaque square, the mark a touch larger since only the
  // corners get rounded.
  { file: 'icon.png', scale: 0.72, background: [255, 255, 255] },
  // Notification icon is drawn as a silhouette; same safe-zone padding.
  { file: 'notification-icon.png', scale: 0.6, background: null },
];

for (const { file, scale, background } of outputs) {
  fs.writeFileSync(path.join(ASSETS, file), render({ scale, background }));
  console.log(`wrote assets/${file} (${CANVAS}x${CANVAS}, logo at ${Math.round(scale * 100)}%)`);
}
