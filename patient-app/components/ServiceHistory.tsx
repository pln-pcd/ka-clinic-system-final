import { StyleSheet, Text, View } from 'react-native';
import { clinicToday, EMPTY, exposureCategory, formatDoseDate, isPepService, serviceCopy } from '../utils/patientRecord';
import { moderateScale, scale, verticalScale } from '../utils/scale';

// Earlier services saved under the patient's MRN (`caseHistory` on their own
// vaccinations/{mrn} doc, written by the dashboard's Add Another Service).
// Same columns as the dashboard's Previous Services table: service, date
// started, doses given, completion date and status, plus the exposure
// category for services that ask for it (PEP). Wound location and depth are
// clinic-only and never shown. Renders nothing when there is no history.

type Props = { history: any[] | null | undefined };

// completedAt is a 'YYYY-MM-DD' clinic date; closedAt is epoch ms.
const toYmd = (v: any): string => {
  if (typeof v === 'number') return clinicToday(new Date(v));
  if (v && typeof v.toDate === 'function') return clinicToday(v.toDate());
  return String(v || '').slice(0, 10);
};

const isDone = (d: any) => d?.done === true || d?.s === 'done' || d?.status === 'done' || d?.status === 'completed';

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  completed: { label: 'Completed', bg: '#ECFDF5', color: '#047857' },
  ongoing: { label: 'Ongoing', bg: '#EFF6FF', color: '#1E3A8A' },
  incomplete: { label: 'Incomplete', bg: '#FFFBEB', color: '#92400E' },
  archived: { label: 'Archived', bg: '#F1F5F9', color: '#475569' },
};
const statusOf = (raw: any) => {
  const key = String(raw || 'completed').toLowerCase();
  return STATUS[key] || { label: key.charAt(0).toUpperCase() + key.slice(1), bg: '#F1F5F9', color: '#475569' };
};

export default function ServiceHistory({ history }: Props) {
  const list = Array.isArray(history) ? history : [];
  if (list.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.header}>
        <View style={s.accent} />
        <Text style={s.title}>Previous Services</Text>
      </View>
      <Text style={s.sub}>Earlier services saved under your MRN.</Text>
      <View style={s.list}>
        {list.map((h, i) => {
          const doses = Array.isArray(h?.doses) ? h.doses : [];
          const given = doses.filter(isDone).length;
          const st = statusOf(h?.status);
          const completed = h?.completedAt || h?.closedAt;
          const cat = isPepService(h?.service) ? exposureCategory(h?.cat, h?.animal) : null;
          const rows: [string, string][] = [
            ['DATE STARTED', h?.date ? formatDoseDate(h.date) : EMPTY],
            ['DOSES GIVEN', doses.length ? `${given}/${doses.length}` : EMPTY],
            ['COMPLETION DATE', completed ? formatDoseDate(toYmd(completed)) : EMPTY],
            ...(cat !== null ? [['EXPOSURE CATEGORY', cat ? `Category ${cat}` : EMPTY] as [string, string]] : []),
          ];
          return (
            <View key={`${h?.closedAt || i}-${i}`} style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.service}>{serviceCopy(h?.service || 'PEP').long}</Text>
                <View style={[s.badge, { backgroundColor: st.bg }]}>
                  <Text style={[s.badgeTxt, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <View style={s.grid}>
                {rows.map(([label, value]) => (
                  <View key={label} style={s.field}>
                    <Text style={s.label}>{label}</Text>
                    <Text style={s.value}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: verticalScale(22) },
  header: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  accent: { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: '#1E3A8A' },
  title: { flex: 1, fontSize: moderateScale(17), fontWeight: '900', color: '#1E293B' },
  sub: { fontSize: moderateScale(12), lineHeight: moderateScale(17), color: '#64748B', marginTop: verticalScale(4), marginBottom: verticalScale(10) },
  list: { gap: verticalScale(12) },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: scale(16), padding: scale(16) },
  cardHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: scale(8) },
  service: { flexGrow: 1, flexShrink: 1, flexBasis: '55%', fontSize: moderateScale(14), lineHeight: moderateScale(20), fontWeight: '800', color: '#0F172A' },
  badge: { borderRadius: scale(8), paddingHorizontal: scale(9), paddingVertical: verticalScale(4) },
  badgeTxt: { fontSize: moderateScale(11), lineHeight: moderateScale(16), fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(12), borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: verticalScale(12), paddingTop: verticalScale(10) },
  field: { flexGrow: 1, flexShrink: 1, flexBasis: '44%', minWidth: scale(110) },
  label: { fontSize: moderateScale(10), lineHeight: moderateScale(15), fontWeight: '700', letterSpacing: 0.5, color: '#64748B', marginBottom: verticalScale(3) },
  value: { fontSize: moderateScale(13), lineHeight: moderateScale(19), fontWeight: '600', color: '#1E293B' },
});
