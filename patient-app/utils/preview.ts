// Screenshot preview (?preview=1), used by the documentation capture scripts
// (scripts/capture-*.mjs) to fill screens with sample data. Web only: on a
// phone it is always off, so sample data can never appear in the real app,
// and `window.location` (absent in React Native) is never read there.
import { Platform } from 'react-native';

/** True for a `preview` route param of "1" on the web build. */
export const isPreview = (value: unknown): boolean => Platform.OS === 'web' && value === '1';

/** True when the web page URL carries preview=1. */
export const urlHasPreview = (): boolean =>
  Platform.OS === 'web' && typeof window !== 'undefined' && !!window.location?.search?.includes('preview=1');
