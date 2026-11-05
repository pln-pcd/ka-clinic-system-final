import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ModalProps,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const DetailsFocusContext = createContext<(focused: boolean) => void>(() => {});

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  animationType?: ModalProps['animationType'];
};

export default function RecoveryModal({ visible, onRequestClose, header, footer, children, animationType = 'fade' }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const detailsFocused = useRef(false);

  const keepDetailsVisible = useCallback(() => {
    if (detailsFocused.current) scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const onDetailsFocusChange = useCallback((focused: boolean) => {
    detailsFocused.current = focused;
    if (focused) keepDetailsVisible();
  }, [keepDetailsVisible]);

  useEffect(() => {
    if (!visible) {
      detailsFocused.current = false;
      return;
    }
    // Run again after the keyboard opens; the first focus event precedes resizing.
    const subscription = Keyboard.addListener('keyboardDidShow', keepDetailsVisible);
    return () => subscription.remove();
  }, [visible, keepDetailsVisible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={animationType}
      onRequestClose={() => { Keyboard.dismiss(); onRequestClose(); }}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardArea}>
          <View style={[styles.overlay, {
            paddingTop: Math.max(insets.top, scale(20)),
            paddingBottom: Math.max(insets.bottom, scale(20)),
          }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessible={false} />
            <View style={styles.sheet}>
              <View style={styles.fixedSection}>{header}</View>
              <ScrollView
                ref={scrollRef}
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator
                onLayout={keepDetailsVisible}
                onContentSizeChange={keepDetailsVisible}
              >
                <DetailsFocusContext.Provider value={onDetailsFocusChange}>
                  {children}
                </DetailsFocusContext.Provider>
              </ScrollView>
              <View style={styles.footer}>{footer}</View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function RecoveryDetailsInput({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const onFocusChange = useContext(DetailsFocusContext);
  return (
    <TextInput
      {...props}
      multiline
      style={[styles.textArea, style]}
      placeholderTextColor="#64748B"
      selectionColor="#1E3A8A"
      cursorColor="#1E3A8A"
      underlineColorAndroid="transparent"
      onFocus={event => { onFocusChange(true); onFocus?.(event); }}
      onBlur={event => { onFocusChange(false); onBlur?.(event); }}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  keyboardArea: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(20) },
  sheet: {
    width: '100%', maxHeight: '100%', flexShrink: 1, backgroundColor: '#FFFFFF',
    borderRadius: scale(24), overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  fixedSection: { flexShrink: 0 },
  body: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  bodyContent: { padding: scale(20), paddingBottom: verticalScale(12) },
  footer: { flexShrink: 0, paddingHorizontal: scale(20), paddingBottom: scale(20) },
  textArea: {
    backgroundColor: '#EEF2F6', borderRadius: scale(14), padding: scale(12),
    height: verticalScale(86), fontSize: moderateScale(11.5), color: '#1E293B',
    borderWidth: 1, borderColor: '#E2E8F0', marginTop: verticalScale(8),
    lineHeight: moderateScale(17), textAlignVertical: 'top',
  },
});
