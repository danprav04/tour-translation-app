import React from 'react';
import { StyleSheet, View, Text, Pressable, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

interface QRCodeDisplayProps {
  roomCode: string;
  serverUrl: string;
}

export default function QRCodeDisplay({ roomCode, serverUrl }: QRCodeDisplayProps) {
  const joinLink = `${serverUrl}?join=${roomCode}`;
  const qrData = JSON.stringify({ action: 'join_tour', roomCode, serverUrl });

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(joinLink);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my tour session!\n\nRoom Code: ${roomCode}\n\nOr open: ${joinLink}`,
        title: 'Join Tour Session',
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <View style={styles.qrBackground}>
          <QRCode
            value={qrData}
            size={180}
            color="#0A0E1A"
            backgroundColor="#FFFFFF"
            quietZone={12}
          />
        </View>
      </View>

      <View style={styles.codeContainer}>
        <Text style={styles.codeLabel}>Room Code</Text>
        <Text style={styles.code}>{roomCode}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleCopyLink}
          style={({ pressed }) => [styles.btn, styles.copyBtn, pressed && styles.pressed]}
        >
          <Text style={styles.btnText}>📋 Copy Link</Text>
        </Pressable>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.btn, styles.shareBtn, pressed && styles.pressed]}
        >
          <Text style={styles.btnText}>📤 Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  qrWrapper: {
    padding: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.3)',
    backgroundColor: 'rgba(0,212,170,0.05)',
  },
  qrBackground: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  codeContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  codeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  code: {
    color: '#00D4AA',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  copyBtn: {
    backgroundColor: 'rgba(0,212,170,0.1)',
    borderColor: 'rgba(0,212,170,0.25)',
  },
  shareBtn: {
    backgroundColor: 'rgba(124,92,252,0.1)',
    borderColor: 'rgba(124,92,252,0.25)',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
