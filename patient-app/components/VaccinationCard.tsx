// The patient's vaccination record card: front (identity + dose table) and
// back (exposure / clinical profile + treatment), used inline on Home (3D
// flip), in the Enlarge pop-up (rotated landscape) and for a previous
// treatment.
//
// Sizes are the card's original ones (before 1.0.5): padding, logo, fonts,
// field rows and table cells match the pre-1.0.5 index.tsx styles. Both faces
// render at ONE height, set by the front: each face's content is measured and
// the taller one (the front, in practice) sets the height; the back lays its
// fields out three to a row so they fit inside it, top-aligned. The ViewShot
// inside each face has that same fixed size, so the exported front and back
// images are identical in size. Nothing is clipped: if a back ever held more
// than the front (very long typed history), the card grows to fit rather
// than cut it off.
import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import { moderateScale, scale, verticalScale } from '../utils/scale';

const NAVY = '#1E3A8A';

export type CardField = { label: string; value: string; flex?: number; accent?: boolean };
export type CardRow = CardField[];
export type CardDoseRow = { key: string; label: string; vaccine: string; date: string; status: string };
export type CardData = {
  frontTitle: string;
  frontSubtitle: string;
  backTitle: string;
  backSubtitle: string;
  frontRows: CardRow[];
  backRows: CardRow[];
  doses: CardDoseRow[];
  /** On both faces of a previous treatment's card, e.g. "PREVIOUS TREATMENT · Mar 2 – Mar 30, 2025". */
  tag?: string;
  /** The clinic's note for the patient (patient-facing field), or '' for none. */
  notes: string;
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

// ── Original sizes ────────────────────────────────────────────────────────
// inline: the pre-1.0.5 cdcOfficialCardPaper / cdcHeader* / cdcField* /
// cdcTable* styles; popup: their *Popup counterparts (card width scale(580)).
type Sizes = ReturnType<typeof sizesFor>;
function sizesFor(variant: 'inline' | 'popup') {
  const p = variant === 'popup';
  return {
    pad: scale(p ? 14 : 10),
    radius: scale(p ? 16 : 14),
    logoW: scale(p ? 52 : 44),
    logoH: verticalScale(p ? 52 : 44),
    logoGap: scale(p ? 8 : 6),
    clinic: moderateScale(p ? 10.5 : 9.5),
    title: moderateScale(p ? 13.5 : 11),
    titleLine: moderateScale(p ? 17 : 14),
    titleMargin: verticalScale(p ? 1 : 1.5),
    sub: moderateScale(p ? 10 : 8.5),
    subLine: moderateScale(p ? 12 : 10.5),
    ruleH: verticalScale(p ? 1.5 : 1),
    ruleGap: verticalScale(p ? 5 : 3),
    headerGap: verticalScale(3),
    rowPad: verticalScale(3),
    rowGap: scale(p ? 8 : 6),
    label: moderateScale(p ? 9.5 : 8),
    labelSpacing: p ? 0.3 : 0.2,
    value: moderateScale(p ? 13 : 10),
    valueGap: verticalScale(p ? 1 : 2),
    tableTop: verticalScale(p ? 5 : 4),
    tableRadius: scale(p ? 6 : 5),
    th: moderateScale(p ? 10 : 9),
    thPadX: scale(p ? 8 : 6),
    thPadY: verticalScale(p ? 5 : 3.5),
    td: moderateScale(p ? 11 : 9.5),
    tdPadX: scale(p ? 8 : 6),
    tdPadY: verticalScale(p ? 4.5 : 3.5),
    tag: moderateScale(p ? 9.5 : 8),
  };
}

// ── One face's content ────────────────────────────────────────────────────
function Header({ v, title, subtitle, tag }: { v: Sizes; title: string; subtitle: string; tag?: string }) {
  return (
    <View style={{ marginBottom: v.headerGap }}>
      {tag ? (
        <View style={st.tag}>
          <Text style={[st.tagTxt, { fontSize: v.tag }]}>{tag}</Text>
        </View>
      ) : null}
      <View style={[st.headerRow, { gap: v.logoGap }]}>
        <Image source={LOGO_KA} style={{ width: v.logoW, height: v.logoH }} resizeMode="contain" accessibilityLabel="K&A Clinic logo" />
        <View style={st.headerText}>
          <Text style={[st.clinic, { fontSize: v.clinic }]}>K&A ANIMAL BITE CENTER & CLINIC</Text>
          <Text style={[st.title, { fontSize: v.title, lineHeight: v.titleLine, marginVertical: v.titleMargin }]}>{title}</Text>
          <Text style={[st.subtitle, { fontSize: v.sub, lineHeight: v.subLine }]}>{subtitle}</Text>
        </View>
        <Image source={LOGO_LIBON} style={{ width: v.logoW, height: v.logoH }} resizeMode="contain" accessibilityLabel="Municipality of Libon seal" />
      </View>
      <View style={[st.rule, { height: v.ruleH, marginTop: v.ruleGap }]} />
    </View>
  );
}

function Rows({ v, rows }: { v: Sizes; rows: CardRow[] }) {
  return (
    <>
      {rows.map((row, i) => (
        <View key={i} style={[st.fieldsRow, { paddingVertical: v.rowPad, gap: v.rowGap }]}>
          {row.map(f => (
            <View key={f.label} style={[st.fieldBox, { flex: f.flex ?? 1 }]}>
              <Text style={[st.fieldLabel, { fontSize: v.label, letterSpacing: v.labelSpacing }]}>{f.label}</Text>
              <Text style={[st.fieldValue, { fontSize: v.value, marginTop: v.valueGap }, f.accent && { color: NAVY }]}>{f.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// Original columns: Dose 1.1 · Vaccine/Dosage 2.1 · Date 1.1. Status (kept
// from 1.0.5) is only as wide as its short labels ("Given", "Upcoming"); the
// width it frees goes to Dose so "Session 1 (Day 0)" stays on one line.
const COLS = [1.75, 1.5, 1.1, 0.8];

function Front({ v, d }: { v: Sizes; d: CardData }) {
  return (
    <View>
      <Header v={v} title={d.frontTitle} subtitle={d.frontSubtitle} tag={d.tag} />
      <Rows v={v} rows={d.frontRows} />
      <View style={[st.table, { marginTop: v.tableTop, borderRadius: v.tableRadius }]}>
        <View style={st.tableHead}>
          {['Dose', 'Vaccine / Dosage', 'Date', 'Status'].map((h, i) => (
            <Text key={h} style={[st.th, { fontSize: v.th, flex: COLS[i], paddingHorizontal: v.thPadX, paddingVertical: v.thPadY }, i === 3 && st.lastCell]}>{h}</Text>
          ))}
        </View>
        {d.doses.map((r, idx) => (
          <View key={r.key} style={[st.tr, idx % 2 === 1 && st.trAlt]}>
            {[r.label, r.vaccine, r.date, r.status].map((c, i) => (
              <Text key={i} style={[st.td, { fontSize: v.td, flex: COLS[i], paddingHorizontal: v.tdPadX, paddingVertical: v.tdPadY }, i === 0 && st.tdStrong, i === 1 && st.tdMid, i === 3 && st.lastCell]}>{c}</Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// Clinical Notes: a bordered box under the profile rows that fills the rest
// of the back. Long notes are cut at a fixed number of lines so they can never
// change the card's size; the enlarged card shows more lines, and the hint
// points there when a note is cut.
function NotesBox({ v, text, variant, onContent }: { v: Sizes; text: string; variant: 'inline' | 'popup'; onContent: (h: number) => void }) {
  const [cut, setCut] = useState(false);
  const maxLines = variant === 'popup' ? 8 : 3;
  return (
    <View style={[st.notesBox, { marginTop: v.tableTop, padding: v.rowGap, borderRadius: v.tableRadius }]}>
      <View onLayout={e => onContent(e.nativeEvent.layout.height)}>
        <Text style={[st.fieldLabel, { fontSize: v.label, letterSpacing: v.labelSpacing }]}>Clinical Notes</Text>
        <Text
          testID="notes-text"
          style={[st.notesTxt, { fontSize: v.value * 0.95, lineHeight: v.value * 1.35, marginTop: v.valueGap }, !text && st.notesEmpty]}
          numberOfLines={maxLines}
          onTextLayout={e => setCut(!!text && e.nativeEvent.lines.length >= maxLines && text.length > 40)}
        >
          {text || 'No clinical notes'}
        </Text>
        {cut && variant === 'inline' ? <Text style={[st.notesHint, { fontSize: v.label }]}>Tap Enlarge Card to read more.</Text> : null}
      </View>
    </View>
  );
}

function Back({ v, d, variant, onTop, onNotes }: { v: Sizes; d: CardData; variant: 'inline' | 'popup'; onTop: (h: number) => void; onNotes: (h: number) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <View onLayout={e => onTop(e.nativeEvent.layout.height)}>
        <Header v={v} title={d.backTitle} subtitle={d.backSubtitle} tag={d.tag} />
        <Rows v={v} rows={d.backRows} />
      </View>
      <NotesBox v={v} text={d.notes} variant={variant} onContent={onNotes} />
    </View>
  );
}

// ── The card ──────────────────────────────────────────────────────────────
export default function VaccinationCard({ variant, data, flipped, frontRef, backRef }: Props) {
  const v = sizesFor(variant);
  const { width: winW, height: winH } = useWindowDimensions();
  const [frontH, setFrontH] = useState(0);
  // The back's natural height: header + rows, plus the notes box at its
  // content height (the box then stretches to fill the shared height).
  const [backTop, setBackTop] = useState(0);
  const [notesContent, setNotesContent] = useState(0);
  const notesChrome = v.tableTop + v.rowGap * 2 + 2;
  const backH = backTop > 0 && notesContent > 0 ? backTop + notesContent + notesChrome : 0;
  const measured = frontH > 0 && backH > 0;
  // Inner (ViewShot) height shared by both faces: the front's, unless the
  // back would otherwise be clipped.
  const inner = Math.ceil(Math.max(frontH, backH));
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

  const keep = (set: React.Dispatch<React.SetStateAction<number>>) => (h: number) => set(p => (Math.abs(p - h) < 0.5 ? p : h));
  const face = (side: 'front' | 'back') => {
    const onBody = (e: LayoutChangeEvent) => keep(setFrontH)(e.nativeEvent.layout.height);
    const hidden = side === 'front' ? flipped : !flipped;
    return (
      <Animated.View
        key={side}
        pointerEvents={hidden ? 'none' : 'auto'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        testID={`card-${variant}-${side}`}
        style={[st.paper, { padding: v.pad, borderRadius: v.radius }, measured && { height: outer }, side === 'front' ? frontStyle : backStyle]}
      >
        <ViewShot ref={side === 'front' ? frontRef : backRef} options={{ format: 'png', quality: 1 }}
          style={[st.shot, measured && { height: inner }]}>
          <View testID={`shot-${variant}-${side}`} style={StyleSheet.absoluteFill} pointerEvents="none" />
          {side === 'front'
            ? <View onLayout={onBody}><Front v={v} d={data} /></View>
            : <Back v={v} d={data} variant={variant} onTop={keep(setBackTop)} onNotes={keep(setNotesContent)} />}
        </ViewShot>
      </Animated.View>
    );
  };

  if (variant === 'inline') {
    return (
      // Until both faces report their height, a typical card height holds the
      // space so the sections below do not jump.
      <View style={[st.inlineBox, { height: measured ? outer : verticalScale(300), opacity: measured ? 1 : 0 }]}>
        {face('front')}
        {face('back')}
      </View>
    );
  }

  // Pop-up: the original landscape card (scale(580) wide) turned -90°, scaled
  // down as a whole (text keeps its proportions) only when the phone is too
  // small to show it at full size.
  const cardW = scale(580);
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
  // No shadow/elevation (as originally): during the 3D flip Android draws the
  // elevation shadow for both faces, so the hidden pane's shadow bleeds through.
  paper: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden',
  },
  shot: { backgroundColor: '#FFFFFF' },
  notesBox: { flexGrow: 1, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  notesTxt: { fontWeight: '600', color: '#0F172A' },
  notesEmpty: { color: '#94A3B8', fontStyle: 'italic', fontWeight: '500' },
  notesHint: { color: '#2563EB', fontWeight: '700', marginTop: verticalScale(2) },
  tag: { alignSelf: 'center', backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1, borderRadius: scale(6), paddingHorizontal: scale(8), paddingVertical: verticalScale(2), marginBottom: verticalScale(4) },
  tagTxt: { fontWeight: '800', color: '#92400E', letterSpacing: 0.3, textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  clinic: { fontWeight: '900', color: NAVY, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: verticalScale(1), textAlign: 'center' },
  title: { fontWeight: '900', color: '#0F172A', letterSpacing: 0.1, textAlign: 'center' },
  subtitle: { color: '#475569', textAlign: 'center' },
  rule: { backgroundColor: '#1E3A5F' },
  fieldsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  fieldBox: { justifyContent: 'flex-end', minWidth: 0 },
  fieldLabel: { fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  fieldValue: { fontWeight: '800', color: '#0F172A' },
  table: { width: '100%', borderWidth: 1, borderColor: '#1E3A5F', overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: '#1E3A5F', borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  th: { fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.3, borderRightWidth: 1, borderRightColor: '#334155' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  trAlt: { backgroundColor: '#F8FAFC' },
  td: { color: '#334155', borderRightWidth: 1, borderRightColor: '#CBD5E1' },
  tdStrong: { fontWeight: '700', color: '#0F172A' },
  tdMid: { fontWeight: '600' },
  lastCell: { borderRightWidth: 0 },
});
