// Crop step for profile photos: a circular crop area over the picked image,
// drag to move it, zoom with the slider (or the mouse wheel / + and -), then
// Save or Cancel. The image always covers the circle, so the result never has
// empty corners.
//
// onSave receives a square canvas (OUTPUT px) of the cropped area; the caller
// compresses it (lib/adminAvatars.js compressCanvas keeps it under 600 KB).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import Modal from './Modal';
import IconButton from './IconButton';
import { BTN } from '../lib/buttons';

const VIEW = 280;      // crop area, px
const OUTPUT = 512;    // saved image, px
const MAX_ZOOM = 4;

export default function ImageCropModal({ file, title = 'Crop photo', onCancel, onSave, saving = false }) {
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside the crop area
  const drag = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      const s = VIEW / Math.min(image.width, image.height);
      setZoom(1);
      setPos({ x: (VIEW - image.width * s) / 2, y: (VIEW - image.height * s) / 2 });
    };
    image.onerror = () => setError('That file could not be read as an image.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = img ? VIEW / Math.min(img.width, img.height) : 1;
  const scale = baseScale * zoom;

  // Keeps the image covering the whole crop area.
  const clamp = useCallback((p, s) => {
    if (!img) return p;
    const w = img.width * s, h = img.height * s;
    return { x: Math.min(0, Math.max(VIEW - w, p.x)), y: Math.min(0, Math.max(VIEW - h, p.y)) };
  }, [img]);

  // Zooms around the centre of the crop area.
  const setZoomCentered = useCallback((next) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const prevS = baseScale * zoom, nextS = baseScale * z;
    setPos(p => {
      const cx = (VIEW / 2 - p.x) / prevS, cy = (VIEW / 2 - p.y) / prevS;
      return clamp({ x: VIEW / 2 - cx * nextS, y: VIEW / 2 - cy * nextS }, nextS);
    });
    setZoom(z);
  }, [baseScale, zoom, clamp]);

  const onPointerDown = (e) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, from: pos };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const { startX, startY, from } = drag.current;
    setPos(clamp({ x: from.x + e.clientX - startX, y: from.y + e.clientY - startY }, scale));
  };
  const onPointerUp = () => { drag.current = null; };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 6;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setPos(p => clamp({ x: p.x + dx, y: p.y + dy }, scale));
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoomCentered(zoom + 0.1); }
    else if (e.key === '-') { e.preventDefault(); setZoomCentered(zoom - 0.1); }
  };

  // Wheel zoom; a native listener so preventDefault stops the page scrolling.
  const areaRef = useRef(null);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); setZoomCentered(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, setZoomCentered]);

  const save = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.imageSmoothingQuality = 'high';
    const side = VIEW / scale;
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, side, side, 0, 0, OUTPUT, OUTPUT);
    onSave(canvas);
  };

  return (
    <Modal onClose={saving ? undefined : onCancel} labelledBy="crop-title">
      <div className="bg-white rounded-3xl w-full max-w-[400px] overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div>
            <h3 id="crop-title" className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Drag to position. Zoom to fit.</p>
          </div>
          <IconButton icon={X} label="Cancel" size={36} iconSize={16} onClick={onCancel} disabled={saving} />
        </div>

        <div className="px-6 py-5 flex flex-col items-center gap-4">
          {error ? (
            <p className="text-xs font-semibold text-rose-600 py-10" role="alert">{error}</p>
          ) : (
            <div
              ref={areaRef}
              role="application"
              aria-label="Crop area. Drag or use the arrow keys to move the photo; plus and minus to zoom."
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              className="relative overflow-hidden rounded-2xl bg-slate-900 outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 select-none touch-none"
              style={{ width: VIEW, height: VIEW, cursor: img ? 'grab' : 'default' }}
            >
              {img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="absolute top-0 left-0 max-w-none pointer-events-none"
                  style={{ width: img.width * scale, height: img.height * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
                />
              )}
              {/* Dim everything outside the circle. */}
              <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-full"
                style={{ boxShadow: '0 0 0 999px rgba(15,23,42,0.55)', border: '2px solid rgba(255,255,255,0.9)' }} />
            </div>
          )}

          <div className="w-full flex items-center gap-3">
            <IconButton icon={Minus} label="Zoom out" size={32} iconSize={14} onClick={() => setZoomCentered(zoom - 0.2)} disabled={!img || zoom <= 1} />
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={e => setZoomCentered(Number(e.target.value))}
              disabled={!img}
              aria-label="Zoom"
              className="flex-1 accent-[#3B50DF] cursor-pointer"
            />
            <IconButton icon={Plus} label="Zoom in" size={32} iconSize={14} onClick={() => setZoomCentered(zoom + 0.2)} disabled={!img || zoom >= MAX_ZOOM} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className={`${BTN.outline} flex-1`}>Cancel</button>
          <button type="button" onClick={save} disabled={!img || saving} className={`${BTN.primary} flex-1`}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
