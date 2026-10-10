// Standalone Metro entry for responsive UI checks. No backend or real data.
import { registerRootComponent } from 'expo';
import { ScrollView, Text, View } from 'react-native';
import DoseTimeline from '../components/DoseTimeline';

function TimelineFixture() {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: '#F4F6FA' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 20 }}>PEP Dose Timeline</Text>
      <View>
        <DoseTimeline today="2026-10-10" record={{ route: 'ID' }} doses={[
          { id: '1', label: 'Session 1 (Day 0)', brand: 'Speeda (PVRV Rabies Vaccine)', date: '2026-09-16', done: true },
          { id: '2', label: 'Session 2 (Day 3)', brand: 'Verorab (PVRV Rabies Vaccine)', date: '2026-09-19', done: true },
          { id: '3', label: 'Session 3 (Day 7)', date: '2026-10-10', done: false },
          { id: '4', label: 'Session 4 (Day 28)', date: '2026-10-14', done: false },
        ]} />
      </View>
    </ScrollView>
  );
}

registerRootComponent(TimelineFixture);
