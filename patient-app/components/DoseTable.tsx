import { StyleSheet, Text, View } from 'react-native';
import { clinicToday, doseBrand, doseState, doseStatus, EMPTY, formatDoseDate } from '../utils/patientRecord';
import { moderateScale, scale, verticalScale } from '../utils/scale';

// The dose timeline table: one row per dose of the CURRENT treatment, with
// the original (pre-1.0.4) design — dark header, Dose · Vaccine · Date ·
// Status, alternating rows, status badges (the Dosage column was removed in
// 1.0.7). Cells wrap onto extra lines instead of cutting text off with "…",
// so every value shows in full.

// Column widths, shared by the header and the rows.
// Dose is widest so every "Session N (Day NN)" label stays on one line.
const COL = { dose: 1.75, vaccine: 1.45, date: 1.1, status: 0.95 };

type Props = { doses: any[]; record: any; today?: string };

export default function DoseTable({ doses, record, today = clinicToday() }: Props) {
  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={[s.headCell, { flex: COL.dose }]}>DOSE</Text>
        <Text style={[s.headCell, { flex: COL.vaccine }]}>VACCINE</Text>
        <Text style={[s.headCell, { flex: COL.date }]}>DATE</Text>
        <Text style={[s.headCell, { flex: COL.status, textAlign: 'center' }]}>STATUS</Text>
      </View>
      {doses.map((d: any, idx: number) => {
        const st = doseStatus(d, today);
        const vaccine = d.blankRow ? EMPTY : doseBrand(d, record, doseState(d, today));
        const tone = st.status === 'given' ? 'done' : st.status === 'overdue' ? 'missed' : st.status === 'due_today' ? 'today' : 'pending';
        const badge = { done: s.badge_done, missed: s.badge_missed, today: s.badge_today, pending: s.badge_pending }[tone];
        const badgeTxt = { done: s.badgeTxt_done, missed: s.badgeTxt_missed, today: s.badgeTxt_today, pending: s.badgeTxt_pending }[tone];
        return (
          <View key={d.id || d.key || idx} style={[s.row, idx % 2 === 1 && s.rowAlt, idx === doses.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={[s.value, { flex: COL.dose, fontWeight: '700', color: '#1E293B' }]}>{d.label || d.n || `Dose ${idx + 1}`}</Text>
            <Text style={[s.value, { flex: COL.vaccine }]}>{vaccine}</Text>
            <Text style={[s.value, { flex: COL.date }]}>{d.date ? formatDoseDate(d.date) : EMPTY}</Text>
            <View style={{ flex: COL.status, alignItems: 'center', justifyContent: 'center' }}>
              <View style={[s.badge, badge]}>
                <Text style={[s.badgeTxt, badgeTxt]}>{d.blankRow ? EMPTY : st.label}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// The original recordsTable* / recordsMiniBadge* styles from index.tsx.
const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: scale(14), borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.02, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  headRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: verticalScale(10), paddingHorizontal: scale(10), alignItems: 'center', gap: scale(4) },
  headCell: { fontSize: moderateScale(10), fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  row: { flexDirection: 'row', paddingVertical: verticalScale(11), paddingHorizontal: scale(10), borderBottomWidth: 1, borderBottomColor: '#F1F5F9', alignItems: 'center', backgroundColor: '#FFFFFF', gap: scale(4) },
  rowAlt: { backgroundColor: '#FFFFFF' },
  value: { fontSize: moderateScale(11), fontWeight: '600', color: '#1E293B' },
  badge: { paddingHorizontal: scale(6), paddingVertical: verticalScale(3), borderRadius: scale(6) },
  badge_done: { backgroundColor: '#F1F5F9' },
  badge_pending: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  badge_today: { backgroundColor: '#E2E8F0' },
  badge_missed: { backgroundColor: 'transparent' }, // overdue: red text only
  badgeTxt: { fontSize: moderateScale(9.5), fontWeight: '800', textAlign: 'center' },
  badgeTxt_done: { color: '#334155' },
  badgeTxt_pending: { color: '#64748B' },
  badgeTxt_today: { color: '#0F172A' },
  badgeTxt_missed: { color: '#DC2626' },
});
