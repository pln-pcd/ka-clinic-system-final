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
import { moderateScale, scale, verticalScale } from '../utils/scale';

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
  /** Show the secondary (left) action in red, for a destructive choice. */
  secondaryDestructive?: boolean;
}

interface Props {
  config: CustomAlertConfig;
  onClose: () => void;
}

const TYPE_CONFIG = {
  info: {
    icon: 'information-circle-outline' as const,
    iconColor: '#1E3A8A',
    iconBg: '#EFF6FF',
    primaryBtnBg: '#1E3A8A',
  },
  success: {
    icon: 'checkmark-circle-outline' as const,
    iconColor: '#10B981',
    iconBg: '#ECFDF5',
    primaryBtnBg: '#10B981',
  },
  // Warnings use amber, like the admin app; destructive actions stay red
  // (isDestructive).
  warning: {
    icon: 'alert-circle-outline' as const,
    iconColor: '#D97706',
    iconBg: '#FEF3C7',
    primaryBtnBg: '#D97706',
  },
  error: {
    icon: 'close-circle-outline' as const,
    iconColor: '#EF4444',
    iconBg: '#FEE2E2',
    primaryBtnBg: '#EF4444',
  },
  guest: {
    icon: 'lock-closed-outline' as const,
    iconColor: '#1E3A8A',
    iconBg: '#EFF6FF',
    primaryBtnBg: '#1E3A8A',
  },
  signout: {
    icon: 'log-out-outline' as const,
    iconColor: '#1E3A8A',
    iconBg: '#EFF6FF',
    primaryBtnBg: '#1E3A8A',
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
    secondaryDestructive = false,
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
                <Ionicons name={currentType.icon} size={36} color={currentType.iconColor} />
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
                    <Text style={[s.secondaryBtnText, secondaryDestructive && { color: '#DC2626' }]}>{secondaryButtonText}</Text>
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
    paddingHorizontal: scale(18),
  },
  card: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: '#FFFFFF',
    borderRadius: scale(32),
    paddingHorizontal: scale(26),
    paddingTop: verticalScale(32),
    paddingBottom: verticalScale(28),
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  iconBox: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(18),
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: verticalScale(10),
  },
  message: {
    fontSize: moderateScale(14.5),
    lineHeight: moderateScale(22),
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: verticalScale(24),
    paddingHorizontal: scale(8),
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: verticalScale(15),
    borderRadius: scale(18),
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: moderateScale(14.5),
    fontWeight: '700',
    color: '#475569',
  },
  primaryBtn: {
    paddingVertical: verticalScale(15),
    borderRadius: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  primaryBtnText: {
    fontSize: moderateScale(14.5),
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
