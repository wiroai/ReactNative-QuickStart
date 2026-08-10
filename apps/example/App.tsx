import { WiroKitInfo } from '@wiro-ai/wirokit-react-native';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>WIRO SDK</Text>
      <Text style={styles.title}>WiroKit React Native</Text>
      <Text style={styles.version}>Version {WiroKitInfo.version}</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#F5F7FB',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#5B6B8C',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  version: {
    color: '#4B5563',
    fontSize: 16,
    marginTop: 8,
  },
});
