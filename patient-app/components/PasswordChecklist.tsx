// Feedback under a new-password field: a slim strength bar (Weak / Fair /
// Strong) and ONE hint line naming the next rule still missing, and a match
// line for the confirm field. Same rules as utils/passwordPolicy.ts (and the
// API), which the screen still enforces before submitting.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { PASSWORD_RULES } from '../utils/passwordPolicy';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const GREEN = '#059669';
const AMBER = '#D97706';
const RED = '#DC2626';
const MUTED = '#64748B';
const TRACK = '#E2E8F0';

function strengthOf(password: string) {
  const passed = PASSWORD_RULES.filter(r => r.test(password)).length;
  const next = PASSWORD_RULES.find(r => !r.test(password));
  if (!next) return { level: 3, label: 'Strong', color: GREEN, next };
  // Short passwords stay Weak however many character types they mix.
  if (password.length < 8 || passed <= 2) return { level: 1, label: 'Weak', color: RED, next };
  return { level: 2, label: 'Fair', color: AMBER, next };
}

export default function PasswordStrength({ password }: { password: string }) {
  if (!password) {
    return (
      <Text style={[styles.hint, styles.wrap]}>8+ characters with A–Z, a–z, 0–9 and a symbol</Text>
    );
  }
  const s = strengthOf(password);
  return (
    <View style={styles.wrap} accessible accessibilityLiveRegion="polite"
      accessibilityLabel={`Password strength ${s.label}. ${s.next ? s.next.hint : 'Strong password'}`}>
      <View style={styles.barRow}>
        {[1, 2, 3].map(i => (
          <View key={i} style={[styles.seg, { backgroundColor: i <= s.level ? s.color : TRACK }]} />
        ))}
        <Text style={[styles.level, { color: s.color }]}>{s.label}</Text>
      </View>
      <Text style={[styles.hint, !s.next && { color: GREEN, fontWeight: '700' }]}>
        {s.next ? s.next.hint : 'Strong password ✓'}
      </Text>
    </View>
  );
}

export function PasswordMatch({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const ok = confirm === password;
  return (
    <View style={[styles.matchRow, styles.wrap]} accessibilityLiveRegion="polite">
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={14} color={ok ? GREEN : RED} />
      <Text style={[styles.hint, { color: ok ? GREEN : RED }]}>{ok ? 'Passwords match' : "Doesn't match"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: verticalScale(6), marginLeft: scale(2) },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: scale(4), marginBottom: verticalScale(3) },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  level: { width: scale(48), textAlign: 'right', fontSize: moderateScale(11.5), fontWeight: '700' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  hint: { fontSize: moderateScale(12), lineHeight: moderateScale(16), color: MUTED },
});
