// ka-clinic-admin/src/features/incidents/IncidentMapPage.jsx
// Incident Map, demo only (thesis ethics rules, docs/STUDY_MODE.md).
//
// Shows ONLY simulated, non-identifiable test incidents (isSimulated: true,
// see lib/simulatedIncidents.js): no addresses, barangays, zones, patients
// or coordinates appear anywhere on this page, there is no barangay filter or
// per-barangay count, a banner says the data is simulated, and the map area
// carries a "SIMULATED DATA" watermark so any screenshot is marked. Only
// signed-in admins reach it (dashboard route + firestore.rules).
import { AlertTriangle, MapPin, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SIM_BOUNDS, simulatedIncidentLabel, simulatedMonthLabel } from '../../lib/simulatedIncidents';
import { MAP_BANNER } from '../../lib/studyMode';

import { SkeletonRows } from '../../components/Skeleton';
// Severity colors mirror the Category II/III convention used across the
// rest of the app (vaccination tracker, patient records).
const CATEGORY_COLOR = { 'Category II': '#EA7A0C', 'Category III': '#D81B25' };
// Anything else (an old "Category I" pin, or none) is grey and not in the legend.
const UNKNOWN_COLOR = '#64748B';
const categoryColor = (cat) => CATEGORY_COLOR[cat] || UNKNOWN_COLOR;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Popup above a pressed pin: a generic label only (no place, no coordinates).
const popupHtml = (inc, color) => `
  <div class="kna-pop">
    <div class="kna-pop-eyebrow">Simulated incident</div>
    <div class="kna-pop-loc">Simulated incident #${esc(inc.simNo ?? '?')}</div>
    <div class="kna-pop-grid">
      <div class="kna-pop-cell"><span>Type</span><b>${esc(inc.type || 'Animal bite')}</b></div>
      <div class="kna-pop-cell"><span>Category</span><b style="color:${color}"><i style="background:${color}"></i>${esc(inc.category || '—')}</b></div>
      <div class="kna-pop-cell kna-pop-wide"><span>Month</span><b>${esc(simulatedMonthLabel(inc.month) || '—')}</b></div>
    </div>
    <div class="kna-pop-anon">Simulated test data, not a real case</div>
  </div>`;

// Crisp SVG teardrop, 28×36, tip at the bottom centre (the marker anchor),
// thin white ring and a soft shadow so it reads on satellite imagery.
const pinSvg = (color) => `
  <svg class="kna-pin-svg" width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 1.5C7.1 1.5 1.5 7 1.5 13.8c0 9.2 10.6 19 12 20.3a.75.75 0 0 0 1 0c1.4-1.3 12-11.1 12-20.3C26.5 7 20.9 1.5 14 1.5Z"
      fill="${color}" stroke="#FFFFFF" stroke-width="1.75"/>
    <circle cx="14" cy="13.5" r="4.6" fill="#FFFFFF"/>
    <circle cx="14" cy="13.5" r="2.2" fill="${color}"/>
  </svg>`;

// Styles for the markers, clusters and the tile-seam fix. Leaflet builds
// these elements outside React, so they are plain CSS.
const MAP_CSS = `
  .kna-pin { background: none; border: none; }
  .kna-pin .kna-pin-svg { display: block; transform-origin: 50% 100%; transition: transform .15s ease;
    filter: drop-shadow(0 2px 3px rgba(15,23,42,.45)); overflow: visible; }
  .kna-pin:hover .kna-pin-svg, .kna-pin.is-hover .kna-pin-svg { transform: scale(1.15); }
  .kna-pin.is-selected .kna-pin-svg { transform: scale(1.3); filter: drop-shadow(0 0 0 #fff) drop-shadow(0 0 5px rgba(255,255,255,.95)) drop-shadow(0 3px 5px rgba(15,23,42,.5)); }
  .kna-pin.is-selected, .kna-pin.is-hover { z-index: 1000 !important; }
  .kna-cluster { background: none; border: none; }
  .kna-cluster div { width: 100%; height: 100%; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
    color: #fff; font: 700 12px/1 'Plus Jakarta Sans', system-ui, sans-serif; border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(15,23,42,.45), 0 0 0 4px rgba(255,255,255,.28); transition: transform .15s ease; }
  .kna-cluster:hover div { transform: scale(1.08); }
  /* Adjacent tiles add together, so sub-pixel gaps between them no longer
     show the background through as thin lines. Dark map background so the
     blend never lightens the imagery. */
  .kna-map.leaflet-container { background: #0B1220; }
  .kna-map .leaflet-tile-container img.leaflet-tile { mix-blend-mode: plus-lighter; }
  .kna-map .kna-inc-popup .leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 12px 32px rgba(15,23,42,.25); }
  .kna-map .kna-inc-popup .leaflet-popup-content { margin: 14px 16px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
  .kna-map .kna-inc-popup a.leaflet-popup-close-button { top: 8px; right: 8px; width: 24px; height: 24px; font-size: 18px; line-height: 22px; color: #64748B; border-radius: 6px; }
  .kna-map .kna-inc-popup a.leaflet-popup-close-button:hover { background: #F1F5F9; color: #0F172A; }
  .kna-pop-eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #64748B; padding-right: 20px; }
  .kna-pop-loc { margin-top: 4px; font-size: 13.5px; font-weight: 700; color: #0F172A; line-height: 1.35; padding-right: 8px; }
  .kna-pop-grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .kna-pop-cell { background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 8px; padding: 5px 9px; }
  .kna-pop-cell span { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
  .kna-pop-cell b { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #1E293B; }
  .kna-pop-cell b i { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
  .kna-pop-wide { grid-column: 1 / -1; }
  .kna-pop-anon { margin-top: 10px; display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: #92400E; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 2px 8px; }
  .kna-map .kna-pin-tip { font: 600 11px/1.3 'Plus Jakarta Sans', system-ui, sans-serif; color: #0F172A; border-radius: 8px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(15,23,42,.18); padding: 4px 8px; }
`;

// `incidents` and `loading` come from the dashboard's shared listener
// (useIncidents), which the global search reads too.
export default function IncidentMapPage({ incidents, loading }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerGroupRef = useRef([]);
  const markersRef = useRef({});
  const clusterGroupRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  // The incident whose popup is open (list row highlighted to match).
  const [selectedId, setSelectedId] = useState(null);
  const hoverPin = (id, on) => markersRef.current[id]?.marker?.getElement()?.classList.toggle('is-hover', on);

  // ── Load Leaflet CSS/JS + the marker-cluster plugin (same CDN-script
  // pattern as Leaflet core) — mapLoaded only flips once clustering is
  // actually available, since the marker-sync effect depends on it. ──────
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('leaflet-cluster-css')) {
      const link1 = document.createElement('link');
      link1.id = 'leaflet-cluster-css';
      link1.rel = 'stylesheet';
      link1.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
      document.head.appendChild(link1);
      const link2 = document.createElement('link');
      link2.id = 'leaflet-cluster-default-css';
      link2.rel = 'stylesheet';
      link2.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
      document.head.appendChild(link2);
    }

    const loadCluster = () => {
      if (window.L.markerClusterGroup) { setMapLoaded(true); return; }
      if (document.getElementById('leaflet-cluster-js')) return;
      const c = document.createElement('script');
      c.id = 'leaflet-cluster-js';
      c.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
      c.async = true;
      c.onload = () => setMapLoaded(true);
      document.head.appendChild(c);
    };

    if (window.L) {
      loadCluster();
      return;
    }
    if (document.getElementById('leaflet-js')) return;
    const s = document.createElement('script');
    s.id = 'leaflet-js';
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => loadCluster();
    document.head.appendChild(s);
  }, []);

  // ── Init Leaflet map centered over Libon, Albay ─────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || leafletMapRef.current) return;
    const L = window.L;
    if (!L) return;

    // The box the simulated pins are spread over.
    const bounds = L.latLngBounds([SIM_BOUNDS.south, SIM_BOUNDS.west], [SIM_BOUNDS.north, SIM_BOUNDS.east]);

    // Still restricted to Libon, but the bounds are padded (30%) so a popup
    // on an edge pin has room to pan fully into view. Whole-number zoom
    // levels only: fractional zoom is what caused the tile seam lines.
    const map = L.map(mapRef.current, {
      center: bounds.getCenter(),
      zoom: 14,
      minZoom: 13,
      maxZoom: 18,
      zoomSnap: 1,
      maxBounds: bounds.pad(0.3),
      maxBoundsViscosity: 0.85,
      dragging: true,
      zoomControl: true,
    });

    // Satellite imagery only: no place-name overlay, so the demo map does
    // not label barangays or streets.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }).addTo(map);

    leafletMapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [mapLoaded]);

  // Simulated incidents only (useIncidents already queries for them; this is
  // a second guard), newest month first.
  const filteredIncidents = useMemo(() => incidents
    .filter(inc => inc.isSimulated === true && inc.mapHidden !== true)
    .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')) || (b.simNo ?? 0) - (a.simNo ?? 0)),
  [incidents]);

  // ── Memoize Leaflet Incident Marker Data ─────────────────────
  const memoizedIncidentLayers = useMemo(() => {
    return filteredIncidents.map(inc => {
      const { lat, lng } = inc;
      if (!lat || !lng) return null;
      const color = categoryColor(inc.category);
      return { id: inc.id, lat, lng, color, category: inc.category, popup: popupHtml(inc, color), tooltip: `Simulated incident #${inc.simNo ?? '?'} · ${inc.category || ''}` };
    }).filter(Boolean);
  }, [filteredIncidents]);

  // ── Sync Leaflet Markers (clustered) & Heat Circles ──────────
  useEffect(() => {
    if (!leafletMapRef.current || !mapLoaded || !window.L || !window.L.markerClusterGroup) return;
    const L = window.L;
    const map = leafletMapRef.current;

    layerGroupRef.current.forEach(layer => map.removeLayer(layer));
    layerGroupRef.current = [];
    markersRef.current = {};
    clusterGroupRef.current = null;

    const buildPinIcon = (color) => L.divIcon({
      className: 'kna-pin',
      html: pinSvg(color),
      iconSize: [28, 36],
      iconAnchor: [14, 35],
      popupAnchor: [0, -32],
    });

    // Overlapping pins become one count bubble that splits on click/zoom.
    // Red when the cluster holds any Category III pin, orange otherwise.
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 38,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const kids = cluster.getAllChildMarkers();
        const n = kids.length;
        const hasIII = kids.some(m => m.options.kna?.category === 'Category III');
        const size = n < 10 ? 34 : n < 25 ? 40 : 46;
        return L.divIcon({
          className: 'kna-cluster',
          html: `<div style="background:${hasIII ? CATEGORY_COLOR['Category III'] : CATEGORY_COLOR['Category II']}">${n}</div>`,
          iconSize: [size, size],
        });
      },
    });
    memoizedIncidentLayers.forEach(inc => {
      const marker = L.marker([inc.lat, inc.lng], { icon: buildPinIcon(inc.color), kna: { category: inc.category }, riseOnHover: true });
      // Pressing a pin opens its popup above it. autoPan moves the map so pin
      // and popup both fit (the padded maxBounds leaves room for that pan at
      // the edges of Libon). Hover shows a small tooltip, hidden while the
      // popup is open.
      marker.bindPopup(inc.popup, { autoPan: true, autoPanPaddingTopLeft: [24, 24], autoPanPaddingBottomRight: [24, 24], maxWidth: 280, minWidth: 240, className: 'kna-inc-popup' });
      const tooltip = document.createElement('span');
      tooltip.textContent = inc.tooltip;
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -34], opacity: 0.96, className: 'kna-pin-tip' });
      marker.on('popupopen', () => { marker.closeTooltip(); setSelectedId(inc.id); });
      marker.on('tooltipopen', () => { if (marker.isPopupOpen()) marker.closeTooltip(); });
      marker.on('popupclose', () => setSelectedId(cur => (cur === inc.id ? null : cur)));
      clusterGroup.addLayer(marker);
      markersRef.current[inc.id] = { marker };
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;
    layerGroupRef.current.push(clusterGroup);
  }, [memoizedIncidentLayers, mapLoaded]);

  // Selected pin: bigger marker with a ring; its list row scrolls into view.
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, { marker }]) => {
      marker.getElement()?.classList.toggle('is-selected', id === selectedId);
    });
    if (selectedId) document.getElementById(`inc-row-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, memoizedIncidentLayers]);
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return undefined;
    const clear = () => setSelectedId(null);
    map.on('click', clear);
    // Cluster re-renders recreate marker elements: re-apply the ring.
    const reapply = () => Object.entries(markersRef.current).forEach(([id, { marker }]) => marker.getElement()?.classList.toggle('is-selected', id === selectedIdRef.current));
    map.on('zoomend moveend', reapply);
    return () => { map.off('click', clear); map.off('zoomend moveend', reapply); };
  }, [mapLoaded]);
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selectedId;

  // ── Pan to Marker ────────────────────────────────────────────
  const panTo = (inc) => {
    setSelectedId(inc.id);
    if (!leafletMapRef.current) return;
    const { lat, lng } = inc;
    if (!lat || !lng) return;

    const map = leafletMapRef.current;
    const obj = markersRef.current[inc.id];

    if (obj?.marker && clusterGroupRef.current) {
      clusterGroupRef.current.zoomToShowLayer(obj.marker, () => {
        obj.marker.openPopup();
      });
    } else {
      map.setView([lat, lng], 15.5, { animate: true });
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-120px)] px-6 py-4">

      {/* ── Simulated-data banner ── */}
      <div role="note" className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900">
        <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-xs font-bold">{MAP_BANNER}</p>
        <p className="text-[11px] font-medium text-amber-800 ml-auto hidden md:block">Authorized evaluators only · No real patient or location data</p>
      </div>

      {/* ── Map Toolbar: title + legend ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <ShieldAlert size={14} className="text-gray-400" /> Incident Map (Demo)
        </div>
        {/* Pin severity legend */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-slate-600">
          <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">Pin</span>
          {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
            <span key={cat} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} /> {cat}
            </span>
          ))}
        </div>
      </div>

      {/* ── Main Map & List Grid ── */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">

        {/* Leaflet Map container */}
        <div className="col-span-8 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col relative">
          <style>{MAP_CSS}</style>
          <div ref={mapRef} className="kna-map w-full h-full z-10" />
          {/* Watermark over the map area: every screenshot reads as simulated. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center overflow-hidden">
            <span className="select-none text-[clamp(32px,7vw,88px)] font-black tracking-[0.12em] text-white/30 -rotate-[24deg] whitespace-nowrap"
              style={{ textShadow: '0 2px 6px rgba(15,23,42,0.35)' }}>
              SIMULATED DATA
            </span>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute left-3 bottom-3 z-[500] px-2 py-1 rounded-md bg-amber-400/90 text-[10px] font-extrabold tracking-wider text-amber-950">
            SIMULATED DATA · NOT REAL CASES
          </div>

        </div>

        {/* Incident List Sidebar — iOS Notes-Style List */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="text-red-600" />
              <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">Simulated incidents</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredIncidents.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <SkeletonRows rows={5} className="!px-4" />
            ) : filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-1.5 text-center p-4">
                <MapPin size={24} className="text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No simulated incidents</p>
                <p className="text-[11px] text-slate-400">Seed them with scripts/seed-simulated-incidents.mjs</p>
              </div>
            ) : filteredIncidents.map(inc => {
              const catColor = categoryColor(inc.category);
              return (
                <div
                  key={inc.id}
                  id={`inc-row-${inc.id}`}
                  onClick={() => panTo(inc)}
                  onMouseEnter={() => hoverPin(inc.id, true)}
                  onMouseLeave={() => hoverPin(inc.id, false)}
                  className={`px-4 py-3 transition-colors group cursor-pointer relative ${selectedId === inc.id ? 'bg-indigo-50/70 shadow-[inset_3px_0_0_#3B50DF]' : 'hover:bg-slate-50/90'}`}
                  title={simulatedIncidentLabel(inc)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-slate-900 group-hover:text-red-600 transition-colors truncate">
                      Simulated incident #{inc.simNo ?? '?'}
                    </span>
                    <span className="text-[10px] font-normal text-slate-400 flex-shrink-0">{simulatedMonthLabel(inc.month)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                    <span>{inc.type || 'Animal bite'}</span>
                    <span className="text-slate-300">•</span>
                    <span>{inc.category || '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
