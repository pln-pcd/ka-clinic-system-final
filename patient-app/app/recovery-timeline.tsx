import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../config/firebase';
import { usePatientAuth } from '../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../constants/scale';

const SYMPTOMS_LIST = ['Redness', 'Swelling', 'Discharge', 'Bleeding', 'Itching', 'Pain', 'Warmth', 'Fever', 'Numbness', 'Pus'];

interface LogEntry {
  id: string;
  type: 'wound' | 'note';
  date: string;
  time: string;
  createdAt: number;
  photoUrl?: string;
  note?: string;
  symptoms: string[];
}

export default function RecoveryTimelineScreen() {
  const router = useRouter();
  const { mrn, loading: authLoading } = usePatientAuth();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'wound' | 'note'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingLog, setViewingLog] = useState<LogEntry | null>(null);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editSymptoms, setEditSymptoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mrn) {
      setLogs([]);
      setLoading(false);
      return;
    }

    const vaccineRef = doc(db, 'vaccinations', mrn);
    const unsub = onSnapshot(
      vaccineRef,
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setLogs([]);
          return;
        }
        const data = snap.data() as any;
        const raw: any[] = Array.isArray(data.woundLog) ? data.woundLog : [];
        const sorted = [...raw].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        setLogs(
          sorted.map((entry, i) => {
            const dateObj = entry.createdAt ? new Date(entry.createdAt) : new Date();
            const dateStr = entry.date || dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = entry.time || dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            return {
              id: entry.id || `log-${i}-${entry.createdAt || Date.now()}`,
              type: entry.type === 'wound' ? 'wound' : 'note',
              date: dateStr,
              time: timeStr,
              createdAt: entry.createdAt || Date.now(),
              photoUrl: entry.photoUrl || entry.photo || undefined,
              note: entry.note || entry.desc || '',
              symptoms: Array.isArray(entry.symptoms) ? entry.symptoms : [],
            };
          })
        );
      },
      (err) => {
        console.error('Error fetching recovery logs:', err);
        setError('Could not load recovery logs.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [mrn]);

  const deleteLog = async (logId: string) => {
    if (!mrn) return;
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this recovery log entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const vaccineRef = doc(db, 'vaccinations', mrn);
              const updated = logs.filter(l => l.id !== logId);
              await updateDoc(vaccineRef, { woundLog: updated });
              if (viewingLog?.id === logId) setViewingLog(null);
            } catch (err) {
              console.error('Delete log failed:', err);
              Alert.alert('Error', 'Failed to delete log entry.');
            }
          },
        },
      ]
    );
  };

  const openEdit = (log: LogEntry) => {
    setViewingLog(null);
    setEditingLog(log);
    setEditDesc(log.note || '');
    setEditSymptoms([...(log.symptoms || [])]);
  };

  const toggleEditSymptom = (sym: string) =>
    setEditSymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);

  const saveEdit = async () => {
    if (!editingLog || !mrn) return;
    setSaving(true);
    try {
      const composedNote = editSymptoms.length
        ? `Symptoms: ${editSymptoms.join(', ')}.${editDesc.trim() ? ' ' + editDesc.trim() : ''}`
        : editDesc.trim();
      const vaccineRef = doc(db, 'vaccinations', mrn);
      const updated = logs.map(l => l.id === editingLog.id ? { ...l, note: composedNote, symptoms: [...editSymptoms] } : l);
      await updateDoc(vaccineRef, { woundLog: updated });
      setEditingLog(null);
    } catch (err) {
      console.error('Save edit failed:', err);
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = logs
    .filter(log => filter === 'all' || log.type === filter)
    .filter(log => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        log.date.toLowerCase().includes(q) ||
        log.time.toLowerCase().includes(q) ||
        (log.note && log.note.toLowerCase().includes(q)) ||
        log.symptoms.some(s => s.toLowerCase().includes(q))
      );
    });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Header Banner (Matches Appointments tab header) */}
      <View style={styles.headerMesh}>
        <View style={styles.headerTopBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtnGlass}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={19} color="#E31837" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Recovery Notes</Text>
            <Text style={styles.headerSub}>Patient Progress</Text>
          </View>
          <View style={{ width: scale(42) }} />
        </View>
      </View>

      {/* Filter and Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={scale(22)} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by date, note, or symptoms..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filterTabsRow}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              All ({logs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'wound' && styles.filterTabActive]}
            onPress={() => setFilter('wound')}
          >
            <Text style={[styles.filterTabText, filter === 'wound' && styles.filterTabTextActive]}>
              Photos ({logs.filter(l => l.type === 'wound').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'note' && styles.filterTabActive]}
            onPress={() => setFilter('note')}
          >
            <Text style={[styles.filterTabText, filter === 'note' && styles.filterTabTextActive]}>
              Notes ({logs.filter(l => l.type === 'note').length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main List */}
      <ScrollView style={styles.scrollList} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#E31837" />
            <Text style={styles.loadingText}>Loading recovery notes...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="alert-circle" size={32} color="#EF4444" />
            <Text style={styles.emptyTitle}>{error}</Text>
          </View>
        ) : filteredLogs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="journal-outline" size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Entries Found</Text>
            <Text style={styles.emptySub}>
              {searchQuery || filter !== 'all' ? 'Try adjusting your search query or filter.' : 'Logged photos and recovery notes will appear here.'}
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredLogs.map((log, idx) => (
              <TouchableOpacity
                key={log.id}
                style={[styles.timelineRow, idx === filteredLogs.length - 1 && styles.timelineRowLast]}
                onPress={() => setViewingLog(log)}
                activeOpacity={0.6}
              >
                {/* Type Icon */}
                <View style={styles.iconBox}>
                  <Ionicons
                    name={log.type === 'wound' ? 'camera-outline' : 'document-text-outline'}
                    size={scale(24)}
                    color="#64748B"
                  />
                </View>

                {/* Date & Time Title + Preview */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateTitle} numberOfLines={1}>{log.date} · {log.time}</Text>
                  {log.note ? (
                    <Text style={styles.noteSnippet} numberOfLines={1}>{log.note}</Text>
                  ) : log.photoUrl ? (
                    <Text style={styles.photoSnippet}>Wound photo attached</Text>
                  ) : (
                    <Text style={styles.noteSnippetEmpty}>No additional text</Text>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={scale(22)} color="#C4CDD8" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Log Detail Modal */}
      <Modal visible={!!viewingLog} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { padding: 0, overflow: 'hidden' }]}>
            {/* Dark Navy / Blue Header */}
            <LinearGradient
              colors={['#0F172A', '#1E293B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalBlueHeader}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.modalBlueHeaderTitle}>{viewingLog?.date} · {viewingLog?.time}</Text>
                <Text style={styles.modalBlueHeaderSub}>
                  {viewingLog?.type === 'wound' ? 'Wound Photo Update' : 'Recovery Note'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewingLog(null)} style={styles.modalBlueCloseBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            <View style={{ padding: scale(20) }}>
              {/* maxHeight was capping this below the height a full-width
                  square photo needs (aspectRatio: 1), clipping the bottom of
                  the image. modalSheet's own maxHeight (below) now bounds the
                  overall popup instead, so this only needs to scroll long note
                  text, not fight the photo for vertical space. */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: verticalScale(560) }}>
                {viewingLog?.photoUrl && (
                  <Image source={{ uri: viewingLog.photoUrl }} style={styles.detailImage} resizeMode="contain" />
                )}

                {viewingLog?.note ? (
                  <Text style={styles.detailNoteText}>{viewingLog.note}</Text>
                ) : null}

                {viewingLog?.symptoms && viewingLog.symptoms.length > 0 ? (
                  <View style={styles.symptomsWrap}>
                    <Text style={styles.symptomsTitle}>Symptoms Logged</Text>
                    <View style={styles.chipsRow}>
                      {viewingLog.symptoms.map(s => (
                        <View key={s} style={styles.symptomChip}>
                          <Text style={styles.symptomChipText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.modalFooterRow}>
                <TouchableOpacity
                  style={styles.modalDeleteBtn}
                  onPress={() => viewingLog && deleteLog(viewingLog.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalEditBtn}
                  onPress={() => viewingLog && openEdit(viewingLog)}
                >
                  <Ionicons name="create-outline" size={15} color="#334155" />
                  <Text style={styles.modalEditText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Entry Modal */}
      <Modal visible={!!editingLog} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { padding: 0, overflow: 'hidden' }]}>
              {/* Dark Navy / Blue Header */}
              <LinearGradient
                colors={['#0F172A', '#1E293B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalBlueHeader}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalBlueHeaderTitle}>Edit Log Entry</Text>
                  <Text style={styles.modalBlueHeaderSub}>Update symptoms or notes</Text>
                </View>
                <TouchableOpacity onPress={() => setEditingLog(null)} style={styles.modalBlueCloseBtn} activeOpacity={0.8}>
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </LinearGradient>

              <View style={{ padding: scale(20) }}>
                <Text style={styles.symptomsTitle}>Symptoms</Text>
                <View style={[styles.chipsRow, { marginTop: verticalScale(8), marginBottom: verticalScale(14) }]}>
                  {SYMPTOMS_LIST.map(sym => (
                    <TouchableOpacity
                      key={sym}
                      style={[styles.editChip, editSymptoms.includes(sym) && styles.editChipActive]}
                      onPress={() => toggleEditSymptom(sym)}
                    >
                      <Text style={[styles.editChipText, editSymptoms.includes(sym) && styles.editChipTextActive]}>{sym}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.symptomsTitle}>Details</Text>
                <TextInput
                  style={styles.editTextArea}
                  placeholder="Add details..."
                  multiline
                  value={editDesc}
                  onChangeText={setEditDesc}
                />

                <View style={styles.modalFooterRow}>
                  <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingLog(null)}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.editSaveBtn, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.editSaveText}>Save Changes</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F6' },
  headerMesh: {
    position: 'relative',
    paddingTop: verticalScale(60),
    paddingBottom: verticalScale(16),
    paddingHorizontal: scale(20),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4FA',
  },
  headerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(12),
  },
  backBtnGlass: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    backgroundColor: 'rgba(227, 24, 55, 0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Matches the Appointments tab header (moderateScale 21 / 13).
  headerSub: {
    color: '#94A3B8',
    fontSize: moderateScale(13),
    fontWeight: '500',
    marginTop: verticalScale(3),
    textAlign: 'center',
  },
  headerTitle: {
    color: '#1E293B',
    fontSize: moderateScale(21),
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },

  filterSection: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(10),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: scale(10),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: scale(14),
    paddingHorizontal: scale(14),
    height: verticalScale(56),
    gap: scale(10),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(15),
    color: '#0F172A',
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  filterTabsRow: { flexDirection: 'row', gap: scale(8) },
  filterTab: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderRadius: scale(12),
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#FFF1F3',
    borderColor: '#FECDD3',
  },
  filterTabText: { fontSize: moderateScale(13.5), fontWeight: '600', color: '#64748B' },
  filterTabTextActive: { color: '#E31837', fontWeight: '800' },

  scrollList: { flex: 1 },
  scrollContent: { padding: scale(20) },
  centerBox: { alignItems: 'center', paddingVertical: verticalScale(40), gap: scale(10) },
  loadingText: { fontSize: moderateScale(13), color: '#64748B', fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    padding: scale(30),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: verticalScale(20),
  },
  emptyTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#0F172A', marginTop: verticalScale(10) },
  emptySub: { fontSize: moderateScale(12), color: '#64748B', textAlign: 'center', marginTop: verticalScale(4), lineHeight: moderateScale(17) },

  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(16),
    gap: scale(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  timelineRowLast: { borderBottomWidth: 0 },
  iconBox: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(12),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  dateTitle: { fontSize: moderateScale(15.5), fontWeight: '800', color: '#0F172A' },
  noteSnippet: { fontSize: moderateScale(13.5), color: '#64748B', marginTop: verticalScale(3), fontWeight: '500' },
  noteSnippetEmpty: { fontSize: moderateScale(13.5), color: '#94A3B8', marginTop: verticalScale(3), fontWeight: '500', fontStyle: 'italic' },
  photoSnippet: { fontSize: moderateScale(13.5), color: '#E31837', marginTop: verticalScale(3), fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  modalSheet: { width: '100%', maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: scale(24), padding: scale(20) },
  modalBlueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(11),
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    gap: scale(12),
  },
  modalBlueHeaderTitle: {
    fontSize: moderateScale(14),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modalBlueHeaderSub: {
    fontSize: moderateScale(10.5),
    color: '#94A3B8',
    marginTop: verticalScale(1),
    fontWeight: '500',
  },
  modalBlueCloseBtn: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: verticalScale(14) },
  modalDateTitle: { fontSize: moderateScale(19), fontWeight: '800', color: '#0F172A' },
  modalTypeSub: { fontSize: moderateScale(12), color: '#64748B', marginTop: verticalScale(2), fontWeight: '500' },
  modalCloseBtn: { width: scale(30), height: scale(30), borderRadius: scale(15), backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  detailImage: { width: '100%', aspectRatio: 1, borderRadius: scale(14), marginBottom: verticalScale(12), backgroundColor: '#F1F5F9' },
  detailNoteText: { fontSize: moderateScale(14), color: '#0F172A', lineHeight: moderateScale(20), marginBottom: verticalScale(12) },
  symptomsWrap: { marginBottom: verticalScale(12) },
  symptomsTitle: { fontSize: moderateScale(11.5), fontWeight: '700', color: '#64748B', marginBottom: verticalScale(6) },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6) },
  symptomChip: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: scale(8), paddingVertical: verticalScale(3), borderRadius: scale(6) },
  symptomChipText: { fontSize: moderateScale(10.5), fontWeight: '700', color: '#334155' },
  modalFooterRow: { flexDirection: 'row', gap: scale(8), marginTop: verticalScale(10) },
  modalDeleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: scale(38),
    height: scale(38),
    borderRadius: scale(10),
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalEditBtn: {
    // Takes the width the removed Close button used to occupy.
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
    height: scale(38),
    paddingHorizontal: scale(14),
    borderRadius: scale(10),
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalEditText: { fontSize: moderateScale(12), fontWeight: '700', color: '#334155' },

  editChip: { paddingHorizontal: scale(11), paddingVertical: verticalScale(6), borderRadius: scale(10), backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  editChipActive: { backgroundColor: '#F1F5F9', borderColor: '#334155' },
  editChipText: { fontSize: moderateScale(11.5), color: '#475569', fontWeight: '700' },
  editChipTextActive: { fontSize: moderateScale(11.5), color: '#0F172A', fontWeight: '800' },
  editTextArea: { backgroundColor: '#F8FAFC', borderRadius: scale(14), padding: scale(12), height: verticalScale(86), fontSize: moderateScale(11.5), color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginTop: verticalScale(8), lineHeight: moderateScale(17) },
  editCancelBtn: { flex: 1, height: scale(38), borderRadius: scale(10), backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  editCancelText: { fontSize: moderateScale(12.5), fontWeight: '800', color: '#475569' },
  editSaveBtn: { flex: 1, height: scale(38), borderRadius: scale(10), backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  editSaveText: { fontSize: moderateScale(12.5), fontWeight: '800', color: '#FFF' },
});
