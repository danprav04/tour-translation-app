import { io, Socket } from 'socket.io-client';
import BackgroundTimer from 'react-native-background-timer';

export interface ListenerInfo {
  id: string;
  name: string;
  joinedAt: string;
}

class SocketService {
  private socket: Socket | null = null;
  private currentRoomCode: string | null = null;
  private currentListenerId: string | null = null;
  private currentDeviceName: string | null = null;
  private currentArchitecture: string | null = null;
  private isHostRole: boolean = false;
  private backgroundPingInterval: number | null = null;

  private outgoingSeq: number = 0;
  public lastChunkSentAt: number = 0;
  public lastChunkReceivedAt: number = 0;

  connect(serverUrl: string): void {
    if (this.socket) {
      this.disconnect();
    }
    this.outgoingSeq = 0;
    this.socket = io(serverUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.startBackgroundPing();
    });

    this.socket.on('disconnect', () => {
      this.stopBackgroundPing();
    });

    this.socket.io.on('reconnect', () => {
      // Automatically rejoin or recreate room on socket reconnect
      if (this.isHostRole && this.currentRoomCode) {
        this.socket?.emit('create-room', { 
          existingRoomCode: this.currentRoomCode,
          architecture: this.currentArchitecture
        });
      } else if (!this.isHostRole && this.currentRoomCode && this.currentListenerId) {
        this.socket?.emit('join-room', { 
          roomCode: this.currentRoomCode, 
          deviceName: this.currentDeviceName, 
          existingListenerId: this.currentListenerId 
        });
      }
    });
  }

  private startBackgroundPing() {
    this.stopBackgroundPing();
    // Send a manual ping every 20 seconds to keep connection alive when backgrounded
    this.backgroundPingInterval = BackgroundTimer.setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping'); // or engine.io ping
      }
    }, 20000);
  }

  private stopBackgroundPing() {
    if (this.backgroundPingInterval !== null) {
      BackgroundTimer.clearInterval(this.backgroundPingInterval);
      this.backgroundPingInterval = null;
    }
  }

  disconnect(): void {
    this.stopBackgroundPing();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentRoomCode = null;
    this.currentListenerId = null;
    this.isHostRole = false;
    this.outgoingSeq = 0;
    this.lastChunkSentAt = 0;
    this.lastChunkReceivedAt = 0;
  }

  createRoom(options?: { architecture?: string }): Promise<{ roomCode: string; roomId: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not connected'));
      
      const timeout = setTimeout(() => reject(new Error('Connection timed out. Check your server URL and network.')), 10000);

      this.socket.emit('create-room', { architecture: options?.architecture || 'legacy' }, (response: { success: boolean; roomCode: string; roomId: string; error?: string }) => {
        clearTimeout(timeout);
        if (response.success) {
          this.currentRoomCode = response.roomCode;
          this.currentArchitecture = options?.architecture || 'legacy';
          this.isHostRole = true;
          this.outgoingSeq = 0;
          resolve({ roomCode: response.roomCode, roomId: response.roomId });
        } else {
          reject(new Error(response.error || 'Failed to create room'));
        }
      });
    });
  }

  joinRoom(roomCode: string, deviceName: string): Promise<{ success: boolean; roomId: string; listenerId: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not connected'));

      const timeout = setTimeout(() => reject(new Error('Connection timed out. Check your server URL and network.')), 10000);

      this.socket.emit('join-room', { roomCode, deviceName }, (response: { success: boolean; roomId: string; listenerId: string; error?: string }) => {
        clearTimeout(timeout);
        if (response.success) {
          this.currentRoomCode = roomCode;
          this.currentListenerId = response.listenerId;
          this.currentDeviceName = deviceName;
          this.isHostRole = false;
          resolve({ success: response.success, roomId: response.roomId, listenerId: response.listenerId });
        } else {
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  }

  sendAudioChunk(data: ArrayBuffer, sampleRate: number, isReliable: boolean = false): void {
    if (this.socket && this.socket.connected) {
      this.outgoingSeq += 1;
      this.lastChunkSentAt = Date.now();
      const timestamp = Date.now();
      
      if (isReliable) {
        this.socket.emit('audio-chunk', data, sampleRate, this.outgoingSeq, timestamp);
      } else {
        this.socket.volatile.emit('audio-chunk', data, sampleRate, this.outgoingSeq, timestamp);
      }
    }
  }

  kickListener(listenerId: string): void {
    if (this.socket) {
      this.socket.emit('kick-listener', { listenerId });
    }
  }

  renameListener(listenerId: string, newName: string): void {
    if (this.socket) {
      this.socket.emit('rename-listener', { listenerId, newName });
    }
  }

  onAudioData(callback: (data: ArrayBuffer, sampleRate: number, seq: number, timestamp: number) => void): void {
    if (this.socket) {
      this.socket.on('audio-data', (data: ArrayBuffer, sampleRate: number, seq: number, timestamp: number) => {
        this.lastChunkReceivedAt = Date.now();
        callback(data, sampleRate, seq, timestamp);
      });
    }
  }

  onListenerJoined(callback: (listener: ListenerInfo) => void): void {
    if (this.socket) {
      this.socket.on('listener-joined', callback);
    }
  }

  onListenerLeft(callback: (listenerId: string) => void): void {
    if (this.socket) {
      this.socket.on('listener-left', (data: { listenerId: string }) => {
        callback(data.listenerId);
      });
    }
  }

  onListenerRenamed(callback: (data: { listenerId: string; newName: string }) => void): void {
    if (this.socket) {
      this.socket.on('listener-renamed', callback);
    }
  }

  onRoomClosed(callback: () => void): void {
    if (this.socket) {
      this.socket.on('room-closed', callback);
    }
  }

  onKicked(callback: () => void): void {
    if (this.socket) {
      this.socket.on('kicked', callback);
    }
  }

  onRenamed(callback: (data: { newName: string }) => void): void {
    if (this.socket) {
      this.socket.on('renamed', callback);
    }
  }

  refreshConnection(): void {
    if (this.socket && this.socket.connected) {
      console.log('[SocketService] Refreshing connection (transport-level reconnect)...');
      // Force transport-level reconnect. Socket.IO will automatically reconnect
      // and the existing 'reconnect' handler will re-join the room.
      (this.socket.io as any).engine?.close();
    }
  }

  sendHealthCheck(nonce: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('health-check', { nonce });
    }
  }

  onHealthCheckAck(callback: (data: { nonce: string; timestamp: number; roomActive: boolean }) => void): void {
    if (this.socket) {
      this.socket.on('health-check-ack', callback);
    }
  }

  requestResync(roomCode: string): Promise<{ hostConnected: boolean; hostStreaming: boolean; listenerCount: number }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not connected'));
      const timeout = setTimeout(() => reject(new Error('Resync request timed out')), 10000);
      this.socket.emit('request-resync', { roomCode }, (response: { hostConnected: boolean; hostStreaming: boolean; listenerCount: number }) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  off(event: string): void {
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

export default new SocketService();
