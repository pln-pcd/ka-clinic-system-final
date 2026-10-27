// ka-clinic-admin/src/features/incidents/IncidentMapPage.jsx
// Incident Map. One pin per open PEP (bite / scratch) case in the patient
// records, placed at the record's barangay (or Poblacion zone) point, never a
// house. Pins are worked out on this page from the live records and nothing
// is stored: a case that is completed or archived simply drops off the map,
// with no notice sent. The records are simulated test data (study rules), and
// the page says so. The map is locked to Libon's municipal boundary. Only
// signed-in staff reach it (dashboard route + firestore.rules).
import { CheckCircle2, ChevronDown, Layers, MapPin, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveCollection } from '../../lib/liveStore';
import { serviceKey } from '../../lib/serviceFields';
import { LIBON_BARANGAYS, LIBON_BOUNDARY, POBLACION, geocodeLibonAddress, insideLibon, knownBarangay, poblacionZone, recordBarangay } from '../../lib/libonGeo';

import { SkeletonRows } from '../../components/Skeleton';
// Severity colors mirror the Category II/III convention used across the
// rest of the app (vaccination tracker, patient records).
// Category I is not used (exposures start at Category II), so it has no
// colour, no legend entry and no pins.
const CATEGORY_COLOR = { 'Category II': '#EA7A0C', 'Category III': '#D81B25' };
// Anything else is grey and not in the legend.
const UNKNOWN_COLOR = '#64748B';

// Barangay filter: Libon's barangays (Poblacion as one).
const MAP_BARANGAYS = LIBON_BARANGAYS;
const categoryColor = (cat) => CATEGORY_COLOR[cat] || UNKNOWN_COLOR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ymd) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const isDoneDose = d => d?.done === true || ['done', 'completed'].includes(String(d?.s || d?.status || '').toLowerCase());
// A case still on the map: PEP, not archived, not completed (every dose given).
const isOpenCase = r => serviceKey(r.service) === 'PEP' && !r.isArchived && r.status !== 'completed'
  && !(Array.isArray(r.doses) && r.doses.length > 0 && r.doses.every(isDoneDose));

/** Pins for the open PEP cases, oldest first numbered from 1; no names or MRNs. */
function incidentsFromRecords(records) {
  return records
    .filter(isOpenCase)
    .map(r => {
      const barangay = knownBarangay(recordBarangay(r));
      if (!barangay) return null; // not a Libon barangay: cannot be placed
      const zone = barangay === POBLACION ? (poblacionZone(r.zone) || poblacionZone(r.barangay)) : (r.zone || '');
      const { lat, lng } = geocodeLibonAddress(barangay, zone || r.firestoreId);
      if (!insideLibon(lat, lng)) return null;
      const animal = String(r.animal || 'Animal').trim();
      const how = String(r.typeOfExposure || 'Bite').trim().toLowerCase();
      const cat = String(r.cat || '').replace('Category ', '').trim();
      return {
        id: r.firestoreId || r.id, lat, lng, barangay,
        type: `${animal.charAt(0).toUpperCase()}${animal.slice(1).toLowerCase()} ${how}`,
        category: cat ? `Category ${cat}` : '',
        date: String(r.date || '').slice(0, 10),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
    .map((inc, i) => ({ ...inc, no: i + 1 }))
    .reverse();
}

// Cases closer than about 150 m would draw on top of each other, so each
// group is fanned out on a small ring around its first case. Every case keeps
// its own pin (nothing is combined); only where it is drawn moves slightly.
const OVERLAP_DEG = 0.0014;
const RING_DEG = 0.0012;
function spreadOverlapping(pins) {
  const groups = [];
  pins.forEach(p => {
    const g = groups.find(gr => Math.abs(gr[0].lat - p.lat) < OVERLAP_DEG && Math.abs(gr[0].lng - p.lng) < OVERLAP_DEG);
    if (g) g.push(p); else groups.push([p]);
  });
  return groups.flatMap(g => (g.length === 1 ? g : g.map((p, i) => {
    const a = (2 * Math.PI * i) / g.length;
    return { ...p, lat: g[0].lat + RING_DEG * Math.sin(a), lng: g[0].lng + RING_DEG * Math.cos(a) };
  })));
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Popup above a pressed pin: a generic label only (no place, no coordinates).
const popupHtml = (inc, color) => `
  <div class="kna-pop">
    <div class="kna-pop-eyebrow">Exposure Incident</div>
    <div class="kna-pop-loc">Incident #${esc(inc.no)}</div>
    <div class="kna-pop-grid">
      <div class="kna-pop-cell"><span>Type</span><b>${esc(inc.type || 'Animal bite')}</b></div>
      <div class="kna-pop-cell"><span>Category</span><b style="color:${color}"><i style="background:${color}"></i>${esc(inc.category || '—')}</b></div>
      <div class="kna-pop-cell"><span>Barangay</span><b>${esc(inc.barangay)}</b></div>
      <div class="kna-pop-cell"><span>Month</span><b>${esc(monthLabel(inc.date) || '—')}</b></div>
    </div>
    <div class="kna-pop-anon">Simulated data · barangay-level point</div>
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

// Styles for the markers and the tile-seam fix. Leaflet builds
// these elements outside React, so they are plain CSS.
const MAP_CSS = `
  .kna-pin { background: none; border: none; }
  .kna-pin .kna-pin-svg { display: block; transform-origin: 50% 100%; transition: transform .15s ease;
    filter: drop-shadow(0 2px 3px rgba(15,23,42,.45)); overflow: visible; }
  .kna-pin:hover .kna-pin-svg, .kna-pin.is-hover .kna-pin-svg { transform: scale(1.15); }
  .kna-pin.is-selected .kna-pin-svg { transform: scale(1.3); filter: drop-shadow(0 0 0 #fff) drop-shadow(0 0 5px rgba(255,255,255,.95)) drop-shadow(0 3px 5px rgba(15,23,42,.5)); }
  .kna-pin.is-selected, .kna-pin.is-hover { z-index: 1000 !important; }
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

// Pins come from the live patient records (the same shared listener the
// Patients page uses), not from stored incident documents.
export default function IncidentMapPage() {
  const vaxLive = useLiveCollection('vaccinations');
  const loading = !vaxLive.loaded;
  const incidents = useMemo(() => incidentsFromRecords(vaxLive.rows || []), [vaxLive]);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerGroupRef = useRef([]);
  const markersRef = useRef({});

  const [mapLoaded, setMapLoaded] = useState(false);
  // The incident whose popup is open (list row highlighted to match).
  const [selectedId, setSelectedId] = useState(null);
  const hoverPin = (id, on) => markersRef.current[id]?.marker?.getElement()?.classList.toggle('is-hover', on);

  // ── Load Leaflet CSS/JS (CDN script). Every case is its own pin, so the
  // marker-cluster plugin is not loaded. ──────────────────────────────
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (window.L) { setMapLoaded(true); return undefined; }
    let s = document.getElementById('leaflet-js');
    if (!s) {
      s = document.createElement('script');
      s.id = 'leaflet-js';
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      document.head.appendChild(s);
    }
    // Also covers a script another visit to this page already started.
    const onLoad = () => setMapLoaded(true);
    s.addEventListener('load', onLoad);
    return () => s.removeEventListener('load', onLoad);
  }, []);

  // ── Init Leaflet map centered over Libon, Albay ─────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || leafletMapRef.current) return;
    const L = window.L;
    if (!L) return;

    // Libon's municipal boundary.
    const bounds = L.latLngBounds(LIBON_BOUNDARY);

    // Locked to Libon: the view can never leave the area (a small margin
    // around the pins, so an edge pin's popup still fits) and cannot zoom out
    // past it. Whole-number zoom levels only: fractional zoom is what caused
    // the tile seam lines.
    const area = bounds.pad(0.08);
    const map = L.map(mapRef.current, {
      center: bounds.getCenter(),
      zoom: 13,
      maxZoom: 18,
      zoomSnap: 1,
      maxBounds: area,
      maxBoundsViscosity: 1.0,
      dragging: true,
      zoomControl: true,
    });
    // Lowest zoom at which the whole view still fits inside the area.
    const lockZoom = () => {
      map.setMinZoom(map.getBoundsZoom(area, true));
      if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom());
      map.panInsideBounds(area, { animate: false });
    };
    lockZoom();
    map.on('resize', lockZoom);

    // Satellite imagery only: no place-name overlay, so the demo map does
    // not label barangays or streets.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }).addTo(map);

    // Everything outside Libon is dimmed (a world-sized shape with Libon cut
    // out of it), and the boundary is outlined.
    L.polygon([[[-90, -180], [-90, 180], [90, 180], [90, -180]], LIBON_BOUNDARY], {
      stroke: false, fillColor: '#0B1220', fillOpacity: 0.62, interactive: false,
    }).addTo(map);
    L.polygon(LIBON_BOUNDARY, { color: '#FFFFFF', weight: 2, opacity: 0.9, fill: false, dashArray: '6 4', interactive: false }).addTo(map);

    leafletMapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [mapLoaded]);

  // Newest case first. Old Category I cases are left out.
  const shownIncidents = useMemo(() => incidents.filter(inc => inc.category !== 'Category I'), [incidents]);

  // Barangay dropdown, applied to both the map and the list.
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  useEffect(() => {
    const onDown = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  const activeFilters = barangayFilter === 'all' ? 0 : 1;
  const filteredIncidents = useMemo(() => (barangayFilter === 'all'
    ? shownIncidents
    : shownIncidents.filter(inc => inc.barangay === barangayFilter)),
  [shownIncidents, barangayFilter]);

  // ── Memoize Leaflet Incident Marker Data ─────────────────────
  const memoizedIncidentLayers = useMemo(() => {
    const placed = filteredIncidents.map(inc => {
      const { lat, lng } = inc;
      if (!lat || !lng) return null;
      const color = categoryColor(inc.category);
      return { id: inc.id, lat, lng, color, category: inc.category, popup: popupHtml(inc, color), tooltip: `Incident #${inc.no} · ${inc.category || ''}` };
    }).filter(Boolean);
    return spreadOverlapping(placed);
  }, [filteredIncidents]);

  // ── Sync Leaflet Markers: one pin per case, never combined ──────────
  useEffect(() => {
    if (!leafletMapRef.current || !mapLoaded || !window.L) return;
    const L = window.L;
    const map = leafletMapRef.current;

    layerGroupRef.current.forEach(layer => map.removeLayer(layer));
    layerGroupRef.current = [];
    markersRef.current = {};

    const buildPinIcon = (color) => L.divIcon({
      className: 'kna-pin',
      html: pinSvg(color),
      iconSize: [28, 36],
      iconAnchor: [14, 35],
      popupAnchor: [0, -32],
    });

    const pinLayer = L.layerGroup();
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
      pinLayer.addLayer(marker);
      markersRef.current[inc.id] = { marker };
    });
    map.addLayer(pinLayer);
    layerGroupRef.current.push(pinLayer);
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
    // Keep the selected pin's ring after the map moves.
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

    // Zoom in on the pin, then open its popup.
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
    // Opened after the pan settles (also when the map did not need to move).
    if (obj?.marker) setTimeout(() => obj.marker.openPopup(), 350);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-120px)] px-6 py-4">

      {/* ── Map Toolbar: title + legend ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          <ShieldAlert size={15} className="text-[#3B50DF]" /> Incident Surveillance Map
        </div>
        <div className="flex items-center gap-3">
          {/* Pin severity legend */}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-slate-600">
            <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">Severity</span>
            {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
              <span key={cat} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} /> {cat}
              </span>
            ))}
          </div>

          {/* Barangay dropdown */}
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen(o => !o)}
              aria-expanded={filterOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Layers size={13} className="text-gray-400" />
              {barangayFilter === 'all' ? 'All Barangays' : `Brgy. ${barangayFilter}`}
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1.5 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 z-[1000] max-h-72 overflow-y-auto">
                {['all', ...MAP_BARANGAYS].map(b => {
                  const on = barangayFilter === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => { setBarangayFilter(b); setFilterOpen(false); }}
                      className={`flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        on ? 'bg-indigo-50 text-[#3B50DF]' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      {b === 'all' ? 'All Barangays' : `Brgy. ${b}`}
                      {on && <CheckCircle2 size={13} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Map & List Grid ── */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">

        {/* Leaflet Map container */}
        <div className="col-span-8 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col relative">
          <style>{MAP_CSS}</style>
          <div ref={mapRef} className="kna-map w-full h-full z-10" />
          <span className="absolute top-3 right-3 z-20 pointer-events-none px-2 py-1 rounded-md bg-white/90 text-[10px] font-extrabold tracking-wider text-slate-700 shadow-sm">
            SIMULATED DATA
          </span>
        </div>

        {/* Incident List Sidebar — iOS Notes-Style List */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="text-red-600" />
              <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">Reported Incidents</h3>
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
                <p className="text-xs font-semibold text-slate-600">No reported incidents</p>
                <p className="text-[11px] text-slate-400">{activeFilters ? 'None in this barangay' : 'No active surveillance pins on file'}</p>
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
                  title={`Incident #${inc.no} · ${inc.type} · ${inc.category || '—'} · Brgy. ${inc.barangay}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-slate-900 group-hover:text-red-600 transition-colors truncate">
                      Incident #{inc.no}
                    </span>
                    <span className="text-[10px] font-normal text-slate-400 flex-shrink-0">{monthLabel(inc.date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                    <span>{inc.type || 'Animal bite'}</span>
                    <span className="text-slate-300">•</span>
                    <span>{inc.category || '—'}</span>
                    <span className="text-slate-300">•</span>
                    <span className="truncate">Brgy. {inc.barangay}</span>
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
