// kna-admin/src/incidents.jsx
import {
  addDoc, collection, doc, limit,
  onSnapshot, orderBy, query
} from 'firebase/firestore';
import { Calendar, CheckCircle2, ChevronDown, Layers, Lock, MapPin, Repeat, ShieldAlert, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { LIBON_BARANGAYS, geocodeLibonAddress } from './patients';
import { getTodayDateString } from '../lib/dates';

const INCIDENT_TYPES = ['Dog Bite', 'Cat Scratch', 'Bat Contact', 'Other Animal Bite'];

// Severity colors mirror the Category I/II/III convention used across the
// rest of the app (vaccination tracker, patient records).
const CATEGORY_COLOR = { 'Category II': '#D97706', 'Category III': '#C8151A' };
const categoryColor = (cat) => CATEGORY_COLOR[cat] || CATEGORY_COLOR['Category III'];

// Barangay filter options: 'all' plus each Libon barangay
// Built dynamically from LIBON_BARANGAYS in patients.jsx

const EMPTY_FORM = {
  barangay: 'San Juan',
  zone: 'Zone 1',
  location: 'Zone 1, Brgy. San Juan, Libon',
  type: 'Dog Bite',
  category: 'Category III',
  description: '',
  status: 'active',
  date: getTodayDateString(),
};

const inputCls =
  'w-full text-xs font-medium px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 ' +
  'outline-none transition focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF]';

function Field({ label, children, full }) {
  return (
    <div className={`flex flex-col gap-1.5${full ? ' sm:col-span-2' : ''}`}>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      {children}
    </div>
  );
}

export default function IncidentMapPage() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerGroupRef = useRef([]);
  const markersRef = useRef({});
  const clusterGroupRef = useRef(null);
  const layerMenuRef = useRef(null);

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [pendingLatLng, setPendingLatLng] = useState(null);
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

    const bounds = L.latLngBounds(
      L.latLng(13.2750, 123.4150),
      L.latLng(13.3180, 123.4560)
    );

    const map = L.map(mapRef.current, {
      center: [13.2999, 123.4372],
      zoom: 14.5,
      minZoom: 14.0,
      maxZoom: 18.0,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
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

    map.on('click', async e => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      setPendingLatLng({ lat, lng });

      // Find exact nearest Libon Barangay by spatial proximity
      let matchedBgy = 'San Juan';
      let minDist = Infinity;
      LIBON_BARANGAYS.forEach(b => {
        const c = geocodeLibonAddress(b);
        const d = Math.hypot(c.lat - lat, c.lng - lng);
        if (d < minDist) {
          minDist = d;
          matchedBgy = b;
        }
      });

      let detectedZone = 'Zone 1';
      let exactAddr = `Brgy. ${matchedBgy}, Libon, Albay`;

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        if (data && data.address) {
          const road = data.address.road || data.address.pedestrian || data.address.suburb || data.address.neighbourhood || '';
          if (road) detectedZone = road;
          const nomBgy = data.address.village || data.address.suburb || data.address.quarter || '';
          if (nomBgy) {
            const foundNomBgy = LIBON_BARANGAYS.find(b => b.toLowerCase() === nomBgy.toLowerCase());
            if (foundNomBgy) matchedBgy = foundNomBgy;
          }
          exactAddr = data.display_name || `${detectedZone ? detectedZone + ', ' : ''}Brgy. ${matchedBgy}, Libon`;
        }
      } catch (err) {
        console.warn('Reverse geocode error:', err);
      }

      setForm({
        ...EMPTY_FORM,
        barangay: matchedBgy,
        zone: detectedZone,
        location: exactAddr,
      });
      setShowModal(true);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [mapLoaded]);

  // ── Firestore real-time listener ────────────────────────────
  useEffect(() => {
    let unsub;
    const fetchIncidents = () => {
      try {
        const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'), limit(100));
        unsub = onSnapshot(q, snap => {
          setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        }, err => {
          console.warn('Ordered query failed, falling back to unordered query:', err);
          const fallbackQ = query(collection(db, 'incidents'), limit(100));
          unsub = onSnapshot(fallbackQ, snap => {
            setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
          });
        });
      } catch (err) {
        console.warn('Query catch fallback:', err);
        const fallbackQ = query(collection(db, 'incidents'), limit(100));
        unsub = onSnapshot(fallbackQ, snap => {
          setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
      }
    };

    fetchIncidents();
    return () => { if (unsub) unsub(); };
  }, []);

  // ── Repeat Incident Zones — barangays with more than one report, ever
  // (not scoped to the current month), computed off the raw incidents list
  // so it stays stable regardless of which layer filter is active. ───────
  const barangayCountsAll = useMemo(() => {
    const counts = {};
    incidents.forEach(i => {
      const key = (i.barangay || i.location || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [incidents]);

  const repeatZoneKeys = useMemo(
    () => new Set(Object.entries(barangayCountsAll).filter(([, c]) => c > 1).map(([k]) => k)),
    [barangayCountsAll]
  );

  // ── Layer filter — applied to both the map and the feed list so the two
  const filteredIncidents = useMemo(() => {
    const list = incidents.filter(inc => {
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
  }, [incidents, barangayFilter, repeatZoneKeys]);

  // ── Memoize Leaflet Incident Marker Data ─────────────────────
  const memoizedIncidentLayers = useMemo(() => {
    return filteredIncidents.map(inc => {
      const lat = inc.lat ?? inc.latitude;
      const lng = inc.lng ?? inc.longitude;
      if (!lat || !lng) return null;

      const color = categoryColor(inc.category);
      const loc = inc.address || inc.location || (inc.barangay ? `${inc.zone ? inc.zone + ', ' : ''}Brgy. ${inc.barangay}, Libon, Albay` : 'Libon, Albay');

      const popupContent = `
        <div style="font-family:'Roboto',system-ui,sans-serif;padding:6px 4px;min-width:200px">
          <div style="display:flex;align-items:center;gap:5px;font-weight:800;font-size:13px;color:#1E293B;margin-bottom:4px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            ${loc}
          </div>
          <div style="font-size:11px;color:${color};font-weight:700;margin-bottom:3px">Type: ${inc.type || 'Dog Bite'} ${inc.category ? '(' + inc.category + ')' : ''}</div>
          <div style="font-size:10px;color:#64748B;margin-bottom:4px">Exposure Date: ${inc.date || 'N/A'}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;color:#059669;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:4px;padding:2px 6px;font-weight:600;display:inline-flex">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Anonymized
            </div>
          </div>
        </div>
      `;

      return { id: inc.id, lat, lng, color, popupContent };
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
      className: 'custom-leaflet-pin-icon',
      html: `
        <svg width="26" height="32" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0px 3px 5px rgba(0,0,0,0.45));">
          <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 34 14 34C14 34 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
          <circle cx="14" cy="13" r="5" fill="#FFFFFF"/>
        </svg>
      `,
      iconSize: [26, 32],
      iconAnchor: [13, 32],
      popupAnchor: [0, -30],
    });

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 25,
      disableClusteringAtZoom: 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    memoizedIncidentLayers.forEach(inc => {
      const marker = L.marker([inc.lat, inc.lng], { icon: buildPinIcon(inc.color) });
      marker.bindPopup(inc.popupContent);
      clusterGroup.addLayer(marker);
      markersRef.current[inc.id] = { marker };
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;
    layerGroupRef.current.push(clusterGroup);
  }, [memoizedIncidentLayers, mapLoaded]);

  // ── Save Incident (Manual Map Pin) ──────────────────────────
  const handleSave = () => {
    setSaving(true);
    const barangayVal = form.barangay || 'San Juan';
    const zoneVal = form.zone || 'Zone 1';
    const locationStr = form.location || `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon`;

    const computedCoords = geocodeLibonAddress(barangayVal, zoneVal);
    const finalLat = pendingLatLng?.lat ?? computedCoords.lat;
    const finalLng = pendingLatLng?.lng ?? computedCoords.lng;

    const incidentData = {
      location: locationStr,
      barangay: barangayVal,
      zone: zoneVal,
      type: form.type || 'Dog Bite',
      category: form.category || 'Category III',
      description: form.description?.trim() || '',
      date: form.date || getTodayDateString(),
      status: 'active',
      lat: finalLat,
      lng: finalLng,
      latitude: finalLat,
      longitude: finalLng,
      source: 'manual_pin',
      pinnedAt: Date.now(),
      createdAt: Date.now(),
    };

    closeModal();
    setSaving(false);
    addDoc(collection(db, 'incidents'), incidentData).catch(err => {
      console.error('Save incident error:', err);
      alert('Failed to save incident. Please try again.');
    });
  };

  // ── Pan to Marker ────────────────────────────────────────────
  const panTo = (inc) => {
    if (!leafletMapRef.current) return;
    const lat = inc.lat ?? inc.latitude;
    const lng = inc.lng ?? inc.longitude;
    if (!lat || !lng) return;

    const map = leafletMapRef.current;
    const obj = markersRef.current[inc.id];

    if (obj?.marker && clusterGroupRef.current) {
      clusterGroupRef.current.zoomToShowLayer(obj.marker, () => {
        map.panTo([lat, lng], { animate: true });
        obj.marker.openPopup();
      });
    } else {
      map.setView([lat, lng], 15.5, { animate: true });
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setPendingLatLng(null);
    setForm(EMPTY_FORM);
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
              {LIBON_BARANGAYS.map(bgy => (
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
          <div ref={mapRef} className="w-full h-full z-10" />

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
              <div className="flex items-center justify-center h-40 text-xs text-slate-400 font-medium">Loading incidents…</div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-1.5 text-center p-4">
                <MapPin size={24} className="text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">{incidents.length === 0 ? 'No incidents in Libon' : 'No matching incidents'}</p>
                <p className="text-[11px] text-slate-400">{incidents.length === 0 ? 'Click map to pin incident' : 'Try switching active filter'}</p>
              </div>
            ) : filteredIncidents.map(inc => {
              const catColor = categoryColor(inc.category);
              const loc = inc.address || inc.location || (inc.barangay ? `${inc.zone ? inc.zone + ', ' : ''}Brgy. ${inc.barangay}, Libon, Albay` : 'Libon, Albay');
              return (
                <div
                  key={inc.id}
                  onClick={() => panTo(inc)}
                  className="px-4 py-3 hover:bg-slate-50/90 transition-colors group cursor-pointer relative"
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
                        <span>{inc.category || 'Category III'}</span>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Manual Pin Incident Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-8 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs">
                  <MapPin size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Pin Anonymized Incident (Libon)</h3>
                  <p className="text-[11px] text-slate-400 font-normal mt-0.5">Public health surveillance entry</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal fields */}
            <div className="p-6 space-y-4 text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
              {pendingLatLng && (
                <div className="text-xs font-semibold text-[#3B50DF] bg-indigo-50/70 border border-indigo-100 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                  <MapPin size={13} className="flex-shrink-0" /> Clicked Location: {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)} (Libon, Albay)
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Barangay (Libon) *">
                  <select
                    value={form.barangay || 'San Juan'}
                    onChange={e => {
                      const b = e.target.value;
                      const z = form.zone || '';
                      setF('barangay', b);
                      setF('location', `${z ? z + ', ' : ''}Brgy. ${b}, Libon`);
                    }}
                    className={inputCls}
                  >
                    {LIBON_BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>

                <Field label="Zone / Street / Purok">
                  <input
                    type="text"
                    placeholder="e.g. Zone 2, Purok 4"
                    value={form.zone || ''}
                    onChange={e => {
                      const z = e.target.value;
                      const b = form.barangay || 'San Juan';
                      setF('zone', z);
                      setF('location', `${z ? z + ', ' : ''}Brgy. ${b}, Libon`);
                    }}
                    className={inputCls}
                  />
                </Field>

                <Field label="Exposure Type" full>
                  <select value={form.type} onChange={e => setF('type', e.target.value)} className={inputCls}>
                    {INCIDENT_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>

                <Field label="Category">
                  <select value={form.category || 'Category III'} onChange={e => setF('category', e.target.value)} className={inputCls}>
                    <option value="Category I">Category I</option>
                    <option value="Category II">Category II</option>
                    <option value="Category III">Category III</option>
                  </select>
                </Field>

                <Field label="Date of Exposure">
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setF('date', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-2.5 items-center text-xs text-slate-700 font-medium">
                <Lock size={15} className="text-[#3B50DF] shrink-0" />
                <span><strong>Data Privacy Guarantee:</strong> Zero personal patient data is stored or exposed.</span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#3B50DF] hover:bg-[#2F40B5] text-white cursor-pointer shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving ? 'Pinning…' : <><MapPin size={13} /> Confirm & Pin</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}