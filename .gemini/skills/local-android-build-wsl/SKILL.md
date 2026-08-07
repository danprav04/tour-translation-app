---
name: local-android-build
description: >-
  Instructions for performing local Android builds (both production and development variants). Includes workarounds for Windows-specific CMake/Ninja errors (using WSL) and ADB port collisions.
---

# Local Android Build & Dev Variants

## 🚨 STRICT SYSTEM RULE 🚨
**NEVER** propose or run commands to restart, shut down, or log off the user's computer (e.g., `Restart-Computer`, `Stop-Computer`, `shutdown /r`). Under no circumstances should you interrupt the user's workflow by rebooting their machine.

## Overview
This skill provides the exact workflow required to successfully build an Android APK (using Expo EAS or Gradle) on this machine. It covers both Production builds (via WSL to bypass CMake issues) and Development builds (configuring app variants and bypassing ADB collisions).

## Development Build Configuration

When creating a development build, it MUST be installable alongside the main app.
1. Use `app.config.js` to modify the app's `name` to include "(Dev)" and append `.dev` to the Android `package` when `APP_VARIANT=development` is set.
2. Use `package.json` scripts to run it: `"android:dev": "cross-env APP_VARIANT=development expo run:android"`.

## Workflow: Building the App

### Scenario A: Building the Dev Variant (Windows)
Run `npm run android:dev` in PowerShell. This runs Expo's prebuild and attempts to compile and install via ADB.
- **ADB Port Collision Issue**: If the build fails at the very end with `protocol fault` or `start-server exited with non-zero code`, it is because WSL or another background service has locked port 5037. 
  **DO NOT RESTART THE COMPUTER.** 
  The `android/` directory was already generated successfully. Instead, compile manually:
  1. `cd android`
  2. `.\gradlew.bat assembleDebug`
  3. The resulting APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Scenario B: Building Production / Release (WSL)
If the user requests a local production Android build (`eas build --local` or `gradlew assembleRelease`) and the host OS is Windows, switch to using WSL (Windows Subsystem for Linux) immediately to bypass the `ninja: error: manifest 'build.ninja' still dirty after 100 tries` C++ compilation bug.

1. **Verify WSL Setup**: 
   Ensure `wsl bash -ic "echo \$ANDROID_HOME"` returns the path.
2. **Disable Android Lint**: 
   Lint often crashes in WSL. In `android/app/build.gradle`, set `abortOnError false`.
3. **Trigger Build**:
   ```powershell
   wsl bash -ic "cd android && ./gradlew assembleRelease"
   ```

## Common Mistakes
- **Restarting the PC**: Do not try to fix ADB locks or locked directories by rebooting.
- **Running `eas build --local` in PowerShell**: EAS CLI explicitly blocks Android local builds on Windows.
- **Ignoring the Ninja dirty manifest error**: Do not repeatedly `clean` the gradle build on Windows if you hit the Ninja timestamp bug; switch to WSL immediately.
