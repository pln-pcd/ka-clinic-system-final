// Live checklist for a new password and a match line for the confirm field.
// Each rule has a small 14px circle that turns into a green check when it
// passes. Same rules as utils/passwordPolicy.ts.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { PASSWORD_RULES } from '../utils/passwordPolicy';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const GREEN = '#059669';
const MUTED = '#64748B';

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}${ok ? ', done' : ', not yet'}`}>
      <View style={[styles.dot, ok ? styles.dotOk : styles.dotOff]}>
        {ok && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
      </View>
      <Text style={[styles.text, { color: ok ? GREEN : MUTED }]}>{label}</Text>
    </View>
  );
}

export default function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={styles.list}>
      {PASSWORD_RULES.map(r => <Rule key={r.key} ok={r.test(password)} label={r.label} />)}
    </View>
  );
}

export function PasswordMatch({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const ok = confirm === password;
  return (
    <View style={[styles.row, { marginTop: verticalScale(6), marginLeft: scale(2) }]} accessibilityLiveRegion="polite">
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={14} color={ok ? GREEN : '#DC2626'} />
      <Text style={[styles.text, { color: ok ? GREEN : '#DC2626' }]}>{ok ? 'Passwords match' : 'Passwords do not match'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: verticalScale(8), marginLeft: scale(2), gap: verticalScale(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  dot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dotOk: { backgroundColor: GREEN, borderColor: GREEN },
  dotOff: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
  text: { fontSize: moderateScale(12), lineHeight: moderateScale(16) },
});
