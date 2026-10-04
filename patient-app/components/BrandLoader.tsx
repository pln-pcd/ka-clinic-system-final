// Branded loading screen (same design as the admin app's BrandLoader): the
// K&A heart-and-cross logo in white on a navy circle that gently breathes,
// with a comet-like arc orbiting it. Built with react-native-svg + Reanimated
// so every animation runs on the UI thread.
//
//   <BrandLoader label="Restoring your session…" />
//
// The logo's single stroke draws itself once (~0.8s) on first appearance.
// With the OS "reduce motion" setting on: no orbit or draw-in, only a soft
// opacity pulse on the circle.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

// The patient app's brand navy (primary buttons, spinners).
export const BRAND_LOADER_COLOR = '#1E3A8A';

// The logo traced from loadinglogo.png as ONE continuous stroke (500×500
// space, stroke 13). Same path as ka-clinic-admin/src/components/BrandLoader.jsx.
const LOGO_PATH =
  'M219 141 C217.5 140.4 214.2 137.8 210 137.5 C205.8 137.2 199.3 137.8 194 139 C188.7 140.2 183.3 142.4 178 145 ' +
  'C172.7 147.6 166.7 150.7 162 154.5 C157.3 158.3 153.5 163.1 150 168 C146.5 172.9 143.4 178.7 141 184 ' +
  'C138.6 189.3 136.6 195.2 135.5 200 C134.4 204.8 134.3 208 134.5 213 C134.7 218 135.2 224.8 136.5 230 ' +
  'C137.8 235.2 139.4 239.3 142 244 C144.6 248.7 150.3 255.7 152 258 L248.5 352.5 L346 254.5 ' +
  'C347.2 252.6 351 247.4 353 243 C355 238.6 356.9 233.2 358 228 C359.1 222.8 359.6 217.3 359.5 212 ' +
  'C359.4 206.7 358.8 201.2 357.5 196 C356.2 190.8 354.6 186.2 352 181 C349.4 175.8 345.7 169.7 342 165 ' +
  'C338.3 160.3 334.7 156.8 330 153 C325.3 149.2 319.3 145.1 314 142.5 C308.7 139.9 303.3 138.6 298 137.5 ' +
  'C292.7 136.4 287.3 135.9 282 136 C276.7 136.1 271 136.8 266 138 C261 139.2 256.3 141.2 252 143.5 ' +
  'C247.7 145.8 243.5 148.6 240 152 C236.5 155.4 233.2 159.7 231 164 C228.8 168.3 227.4 173.7 226.5 178 ' +
  'C225.6 182.3 225.7 185.3 225.5 190 C225.3 194.7 225.5 203.3 225.5 206 ' +
  'H181.5 V251.5 H225.5 V295 H270.5 V251.5 H314 V206 H270.5';
const LOGO_LENGTH = 1119; // measured total length of LOGO_PATH

// Geometry: a 120px disc, a 6px gap, then the arc ring (r=72, 8px stroke).
const BOX = 168;
const C = BOX / 2;
const DISC = 120;
const RING_R = 72;
const RING_LEN = 2 * Math.PI * RING_R; // 452.4
const TAIL_MIN = 2;
const TAIL_MAX = 94; // ≈ 75° of the ring

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = { label?: string; intro?: boolean; backgroundColor?: string };

export default function BrandLoader({ label = 'Loading…', intro = true, backgroundColor = '#F5F7FA' }: Props) {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0);  // 0 → 1 → 0 over 2s
  const spin = useSharedValue(0);    // degrees
  const stretch = useSharedValue(0); // 0 → 1 → 0 over 2.7s
  const draw = useSharedValue(intro && !reduceMotion ? 0 : 1);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    breath.value = withRepeat(withTiming(1, { duration: reduceMotion ? 1200 : 1000, easing: ease }), -1, true);
    if (reduceMotion) return;
    spin.value = withRepeat(withTiming(360, { duration: 1350, easing: Easing.linear }), -1, false);
    stretch.value = withRepeat(withTiming(1, { duration: 1350, easing: Easing.inOut(Easing.ease) }), -1, true);
    if (intro) draw.value = withDelay(100, withTiming(1, { duration: 800, easing: Easing.bezier(0.45, 0, 0.2, 1) }));
  }, [reduceMotion, intro, breath, spin, stretch, draw]);

  const discStyle = useAnimatedStyle(() => (reduceMotion
    ? { opacity: 1 - 0.3 * breath.value }
    : { transform: [{ scale: 1 + 0.04 * breath.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.35 * breath.value,
    transform: [{ scale: 1 + 0.06 * breath.value }],
  }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // The dash covers [0, RING_LEN - offset] of the ring: offset sets the tail length.
  const tailProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LEN - (TAIL_MIN + (TAIL_MAX - TAIL_MIN) * stretch.value),
  }));
  const logoProps = useAnimatedProps(() => ({ strokeDashoffset: LOGO_LENGTH * (1 - draw.value) }));

  return (
    <View style={[s.root, { backgroundColor }]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={{ width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' }}>
        {/* Soft glow in the brand colour (a radial gradient; RN has no blur). */}
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none">
          <Svg width={BOX} height={BOX}>
            <Defs>
              <RadialGradient id="kna-bl-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.62" stopColor={BRAND_LOADER_COLOR} stopOpacity="0.35" />
                <Stop offset="1" stopColor={BRAND_LOADER_COLOR} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={C} cy={C} r={C} fill="url(#kna-bl-glow)" />
          </Svg>
        </Animated.View>

        <Animated.View style={[s.disc, discStyle]}>
          <Svg width={DISC * 0.55} height={DISC * 0.55} viewBox="122 120 250 250">
            <AnimatedPath d={LOGO_PATH} fill="none" stroke="#FFFFFF" strokeWidth={13}
              strokeLinecap="round" strokeLinejoin="miter"
              strokeDasharray={[LOGO_LENGTH, LOGO_LENGTH]} animatedProps={logoProps} />
          </Svg>
        </Animated.View>

        {!reduceMotion && (
          <Animated.View style={[StyleSheet.absoluteFill, orbitStyle]} pointerEvents="none">
            <Svg width={BOX} height={BOX}>
              {/* Mirrored so the dash runs backwards from the head at 3 o'clock:
                  the dot leads and the tail trails as it turns clockwise. */}
              <AnimatedCircle cx={C} cy={C} r={RING_R} fill="none" stroke={BRAND_LOADER_COLOR}
                strokeOpacity={0.4} strokeWidth={8} strokeLinecap="round"
                strokeDasharray={[RING_LEN, RING_LEN]} animatedProps={tailProps}
                transform={`translate(0 ${BOX}) scale(1 -1)`} />
              <Circle cx={C + RING_R} cy={C} r={5.5} fill={BRAND_LOADER_COLOR} />
            </Svg>
          </Animated.View>
        )}
      </View>
      {label ? <Text style={s.label}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  disc: {
    width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: BRAND_LOADER_COLOR,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { marginTop: 20, fontSize: 13, fontWeight: '500', color: '#64748B' },
});
