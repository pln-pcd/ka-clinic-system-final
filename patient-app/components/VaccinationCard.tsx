// The patient's vaccination record card: front (identity + dose table) and
// back (exposure / clinical profile + treatment status), used inline on Home
// (3D flip) and in the Enlarge pop-up (rotated landscape).
//
// Both faces always render at ONE height: each face's natural content is
// measured, the taller one sets the height, and the shorter face fills it with
// its footer pinned to the bottom. The ViewShot inside each face has that
// same fixed size, so exported front and back images are identical in size.
// Nothing is clipped: the height grows with the content instead.
import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const NAVY = '#1E3A8A';

export type CardField = { label: string; value: string; accent?: boolean; wide?: boolean };
export type CardDoseRow = { key: string; label: string; vaccine: string; date: string; status: string };
export type CardData = {
  frontTitle: string;
  backTitle: string;
  backSubtitle: string;
  lastName: string;
  firstName: string;
  mi: string;
  dob: string;
  mrn: string;
  purpose: string;
  /** Exposure category on the front, PEP only (null hides it). */
  category: string | null;
  doses: CardDoseRow[];
  /** Back side: exposure fields (PEP only), then the profile and treatment. */
  exposure: CardField[];
  profile: CardField[];
  treatment: CardField[];
};

type ShotRef = React.RefObject<React.ComponentRef<typeof ViewShot> | null>;

type Props = {
  variant: 'inline' | 'popup';
  data: CardData;
  flipped: boolean;
  frontRef: ShotRef;
  backRef: ShotRef;
};

const LOGO_KA = require('../assets/logo-white-nobg.png');
const LOGO_LIBON = require('../assets/libon-seal.png');

// ── One face's content ────────────────────────────────────────────────────
function Header({ v, title, subtitle }: { v: Sizes; title: string; subtitle: string }) {
  return (
    <View>
      <View style={[st.headerRow, { gap: v.headerGap }]}>
        <Image source={LOGO_KA} style={{ width: v.logo, height: v.logo }} resizeMode="contain" accessibilityLabel="K&A Clinic logo" />
        <View style={st.headerText}>
          <Text style={[st.clinic, { fontSize: v.clinic, lineHeight: v.clinic * 1.25 }]}>K&A ANIMAL BITE CENTER & CLINIC</Text>
          <Text style={[st.title, { fontSize: v.title, lineHeight: v.title * 1.3 }]}>{title}</Text>
          <Text style={[st.subtitle, { fontSize: v.sub, lineHeight: v.sub * 1.3 }]}>{subtitle}</Text>
        </View>
        <Image source={LOGO_LIBON} style={{ width: v.logo, height: v.logo }} resizeMode="contain" accessibilityLabel="Municipality of Libon seal" />
      </View>
      <View style={[st.rule, { marginVertical: v.ruleGap }]} />
    </View>
  );
}

function Fields({ v, fields }: { v: Sizes; fields: CardField[] }) {
  if (!fields.length) return null;
  return (
    <View style={st.fieldGrid}>
      {fields.map(f => (
        <View key={f.label} style={[st.field, { paddingVertical: v.fieldPad, flexBasis: f.wide ? '100%' : '46%' }]}>
          <Text style={[st.fieldLabel, { fontSize: v.label }]}>{f.label}</Text>
          <Text style={[st.fieldValue, { fontSize: v.value }, f.accent && { color: NAVY }]}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionLabel({ v, children }: { v: Sizes; children: string }) {
  return <Text style={[st.section, { fontSize: v.label, marginTop: v.ruleGap * 1.5 }]}>{children}</Text>;
}

function Front({ v, d }: { v: Sizes; d: CardData }) {
  const identity: CardField[] = [
    { label: 'Last Name', value: d.lastName },
    { label: 'First Name', value: d.firstName },
    { label: 'MI', value: d.mi },
    { label: 'Date of Birth', value: d.dob },
    { label: 'Patient Number (MRN)', value: d.mrn, wide: true },
    { label: 'Vaccination Purpose', value: d.purpose, wide: d.category === null },
    ...(d.category !== null ? [{ label: 'Exposure Category', value: d.category, accent: true }] : []),
  ];
  return (
    <View>
      <Header v={v} title={d.frontTitle} subtitle="Official Prophylaxis & Immunization Record" />
      <Fields v={v} fields={identity} />
      <View style={[st.table, { marginTop: v.ruleGap * 1.5 }]}>
        <View style={st.tableHead}>
          {['Dose', 'Vaccine / Dosage', 'Date', 'Status'].map((h, i) => (
            <Text key={h} style={[st.th, { fontSize: v.th, flex: COLS[i], paddingHorizontal: v.cellPadX, paddingVertical: v.cellPadY }, i === 3 && st.lastCell]}>{h}</Text>
          ))}
        </View>
        {d.doses.map((r, idx) => (
          <View key={r.key} style={[st.tr, idx % 2 === 1 && st.trAlt]}>
            {[r.label, r.vaccine, r.date, r.status].map((c, i) => (
              <Text key={i} style={[st.td, { fontSize: v.td, flex: COLS[i], paddingHorizontal: v.cellPadX, paddingVertical: v.cellPadY }, i === 0 && st.tdStrong, i === 3 && st.lastCell]}>{c}</Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
const COLS = [1.15, 1.9, 1.15, 1.1];

function Back({ v, d }: { v: Sizes; d: CardData }) {
  return (
    <View>
      <Header v={v} title={d.backTitle} subtitle={d.backSubtitle} />
      {d.exposure.length > 0 && (<><SectionLabel v={v}>Exposure</SectionLabel><Fields v={v} fields={d.exposure} /></>)}
      <SectionLabel v={v}>Patient Profile</SectionLabel>
      <Fields v={v} fields={d.profile} />
      <SectionLabel v={v}>Treatment</SectionLabel>
      <Fields v={v} fields={d.treatment} />
    </View>
  );
}

function Footer({ v, onLayout }: { v: Sizes; onLayout: (e: LayoutChangeEvent) => void }) {
  return (
    <View onLayout={onLayout} style={[st.footer, { paddingTop: v.ruleGap * 2 }]}>
      <Text style={[st.footerTxt, { fontSize: v.label }]}>K&A Animal Bite Center & Clinic · Libon, Albay</Text>
    </View>
  );
}

// ── Sizes per variant ─────────────────────────────────────────────────────
type Sizes = ReturnType<typeof sizesFor>;
function sizesFor(variant: 'inline' | 'popup') {
  const p = variant === 'popup';
  return {
    pad: scale(p ? 16 : 12),
    logo: scale(p ? 54 : 42),
    headerGap: scale(p ? 10 : 6),
    // Clinic name: was moderateScale(9.5) inline / (10.5) pop-up; now larger
    // and allowed to wrap between the two logos.
    clinic: moderateScale(p ? 12 : 10.5),
    title: moderateScale(p ? 13.5 : 11),
    sub: moderateScale(p ? 10 : 8.5),
    label: moderateScale(p ? 9.5 : 8),
    value: moderateScale(p ? 13 : 10),
    th: moderateScale(p ? 10 : 8.5),
    td: moderateScale(p ? 11 : 9.5),
    fieldPad: verticalScale(p ? 5 : 3.5),
    cellPadX: scale(p ? 8 : 5),
    cellPadY: verticalScale(p ? 5 : 3.5),
    ruleGap: verticalScale(p ? 5 : 3.5),
  };
}

// ── The card ──────────────────────────────────────────────────────────────
export default function VaccinationCard({ variant, data, flipped, frontRef, backRef }: Props) {
  const v = sizesFor(variant);
  const { width: winW, height: winH } = useWindowDimensions();
  const [front, setFront] = useState({ body: 0, foot: 0 });
  const [back, setBack] = useState({ body: 0, foot: 0 });
  const measured = front.body > 0 && back.body > 0;
  // Inner (ViewShot) height shared by both faces.
  const inner = Math.ceil(Math.max(front.body + front.foot, back.body + back.foot));
  const BORDER = 1;
  const outer = inner + v.pad * 2 + BORDER * 2;

  const flip = useSharedValue(flipped ? 1 : 0);
  useEffect(() => {
    flip.value = withTiming(flipped ? 1 : 0, { duration: variant === 'inline' ? 450 : 0, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  }, [flipped]);
  const frontStyle = useAnimatedStyle(() => (variant === 'inline'
    ? { transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }], backfaceVisibility: 'hidden' as const }
    : { opacity: flip.value < 0.5 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => (variant === 'inline'
    ? { transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }], backfaceVisibility: 'hidden' as const }
    : { opacity: flip.value < 0.5 ? 0 : 1 }));

  const face = (side: 'front' | 'back') => {
    const set = side === 'front' ? setFront : setBack;
    const onBody = (e: LayoutChangeEvent) => { const h = e.nativeEvent.layout.height; set(p => (Math.abs(p.body - h) < 0.5 ? p : { ...p, body: h })); };
    const onFoot = (e: LayoutChangeEvent) => { const h = e.nativeEvent.layout.height; set(p => (Math.abs(p.foot - h) < 0.5 ? p : { ...p, foot: h })); };
    const hidden = side === 'front' ? flipped : !flipped;
    return (
      <Animated.View
        key={side}
        pointerEvents={hidden ? 'none' : 'auto'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        testID={`card-${variant}-${side}`}
        style={[st.paper, { padding: v.pad, borderRadius: scale(variant === 'popup' ? 16 : 14) }, measured && { height: outer }, side === 'front' ? frontStyle : backStyle]}
      >
        <ViewShot ref={side === 'front' ? frontRef : backRef} options={{ format: 'png', quality: 1 }}
          style={[st.shot, measured && { height: inner }]}>
          <View testID={`shot-${variant}-${side}`} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View onLayout={onBody}>{side === 'front' ? <Front v={v} d={data} /> : <Back v={v} d={data} />}</View>
          <View style={st.spacer} />
          <Footer v={v} onLayout={onFoot} />
        </ViewShot>
      </Animated.View>
    );
  };

  if (variant === 'inline') {
    return (
      // Until both faces report their height, a typical card height holds the
      // space so the sections below do not jump.
      <View style={[st.inlineBox, { height: measured ? outer : verticalScale(330), opacity: measured ? 1 : 0 }]}>
        {face('front')}
        {face('back')}
      </View>
    );
  }

  // Pop-up: a landscape card turned -90°, scaled down as a whole (text keeps
  // its proportions) only when the phone is too small to show it at full size.
  const cardW = Math.min(scale(600), winH * 0.82);
  const availW = winW * 0.98 - scale(24);
  const availH = winH * 0.94 - verticalScale(200);
  const fit = measured ? Math.min(1, availW / outer, availH / cardW) : 1;
  return (
    <View style={{ width: '100%', height: cardW * fit, alignItems: 'center', justifyContent: 'center', opacity: measured ? 1 : 0 }}>
      <View style={{ width: cardW, height: measured ? outer : undefined, transform: [{ rotate: '-90deg' }, { scale: fit }] }}>
        {face('front')}
        {face('back')}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  inlineBox: { width: '100%', marginTop: verticalScale(4), marginBottom: verticalScale(8) },
  // No shadow/elevation: during the 3D flip Android draws the elevation
  // shadow for both faces, so the hidden pane's shadow bleeds through.
  paper: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden',
  },
  shot: { backgroundColor: '#FFFFFF' },
  spacer: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1, minWidth: 0, alignItems: 'center' },
  clinic: { fontWeight: '900', color: NAVY, letterSpacing: 0.4, textAlign: 'center' },
  title: { fontWeight: '900', color: '#0F172A', textAlign: 'center', marginTop: verticalScale(1) },
  subtitle: { color: '#475569', textAlign: 'center' },
  rule: { height: 1, backgroundColor: '#1E3A5F' },
  section: { fontWeight: '900', color: '#1E3A5F', letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: scale(8) },
  field: { flexGrow: 1, flexShrink: 1, minWidth: 0, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  fieldLabel: { fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.2 },
  fieldValue: { fontWeight: '800', color: '#0F172A', marginTop: verticalScale(1.5) },
  table: { borderWidth: 1, borderColor: '#1E3A5F', borderRadius: scale(5), overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: '#1E3A5F' },
  th: { fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.3, borderRightWidth: 1, borderRightColor: '#334155' },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  trAlt: { backgroundColor: '#F8FAFC' },
  td: { color: '#334155', fontWeight: '600', borderRightWidth: 1, borderRightColor: '#CBD5E1' },
  tdStrong: { fontWeight: '800', color: '#0F172A' },
  lastCell: { borderRightWidth: 0 },
  footer: { alignItems: 'center' },
  footerTxt: { fontWeight: '700', color: '#64748B', letterSpacing: 0.3, textAlign: 'center' },
});
