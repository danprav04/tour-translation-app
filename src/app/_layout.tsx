import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SettingsProvider } from '@/context/SettingsContext';
import { DebugProvider } from '@/context/DebugContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox } from 'react-native';
import BugReportButton from '@/components/BugReportButton';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { registerGlobals } from '@livekit/react-native';

registerGlobals();

// Ignore the common NativeEventEmitter warnings from older native modules
LogBox.ignoreLogs([
  '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method.',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method.',
]);

// Import early to register the Notifee foreground service handler
import '@/services/foregroundService';

import VersionCheck from '@/components/VersionCheck';

import { DatabaseProvider } from '@/context/DatabaseContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <DebugProvider>
            <DatabaseProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#0A0E1A' },
                  animation: 'fade',
                }}
              />
              <BugReportButton />
              <VersionCheck />
            </DatabaseProvider>
          </DebugProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
