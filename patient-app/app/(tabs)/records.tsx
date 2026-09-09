// patient-app/app/(tabs)/records.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { formatDoseDate } from '../../config/dates';
import { db } from '../../config/firebase';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../constants/scale';
import { serviceCopy } from '../../constants/vaccineTypes';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';

const { width } = Dimensions.get('window');
const MEDICAL_RED = '#1E3A8A';
const SOFT_GRAY_BG = '#F4F6FA';

const C = {
  red: MEDICAL_RED,
  redLight: '#EFF6FF',
  redDeep: '#172554',
  white: '#FFFFFF',
  charcoal: '#1E293B',
  slate: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  green: '#10B981',
  bg: SOFT_GRAY_BG,
};

const DEFAULT_RECORD_DOSES = [
  { id: 'd1', label: '1st Dose (Day 0)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/04/26', provider: 'K&A Main Clinic / RN S. Santos', done: true },
  { id: 'd2', label: '2nd Dose (Day 3)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/07/26', provider: 'K&A Main Clinic / RN S. Santos', done: true },
  { id: 'd3', label: '3rd Dose (Day 7)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/11/26', provider: 'K&A Main Clinic / RN S. Santos', done: true },
  { id: 'd4', label: '4th Dose (Day 14)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/18/26', provider: 'K&A Main Clinic / RN', done: false },
  { id: 'd5', label: 'RIG (Immunoglobulin)', vaccineBrand: 'ERIG (Equine Rabies)', dosage: '20 IU/kg (Infiltration)', date: '08/04/26', provider: 'K&A Emergency Unit', done: true },
];

export default function RecordsScreen() {
  const router = useRouter();
  const { user, mrn, isGuest } = usePatientAuth();
  const insets = useSafeAreaInsets();

  const [patientRecord, setPatientRecord] = useState<any | null>(null);

  // ── Custom Alert Modal State ──────────────────────────────────────────────
  const [alertConfig, setAlertConfig] = useState<CustomAlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<CustomAlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  // 3D Flip Card State
  const flipAnim = useSharedValue(0);
  const [isFlippedState, setIsFlippedState] = useState(false);
  const cardFrontShotRef = useRef<ViewShot>(null);
  const cardBackShotRef = useRef<ViewShot>(null);
  const [exportingCard, setExportingCard] = useState(false);

  const toggleCardFlip = () => {
    const nextVal = isFlippedState ? 0 : 1;
    setIsFlippedState(!isFlippedState);
    flipAnim.value = withTiming(nextVal, {
      duration: 450,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [180, 360]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const handleExportCard = async () => {
    if (isGuest || user?.isAnonymous || !mrn) {
      showAlert({
        type: 'guest',
        title: 'Guest Mode',
        message: 'Guest accounts cannot export personalized medical cards. Sign in or register with your Medical Record Number (MRN) to access and export your official record card.',
        primaryButtonText: 'Sign In / Register',
        onPrimaryPress: () => {
          hideAlert();
          router.push('/auth/login');
        },
        secondaryButtonText: 'Dismiss',
        onSecondaryPress: hideAlert,
      });
      return;
    }
    const targetRef = isFlippedState ? cardBackShotRef : cardFrontShotRef;
    if (!targetRef.current?.capture) return;
    setExportingCard(true);
    try {
      const uri = await targetRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Export Vaccination Record Card',
        });
      } else {
        showAlert({
          type: 'success',
          title: 'Card Exported',
          message: `Card image saved to: ${uri}`,
          primaryButtonText: 'OK',
          onPrimaryPress: hideAlert,
        });
      }
    } catch (e: any) {
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: e?.message || 'Could not export card image. Please try again.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } finally {
      setExportingCard(false);
    }
  };

  // Live Firestore patient record snapshot
  useEffect(() => {
    if (!mrn) return;
    return onSnapshot(doc(db, 'vaccinations', mrn), snap => {
      if (snap.exists()) {
        setPatientRecord(snap.data());
      }
    });
  }, [mrn]);

  const pr = patientRecord || {};
  const fullName = pr.name || user?.displayName || 'Dela Cruz, Paulina C.';
  const isCommaFormat = fullName.includes(',');
  const nameParts = isCommaFormat ? fullName.split(',').map((s: string) => s.trim()) : fullName.trim().split(' ');
  const lastNameVal = pr.lastName || (isCommaFormat ? nameParts[0] : (nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Cruz'));
  const firstNameVal = pr.firstName || (isCommaFormat ? nameParts[1] : nameParts[0]) || 'Paulina';
  const middleNameVal = pr.middleName || (nameParts.length > 2 ? nameParts[2] : 'C.');
  const miVal = middleNameVal ? middleNameVal.charAt(0).toUpperCase() + '.' : 'C.';
  const dobVal = pr.dob || '04/12/1995';
  const mrnVal = mrn ? `MRN-${mrn}` : (pr.id ? `MRN-${pr.id}` : 'MRN-2026-004');
  const vaccineCopy = serviceCopy(pr.service);
  const purposeVal = pr.service ? vaccineCopy.long : '—';
  const catVal = pr.cat ? `Category ${pr.cat}` : 'Category II (Moderate Risk)';
  const doseList = Array.isArray(pr.doses) && pr.doses.length > 0 ? pr.doses : DEFAULT_RECORD_DOSES;

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── TOP SECTION HEADER: white, matching the Logged-in Devices /
          Appointments header layout — centered title, thin bottom border. ── */}
      <View style={s.topMeshSection}>
        <View style={s.headerTop}>
          <View style={{ width: scale(46) }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Medical Records</Text>
            <Text style={s.headerSub}>Official Immunization & Case Log</Text>
          </View>
          <View style={s.btnGlass}>
            <Ionicons name="id-card" size={22} color={C.red} />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: verticalScale(110) + insets.bottom, paddingTop: verticalScale(14), paddingHorizontal: scale(20) }}>

        {/* ══ COMPREHENSIVE CASE & INCIDENT DETAILS TABLE ══ */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Case & Incident Record</Text>
          </View>

          <View style={s.tableCard}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { flex: 1.2 }]}>RECORD FIELD</Text>
              <Text style={[s.tableHeaderCell, { flex: 1.8 }]}>DETAILS</Text>
            </View>

            <View style={s.recordTableRow}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Exposure Date</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8 }]}>{formatDoseDate(pr.date || pr.exposureDate)}</Text>
            </View>
            <View style={[s.recordTableRow, s.recordTableRowAlt]}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Exposure Category</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8, color: MEDICAL_RED, fontWeight: '700' }]}>{catVal}</Text>
            </View>
            <View style={s.recordTableRow}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Biting Animal</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8 }]}>{pr.animal || pr.sourceOfExposure || 'Dog / Cat'}</Text>
            </View>
            <View style={[s.recordTableRow, s.recordTableRowAlt]}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Animal Status</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8 }]}>{pr.animalStatus || 'Alive & Observed'}</Text>
            </View>
            <View style={s.recordTableRow}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Local Washing</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8 }]}>{pr.washTreatment || 'Soap & Running Water'}</Text>
            </View>
            <View style={[s.recordTableRow, s.recordTableRowAlt]}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Known Allergies</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8 }]}>{pr.allergies || 'None Reported'}</Text>
            </View>
            <View style={[s.recordTableRow, { borderBottomWidth: 0 }]}>
              <Text style={[s.recordTableCellLabel, { flex: 1.2 }]}>Attending ABTC</Text>
              <Text style={[s.recordTableCellValue, { flex: 1.8, fontWeight: '700', color: C.charcoal }]}>K&A Animal Bite Center</Text>
            </View>
          </View>
        </View>

        {/* ══ VACCINATION SCHEDULE TABLE — heading follows the record ══ */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>{vaccineCopy.timelineTitle}</Text>
          </View>

          <View style={s.tableCard}>
            {/* Table Header Row */}
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { flex: 1.1 }]}>DOSE</Text>
              <Text style={[s.tableHeaderCell, { flex: 1.4 }]}>VACCINE</Text>
              <Text style={[s.tableHeaderCell, { flex: 1.1 }]}>DOSAGE</Text>
              <Text style={[s.tableHeaderCell, { flex: 1.0 }]}>DATE</Text>
              <Text style={[s.tableHeaderCell, { flex: 0.9, textAlign: 'center' }]}>STATUS</Text>
            </View>

            {doseList.map((d: any, idx: number) => {
              const isDone = d.done || (d.status || d.s) === 'done';
              const vaccineName = d.vaccineBrand || d.b || pr.vaccineBrand || (idx === 4 ? 'ERIG' : 'Speeda ARV');
              const dosageVal = d.dosage || pr.route || (idx === 4 ? '20 IU/kg' : '0.5 mL (IM)');
              const dateVal = d.date ? formatDoseDate(d.date) : 'Scheduled';
              const isAlt = idx % 2 === 1;
              const isLast = idx === doseList.length - 1;

              return (
                <View key={d.id || idx} style={[s.recordTableRow, isAlt && s.recordTableRowAlt, isLast && { borderBottomWidth: 0 }]}>
                  <Text style={[s.recordTableCellValue, { flex: 1.1, fontWeight: '700', color: C.charcoal }]} numberOfLines={1}>
                    {d.label || d.n || `Dose ${idx + 1}`}
                  </Text>
                  <Text style={[s.recordTableCellValue, { flex: 1.4 }]} numberOfLines={1}>
                    {vaccineName}
                  </Text>
                  <Text style={[s.recordTableCellValue, { flex: 1.1 }]} numberOfLines={1}>
                    {dosageVal}
                  </Text>
                  <Text style={[s.recordTableCellValue, { flex: 1.0 }]} numberOfLines={1}>
                    {dateVal}
                  </Text>
                  <View style={{ flex: 0.9, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={[s.miniBadge, isDone ? s.miniBadgeDone : s.miniBadgePending]}>
                      <Text style={[s.miniBadgeTxt, isDone ? s.miniBadgeTxtDone : s.miniBadgeTxtPending]}>
                        {isDone ? 'DONE' : 'PENDING'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* ── BOTTOM NAVIGATION BAR ── */}
      <View style={[nav.bar, { height: verticalScale(80) + insets.bottom, paddingBottom: verticalScale(8) + insets.bottom }]}>
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/')}
        >
          <Ionicons name="home-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Home</Text>
        </TouchableOpacity>

        {/* Tab 2: Appts */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/appt')}
        >
          <Ionicons name="calendar-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Appts</Text>
        </TouchableOpacity>

        {/* Tab 3: Chat */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/chat')}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Chat</Text>
        </TouchableOpacity>

        {/* Tab 4: Records (ACTIVE) */}
        <TouchableOpacity style={nav.tab} activeOpacity={0.7}>
          <Ionicons name="id-card" size={24} color={C.red} />
          <Text style={[nav.label, nav.labelActive]}>Records</Text>
        </TouchableOpacity>

        {/* Tab 5: Account */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/profile')}
        >
          <Ionicons name="person-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Account</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={hideAlert} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topMeshSection: {
    position: 'relative',
    paddingTop: verticalScale(66),
    paddingBottom: verticalScale(22),
    paddingHorizontal: scale(20),
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4FA',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scale(12) },
  headerTitle: { fontSize: moderateScale(21), fontWeight: '900', color: C.charcoal, letterSpacing: -0.4, textAlign: 'center' },
  headerSub: { fontSize: moderateScale(13), color: C.muted, fontWeight: '500', marginTop: verticalScale(3), textAlign: 'center' },
  btnGlass: { width: scale(46), height: scale(46), borderRadius: scale(23), backgroundColor: C.redLight, justifyContent: 'center', alignItems: 'center' },

  // Ultra-Compact Vaccination Card Styling
  cardWrapper: { width: '100%', marginBottom: verticalScale(12) },
  cardPaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderTopWidth: 3,
    borderTopColor: MEDICAL_RED,
    padding: scale(8),
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardPaperBack: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: scale(4) },
  cardTitle: { fontSize: moderateScale(11.5), fontWeight: '900', color: '#0F172A', letterSpacing: 0.2 },
  cardSub: { fontSize: moderateScale(8.5), color: '#475569', marginTop: verticalScale(1) },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: scale(2), backgroundColor: '#F1F5F9', paddingHorizontal: scale(6), paddingVertical: verticalScale(2), borderRadius: scale(5), borderWidth: 1, borderColor: '#CBD5E1' },
  exportBtnTxt: { fontSize: moderateScale(9), fontWeight: '800', color: '#1E3A5F' },
  divider: { height: 1, backgroundColor: '#0F172A', marginVertical: verticalScale(3) },

  fieldsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: verticalScale(2), gap: scale(6) },
  fieldLbl: { fontSize: moderateScale(7.5), fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3 },
  fieldVal: { fontSize: moderateScale(10), fontWeight: '800', color: '#0F172A', marginTop: verticalScale(1) },

  tableBox: { borderWidth: 1, borderColor: '#475569', borderRadius: scale(6), overflow: 'hidden', marginTop: verticalScale(3) },
  tableHeadRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#475569' },
  tableHeadCell: { paddingHorizontal: scale(6), paddingVertical: verticalScale(3), fontSize: moderateScale(8.5), fontWeight: '800', color: '#0F172A', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  tableCell: { paddingHorizontal: scale(6), paddingVertical: verticalScale(3), fontSize: moderateScale(9.5), color: '#334155' },

  flipHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: verticalScale(4), paddingTop: verticalScale(4), borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  flipHintTxt: { fontSize: moderateScale(9.5), fontWeight: '700', color: '#2563EB' },
  pageBadge: { fontSize: moderateScale(9), fontWeight: '800', color: '#64748B', backgroundColor: '#F1F5F9', paddingHorizontal: scale(5), paddingVertical: verticalScale(1), borderRadius: scale(4) },
  sectionHeaderTag: { fontSize: moderateScale(8.5), fontWeight: '900', color: '#1E3A5F', letterSpacing: 0.3, textTransform: 'uppercase' },

  section: { marginTop: verticalScale(20) },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10), gap: scale(8) },
  sectionAccent: { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: MEDICAL_RED },
  sectionTitle: { fontSize: moderateScale(17), fontWeight: '900', color: C.charcoal, flex: 1 },

  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
    alignItems: 'center',
  },
  tableHeaderCell: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  recordTableRow: {
    flexDirection: 'row',
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  recordTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  recordTableCellLabel: {
    fontSize: moderateScale(11.5),
    fontWeight: '700',
    color: '#475569',
  },
  recordTableCellValue: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#1E293B',
  },
  miniBadge: {
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3),
    borderRadius: scale(6),
  },
  miniBadgeDone: {
    backgroundColor: '#ECFDF5',
  },
  miniBadgePending: {
    backgroundColor: '#EFF6FF',
  },
  miniBadgeTxt: {
    fontSize: moderateScale(9.5),
    fontWeight: '800',
  },
  miniBadgeTxtDone: {
    color: '#059669',
  },
  miniBadgeTxtPending: {
    color: MEDICAL_RED,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(24) },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#FFF', borderRadius: scale(20), padding: scale(20) },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(12) },
  modalTitle: { fontSize: moderateScale(16), fontWeight: '800', color: C.charcoal },
  modalImg: { width: '100%', height: verticalScale(200), borderRadius: scale(12), marginBottom: verticalScale(10) },
  modalMeta: { fontSize: moderateScale(11), color: C.muted, fontWeight: '600', marginBottom: verticalScale(6) },
  modalNote: { fontSize: moderateScale(13), color: C.charcoal, lineHeight: moderateScale(18), marginBottom: verticalScale(14) },
  modalCloseBtn: { paddingVertical: verticalScale(10), backgroundColor: SOFT_GRAY_BG, borderRadius: scale(10), alignItems: 'center' },
  modalCloseTxt: { fontSize: moderateScale(13), fontWeight: '700', color: C.slate },
});

const nav = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: verticalScale(80), backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderTopWidth: 1, borderColor: '#F1F5F9',
    paddingBottom: verticalScale(8), paddingTop: verticalScale(6),
    elevation: 20, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 },
    paddingHorizontal: scale(4),
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%' },
  label: { fontSize: moderateScale(11), color: '#64748B', marginTop: verticalScale(3), fontWeight: '600' },
  labelActive: { color: C.red, fontWeight: '800' },
});
