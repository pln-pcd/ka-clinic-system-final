// Single source of truth shared by MapViewContainer.native.tsx and .web.tsx,
// mirroring the Admin Dashboard's Incident Map (ka-clinic-admin/src/incidents.jsx)
// so the patient-facing map reads identically to the one clinic staff use.
import type { MapMarkerData, MapView } from './MapViewContainer.types';

// Severity colors mirror the Category I/II/III convention used across the
// rest of the app (vaccination tracker, patient records).
export const CATEGORY_COLOR: Record<string, string> = {
  'Category I': '#059669',
  'Category II': '#D97706',
  'Category III': '#C8151A',
};
export const RESOLVED_COLOR = '#94A3B8';
export const HEAT_CIRCLE_COLOR = '#C8151A';

export const categoryColor = (cat?: string): string =>
  (cat && CATEGORY_COLOR[cat]) || CATEGORY_COLOR['Category III'];

/** Pin fill: resolved incidents grey out, otherwise colored by severity. */
export const markerColor = (marker: Pick<MapMarkerData, 'category' | 'status'>): string =>
  marker.status === 'resolved' ? RESOLVED_COLOR : categoryColor(marker.category);

export const getSeverityStyle = (category?: string, status?: string) => {
  if (status === 'resolved') {
    return {
      dotColor: RESOLVED_COLOR,
      pillBg: '#F1F5F9',
      pillBorder: '#E2E8F0',
      pillText: '#64748B',
    };
  }
  const color = categoryColor(category);
  if (color === CATEGORY_COLOR['Category I']) {
    return {
      dotColor: CATEGORY_COLOR['Category I'],
      pillBg: '#ECFDF5',
      pillBorder: '#A7F3D0',
      pillText: '#047857',
    };
  }
  if (color === CATEGORY_COLOR['Category II']) {
    return {
      dotColor: CATEGORY_COLOR['Category II'],
      pillBg: '#FFFBEB',
      pillBorder: '#FDE68A',
      pillText: '#B45309',
    };
  }
  return {
    dotColor: CATEGORY_COLOR['Category III'],
    pillBg: '#FEF2F2',
    pillBorder: '#FCA5A5',
    pillText: '#B91C1C',
  };
};

// Locked to Libon town proper only — incidents are all pinned within its
// poblacion/barangay extent, so the viewport stays tight to that area instead
// of drifting into neighboring Polangui/Oas territory at lower zoom.
export const LIBON_MAP_VIEW: MapView = {
  center: { latitude: 13.2999, longitude: 123.4372 },
  zoom: 14.5,
  minZoom: 14.0,
  maxZoom: 18.0,
  bounds: { south: 13.2750, west: 123.4150, north: 13.3180, east: 123.4560 },
};

export const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: 'Category I', color: CATEGORY_COLOR['Category I'] },
  { label: 'Category II', color: CATEGORY_COLOR['Category II'] },
  { label: 'Category III', color: CATEGORY_COLOR['Category III'] },
  { label: 'Resolved', color: RESOLVED_COLOR },
];

export const HEAT_CIRCLE_CAPTION =
  'Larger, darker circles mean more reported cases pinned at that spot.';

export type HeatCircle = {
  key: string;
  latitude: number;
  longitude: number;
  count: number;
  radius: number;
  fillOpacity: number;
};

/**
 * Group by rounded coordinate so repeated pins at the same spot become one
 * appropriately-sized heat circle instead of N identical overlapping ones.
 * Radius/opacity curves are copied from the admin map so both scale alike.
 */
export function buildHeatCircles(markers: MapMarkerData[]): HeatCircle[] {
  const groups = new Map<string, { latitude: number; longitude: number; count: number }>();
  markers.forEach(m => {
    const key = `${m.latitude.toFixed(4)},${m.longitude.toFixed(4)}`;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { latitude: m.latitude, longitude: m.longitude, count: 1 });
  });

  return Array.from(groups.entries()).map(([key, g]) => ({
    key,
    latitude: g.latitude,
    longitude: g.longitude,
    count: g.count,
    radius: 200 + Math.min(g.count - 1, 6) * 70,
    fillOpacity: Math.min(0.14 + (g.count - 1) * 0.09, 0.6),
  }));
}

// Esri "hybrid" basemap — satellite imagery plus a labels/roads reference
// overlay, because pure satellite tiles carry no place names and would make
// a barangay-level map unreadable.
export const ESRI_SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_REFERENCE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
export const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
