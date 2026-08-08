<div align="center">
  <h1>🎙️ TourCast</h1>
  <p>Live Audio Broadcasting & AI Translation App for Tour Guides and Audiences</p>
</div>

---

## 📖 Overview

**TourCast** is a real-time audio broadcasting application built with React Native (Expo). It empowers tour guides, translators, or presenters to seamlessly stream live audio to their audience's devices with ultra-low latency. 

Recently supercharged with **AI Real-Time Translation** powered by the Gemini 3.5 Live Translate API, the app allows listeners to hear the tour in their preferred language natively using on-device Text-to-Speech (TTS). Listeners can simply join a session by scanning a QR code or entering a unique 6-character room code, completely bypassing the need for specialized radio hardware.

---

## ✨ Features

- **🤖 AI Real-Time Translation:** Powered by the Gemini 3.5 Live API, seamlessly translating the host's live speech into the listener's target language.
- **🗣️ Native Text-to-Speech (TTS):** Translated text is played back to the listener using native device TTS for a natural listening experience.
- **📡 Dual-Mode Streaming:** 
  - **LiveKit (Default):** Ultra-low latency WebRTC audio streaming for robust global delivery.
  - **Socket.IO (Legacy):** WebSocket-based streaming as a fallback mechanism.
- **🔒 Room-based Sessions:** Securely create distinct rooms with unique 6-character access codes.
- **📷 QR Code Onboarding:** Frictionless joining experience for listeners via in-app QR code scanning.
- **👥 Audience Management:** Hosts can view connected listeners, monitor connection health, rename devices, or kick disruptive users.
- **🎵 Background Playback:** Listeners can keep hearing the broadcast even while using other apps or locking their screens.
- **📱 Cross-Platform:** High-performance mobile client for both iOS and Android platforms built with Expo and React Native.

---

## 🛠️ Tech Stack

### Mobile Client (Frontend)
- **Framework:** React Native 0.86 / Expo 57
- **Routing:** Expo Router (File-based navigation)
- **Streaming:** `@livekit/react-native` (WebRTC) and `socket.io-client` (Legacy)
- **AI Translation:** Google Gemini API (`models/gemini-3.5-live-translate-preview`)
- **Audio & TTS:** `expo-audio` (Capture and background playback), Native TTS
- **Camera/Scanning:** `expo-camera` / `react-native-qrcode-svg`
- **Styling:** NativeWind / TailwindCSS
- **Language:** TypeScript

### Signaling Server (Backend)
- **Framework:** Node.js / Express.js
- **Real-time Engine:** Socket.IO
- **Functions:** LiveKit token generation, legacy audio relay, and room management.
- **Containerization:** Docker & Docker Compose

---

## 📂 Project Structure

```text
tour-translation-app/
├── server/                 # Express backend (LiveKit auth & Socket.IO signaling)
│   ├── index.js            # Main server entrypoint
│   ├── Dockerfile          # Docker configuration for production deployment
│   └── docker-compose.yml  # Docker Compose for local orchestration
├── src/                    # Mobile app source code
│   ├── app/                # Expo Router screens (index, host, listener, stream, settings)
│   ├── components/         # Reusable React components (UI, StatusBadge, AudioVisualizer)
│   ├── context/            # Global state management
│   ├── hooks/              # Custom React hooks (useHost, useListener, useTTS)
│   └── services/           # LiveKit, Socket, Audio, and Gemini Translation services
├── app.json                # Expo configuration file
└── package.json            # Project dependencies and scripts
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Docker](https://www.docker.com/) (Optional, for running the backend)
- [Expo Go](https://expo.dev/go) or a configured Simulator/Emulator

### 1. Setup the Backend Server

The backend is required for generating LiveKit tokens and handling legacy Socket.IO streaming.

**Option A: Run Locally (Node)**
```bash
cd server
npm install
npm start
```
*The server will start on port 3000.*

**Option B: Run with Docker**
```bash
cd server
docker-compose up -d
```

### 2. Setup the Mobile App

Open a new terminal window at the root of the project.

```bash
# Install dependencies
npm install

# Start the Expo development server
npx expo start
```

Press `a` to open the app on an Android Emulator, `i` for an iOS Simulator, or scan the QR code in the terminal using the Expo Go app on your physical device.

### 3. Configure Gemini AI Translation

To use the live AI translation features:
1. Open the app and navigate to **Settings**.
2. Enter your **Google Gemini API Key**.
3. (Optional) Toggle between LiveKit and Legacy WebSockets if needed.

*(Note: Real-time audio capture requires a physical device for the host. Ensure the mobile app is pointing to your local machine's IP address if testing on a physical phone.)*

---

## 🕹️ Usage

1. **Host a Tour:** Tap "Host a Tour" on the home screen. A room will be created with a unique 6-letter code and a QR code will be displayed.
2. **Join a Tour:** 
   - Tap "Join a Tour".
   - Either enter the 6-letter room code manually or use your camera to scan the host's QR code.
   - Listeners can select their desired target language for real-time translation.
3. **Manage Listeners:** As a host, tap on any listener in your audience list to rename them or remove them from the session. You can also monitor their connection health.
4. **End Session:** The host can disconnect at any time, which will automatically close the room for all listeners.

---

## 📄 License

This project is open-source and available under the standard MIT License. See the [LICENSE](LICENSE) file for more information.
