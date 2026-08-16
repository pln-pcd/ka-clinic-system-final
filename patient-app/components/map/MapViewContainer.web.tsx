// Web incident map — Leaflet + Esri satellite tiles, mirroring the Admin
// Dashboard's Incident Map (ka-clinic-admin/src/incidents.jsx) so patients and
// clinic staff read the same picture. react-native-maps has no web build, and
// importing it here breaks the whole Metro web bundle.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import type { MapMarkerData, MapViewContainerProps } from './MapViewContainer.types';
import {
  buildHeatCircles,
  ESRI_ATTRIBUTION,
  ESRI_REFERENCE_URL,
  ESRI_SATELLITE_URL,
  HEAT_CIRCLE_CAPTION,
  HEAT_CIRCLE_COLOR,
  LEGEND_ITEMS,
  markerColor,
} from './mapTheme';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

const buildPinIcon = (color: string) =>
  L.divIcon({
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

const buildPopup = (m: MapMarkerData): string => {
  const color = markerColor(m);
  const status = m.status || 'active';
  return `
    <div style="font-family:'Roboto',system-ui,sans-serif;padding:6px 4px;min-width:200px">
      <div style="display:flex;align-items:center;gap:5px;font-weight:800;font-size:13px;color:#1E293B;margin-bottom:4px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        ${escapeHtml(m.title)}
      </div>
      <div style="font-size:11px;color:${color};font-weight:700;margin-bottom:3px">Type: ${escapeHtml(m.type || 'Dog Bite')} ${m.category ? '(' + escapeHtml(m.category) + ')' : ''}</div>
      <div style="font-size:10px;color:#64748B;margin-bottom:4px">Exposure Date: ${escapeHtml(m.date || 'N/A')}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:4px;font-size:9px;color:#059669;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:4px;padding:2px 6px;font-weight:600;display:inline-flex">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Anonymized
        </div>
        ${status === 'resolved' ? '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-radius:4px;padding:2px 6px;display:inline-flex;color:#64748B;background:#F1F5F9">Resolved</div>' : ''}
      </div>
    </div>
  `;
};

// The full desktop legend eats most of a phone-sized map, so below this it
// switches to a compact corner card (see COMPACT_* styles).
const COMPACT_MAX_WIDTH = 420;
const COMPACT_MAX_HEIGHT = 360;

export default function MapViewContainer({ view, markers, showLegend = true, style }: MapViewContainerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const [compact, setCompact] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCompact(width < COMPACT_MAX_WIDTH || height < COMPACT_MAX_HEIGHT);
  };

  // ── Init map ────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    const map = L.map(host, {
      center: [view.center.latitude, view.center.longitude],
      zoom: view.zoom,
      minZoom: view.minZoom,
      maxZoom: view.maxZoom,
      maxBounds: view.bounds
        ? L.latLngBounds(
            L.latLng(view.bounds.south, view.bounds.west),
            L.latLng(view.bounds.north, view.bounds.east)
          )
        : undefined,
      maxBoundsViscosity: 1.0,
      dragging: true,
      zoomControl: true,
    });

    // Esri's full credit line wraps to three lines over a phone-width map and
    // swallows the bottom of it — keep the credit, shrink the type.
    if (!document.getElementById('kna-map-attribution-style')) {
      const style = document.createElement('style');
      style.id = 'kna-map-attribution-style';
      style.textContent =
        '.leaflet-control-attribution{font-size:8px;line-height:1.4;padding:0 4px;opacity:.85;' +
        'max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
      document.head.appendChild(style);
    }

    L.tileLayer(ESRI_SATELLITE_URL, { attribution: ESRI_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.tileLayer(ESRI_REFERENCE_URL, { maxZoom: 19, pane: 'overlayPane' }).addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);

    // The legend is a sibling of the Leaflet container, so it always paints
    // over popups. On a phone-sized map an open popup should win.
    map.on('popupopen', () => setPopupOpen(true));
    map.on('popupclose', () => setPopupOpen(false));

    // The map lives inside a resizable phone frame on web, and Leaflet only
    // recalculates tile layout when told to — without this the tiles go grey
    // or misalign whenever the container changes size.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = [];
    };
  }, []);

  // ── Sync clustered location markers ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 25,
      disableClusteringAtZoom: 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    markers.forEach(m => {
      L.marker([m.latitude, m.longitude], { icon: buildPinIcon(markerColor(m)) })
        .bindPopup(buildPopup(m))
        .addTo(clusterGroup);
    });
    map.addLayer(clusterGroup);
    layersRef.current.push(clusterGroup);
  }, [markers]);

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      {/* Leaflet mounts into a real DOM node, so this stays a plain div
          rather than a react-native-web View. */}
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />

      {showLegend && !popupOpen && (
        <View
          style={[styles.legend, styles.legendContainerStyle]}
          // @ts-ignore - web onClick
          onClick={() => setLegendExpanded(e => !e)}
        >
          <View style={styles.legendHeaderRow}>
            <Text style={styles.legendHeading}>Pin Severity</Text>
            <Text style={styles.legendToggleIcon}>{legendExpanded ? '▼' : '▲'}</Text>
          </View>

          {legendExpanded && (
            <View style={styles.legendExpandedBody}>
              <View style={styles.legendItems}>
                {LEGEND_ITEMS.map(item => (
                  <View key={item.label} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%', position: 'relative' },
  legend: {
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  legendContainerStyle: {
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: 190,
  },
  legendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  legendHeading: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  legendToggleIcon: {
    fontSize: 8,
    color: '#64748B',
  },
  legendExpandedBody: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  legendItems: { gap: 4, marginBottom: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendLabel: { fontSize: 9.5, color: '#475569', fontWeight: '600' },
  legendCaption: { fontSize: 8.5, color: '#64748B', lineHeight: 12, marginTop: 2 },
});
