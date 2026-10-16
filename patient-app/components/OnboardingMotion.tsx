// Onboarding page motion: the illustration fades and settles in from a
// slightly smaller scale, the tag / title / text follow in a short stagger,
// and the progress dots grow into place. Everything runs on the UI thread
// (Reanimated), stays under ~350 ms, uses ease-out curves, and is skipped
// when the phone's "reduce motion" setting is on (ReduceMotion.System).
// The page-to-page slide itself is the native stack transition
// (components/AppShells.tsx), so Back, Next and the swipe-back gesture all
// move the same way.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scale, verticalScale } from '../utils/scale';

const NAVY = '#1E3A8A';
const EASE = Easing.out(Easing.cubic);

const illustrationIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.94 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE },
}).duration(340).reduceMotion(ReduceMotion.System);

const textIn = (delay: number) => new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 12 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
}).delay(delay).duration(280).reduceMotion(ReduceMotion.System);

export function EnterIllustration({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Animated.View entering={illustrationIn} style={style}>{children}</Animated.View>;
}

export function EnterText({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <Animated.View entering={textIn(delay)}>{children}</Animated.View>;
}

function Dot({ active }: { active: boolean }) {
  // The active dot grows from a dot to a bar when its page appears.
  const w = useSharedValue(active ? scale(7) : scale(7));
  useEffect(() => {
    w.value = withTiming(active ? scale(24) : scale(7), { duration: 300, easing: EASE, reduceMotion: ReduceMotion.System });
  }, [active]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[st.dot, active && st.dotActive, style]} />;
}

export function OnboardingDots({ active, count = 4 }: { active: number; count?: number }) {
  return (
    <View style={st.row} accessibilityLabel={`Page ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => <Dot key={i} active={i === active} />)}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: verticalScale(12), alignItems: 'center' },
  dot: { height: scale(7), borderRadius: scale(3.5), backgroundColor: '#E2E8F0', marginRight: scale(8) },
  dotActive: { backgroundColor: NAVY },
});
