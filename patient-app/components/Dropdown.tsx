// The app's dropdown: a field that opens a floating, scrollable list right
// under it (above it when there is no room below). Tapping outside the list,
// Android Back, or picking an option closes it. The list lives in its own
// transparent Modal, so a scroll view or bottom sheet around the field never
// clips it.
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { moderateScale, scale, verticalScale } from '../utils/scale';

export type DropdownOption = { value: string; label: string; desc?: string; icon?: string };

type Props = {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  accessibilityLabel?: string;
};

const NAVY = '#1A3052';
const NAVY_FAINT = 'rgba(26,48,82,0.07)';
const ROW_H = verticalScale(62);
const MAX_LIST = verticalScale(330);

export default function Dropdown({ value, options, onChange, placeholder = 'Select', error, accessibilityLabel }: Props) {
  const fieldRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { height: winH } = useWindowDimensions();
  const selected = options.find(o => o.value === value);

  const open = () => {
    fieldRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };
  const close = () => setAnchor(null);

  const listH = Math.min(MAX_LIST, options.length * ROW_H + verticalScale(12));
  const below = anchor ? winH - (anchor.y + anchor.h) : 0;
  const openUp = anchor ? below < listH + verticalScale(16) && anchor.y > below : false;
  const top = anchor ? (openUp ? anchor.y - listH - verticalScale(6) : anchor.y + anchor.h + verticalScale(6)) : 0;

  return (
    <>
      <Pressable
        ref={fieldRef}
        onPress={open}
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: !!anchor }}
        accessibilityValue={{ text: selected?.label || placeholder }}
        android_ripple={{ color: 'rgba(15,23,42,0.06)' }}
        style={({ pressed }) => [s.field, !!anchor && s.fieldOpen, error && s.fieldError, pressed && Platform.OS === 'ios' && { opacity: 0.85 }]}
      >
        {selected?.icon ? (
          <View style={s.iconBox}><Ionicons name={selected.icon as any} size={16} color={NAVY} /></View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.fieldTxt, !selected && s.placeholder]}>{selected?.label || placeholder}</Text>
          {selected?.desc ? <Text style={s.fieldDesc}>{selected.desc}</Text> : null}
        </View>
        <Ionicons name={anchor ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
      </Pressable>

      <Modal visible={!!anchor} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close list" />
        {anchor && (
          <View style={[s.menu, { top, left: anchor.x, width: anchor.w, maxHeight: listH }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: verticalScale(6) }}>
              {options.map(o => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => { onChange(o.value); close(); }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    android_ripple={{ color: 'rgba(26,48,82,0.08)' }}
                    style={({ pressed }) => [s.option, active && s.optionActive, pressed && Platform.OS === 'ios' && { opacity: 0.8 }]}
                  >
                    {o.icon ? (
                      <View style={[s.iconBox, active && s.iconBoxActive]}>
                        <Ionicons name={o.icon as any} size={16} color={active ? '#FFFFFF' : NAVY} />
                      </View>
                    ) : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.optionTxt, active && { color: NAVY }]}>{o.label}</Text>
                      {o.desc ? <Text style={s.fieldDesc}>{o.desc}</Text> : null}
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color={NAVY} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: scale(10),
    minHeight: verticalScale(54), paddingHorizontal: scale(12), paddingVertical: verticalScale(8),
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: scale(14), backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  fieldOpen: { borderColor: NAVY },
  fieldError: { borderColor: '#DC2626' },
  fieldTxt: { fontSize: moderateScale(14), fontWeight: '700', color: '#0F1E2E' },
  placeholder: { color: '#94A3B8', fontWeight: '500' },
  fieldDesc: { fontSize: moderateScale(11.5), lineHeight: moderateScale(16), color: '#64748B', marginTop: verticalScale(1) },
  iconBox: { width: scale(32), height: scale(32), borderRadius: scale(9), backgroundColor: NAVY_FAINT, alignItems: 'center', justifyContent: 'center' },
  iconBoxActive: { backgroundColor: NAVY },
  menu: {
    position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: scale(14),
    borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: scale(10), minHeight: ROW_H, paddingHorizontal: scale(12), paddingVertical: verticalScale(8) },
  optionActive: { backgroundColor: NAVY_FAINT },
  optionTxt: { fontSize: moderateScale(14), fontWeight: '700', color: '#0F1E2E' },
});
