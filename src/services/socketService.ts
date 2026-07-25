import { io, Socket } from 'socket.io-client';

export interface ListenerInfo {
  id: string;
  name: string;
  joinedAt: string;
}

class SocketService {
  private socket: Socket | null = null;

  connect(serverUrl: string): void {
    if (this.socket) {
      this.disconnect();
    }
    this.socket = io(serverUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  createRoom(): Promise<{ roomCode: string; roomId: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not connected'));
      
      this.socket.emit('create-room', (response: { success: boolean; roomCode: string; roomId: string; error?: string }) => {
        if (response.success) {
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

      this.socket.emit('join-room', { roomCode, deviceName }, (response: { success: boolean; roomId: string; listenerId: string; error?: string }) => {
        if (response.success) {
          resolve({ success: response.success, roomId: response.roomId, listenerId: response.listenerId });
        } else {
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  }

  sendAudioChunk(data: ArrayBuffer, sampleRate: number): void {
    if (this.socket && this.socket.connected) {
      this.socket.volatile.emit('audio-chunk', data, sampleRate);
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

  onAudioData(callback: (data: ArrayBuffer, sampleRate: number) => void): void {
    if (this.socket) {
      this.socket.on('audio-data', callback);
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

  onRenamed(callback: (newName: string) => void): void {
    if (this.socket) {
      this.socket.on('renamed', callback);
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  removeAllListeners(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}

export default new SocketService();
