import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SettingsProvider } from '@/context/SettingsContext';
import { DebugProvider } from '@/context/DebugContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox } from 'react-native';
import BugReportButton from '@/components/BugReportButton';

import { registerGlobals } from '@livekit/react-native';

registerGlobals();

// Ignore the common NativeEventEmitter warnings from older native modules
LogBox.ignoreLogs([
  '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method.',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method.',
]);

// Import early to register the Notifee foreground service handler
import '@/services/foregroundService';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <DebugProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0A0E1A' },
              animation: 'fade',
            }}
          />
          <BugReportButton />
        </DebugProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
