import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SettingsProvider } from '@/context/SettingsContext';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0E1A' },
          animation: 'fade',
        }}
      />
    </SettingsProvider>
  );
}
