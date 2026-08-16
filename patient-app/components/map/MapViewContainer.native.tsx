// Native (iOS/Android) incident map — renders Leaflet + Esri satellite tiles
// and Leaflet.markercluster via react-native-webview, mirroring the Admin
// Dashboard's Incident Map (ka-clinic-admin/src/pages/incidents.jsx) and the
// web view (MapViewContainer.web.tsx) so all platforms read identically.
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { MapMarkerData, MapViewContainerProps } from './MapViewContainer.types';
import {
  buildHeatCircles,
  ESRI_ATTRIBUTION,
  ESRI_REFERENCE_URL,
  ESRI_SATELLITE_URL,
  HEAT_CIRCLE_COLOR,
  markerColor,
} from './mapTheme';

function escapeJs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function buildLeafletHtml(view: MapViewContainerProps['view'], markers: MapMarkerData[], showLegend: boolean): string {
  const heatCircles = buildHeatCircles(markers);

  const markersData = markers.map(m => ({
    id: m.id,
    title: m.title,
    latitude: m.latitude,
    longitude: m.longitude,
    category: m.category,
    status: m.status,
    type: m.type,
    date: m.date,
    color: markerColor(m),
  }));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body, #map {
      width: 100%; height: 100%; margin: 0; padding: 0;
      background: #0F172A;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .leaflet-control-attribution {
      font-size: 8px !important;
      line-height: 1.3 !important;
      padding: 0 4px !important;
      opacity: 0.85;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .map-legend {
      position: absolute;
      bottom: 12px;
      left: 12px;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(6px);
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 6px 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
      user-select: none;
    }
    .legend-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 9.5px;
      font-weight: 800;
      color: #1E293B;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .legend-toggle-icon {
      font-size: 8px;
      color: #64748B;
      transition: transform 0.2s;
    }
    .map-legend.expanded .legend-toggle-icon {
      transform: rotate(180deg);
    }
    .legend-body {
      display: none;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #F1F5F9;
    }
    .map-legend.expanded .legend-body {
      display: block;
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 3px;
    }
    .legend-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-label {
      font-size: 9.5px;
      color: #475569;
      font-weight: 600;
    }
    .legend-caption {
      font-size: 8.5px;
      color: #64748B;
      line-height: 1.3;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  ${
    showLegend
      ? `
  <div class="map-legend" id="legendBox" onclick="this.classList.toggle('expanded')">
    <div class="legend-header">
      <span>Pin Severity</span>
      <span class="legend-toggle-icon">▲</span>
    </div>
    <div class="legend-body">
      <div class="legend-row"><div class="legend-dot" style="background:#059669"></div><span class="legend-label">Category I</span></div>
      <div class="legend-row"><div class="legend-dot" style="background:#D97706"></div><span class="legend-label">Category II</span></div>
      <div class="legend-row"><div class="legend-dot" style="background:#C8151A"></div><span class="legend-label">Category III</span></div>
      <div class="legend-row"><div class="legend-dot" style="background:#94A3B8"></div><span class="legend-label">Resolved</span></div>
    </div>
  </div>
  `
      : ''
  }
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      var center = [${view.center.latitude}, ${view.center.longitude}];
      var zoom = ${view.zoom};
      var minZoom = ${view.minZoom};
      var maxZoom = ${view.maxZoom};
      var bounds = ${
        view.bounds
          ? `L.latLngBounds(L.latLng(${view.bounds.south}, ${view.bounds.west}), L.latLng(${view.bounds.north}, ${view.bounds.east}))`
          : 'null'
      };

      var map = L.map('map', {
        center: center,
        zoom: zoom,
        minZoom: minZoom,
        maxZoom: maxZoom,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        dragging: true,
        zoomControl: true
      });

      L.tileLayer('${ESRI_SATELLITE_URL}', {
        attribution: '${escapeJs(ESRI_ATTRIBUTION)}',
        maxZoom: 19
      }).addTo(map);

      L.tileLayer('${ESRI_REFERENCE_URL}', {
        maxZoom: 19,
        pane: 'overlayPane'
      }).addTo(map);

      var markers = ${JSON.stringify(markersData)};
      var clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 25,
        disableClusteringAtZoom: 1,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
      });

      function buildPinIcon(color) {
        return L.divIcon({
          className: 'custom-leaflet-pin-icon',
          html: '<svg width="26" height="32" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0px 3px 5px rgba(0,0,0,0.45));"><path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 34 14 34C14 34 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="' + color + '" stroke="#FFFFFF" stroke-width="2.5"/><circle cx="14" cy="13" r="5" fill="#FFFFFF"/></svg>',
          iconSize: [26, 32],
          iconAnchor: [13, 32],
          popupAnchor: [0, -30]
        });
      }

      function buildPopup(m) {
        var color = m.color;
        var status = m.status || 'active';
        return '<div style="font-family:sans-serif;padding:4px 2px;min-width:180px">' +
          '<div style="font-weight:800;font-size:13px;color:#1E293B;margin-bottom:4px">' + (m.title || 'Incident') + '</div>' +
          '<div style="font-size:11px;color:' + color + ';font-weight:700;margin-bottom:3px">Type: ' + (m.type || 'Dog Bite') + (m.category ? ' (' + m.category + ')' : '') + '</div>' +
          '<div style="font-size:10px;color:#64748B;margin-bottom:4px">Exposure Date: ' + (m.date || 'N/A') + '</div>' +
          (status === 'resolved' ? '<div style="display:inline-block;font-size:9px;font-weight:700;text-transform:uppercase;border-radius:4px;padding:2px 6px;color:#64748B;background:#F1F5F9">Resolved</div>' : '') +
        '</div>';
      }

      markers.forEach(function(m) {
        L.marker([m.latitude, m.longitude], { icon: buildPinIcon(m.color) })
          .bindPopup(buildPopup(m))
          .addTo(clusterGroup);
      });

      map.addLayer(clusterGroup);
    });
  </script>
</body>
</html>
  `;
}

export default function MapViewContainer({ view, markers, showLegend = true, style }: MapViewContainerProps) {
  const htmlContent = useMemo(
    () => buildLeafletHtml(view, markers, showLegend),
    [view, markers, showLegend]
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F172A',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
