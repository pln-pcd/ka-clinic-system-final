import { StyleSheet, Text, View } from 'react-native';
import { clinicToday, doseBrand, doseState, doseStatus, EMPTY, formatDoseDate } from '../utils/patientRecord';
import { moderateScale, scale, verticalScale } from '../utils/scale';

type Props = { doses: any[]; record: any; today?: string };

const COLORS = {
  given: { backgroundColor: '#ECFDF5', color: '#047857' },
  overdue: { backgroundColor: '#FEF2F2', color: '#B91C1C' },
  due_today: { backgroundColor: '#FFFBEB', color: '#92400E' },
  upcoming: { backgroundColor: '#EFF6FF', color: '#1E3A8A' },
};

export default function DoseTimeline({ doses, record, today = clinicToday() }: Props) {
  return (
    <View style={s.list}>
      {doses.map((dose, index) => {
        const status = doseStatus(dose, today);
        const colors = COLORS[status.status as keyof typeof COLORS] || COLORS.upcoming;
        const vaccine = dose.blankRow ? EMPTY : doseBrand(dose, record, doseState(dose, today));
        return (
          <View key={dose.id || dose.key || index} style={s.row}>
            <View style={s.spine}>
              <View style={[s.marker, { backgroundColor: colors.backgroundColor, borderColor: colors.color }]}>
                <Text style={[s.markerText, { color: colors.color }]}>{index + 1}</Text>
              </View>
              {index < doses.length - 1 && <View style={s.connector} />}
            </View>
            <View style={s.card}>
              <View style={s.header}>
                <Text style={s.title}>{dose.label || dose.n || `Dose ${index + 1}`}</Text>
                <View style={[s.badge, { backgroundColor: colors.backgroundColor }]}>
                  <Text style={[s.badgeText, { color: colors.color }]}>{dose.blankRow ? 'No record' : status.label}</Text>
                </View>
              </View>
              <Text style={s.label}>VACCINE</Text>
              <Text style={s.value}>{vaccine}</Text>
              <View style={s.details}>
                <View style={s.field}>
                  <Text style={s.label}>DOSAGE / ROUTE</Text>
                  <Text style={s.value}>{dose.blankRow ? EMPTY : dose.dosage || record.route || EMPTY}</Text>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>DATE</Text>
                  <Text style={s.value}>{dose.date ? formatDoseDate(dose.date) : EMPTY}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: verticalScale(12) },
  row: { flexDirection: 'row', gap: scale(10), alignItems: 'stretch' },
  spine: { width: scale(30), alignItems: 'center' },
  marker: { width: scale(30), height: scale(30), borderRadius: scale(15), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  markerText: { fontSize: moderateScale(12), fontWeight: '800' },
  connector: { flex: 1, width: 2, backgroundColor: '#CBD5E1', marginTop: verticalScale(6), marginBottom: verticalScale(-6) },
  card: { flex: 1, minWidth: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: scale(16), padding: scale(16) },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: scale(8), marginBottom: verticalScale(12) },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: '55%', fontSize: moderateScale(14), lineHeight: moderateScale(20), fontWeight: '800', color: '#0F172A' },
  badge: { maxWidth: '100%', borderRadius: scale(8), paddingHorizontal: scale(9), paddingVertical: verticalScale(4) },
  badgeText: { fontSize: moderateScale(11), lineHeight: moderateScale(16), fontWeight: '700' },
  label: { fontSize: moderateScale(10), lineHeight: moderateScale(15), fontWeight: '700', letterSpacing: 0.5, color: '#64748B', marginBottom: verticalScale(3) },
  value: { fontSize: moderateScale(13), lineHeight: moderateScale(19), fontWeight: '600', color: '#1E293B' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(12), borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: verticalScale(12), paddingTop: verticalScale(10) },
  field: { flexGrow: 1, flexShrink: 1, flexBasis: '44%', minWidth: scale(90) },
});
