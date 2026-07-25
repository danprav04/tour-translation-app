<div align="center">
  <h1>🎙️ TourCast</h1>
  <p>Live Audio Broadcasting App for Tour Guides and Audiences</p>
</div>

---

## 📖 Overview

**TourCast** is a real-time audio broadcasting application built with React Native (Expo) and a Node.js/Socket.IO backend. It empowers tour guides, translators, or presenters to seamlessly stream live audio to their audience's devices with ultra-low latency. 

Listeners can simply join a session by scanning a QR code or entering a unique 6-character room code, completely bypassing the need for specialized radio hardware.

---

## ✨ Features

- **📡 Live Audio Streaming:** Broadcast crisp, low-latency audio using WebSockets (Socket.IO).
- **🔒 Room-based Sessions:** Securely create distinct rooms with unique 6-character access codes.
- **📷 QR Code Onboarding:** Frictionless joining experience for listeners via in-app QR code scanning.
- **👥 Audience Management:** Hosts can view connected listeners, rename devices for clarity, or kick disruptive users.
- **🎵 Background Playback:** Listeners can keep hearing the broadcast even while using other apps or locking their screens.
- **📱 Cross-Platform:** High-performance mobile client for both iOS and Android platforms built with Expo.

---

## 🛠️ Tech Stack

### Mobile Client (Frontend)
- **Framework:** React Native / Expo
- **Routing:** Expo Router (File-based navigation)
- **Audio:** `expo-audio` (Capture and background playback)
- **Camera/Scanning:** `expo-camera` / `react-native-qrcode-svg`
- **Styling:** NativeWind / TailwindCSS (or similar via `global.css`)
- **Language:** TypeScript

### Signaling Server (Backend)
- **Framework:** Node.js / Express.js
- **Real-time Engine:** Socket.IO
- **Containerization:** Docker & Docker Compose

---

## 📂 Project Structure

```text
tour-translation-app/
├── server/                 # Express & Socket.IO backend for signaling
│   ├── index.js            # Main server entrypoint
│   ├── Dockerfile          # Docker configuration for production deployment
│   └── docker-compose.yml  # Docker Compose for local orchestration
├── src/                    # Mobile app source code
│   ├── app/                # Expo Router screens (index, host, listener, settings)
│   ├── components/         # Reusable React components
│   ├── context/            # Global state management
│   ├── hooks/              # Custom React hooks
│   └── services/           # Socket and API services
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

You can run the server natively or via Docker.

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

*(Note: Real-time audio capture requires a physical device for the host. Ensure the mobile app is pointing to your local machine's IP address if testing on a physical phone.)*

---

## 🕹️ Usage

1. **Host a Tour:** Tap "Host a Tour" on the home screen. A room will be created with a unique 6-letter code and a QR code will be displayed.
2. **Join a Tour:** 
   - Tap "Join a Tour".
   - Either enter the 6-letter room code manually or use your camera to scan the host's QR code.
3. **Manage Listeners:** As a host, tap on any listener in your audience list to rename them or remove them from the session.
4. **End Session:** The host can disconnect at any time, which will automatically close the room for all listeners.

---

## 📄 License

This project is open-source and available under the standard MIT License. See the [LICENSE](LICENSE) file for more information.
