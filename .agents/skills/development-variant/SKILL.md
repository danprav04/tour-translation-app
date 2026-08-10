---
name: development-variant
description: Rules and specifications for creating a development local build for an Expo React Native app.
---

# Development Variant Build Specifications

When creating a development build for this Expo React Native app, you must ensure it can be installed alongside the main app. 
To achieve this, the following specifications must be followed:

## 1. App Name Modification
- The app's name must be dynamically modified in `app.config.js` to include "(Dev)" when the environment variable `APP_VARIANT=development` is set.
- Example: `config.name = \`\${config.name} (Dev)\`;`

## 2. Package and Bundle Identifier Modification
- Append `.dev` to the Android `package` and iOS `bundleIdentifier` in `app.config.js` when `APP_VARIANT=development` is set.
- This ensures the dev variant can be installed on a device without overwriting the production version.

## 3. Required Scripts
The `package.json` must include development scripts that set the `APP_VARIANT` variable using `cross-env`:
- `"android:dev": "cross-env APP_VARIANT=development expo run:android"`
- `"ios:dev": "cross-env APP_VARIANT=development expo run:ios"`

## 4. ADB Port Collision Fallback
- If `npm run android:dev` fails at the end due to an ADB port collision (e.g., `protocol fault` or `start-server exited with non-zero code`), the `android/` directory was likely still generated successfully.
- **Fallback compilation**: Navigate to the `android/` directory and run `.\gradlew.bat assembleDebug` (on Windows) or `./gradlew assembleDebug` (on Mac/Linux).
- The resulting APK will be at `android/app/build/outputs/apk/debug/app-debug.apk` and will contain the correct `.dev` variant configuration.
