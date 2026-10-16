import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { toYmd } from '../utils/cardData';
import { EMPTY, exposureCategory, formatDoseDate, isPepService, serviceCopy } from '../utils/patientRecord';
import { moderateScale, scale, verticalScale } from '../utils/scale';

// Earlier treatments saved under the patient's MRN (`caseHistory` on their
// own vaccinations/{mrn} doc, written by the dashboard's Add Another
// Service), in the dose timeline's table style. Same columns as the
// dashboard's Previous Services table: service, date started, doses given,
// completion date and status, plus the exposure category under the service
// for PEP only. Wound location and depth are clinic-only and never shown.
// Each row opens that treatment's card. Renders nothing without history.

type Props = { history: any[] | null | undefined; onOpen: (index: number) => void };

const isDone = (d: any) => d?.done === true || d?.s === 'done' || d?.status === 'done' || d?.status === 'completed';

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  completed: { label: 'Completed', bg: '#ECFDF5', color: '#059669' },
  ongoing: { label: 'Ongoing', bg: '#EFF6FF', color: '#3B50DF' },
  incomplete: { label: 'Incomplete', bg: '#FFFBEB', color: '#B45309' },
  archived: { label: 'Archived', bg: '#F1F5F9', color: '#475569' },
};
const statusOf = (raw: any) => {
  const key = String(raw || 'completed').toLowerCase();
  return STATUS[key] || { label: key.charAt(0).toUpperCase() + key.slice(1), bg: '#F1F5F9', color: '#475569' };
};

const COLS = { service: 1.45, start: 1.1, doses: 0.75, end: 1.1, status: 1.05 };

export default function PreviousTreatments({ history, onOpen }: Props) {
  const list = Array.isArray(history) ? history : [];
  if (list.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.header}>
        <View style={s.accent} />
        <Text style={s.title}>Previous Treatments</Text>
      </View>
      <View style={s.hintRow}>
        <Ionicons name="hand-left-outline" size={13} color="#64748B" />
        <Text style={s.hint}>Tap a treatment to view or export its card.</Text>
      </View>
      <View style={s.card}>
        <View style={s.headRow}>
          <Text style={[s.headCell, { flex: COLS.service }]}>SERVICE</Text>
          <Text style={[s.headCell, { flex: COLS.start }]}>STARTED</Text>
          <Text style={[s.headCell, { flex: COLS.doses }]}>DOSES</Text>
          <Text style={[s.headCell, { flex: COLS.end }]}>COMPLETED</Text>
          <Text style={[s.headCell, { flex: COLS.status, textAlign: 'center' }]}>STATUS</Text>
          <View style={s.chevronCol} />
        </View>
        {list.map((h, i) => {
          const doses = Array.isArray(h?.doses) ? h.doses : [];
          const given = doses.filter(isDone).length;
          const st = statusOf(h?.status);
          const completed = h?.completedAt || h?.closedAt;
          const pep = isPepService(h?.service);
          const cat = pep ? exposureCategory(h?.cat, h?.animal) : '';
          const svc = serviceCopy(h?.service || 'PEP');
          return (
            <Pressable
              key={`${h?.closedAt || i}-${i}`}
              onPress={() => onOpen(i)}
              accessibilityRole="button"
              accessibilityLabel={`${svc.long}, started ${h?.date ? formatDoseDate(h.date) : 'unknown'}. Open its vaccination card.`}
              android_ripple={{ color: 'rgba(30,58,138,0.08)' }}
              style={({ pressed }) => [s.row, i % 2 === 1 && s.rowAlt, i === list.length - 1 && { borderBottomWidth: 0 }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
            >
              <View style={{ flex: COLS.service, minWidth: 0 }}>
                <Text style={s.service}>{svc.short}</Text>
                {pep && <Text style={s.sub}>{cat ? `Category ${cat}` : 'Category —'}</Text>}
              </View>
              <Text style={[s.value, { flex: COLS.start }]}>{h?.date ? formatDoseDate(h.date) : EMPTY}</Text>
              <Text style={[s.value, s.strong, { flex: COLS.doses }]}>{doses.length ? `${given}/${doses.length}` : EMPTY}</Text>
              <Text style={[s.value, { flex: COLS.end }]}>{completed ? formatDoseDate(toYmd(completed)) : EMPTY}</Text>
              <View style={{ flex: COLS.status, alignItems: 'center' }}>
                <View style={[s.badge, { backgroundColor: st.bg }]}>
                  <Text style={[s.badgeTxt, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <View style={s.chevronCol}>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Same look as the dose timeline table above it (recordsTable* in index.tsx).
const s = StyleSheet.create({
  section: { marginTop: verticalScale(20), width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: verticalScale(6) },
  accent: { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: '#3B50DF' },
  title: { flex: 1, fontSize: moderateScale(17), fontWeight: '900', color: '#1E293B' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6), marginBottom: verticalScale(10) },
  hint: { flex: 1, fontSize: moderateScale(12), lineHeight: moderateScale(16), color: '#64748B', fontWeight: '500' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: scale(16), borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: '#0F172A', paddingVertical: verticalScale(10), paddingHorizontal: scale(10) },
  headCell: { fontSize: moderateScale(9.5), fontWeight: '800', color: '#94A3B8', letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: scale(4), minHeight: 48, paddingVertical: verticalScale(11), paddingHorizontal: scale(10), borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FFFFFF' },
  rowAlt: { backgroundColor: '#F8FAFC' },
  service: { fontSize: moderateScale(11.5), fontWeight: '800', color: '#1E293B' },
  sub: { fontSize: moderateScale(10), color: '#64748B', fontWeight: '600', marginTop: verticalScale(1) },
  value: { fontSize: moderateScale(11), fontWeight: '600', color: '#1E293B' },
  strong: { fontWeight: '800' },
  badge: { paddingHorizontal: scale(6), paddingVertical: verticalScale(3), borderRadius: scale(6) },
  badgeTxt: { fontSize: moderateScale(9.5), fontWeight: '800', textAlign: 'center' },
  chevronCol: { width: scale(16), alignItems: 'flex-end' },
});
