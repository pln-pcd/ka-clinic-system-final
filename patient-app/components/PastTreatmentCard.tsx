import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import Tap from './Tap';
import VaccinationCard, { CardData } from './VaccinationCard';
import { serviceCopy } from '../utils/patientRecord';
import { moderateScale, scale, verticalScale, GUTTER } from '../utils/scale';

// One previous treatment's vaccination card, front and back, with the same
// card component, size and flip as the current card on Home. The card itself
// carries a "PREVIOUS TREATMENT · start – end" tag (also on the exported
// images), so it cannot be mistaken for the current card. Export saves the
// side that is showing; both sides export at the same size.

type Props = {
  visible: boolean;
  data: CardData | null;
  service?: string;
  range?: string;
  onClose: () => void;
  /** Saves the captured image; resolves once saved, rejects on failure. */
  onExport: (uri: string, side: 'front' | 'back') => Promise<void>;
};

export default function PastTreatmentCard({ visible, data, service, range, onClose, onExport }: Props) {
  const insets = useSafeAreaInsets();
  const [flipped, setFlipped] = useState(false);
  const [exporting, setExporting] = useState(false);
  const frontRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const backRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  useEffect(() => { if (visible) setFlipped(false); }, [visible]);

  const exportSide = async () => {
    const ref = flipped ? backRef : frontRef;
    if (!ref.current?.capture || exporting) return;
    setExporting(true);
    try { await onExport(await ref.current.capture(), flipped ? 'back' : 'front'); }
    finally { setExporting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + verticalScale(10) }]}>
        <View style={s.header}>
          <Tap onPress={onClose} style={s.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to Home">
            <Ionicons name="chevron-back" size={22} color="#1E293B" />
          </Tap>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.kicker}>PREVIOUS TREATMENT</Text>
            <Text style={s.title}>{serviceCopy(service).long}</Text>
            {range ? <Text style={s.range}>{range}</Text> : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + verticalScale(24) }}>
          {data && (
            <Tap activeOpacity={0.96} onPress={() => setFlipped(f => !f)} clip={false} style={{ width: '100%' }}
              accessibilityRole="button" accessibilityLabel={flipped ? 'Previous treatment card, back side. Tap to show the front.' : 'Previous treatment card, front side. Tap to show the back.'}>
              <VaccinationCard variant="inline" data={data} flipped={flipped} frontRef={frontRef} backRef={backRef} />
            </Tap>
          )}
          <Text style={s.hint}>{flipped ? 'Showing Back · Tap the card to flip' : 'Showing Front · Tap the card to flip'}</Text>

          <View style={s.actions}>
            <Tap style={s.secondary} onPress={() => setFlipped(f => !f)} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="swap-horizontal" size={16} color="#1E3A8A" />
              <Text style={s.secondaryTxt}>{flipped ? 'Show Front' : 'Show Back'}</Text>
            </Tap>
            <Tap style={[s.secondary, exporting && { opacity: 0.6 }]} onPress={exportSide} disabled={exporting} activeOpacity={0.85} accessibilityRole="button"
              accessibilityLabel={`Export the ${flipped ? 'back' : 'front'} of this card`}>
              {exporting ? <ActivityIndicator size="small" color="#1E3A8A" /> : <Ionicons name="download-outline" size={16} color="#1E3A8A" />}
              <Text style={s.secondaryTxt}>Export {flipped ? 'Back' : 'Front'}</Text>
            </Tap>
          </View>

          <Tap style={s.primary} onPress={onClose} activeOpacity={0.85} accessibilityRole="button">
            <Ionicons name="home-outline" size={17} color="#FFFFFF" />
            <Text style={s.primaryTxt}>Back to Home</Text>
          </Tap>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2F6' },
  header: { flexDirection: 'row', alignItems: 'center', gap: scale(12), paddingHorizontal: GUTTER, paddingBottom: verticalScale(14) },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: moderateScale(10.5), fontWeight: '800', color: '#92400E', letterSpacing: 0.6 },
  title: { fontSize: moderateScale(17), fontWeight: '900', color: '#1E293B', marginTop: verticalScale(2) },
  range: { fontSize: moderateScale(12.5), color: '#64748B', fontWeight: '600', marginTop: verticalScale(2) },
  hint: { textAlign: 'center', fontSize: moderateScale(11.5), fontWeight: '700', color: '#2563EB', marginTop: verticalScale(4) },
  actions: { flexDirection: 'row', gap: scale(10), marginTop: verticalScale(16) },
  secondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), minHeight: 46, borderRadius: scale(14), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEAFE', overflow: 'hidden' },
  secondaryTxt: { fontSize: moderateScale(13), fontWeight: '700', color: '#1E3A8A' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), minHeight: 50, borderRadius: scale(14), backgroundColor: '#1E3A8A', marginTop: verticalScale(12), overflow: 'hidden' },
  primaryTxt: { fontSize: moderateScale(14), fontWeight: '800', color: '#FFFFFF' },
});
