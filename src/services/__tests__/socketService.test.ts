import socketService from '../socketService';
import { io } from 'socket.io-client';

describe('SocketService', () => {
  let mockSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = (io as jest.Mock)();
    socketService.disconnect();
  });

  it('should connect to server', () => {
    socketService.connect('http://localhost');
    expect(io).toHaveBeenCalledWith('http://localhost', expect.any(Object));
  });

  it('should create room', async () => {
    socketService.connect('http://localhost');
    mockSocket.emit.mockImplementation((event: string, data: any, cb: Function) => {
      if (event === 'create-room') {
        cb({ success: true, roomCode: 'ROOM', roomId: '123' });
      }
    });

    const result = await socketService.createRoom();
    expect(result.roomCode).toBe('ROOM');
    expect(socketService['currentRoomCode']).toBe('ROOM');
    expect(socketService['isHostRole']).toBe(true);
  });

  it('should join room', async () => {
    socketService.connect('http://localhost');
    mockSocket.emit.mockImplementation((event: string, data: any, cb: Function) => {
      if (event === 'join-room') {
        cb({ success: true, listenerId: 'list1', roomId: '123' });
      }
    });

    const result = await socketService.joinRoom('ROOM', 'Device');
    expect(result.success).toBe(true);
    expect(socketService['currentListenerId']).toBe('list1');
  });

  it('should send audio chunks', async () => {
    socketService.connect('http://localhost');
    // fake create room to set currentRoomCode
    mockSocket.emit.mockImplementation((e: string, d: any, cb?: Function) => {
      if (e === 'create-room' && typeof cb === 'function') {
        cb({ success: true, roomCode: 'R' });
      }
    });
    await socketService.createRoom();

    socketService.sendAudioChunk(new ArrayBuffer(10), 16000, true);
    expect(mockSocket.emit).toHaveBeenCalledWith('audio-chunk', expect.any(ArrayBuffer), 0, expect.any(Number), 16000);
  });
});
