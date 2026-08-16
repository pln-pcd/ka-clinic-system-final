// Placeholder desktop layout for the web build. The patient app has no
// dedicated desktop experience yet — this stands in until one is designed.
import { StyleSheet, Text, View } from 'react-native';

export default function DesktopApp() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>K&A Rabies Monitoring</Text>
      <Text style={styles.subtitle}>Desktop view is not built yet.</Text>
      <Text style={styles.hint}>Append ?view=mobile to the URL, or press Alt+M, to preview the mobile app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    color: '#888',
  },
});
