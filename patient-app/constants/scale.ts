import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The UI's fixed dp values (58dp inputs, 26px titles, 110dp logo circles,
// etc.) read oversized even on a real 360x723dp Android phone — confirmed via
// on-device debug readout, not a narrower-than-expected-screen problem. The
// reference size is deliberately set ABOVE real device dimensions so every
// scale()/verticalScale() call returns a sub-1.0 ratio (~0.72), shrinking the
// whole UI by roughly 28% uniformly rather than trying to match a "design
// width" that was never actually correct to begin with.
const REFERENCE_WIDTH = 500;
const REFERENCE_HEIGHT = 1111;

export const scale = (size: number) => (SCREEN_WIDTH / REFERENCE_WIDTH) * size;
export const verticalScale = (size: number) => (SCREEN_HEIGHT / REFERENCE_HEIGHT) * size;

// factor=0.85 (not the usual 0.5) so font sizes shrink by nearly the same
// ~28% as every other dimension — a low damping factor here would leave text
// looking relatively too large against the now-smaller boxes/padding around it.
export const moderateScale = (size: number, factor = 0.85) =>
  size + (scale(size) - size) * factor;

export const moderateVerticalScale = (size: number, factor = 0.85) =>
  size + (verticalScale(size) - size) * factor;
