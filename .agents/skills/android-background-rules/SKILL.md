---
name: android-background-rules
description: Rules and anti-patterns for implementing background execution in Expo/React Native Android apps.
---

# Android Background Execution Rules

When implementing or modifying background tasks, keep-alive mechanisms, or foreground services for Android in this React Native/Expo app, **you must adhere to the following rules:**

## 1. Do NOT use Silent Audio Keep-Alive
- **Prohibited:** Playing a silent audio file (or raw PCM buffer) on a loop to prevent the Android OS from reclaiming the audio session or killing the app.
- **Reason:** As of Android 14+, the OS Phantom Process Killer and aggressive battery managers will detect this as abuse and hard-kill the app with a `SecurityException` or similar uncatchable termination.
- **Alternative:** Use proper Foreground Services (`react-native-background-actions`) with the correct service types declared in `AndroidManifest.xml` (e.g., `dataSync`, `microphone`, `mediaPlayback`).

## 2. Do NOT rely on RAM-only Logging for Critical Diagnostics
- **Prohibited:** Storing debug logs, events, or state exclusively in memory (RAM).
- **Reason:** When Android battery optimization kills the app, the memory is wiped. The resulting bug reports will contain empty state data, making it impossible to diagnose the crash.
- **Alternative:** Periodically flush critical state (like timestamps of last successful heartbeat, active session state) to disk using `AsyncStorage` or similar persistent storage, so it can be retrieved on the next cold start.

## 3. Explicit Foreground Service Types
- **Rule:** Every foreground service must declare an explicit `foregroundServiceType` in the Android Manifest.
- **Reason:** Missing or mismatched service types will cause a fatal exception on Android 14+.

## 4. CPU Wake Locks
- **Rule:** If the app needs to process data (like WebSockets) while the screen is off, a `PARTIAL_WAKE_LOCK` must be acquired.
- **Implementation:** This should be handled via the foreground service library (e.g., `react-native-background-actions`), not manually unless absolutely necessary.
