// patient-app/components/CustomAlertModal.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../constants/scale';

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'guest' | 'signout';

export interface CustomAlertConfig {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  primaryButtonText?: string;
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  isDestructive?: boolean;
}

interface Props {
  config: CustomAlertConfig;
  onClose: () => void;
}

const TYPE_CONFIG = {
  info: {
    icon: 'information-circle-outline' as const,
    iconColor: '#3B50DF',
    iconBg: '#EEF2FF',
    primaryBtnBg: '#3B50DF',
  },
  success: {
    icon: 'checkmark-circle-outline' as const,
    iconColor: '#10B981',
    iconBg: '#ECFDF5',
    primaryBtnBg: '#10B981',
  },
  warning: {
    icon: 'alert-circle-outline' as const,
    iconColor: '#F59E0B',
    iconBg: '#FEF3C7',
    primaryBtnBg: '#3B50DF',
  },
  error: {
    icon: 'close-circle-outline' as const,
    iconColor: '#EF4444',
    iconBg: '#FEE2E2',
    primaryBtnBg: '#EF4444',
  },
  guest: {
    icon: 'lock-closed-outline' as const,
    iconColor: '#3B50DF',
    iconBg: '#EEF2FF',
    primaryBtnBg: '#3B50DF',
  },
  signout: {
    icon: 'log-out-outline' as const,
    iconColor: '#EF4444',
    iconBg: '#FEE2E2',
    primaryBtnBg: '#EF4444',
  },
};

export default function CustomAlertModal({ config, onClose }: Props) {
  const {
    visible,
    type = 'info',
    title,
    message,
    primaryButtonText = 'OK',
    onPrimaryPress,
    secondaryButtonText,
    onSecondaryPress,
    isDestructive = false,
  } = config;

  if (!visible) return null;

  const currentType = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  const handlePrimary = () => {
    if (onPrimaryPress) {
      onPrimaryPress();
    } else {
      onClose();
    }
  };

  const handleSecondary = () => {
    if (onSecondaryPress) {
      onSecondaryPress();
    } else {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <View style={s.card}>
              {/* Icon Badge */}
              <View style={[s.iconBox, { backgroundColor: currentType.iconBg }]}>
                <Ionicons name={currentType.icon} size={30} color={currentType.iconColor} />
              </View>

              {/* Title & Message */}
              <Text style={s.title}>{title}</Text>
              <Text style={s.message}>{message}</Text>

              {/* Action Buttons */}
              <View style={s.btnRow}>
                {secondaryButtonText ? (
                  <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={handleSecondary}
                    activeOpacity={0.7}
                  >
                    <Text style={s.secondaryBtnText}>{secondaryButtonText}</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[
                    s.primaryBtn,
                    {
                      backgroundColor: isDestructive ? '#EF4444' : currentType.primaryBtnBg,
                      flex: secondaryButtonText ? 1 : undefined,
                      width: secondaryButtonText ? undefined : '100%',
                    },
                  ]}
                  onPress={handlePrimary}
                  activeOpacity={0.8}
                >
                  <Text style={s.primaryBtnText}>{primaryButtonText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(24),
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: scale(28),
    paddingHorizontal: scale(22),
    paddingTop: verticalScale(26),
    paddingBottom: verticalScale(22),
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  iconBox: {
    width: scale(62),
    height: scale(62),
    borderRadius: scale(31),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  title: {
    fontSize: moderateScale(18.5),
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: verticalScale(8),
  },
  message: {
    fontSize: moderateScale(13.5),
    lineHeight: moderateScale(20),
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: verticalScale(22),
    paddingHorizontal: scale(6),
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: verticalScale(13),
    borderRadius: scale(16),
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#475569',
  },
  primaryBtn: {
    paddingVertical: verticalScale(13),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  primaryBtnText: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
