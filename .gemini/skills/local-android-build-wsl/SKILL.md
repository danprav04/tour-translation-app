---
name: local-android-build-wsl
description: >-
  Instructions for performing a local Android EAS or Gradle build on a Windows machine by utilizing WSL to bypass Windows-specific CMake/Ninja errors and EAS limitations.
---

# Local Android Build in WSL

## Overview
This skill provides the exact workflow required to successfully build an Android APK (using Expo EAS or Gradle) on a Windows host. It bypasses the common `ninja: error: manifest 'build.ninja' still dirty after 100 tries` C++ compilation bug in `react-native-reanimated` and the EAS CLI limitation that prevents local Android builds on Windows.

## Workflow

### 1. Identify Windows Environment
If the user requests a local Android build (`eas build --local` or `gradlew assembleRelease`) and the OS is Windows, immediately inform them that Windows direct builds may fail due to C++ compilation issues and EAS limitations. Switch to using WSL (Windows Subsystem for Linux).

### 2. Verify WSL Android SDK Setup
Before building, ensure WSL has the Android SDK installed.
- Check Java: `wsl java -version`
- Check Android SDK: `wsl bash -ic "echo \$ANDROID_HOME"`
If the SDK is missing, you must install the Android Command Line Tools, platform-tools, platforms, build-tools, cmake, and ndk inside WSL, and add `ANDROID_HOME` to `~/.bashrc`.

### 3. Disable Android Lint
Android Lint often crashes or fails the release build unnecessarily.
Modify `android/app/build.gradle` to add:
```gradle
android {
    ...
    lintOptions {
        abortOnError false
    }
}
```

### 4. Trigger the Build in WSL
Run the build command entirely within WSL. Ensure you use an interactive shell so `~/.bashrc` is sourced (which contains `ANDROID_HOME`).
Example for EAS:
```powershell
wsl bash -ic "npx eas-cli build --platform android --profile production --local"
```
Example for standard gradle build:
```powershell
wsl bash -ic "cd android && ./gradlew assembleRelease"
```

## Common Mistakes
- **Running `eas build --local` in PowerShell**: EAS CLI explicitly blocks Android local builds on Windows.
- **Ignoring the Ninja dirty manifest error**: Do not try to repeatedly `clean` the gradle build on Windows if you hit the Ninja timestamp bug; switch to WSL immediately.
- **Forgetting `-ic` in WSL**: If you just run `wsl bash -c`, it won't load `ANDROID_HOME` from `~/.bashrc`, causing the build to fail with "SDK location not found".
