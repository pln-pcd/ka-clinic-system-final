// Paper preview used by every export popup: a fixed toolbar (page count,
// zoom out / zoom level / zoom in, fit to width) above a scroll area that
// holds the page.
//
// Keeping the paper still while zooming:
//   - the page is centred on the scroll area's middle line and scaled with
//     transform-origin "top center", so it grows and shrinks around a line
//     that never moves;
//   - the scroll area keeps its scrollbar gutter reserved
//     (scrollbar-gutter: stable both-edges), so a scrollbar appearing or
//     disappearing never nudges the page sideways;
//   - when the page is wider than the view, the horizontal scroll keeps
//     the same point of the page in the middle (the page's centre, unless
//     the user scrolled sideways); vertically the same point stays in view.
// The preview opens scrolled to the top of the first page.
//
// The page is always shown at its full height (the caller measures it), so
// the paper never gets a scrollbar of its own; the preview area scrolls.
import { useLayoutEffect, useRef, useState } from 'react';
import { Minus, MoveHorizontal, Plus } from 'lucide-react';
import IconButton from './IconButton';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const clamp = z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
const GUTTER = 24;

export default function PreviewViewer({ pages = 1, sheetWidth, sheetHeight, sheetStyle, defaultZoom = 0.85, children }) {
  const [zoom, setZoom] = useState(defaultZoom);
  const scrollRef = useRef(null);
  // Where the viewport's middle sat on the page (0..1) just before a zoom.
  const anchor = useRef(null);
  // Until the user scrolls, the preview stays pinned to the top (the page
  // height is measured after the document renders, which can move it).
  const touched = useRef(false);

  function changeZoom(next) {
    const el = scrollRef.current;
    if (el) {
      anchor.current = {
        // Not scrollable sideways yet: the page's middle is the view's middle.
        x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
        y: el.scrollHeight > el.clientHeight ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0,
        atTop: el.scrollTop <= 1,
      };
    }
    setZoom(z => clamp(typeof next === 'function' ? next(z) : next));
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollTop = a.atTop ? 0 : Math.max(0, a.y * el.scrollHeight - el.clientHeight / 2);
    el.scrollLeft = Math.max(0, a.x * el.scrollWidth - el.clientWidth / 2);
    anchor.current = null;
  }, [zoom]);

  // Open at the top, and stay there while the measured height settles.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && !touched.current) { el.scrollTop = 0; el.scrollLeft = 0; }
  }, [sheetHeight, pages]);

  function fitToWidth() {
    const el = scrollRef.current;
    if (!el) return;
    changeZoom((el.clientWidth - GUTTER * 2) / sheetWidth);
  }

  const markTouched = () => { touched.current = true; };
  const scaledW = sheetWidth * zoom;
  const scaledH = sheetHeight * zoom;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#EDF0FA' }}>
      {/* Toolbar sits outside the scroll area, so it never moves. Every
          control is 36px tall and centred on the same line. */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 24px 12px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 48,
          background: '#FFFFFF', padding: '0 8px 0 14px', borderRadius: 14, border: '1px solid #E2E8F0',
          color: '#334155', boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
        }}>
          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600, lineHeight: '36px', paddingRight: 4 }}>
            {pages} page{pages !== 1 ? 's' : ''}
          </span>
          <span aria-hidden="true" style={{ width: 1, height: 20, background: '#E2E8F0', margin: '0 4px' }} />
          <IconButton icon={Minus} label="Zoom out" onClick={() => changeZoom(z => z - 0.1)} disabled={zoom <= MIN_ZOOM} />
          <span style={{
            height: 36, minWidth: 58, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#0F172A', background: '#F1F5F9', borderRadius: 8, fontSize: 13,
            fontVariantNumeric: 'tabular-nums', lineHeight: 0,
          }} aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton icon={Plus} label="Zoom in" onClick={() => changeZoom(z => z + 0.1)} disabled={zoom >= MAX_ZOOM} />
          <span aria-hidden="true" style={{ width: 1, height: 20, background: '#E2E8F0', margin: '0 4px' }} />
          <IconButton icon={MoveHorizontal} label="Fit to width" onClick={fitToWidth} />
        </div>
      </div>

      <div
        ref={scrollRef}
        onWheel={markTouched}
        onPointerDown={markTouched}
        onKeyDown={markTouched}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', overflowAnchor: 'none', scrollbarGutter: 'stable both-edges', padding: `0 ${GUTTER}px ${GUTTER}px` }}
      >
        {/* Reserves the scaled footprint, centred; at least as wide as the view. */}
        <div style={{ position: 'relative', width: '100%', minWidth: scaledW, height: scaledH, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            width: sheetWidth, height: sheetHeight, marginLeft: -sheetWidth / 2,
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            transform: `scale(${zoom})`, transformOrigin: 'top center',
            transition: 'transform 0.12s ease-out',
            ...sheetStyle,
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
