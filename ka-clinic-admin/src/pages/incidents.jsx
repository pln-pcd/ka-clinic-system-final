// kna-admin/src/incidents.jsx
import {
  addDoc, collection, deleteDoc, doc,
  onSnapshot, orderBy, query, updateDoc
} from 'firebase/firestore';
import { Calendar, CheckCircle2, ChevronDown, Layers, Lock, MapPin, Repeat, RotateCcw, ShieldAlert, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { LIBON_BARANGAYS, geocodeLibonAddress } from './patients';

const INCIDENT_TYPES = ['Dog Bite', 'Cat Scratch', 'Bat Contact', 'Other Animal Bite'];

// Severity colors mirror the Category I/II/III convention used across the
// rest of the app (vaccination tracker, patient records).
const CATEGORY_COLOR = { 'Category I': '#059669', 'Category II': '#D97706', 'Category III': '#C8151A' };
const RESOLVED_COLOR = '#94A3B8';
const categoryColor = (cat) => CATEGORY_COLOR[cat] || CATEGORY_COLOR['Category III'];

const LAYER_OPTIONS = [
  { key: 'all', label: 'All Incidents' },
  { key: 'highrisk', label: 'High-Risk Zones Only' },
  { key: 'active', label: 'Active Only' },
  { key: 'resolved', label: 'Resolved Only' },
];

const EMPTY_FORM = {
  barangay: 'San Juan',
  zone: 'Zone 1',
  location: 'Zone 1, Brgy. San Juan, Libon',
  type: 'Dog Bite',
  category: 'Category III',
  description: '',
  status: 'active',
  date: new Date().toISOString().split('T')[0],
};

const inputCls =
  'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 ' +
  'outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 focus:bg-white font-normal';

function Field({ label, children, full }) {
  return (
    <div className={`flex flex-col gap-1.5${full ? ' col-span-2' : ''}`}>
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
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
  const [layerFilter, setLayerFilter] = useState('all');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState(null);

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
        const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));
        unsub = onSnapshot(q, snap => {
          setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        }, err => {
          console.warn('Ordered query failed, falling back to unordered query:', err);
          const fallbackQ = query(collection(db, 'incidents'));
          unsub = onSnapshot(fallbackQ, snap => {
            setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
          });
        });
      } catch (err) {
        console.warn('Query catch fallback:', err);
        const fallbackQ = query(collection(db, 'incidents'));
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
  // never disagree about what's currently shown. ─────────────────────────
  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      const status = inc.status || 'active';
      if (layerFilter === 'active') return status === 'active';
      if (layerFilter === 'resolved') return status === 'resolved';
      if (layerFilter === 'highrisk') {
        const key = (inc.barangay || inc.location || '').trim().toLowerCase();
        return repeatZoneKeys.has(key);
      }
      return true;
    });
  }, [incidents, layerFilter, repeatZoneKeys]);

  // ── Memoize Leaflet Incident Marker Data ─────────────────────
  const memoizedIncidentLayers = useMemo(() => {
    return filteredIncidents.map(inc => {
      const lat = inc.lat ?? inc.latitude;
      const lng = inc.lng ?? inc.longitude;
      if (!lat || !lng) return null;

      const status = inc.status || 'active';
      const color = status === 'resolved' ? RESOLVED_COLOR : categoryColor(inc.category);

      const popupContent = `
        <div style="font-family:'Roboto',system-ui,sans-serif;padding:6px 4px;min-width:200px">
          <div style="display:flex;align-items:center;gap:5px;font-weight:800;font-size:13px;color:#1E293B;margin-bottom:4px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            ${inc.location || 'Libon, Albay'}
          </div>
          <div style="font-size:11px;color:${color};font-weight:700;margin-bottom:3px">Type: ${inc.type || 'Dog Bite'} ${inc.category ? '(' + inc.category + ')' : ''}</div>
          <div style="font-size:10px;color:#64748B;margin-bottom:4px">Exposure Date: ${inc.date || 'N/A'}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;color:#059669;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:4px;padding:2px 6px;font-weight:600;display:inline-flex">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Anonymized
            </div>
            ${status === 'resolved' ? '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-radius:4px;padding:2px 6px;display:inline-flex;color:#64748B;background:#F1F5F9">Resolved</div>' : ''}
          </div>
        </div>
      `;

      return { id: inc.id, lat, lng, color, status, popupContent };
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
      date: form.date || new Date().toISOString().split('T')[0],
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

  // ── Delete Incident ─────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Remove this incident pin?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'incidents', id));
    } catch {
      alert('Failed to delete.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Mark Resolved / Reopen ───────────────────────────────────
  const handleToggleStatus = async (inc) => {
    const newStatus = (inc.status || 'active') === 'resolved' ? 'active' : 'resolved';
    setResolvingId(inc.id);
    try {
      await updateDoc(doc(db, 'incidents', inc.id), { status: newStatus });
    } catch {
      alert('Failed to update incident status.');
    } finally {
      setResolvingId(null);
    }
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
        <div ref={layerMenuRef} className="relative">
          <button
            onClick={() => setLayerMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Layers size={13} className="text-gray-400" />
            {LAYER_OPTIONS.find(o => o.key === layerFilter)?.label}
            <ChevronDown size={13} className="text-gray-400" />
          </button>
          {layerMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 min-w-[190px] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 z-30">
              {LAYER_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setLayerFilter(opt.key); setLayerMenuOpen(false); }}
                  className={`flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    layerFilter === opt.key ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                  {layerFilter === opt.key && <CheckCircle2 size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Map & List Grid ── */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">

        {/* Leaflet Map container */}
        <div className="col-span-8 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col relative">
          <div ref={mapRef} className="w-full h-full z-10" />

          {/* Map Legend — compact & collapsible */}
          <div
            onClick={() => setLegendExpanded(e => !e)}
            className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/90 shadow-md px-3 py-2 text-[11px] max-w-[200px] cursor-pointer select-none transition-all"
          >
            <div className="flex items-center justify-between gap-3 text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">
              <span>Pin Severity</span>
              <span className="text-[9px] text-slate-400">{legendExpanded ? '▼' : '▲'}</span>
            </div>

            {legendExpanded && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="flex flex-col gap-1.5 mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLOR['Category I'] }} /> Category I
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLOR['Category II'] }} /> Category II
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLOR['Category III'] }} /> Category III
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RESOLVED_COLOR }} /> Resolved
                  </div>
                </div>
              </div>
            )}
          </div>
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
              const status = inc.status || 'active';
              const isResolved = status === 'resolved';
              const catColor = categoryColor(inc.category);
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
                        <span className="text-[13px] font-bold text-slate-900 group-hover:text-red-600 transition-colors truncate">
                          {inc.location || 'Libon, Albay'}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isResolved && (
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Resolved
                            </span>
                          )}
                          <span className="text-[10px] font-normal text-slate-400">
                            {inc.date || 'Today'}
                          </span>
                        </div>
                      </div>

                      {/* iOS Notes Subtitle Line */}
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                        <span>{inc.type || 'Dog Bite'}</span>
                        <span className="text-slate-300">•</span>
                        <span>{inc.category || 'Category III'}</span>
                      </div>
                    </div>

                    {/* Quick Actions (Status toggle & delete) */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(inc); }}
                        disabled={resolvingId === inc.id}
                        className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        title={isResolved ? 'Reopen Incident' : 'Mark Resolved'}
                      >
                        {isResolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(inc.id); }}
                        disabled={deletingId === inc.id}
                        className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove Incident"
                      >
                        <Trash2 size={13} />
                      </button>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900 text-white rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white">
                  <MapPin size={15} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-white">Pin Anonymized Incident (Libon)</h2>
                  <p className="text-[11px] text-gray-400">Public health surveillance entry</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-red-600 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal fields */}
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              {pendingLatLng && (
                <div className="col-span-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 flex items-center gap-1.5">
                  <MapPin size={12} className="flex-shrink-0" /> Clicked Location: {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)} (Libon, Albay)
                </div>
              )}

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

              <div className="col-span-2 bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2.5 items-center text-xs text-rose-800 font-medium">
                <Lock size={16} className="text-rose-600 flex-shrink-0" />
                <span><strong>Data Privacy Guarantee:</strong> Zero personal patient data is stored or exposed.</span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
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