// Standalone Metro entry for responsive UI checks. No backend or real data:
// every record below is simulated.
//   /ui-fixture                  dose timeline table
//   /ui-fixture?fixture=cards    vaccination card (both faces, inline and
//                                pop-up), Previous Treatments and each past
//                                treatment's card for a PEP,
//                                a PrEP and a new-service (Tetanus) patient
import { registerRootComponent } from 'expo';
import React, { createRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import DoseTable from '../components/DoseTable';
import PreviousTreatments from '../components/PreviousTreatments';
import VaccinationCard from '../components/VaccinationCard';
import { buildCardData, historicalRecord, treatmentRange } from '../utils/cardData';

const TODAY = '2026-10-10';

function TimelineFixture() {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: '#F4F6FA' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 20 }}>PEP Dose Timeline</Text>
      <View>
        <DoseTable today={TODAY} record={{ route: 'ID' }} doses={[
          { id: '1', label: 'Session 1 (Day 0)', brand: 'Speeda (PVRV Rabies Vaccine)', date: '2026-09-16', done: true },
          { id: '2', label: 'Session 2 (Day 3)', brand: 'Verorab (PVRV Rabies Vaccine)', date: '2026-09-19', done: true },
          { id: '3', label: 'Session 3 (Day 7)', date: '2026-10-10', done: false },
          { id: '4', label: 'Session 4 (Day 28)', date: '2026-10-14', done: false },
        ]} />
      </View>
    </ScrollView>
  );
}

const pepHistory = {
  service: 'PEP', date: '2025-03-02', status: 'completed', completedAt: '2025-03-30', cat: 'III', animal: 'Dog',
  woundLocation: 'SIMULATED-WOUND-LOCATION', woundDepth: 'SIMULATED-WOUND-DEPTH',
  doses: [{ status: 'done' }, { status: 'done' }, { status: 'done' }, { status: 'done' }],
};
const prepHistory = {
  service: 'PrEP', date: '2025-11-08', status: 'completed', closedAt: Date.parse('2025-11-30T04:00:00Z'),
  doses: [{ s: 'done' }, { s: 'done' }],
};

export const FIXTURE_PATIENTS = [
  {
    key: 'pep', mrn: '2026-901',
    record: {
      name: 'Juan Simulated Dela Cruz', dob: '1990-04-12', age: 36, sex: 'Male', contact: '+639170000001', service: 'PEP',
      date: '2026-09-16', typeOfExposure: 'Bite', animal: 'Dog', cat: 'III', numberOfBites: '2', woundWashed: 'Yes',
      woundLocation: 'SIMULATED-WOUND-LOCATION', woundDepth: 'SIMULATED-WOUND-DEPTH', notes: 'SIMULATED-INTERNAL-REMARK',
      pastVaccines: 'None', allergies: 'Penicillin', status: 'ongoing', route: 'ID',
      doses: [
        { key: 'd1', n: 'Session 1 (Day 0)', date: '2026-09-16', status: 'done', brand: 'Speeda (PVRV Rabies Vaccine)' },
        { key: 'd2', n: 'Session 2 (Day 3)', date: '2026-09-19', status: 'done', brand: 'Verorab (PVRV Rabies Vaccine)' },
        { key: 'd3', n: 'Session 3 (Day 7)', date: '2026-09-23', status: 'pending' },
        { key: 'd4', n: 'Session 4 (Day 28)', date: '2026-10-14', status: 'pending' },
      ],
      caseHistory: [],
    },
  },
  {
    key: 'prep', mrn: '2026-902',
    record: {
      name: 'Maria Simulated Santos', dob: '1999-01-30', age: 27, sex: 'Female', contact: '+639170000002', service: 'PrEP',
      pastVaccines: 'Completed PEP (1–3 years ago)', allergies: '', status: 'ongoing',
      doses: [
        { key: 'p1', n: 'Dose 1 (Day 0)', date: '2026-10-03', status: 'done', brand: 'Rabipur (PCECV)' },
        { key: 'p2', n: 'Dose 2 (Day 7)', date: '2026-10-10', status: 'pending' },
      ],
      caseHistory: [pepHistory],
    },
  },
  {
    key: 'tetanus', mrn: '2026-903',
    record: {
      name: 'Maximiliano Simulated Concepcion-Villaseñor', dob: '1975-08-21', age: 51, sex: 'Male', contact: '+639170000003', service: 'Tetanus',
      pastVaccines: 'Others', pastVaccinesOther: 'Hepatitis B series (2019), Influenza (2025)', allergies: 'None',
      woundType: 'Puncture', lastTetanus: 'More than 10 years ago', status: 'completed', completedAt: '2026-10-01',
      doses: [
        { key: 't1', n: 'Dose 1 (Day 0)', date: '2026-09-01', status: 'done', brand: 'Tetanus Toxoid (TT)', dosage: '0.5 mL IM' },
        { key: 't2', n: 'Dose 2 (Day 28)', date: '2026-09-29', status: 'done', brand: 'Tetanus Toxoid (TT)', dosage: '0.5 mL IM' },
      ],
      caseHistory: [pepHistory, prepHistory],
    },
  },
];

function CardsFixture() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: '#F4F6FA', gap: 28 }}>
      {FIXTURE_PATIENTS.map(p => {
        const data = buildCardData({ record: p.record, mrn: p.mrn, isGuest: false, today: TODAY });
        return (
          <View key={p.key} nativeID={`patient-${p.key}`} testID={`patient-${p.key}`} style={{ gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>{p.key}</Text>
            <View testID={`inline-front-${p.key}`}><VaccinationCard variant="inline" data={data} flipped={false} frontRef={createRef()} backRef={createRef()} /></View>
            <View testID={`inline-back-${p.key}`}><VaccinationCard variant="inline" data={data} flipped frontRef={createRef()} backRef={createRef()} /></View>
            <View testID={`popup-${p.key}`}><VaccinationCard variant="popup" data={data} flipped={false} frontRef={createRef()} backRef={createRef()} /></View>
            <View testID={`history-${p.key}`}><PreviousTreatments history={p.record.caseHistory} onOpen={() => {}} /></View>
            {p.record.caseHistory.map((h: any, i: number) => {
              const past = buildCardData({ record: historicalRecord({ ...p.record, mrn: p.mrn }, h), mrn: p.mrn, isGuest: false, today: TODAY, tag: `PREVIOUS TREATMENT · ${treatmentRange(h)}` });
              return (
                <View key={i} style={{ gap: 12 }}>
                  <View testID={`past-front-${p.key}-${i}`}><VaccinationCard variant="inline" data={past} flipped={false} frontRef={createRef()} backRef={createRef()} /></View>
                  <View testID={`past-back-${p.key}-${i}`}><VaccinationCard variant="inline" data={past} flipped frontRef={createRef()} backRef={createRef()} /></View>
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const mode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('fixture') : null;
registerRootComponent(mode === 'cards' ? CardsFixture : TimelineFixture);
