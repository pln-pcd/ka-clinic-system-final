import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The UI's fixed dp values (58dp inputs, 26px titles, 110dp logo circles,
// etc.) read oversized even on a real 360x723dp Android phone — confirmed via
// on-device debug readout, not a narrower-than-expected-screen problem. The
// reference size is deliberately set ABOVE real device dimensions so every
// scale()/verticalScale() call returns a sub-1.0 ratio (~0.72), shrinking the
// whole UI by roughly 28% uniformly rather than trying to match a "design
// width" that was never actually correct to begin with.
const REFERENCE_WIDTH = 460;
const REFERENCE_HEIGHT = 1000;

export const scale = (size: number) => (SCREEN_WIDTH / REFERENCE_WIDTH) * size;
export const verticalScale = (size: number) => (SCREEN_HEIGHT / REFERENCE_HEIGHT) * size;

// factor=0.45 provides a natural, comfortable font boost (~15% larger across all
// devices) so text is clean and legible without overflowing cards or buttons.
export const moderateScale = (size: number, factor = 0.45) =>
  size + (scale(size) - size) * factor;

export const moderateVerticalScale = (size: number, factor = 0.45) =>
  size + (verticalScale(size) - size) * factor;
