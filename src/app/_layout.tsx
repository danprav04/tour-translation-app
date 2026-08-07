import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SettingsProvider } from '@/context/SettingsContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BugReportButton from '@/components/BugReportButton';

import { registerGlobals } from '@livekit/react-native';

registerGlobals();

// Import early to register the Notifee foreground service handler
import '@/services/foregroundService';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0A0E1A' },
            animation: 'fade',
          }}
        />
        <BugReportButton />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
