// ka-clinic-admin/src/features/incidents/IncidentMapPage.jsx
// Read-only surveillance map. Pins are created only from a patient record
// (Patients → Pin Incident Map), never by clicking the map.
import { CheckCircle2, ChevronDown, Layers, MapPin, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIBON_BARANGAYS, LIBON_BARANGAY_COORDS } from '../../lib/libonGeo';

import { SkeletonRows } from '../../components/Skeleton';
// Severity colors mirror the Category II/III convention used across the
// rest of the app (vaccination tracker, patient records).
const CATEGORY_COLOR = { 'Category II': '#EA7A0C', 'Category III': '#D81B25' };
// Anything else (an old "Category I" pin, or none) is grey and not in the legend.
const UNKNOWN_COLOR = '#64748B';
const categoryColor = (cat) => CATEGORY_COLOR[cat] || UNKNOWN_COLOR;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Popup shown above a pressed pin: address, exposure type + category,
// exposure date and the anonymized note (no patient details on the map).
const popupHtml = (inc, loc, color) => `
  <div class="kna-pop">
    <div class="kna-pop-eyebrow">Incident details</div>
    <div class="kna-pop-loc">${esc(loc)}</div>
    <div class="kna-pop-grid">
      <div class="kna-pop-cell"><span>Exposure</span><b>${esc(inc.type || 'Animal bite')}</b></div>
      <div class="kna-pop-cell"><span>Category</span><b style="color:${color}"><i style="background:${color}"></i>${esc(inc.category || '—')}</b></div>
      <div class="kna-pop-cell kna-pop-wide"><span>Exposure date</span><b>${esc(inc.date || inc.exposureDate || '—')}</b></div>
    </div>
    <div class="kna-pop-anon">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Anonymized: no patient details on the map
    </div>
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
  .kna-pop-anon { margin-top: 10px; display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 600; color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 2px 8px; }
  .kna-map .kna-pin-tip { font: 600 11px/1.3 'Plus Jakarta Sans', system-ui, sans-serif; color: #0F172A; border-radius: 8px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(15,23,42,.18); padding: 4px 8px; }
`;

// Barangay filter options: 'all' plus each named Libon barangay. The
// "Zone N" entries in LIBON_BARANGAYS are poblacion zones, not barangays,
// so the map filter leaves them out.
const MAP_BARANGAYS = LIBON_BARANGAYS.filter(b => !/^Zone \d+$/.test(b));

// `incidents` and `loading` come from the dashboard's shared listener
// (useIncidents), which the global search reads too.
export default function IncidentMapPage({ incidents, loading }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerGroupRef = useRef([]);
  const markersRef = useRef({});
  const clusterGroupRef = useRef(null);
  const layerMenuRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  // The incident whose popup is open (list row highlighted to match).
  const [selectedId, setSelectedId] = useState(null);
  const hoverPin = (id, on) => markersRef.current[id]?.marker?.getElement()?.classList.toggle('is-hover', on);

  useEffect(() => {
    const handler = e => { if (layerMenuRef.current && !layerMenuRef.current.contains(e.target)) setLayerMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

    // The whole municipality: every Libon barangay's coordinates (the old
    // box only covered the town centre, so pins in outer barangays such as
    // Tipa-tipa could not be reached).
    const coords = Object.values(LIBON_BARANGAY_COORDS);
    const bounds = L.latLngBounds(coords.map(c => L.latLng(c.lat, c.lng)));

    // Still restricted to Libon, but the bounds are padded (30%) so a popup
    // on an edge pin has room to pan fully into view. Whole-number zoom
    // levels only: fractional zoom is what caused the tile seam lines.
    const map = L.map(mapRef.current, {
      center: [13.2999, 123.4372],
      zoom: 15,
      minZoom: 14,
      maxZoom: 18,
      zoomSnap: 1,
      maxBounds: bounds.pad(0.3),
      maxBoundsViscosity: 0.85,
      dragging: true,
      zoomControl: true,
    });

    // Satellite imagery + a labels/roads reference overlay on top (the
    // "hybrid" view) — pure satellite tiles alone have no place names,
    // which would make the barangay-level map hard to actually read.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      pane: 'overlayPane',
    }).addTo(map);

    leafletMapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [mapLoaded]);

  // ── Layer filter — applied to both the map and the feed list so the two
  // always agree. Pins whose patient has completed treatment are skipped
  // (mapHidden, set by the dashboard / nightly sweep): the incident record
  // stays in Firestore, it just no longer shows on the map.
  const filteredIncidents = useMemo(() => {
    const list = incidents.filter(inc => {
      if (inc.mapHidden === true) return false;
      if (barangayFilter !== 'all') {
        const incBgy = (inc.barangay || '').trim().toLowerCase();
        return incBgy === barangayFilter.toLowerCase();
      }
      return true;
    });
    return list.sort((a, b) => {
      const dateA = a.date || a.exposureDate || '';
      const dateB = b.date || b.exposureDate || '';
      return dateB.localeCompare(dateA) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
  }, [incidents, barangayFilter]);

  // ── Memoize Leaflet Incident Marker Data ─────────────────────
  const memoizedIncidentLayers = useMemo(() => {
    return filteredIncidents.map(inc => {
      const lat = inc.lat ?? inc.latitude;
      const lng = inc.lng ?? inc.longitude;
      if (!lat || !lng) return null;

      const color = categoryColor(inc.category);
      const loc = inc.address || inc.location || (inc.barangay ? `${inc.zone ? inc.zone + ', ' : ''}Brgy. ${inc.barangay}, Libon, Albay` : 'Libon, Albay');


      return { id: inc.id, lat, lng, color, category: inc.category, popup: popupHtml(inc, loc, color), tooltip: `${inc.barangay ? `Brgy. ${inc.barangay}` : loc} · ${inc.category || ''}` };
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
      marker.bindTooltip(inc.tooltip, { direction: 'top', offset: [0, -34], opacity: 0.96, className: 'kna-pin-tip' });
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
    const lat = inc.lat ?? inc.latitude;
    const lng = inc.lng ?? inc.longitude;
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

      {/* ── Map Toolbar: title + layer toggle ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <ShieldAlert size={14} className="text-gray-400" /> Rabies Incident Surveillance Map — Libon, Albay
        </div>
        <div className="flex items-center gap-3">
          {/* Pin severity legend */}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-slate-600">
            <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">Pin</span>
            {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
              <span key={cat} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} /> {cat}
              </span>
            ))}
          </div>

        <div ref={layerMenuRef} className="relative">
          <button
            onClick={() => setLayerMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Layers size={13} className="text-gray-400" />
            {barangayFilter === 'all' ? 'All Barangays' : `Brgy. ${barangayFilter}`}
            <ChevronDown size={13} className="text-gray-400" />
          </button>
          {layerMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 z-30 max-h-64 overflow-y-auto">
              <button
                onClick={() => { setBarangayFilter('all'); setLayerMenuOpen(false); }}
                className={`flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  barangayFilter === 'all' ? 'bg-indigo-50 text-[#3B50DF]' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                All Barangays
                {barangayFilter === 'all' && <CheckCircle2 size={13} />}
              </button>
              {MAP_BARANGAYS.map(bgy => (
                <button
                  key={bgy}
                  onClick={() => { setBarangayFilter(bgy); setLayerMenuOpen(false); }}
                  className={`flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    barangayFilter === bgy ? 'bg-indigo-50 text-[#3B50DF]' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Brgy. {bgy}
                  {barangayFilter === bgy && <CheckCircle2 size={13} />}
                </button>
              ))}
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

        </div>

        {/* Incident List Sidebar — iOS Notes-Style List */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="text-red-600" />
              <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">Incidents List</h3>
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
                <p className="text-xs font-semibold text-slate-600">{incidents.length === 0 ? 'No incidents in Libon' : 'No matching incidents'}</p>
                <p className="text-[11px] text-slate-400">{incidents.length === 0 ? 'Pin an incident from a patient record' : 'Try switching active filter'}</p>
              </div>
            ) : filteredIncidents.map(inc => {
              const catColor = categoryColor(inc.category);
              const loc = inc.address || inc.location || (inc.barangay ? `${inc.zone ? inc.zone + ', ' : ''}Brgy. ${inc.barangay}, Libon, Albay` : 'Libon, Albay');
              return (
                <div
                  key={inc.id}
                  id={`inc-row-${inc.id}`}
                  onClick={() => panTo(inc)}
                  onMouseEnter={() => hoverPin(inc.id, true)}
                  onMouseLeave={() => hoverPin(inc.id, false)}
                  className={`px-4 py-3 transition-colors group cursor-pointer relative ${selectedId === inc.id ? 'bg-indigo-50/70 shadow-[inset_3px_0_0_#3B50DF]' : 'hover:bg-slate-50/90'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* iOS Notes Primary Title Line */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold text-slate-900 group-hover:text-red-600 transition-colors truncate" title={loc}>
                          {loc}
                        </span>
                        <span className="text-[10px] font-normal text-slate-400 flex-shrink-0">
                          {inc.date || inc.exposureDate || 'Today'}
                        </span>
                      </div>

                      {/* iOS Notes Subtitle Line */}
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                        <span>{inc.type || 'Dog Bite'}</span>
                        <span className="text-slate-300">•</span>
                        <span>{inc.category || '—'}</span>
                      </div>
                    </div>

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