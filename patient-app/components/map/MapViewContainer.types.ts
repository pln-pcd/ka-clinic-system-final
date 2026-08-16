// Shared prop contract for MapViewContainer.native.tsx and .web.tsx so the
// screen using the map never needs to know which platform it's rendering on.
import type { StyleProp, ViewStyle } from 'react-native';

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/** Camera framing, expressed in Leaflet/Google-compatible zoom levels. */
export type MapView = {
  center: MapCoordinate;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  bounds?: MapBounds;
};

export type MapMarkerData = {
  id: string;
  latitude: number;
  longitude: number;
  /** Human-readable place, e.g. "Zone 1, Brgy. San Juan, Libon". */
  title: string;
  /** Incident type, e.g. "Dog Bite". */
  type?: string;
  /** "Category I" | "Category II" | "Category III" — drives pin color. */
  category?: string;
  status?: 'active' | 'resolved';
  /** Exposure date, already formatted for display. */
  date?: string;
};

export type MapViewContainerProps = {
  view: MapView;
  markers: MapMarkerData[];
  /** Renders the Pin Severity / Heat Circle legend overlay. */
  showLegend?: boolean;
  style?: StyleProp<ViewStyle>;
};
