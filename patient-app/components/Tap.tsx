// The app's pressable: a drop-in for TouchableOpacity (same props: style,
// onPress, activeOpacity, disabled, hitSlop, accessibility…) with press
// feedback that fills the WHOLE element in its own shape.
//
//   Android  a ripple over the element. When the element is rounded it also
//            clips (overflow hidden), so the ripple follows the exact radius
//            instead of showing a square box.
//   iOS/web  the element dims slightly (activeOpacity) and, for cards
//            (pressScale), shrinks a touch.
//
// The ripple is light on dark backgrounds and dark on light ones, picked from
// the element's own backgroundColor. Pass clip={false} for an element whose
// badge deliberately hangs over its edge.
import React, { forwardRef } from 'react';
import { Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Opacity while pressed on iOS/web (TouchableOpacity's prop). */
  activeOpacity?: number;
  /** Shrink slightly while pressed on iOS/web; for cards. */
  pressScale?: boolean;
  /** Clip children to the rounded shape on Android (default true when rounded). */
  clip?: boolean;
  rippleColor?: string;
};

function isDark(color: unknown): boolean {
  if (typeof color !== 'string') return false;
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})/i)?.[1];
  let r: number, g: number, b: number;
  if (hex) {
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  } else {
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return false;
    [r, g, b] = [m[1], m[2], m[3]].map(Number);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

const Tap = forwardRef<View, Props>(function Tap(
  { style, children, activeOpacity = 0.85, pressScale = false, clip, rippleColor, disabled, ...rest },
  ref,
) {
  const flat = StyleSheet.flatten(style) || {};
  const rounded = flat.borderRadius != null || flat.borderTopLeftRadius != null || flat.borderTopRightRadius != null;
  const shouldClip = Platform.OS === 'android' && (clip ?? rounded);
  const ripple = rippleColor || (isDark(flat.backgroundColor) ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)');
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      android_ripple={disabled ? undefined : { color: ripple, foreground: true }}
      style={({ pressed }) => [
        style,
        shouldClip && { overflow: 'hidden' },
        pressed && Platform.OS !== 'android' && { opacity: activeOpacity },
        pressed && Platform.OS !== 'android' && pressScale && { transform: [{ scale: 0.98 }] },
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
});

export default Tap;
