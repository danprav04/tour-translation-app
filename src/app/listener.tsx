import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSettingsContext } from '@/context/SettingsContext';
import GlassCard from '@/components/GlassCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCANNER_SIZE = SCREEN_WIDTH - 80;

export default function ListenerScreen() {
  const router = useRouter();
  const { settings, updateSettings } = useSettingsContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [roomCode, setRoomCode] = useState('');
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleConnect = (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      Alert.alert('Invalid Code', 'Please enter a valid room code.');
      return;
    }
    updateSettings({ lastRoomCode: trimmed });
    router.push(`/stream?roomCode=${trimmed}`);
  };

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const parsed = JSON.parse(data);
      if (parsed.roomCode) {
        handleConnect(parsed.roomCode);
        return;
      }
    } catch {
      // Not JSON, treat as plain room code
    }
    // Try as plain code
    if (data.includes('join=')) {
      const code = data.split('join=')[1]?.split('&')[0];
      if (code) {
        handleConnect(code);
        return;
      }
    }
    handleConnect(data);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={16}>
            <Text style={styles.backBtn}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Join Session</Text>
          <View style={styles.placeholder} />
        </View>

        {/* QR Scanner */}
        {showScanner ? (
          <View style={styles.scannerSection}>
            {permission?.granted ? (
              <View style={styles.scannerWrapper}>
                <CameraView
                  style={styles.scanner}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
                />
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerCornerTL} />
                  <View style={styles.scannerCornerTR} />
                  <View style={styles.scannerCornerBL} />
                  <View style={styles.scannerCornerBR} />
                </View>
              </View>
            ) : (
              <GlassCard padding={32}>
                <View style={styles.permissionContainer}>
                  <Text style={styles.permissionText}>
                    Camera access is needed to scan QR codes
                  </Text>
                  <Pressable
                    onPress={requestPermission}
                    style={styles.permissionBtn}
                  >
                    <Text style={styles.permissionBtnText}>Grant Permission</Text>
                  </Pressable>
                </View>
              </GlassCard>
            )}
            <Pressable
              onPress={() => {
                setShowScanner(false);
                setScanned(false);
              }}
              style={styles.cancelScanBtn}
            >
              <Text style={styles.cancelScanText}>Cancel Scan</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Scan QR Button */}
            <GlassCard
              variant="secondary"
              onPress={() => {
                setScanned(false);
                setShowScanner(true);
              }}
              style={styles.scanCard}
            >
              <View style={styles.scanCardContent}>
                <Text style={styles.scanIcon}>📷</Text>
                <Text style={styles.scanTitle}>Scan QR Code</Text>
                <Text style={styles.scanDesc}>
                  Point your camera at the host's QR code
                </Text>
              </View>
            </GlassCard>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Manual Code */}
            <GlassCard style={styles.manualSection}>
              <Text style={styles.manualTitle}>Enter Room Code</Text>
              <TextInput
                style={styles.codeInput}
                value={roomCode}
                onChangeText={(text) => setRoomCode(text.toUpperCase())}
                placeholder="Enter code"
                placeholderTextColor="rgba(255,255,255,0.2)"
                autoCapitalize="characters"
                maxLength={8}
                textAlign="center"
              />
              <Pressable
                onPress={() => handleConnect(roomCode)}
                style={({ pressed }) => [
                  styles.connectBtn,
                  !roomCode.trim() && styles.connectBtnDisabled,
                  pressed && styles.pressed,
                ]}
                disabled={!roomCode.trim()}
              >
                <Text style={styles.connectBtnText}>Connect</Text>
              </Pressable>
            </GlassCard>

            {/* Last Session */}
            {settings.lastRoomCode ? (
              <GlassCard
                onPress={() => handleConnect(settings.lastRoomCode)}
                style={styles.lastSession}
              >
                <View style={styles.lastSessionContent}>
                  <View>
                    <Text style={styles.lastSessionLabel}>Last Session</Text>
                    <Text style={styles.lastSessionCode}>
                      {settings.lastRoomCode}
                    </Text>
                  </View>
                  <Text style={styles.reconnectArrow}>→</Text>
                </View>
              </GlassCard>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backBtn: {
    color: '#7C5CFC',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  placeholder: {
    width: 60,
  },
  scannerSection: {
    alignItems: 'center',
    flex: 1,
  },
  scannerWrapper: {
    width: SCANNER_SIZE,
    height: SCANNER_SIZE,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  scanner: {
    width: '100%',
    height: '100%',
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scannerCornerTL: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#7C5CFC',
    borderTopLeftRadius: 8,
  },
  scannerCornerTR: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#7C5CFC',
    borderTopRightRadius: 8,
  },
  scannerCornerBL: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#7C5CFC',
    borderBottomLeftRadius: 8,
  },
  scannerCornerBR: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#7C5CFC',
    borderBottomRightRadius: 8,
  },
  cancelScanBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelScanText: {
    color: '#FF4757',
    fontSize: 15,
    fontWeight: '600',
  },
  scanCard: {
    marginBottom: 24,
  },
  scanCardContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  scanIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  scanTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  scanDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    marginTop: 6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 16,
  },
  manualSection: {
    marginBottom: 20,
  },
  manualTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 18,
    paddingHorizontal: 20,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 6,
    marginBottom: 16,
  },
  connectBtn: {
    backgroundColor: '#7C5CFC',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  connectBtnDisabled: {
    opacity: 0.4,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  lastSession: {
    marginTop: 4,
  },
  lastSessionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastSessionLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },
  lastSessionCode: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 2,
  },
  reconnectArrow: {
    color: '#7C5CFC',
    fontSize: 28,
    fontWeight: '300',
  },
  permissionContainer: {
    alignItems: 'center',
  },
  permissionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionBtn: {
    backgroundColor: '#7C5CFC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
