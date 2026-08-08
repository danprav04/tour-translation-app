const request = require('supertest');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const fs = require('fs');

// Mock external dependencies
jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: jest.fn(),
    toJwt: jest.fn().mockResolvedValue('mocked_token'),
  })),
}));

let app, server, io;
let clientSocket, hostSocket;
let gcCallback;
let createdRoomCode = '';

beforeAll((done) => {
  // Setup FS mocks before requiring index
  jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => '{}');

  const originalSetInterval = global.setInterval;
  jest.spyOn(global, 'setInterval').mockImplementation((cb, ms) => {
    if (ms === 5 * 60 * 1000) gcCallback = cb;
    return originalSetInterval(cb, ms);
  });

  const index = require('./index');
  app = index.app;
  server = index.server;
  io = index.io;

  server.listen(0, () => {
    const port = server.address().port;
    clientSocket = new Client(`http://localhost:${port}`, { forceNew: true });
    hostSocket = new Client(`http://localhost:${port}`, { forceNew: true });
    
    let connected = 0;
    const onConnect = () => {
      connected++;
      if (connected === 2) done();
    };
    
    clientSocket.on('connect', onConnect);
    hostSocket.on('connect', onConnect);
  });
});

afterAll(() => {
  clientSocket.disconnect();
  hostSocket.disconnect();
  io.close();
  server.close();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Express Endpoints', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });

  it('should get api rooms', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.statusCode).toEqual(200);
    expect(res.body.rooms).toBeDefined();
  });

  it('should return false for non-existent room', async () => {
    const res = await request(app).get('/room/INVALID');
    expect(res.statusCode).toEqual(200);
    expect(res.body.exists).toBe(false);
  });
});

describe('Socket.IO Events', () => {
  it('should create a room', (done) => {
    hostSocket.emit('create-room', { architecture: 'legacy' }, (response) => {
      expect(response.success).toBe(true);
      expect(response.roomCode).toBeDefined();
      createdRoomCode = response.roomCode;
      done();
    });
  });

  it('should handle code generation collision', (done) => {
    const originalRandom = Math.random;
    // Force Math.random to generate exactly the same chars as the first room, once, then random
    let calls = 0;
    Math.random = () => {
      if (calls < 6) {
        calls++;
        // To precisely match the existing room, it's easier to just temporarily inject the room into `rooms` 
        // or just mock it to return 'AAAAAA' twice. But generating 'AAAAAA' requires Math.random() returning 0.
        return 0; // 'A'
      }
      return originalRandom();
    };
    
    // First create 'AAAAAA'
    hostSocket.emit('create-room', { architecture: 'legacy' }, (res1) => {
      // Then force it to generate 'AAAAAA' again initially for the second room
      calls = 0;
      hostSocket.emit('create-room', { architecture: 'legacy' }, (res2) => {
        expect(res2.roomCode).not.toBe('AAAAAA');
        Math.random = originalRandom;
        done();
      });
    });
  });

  it('should recreate an existing room', (done) => {
    hostSocket.emit('create-room', { existingRoomCode: createdRoomCode, architecture: 'webrtc' }, (response) => {
      expect(response.success).toBe(true);
      expect(response.reconnected).toBe(true);
      expect(response.roomCode).toBe(createdRoomCode);
      done();
    });
  });

  it('should get room status via HTTP', async () => {
    const res = await request(app).get(`/room/${createdRoomCode}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.architecture).toBe('webrtc');
  });

  it('should not allow listener to join webrtc room using socket join', (done) => {
    clientSocket.emit('join-room', { roomCode: createdRoomCode }, (response) => {
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/Host is using WebRTC/);
      done();
    });
  });

  let currentListenerId = '';
  it('should allow joining legacy room', (done) => {
    // Switch back to legacy
    hostSocket.emit('create-room', { existingRoomCode: createdRoomCode, architecture: 'legacy' }, () => {
      clientSocket.emit('join-room', { roomCode: createdRoomCode, deviceName: 'Test Device' }, (response) => {
        expect(response.success).toBe(true);
        expect(response.listenerId).toBeDefined();
        currentListenerId = response.listenerId;
        done();
      });
    });
  });

  it('should handle join-room without roomCode', (done) => {
    clientSocket.emit('join-room', {}, (response) => {
      expect(response.success).toBe(false);
      done();
    });
  });

  it('should handle join-room with invalid roomCode', (done) => {
    clientSocket.emit('join-room', { roomCode: 'INVALID' }, (response) => {
      expect(response.success).toBe(false);
      done();
    });
  });

  it('should handle reconnecting listener', (done) => {
    clientSocket.emit('join-room', { roomCode: createdRoomCode, existingListenerId: currentListenerId }, (response) => {
      expect(response.success).toBe(true);
      expect(response.reconnected).toBe(true);
      done();
    });
  });

  it('should handle request-resync', (done) => {
    clientSocket.emit('request-resync', { roomCode: createdRoomCode }, (response) => {
      expect(response.hostConnected).toBe(true);
      expect(response.listenerCount).toBeGreaterThanOrEqual(1);
      done();
    });
  });

  it('should handle request-resync without roomCode', (done) => {
    clientSocket.emit('request-resync', {}, (response) => {
      expect(response.hostConnected).toBe(false);
      done();
    });
  });

  it('should handle request-resync with invalid roomCode', (done) => {
    clientSocket.emit('request-resync', { roomCode: 'INVALID' }, (response) => {
      expect(response.hostConnected).toBe(false);
      done();
    });
  });

  it('should handle health-check', (done) => {
    hostSocket.once('health-check-ack', (response) => {
      expect(response.nonce).toBe('123');
      expect(response.roomActive).toBe(true);
      done();
    });
    hostSocket.emit('health-check', { nonce: '123' });
  });

  it('should handle audio-chunk broadcasting', (done) => {
    clientSocket.once('audio-data', (data, seq, ts, sr) => {
      expect(data).toBe('test-audio');
      expect(seq).toBe(1);
      done();
    });
    // Volatile events might be dropped, but locally they usually aren't.
    hostSocket.emit('audio-chunk', 'test-audio', 1, Date.now(), 48000);
  });

  it('should rename a listener', (done) => {
    clientSocket.once('renamed', (data) => {
      expect(data.newName).toBe('New Name');
      done();
    });
    hostSocket.emit('rename-listener', { listenerId: currentListenerId, newName: 'New Name' });
  });

  it('should kick a listener', (done) => {
    clientSocket.once('kicked', () => {
      done();
    });
    hostSocket.emit('kick-listener', { listenerId: currentListenerId });
  });

  it('should trigger garbage collection of rooms', () => {
    // Manually trigger the GC interval logic for test coverage
    if (gcCallback) {
      // First call, room host is still connected (from earlier tests)
      gcCallback();
      // Mock lastHostDisconnect logic
      io.sockets.sockets.get = jest.fn().mockReturnValue(null);
      gcCallback();
      // Fast forward time for the next call to trigger removal? No, Date.now() is used inside index.js.
      // So we have to mock Date.now()!
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + (15 * 60 * 1000));
      gcCallback(); // Second time without host triggers removal
      Date.now = originalNow;
    }
  });
  it('should handle listener disconnect', (done) => {
    const tempListener = new Client(`http://localhost:${server.address().port}`, { forceNew: true });
    tempListener.on('connect', () => {
      tempListener.emit('join-room', { roomCode: createdRoomCode }, () => {
        tempListener.disconnect();
        // Wait a bit for the server to process the disconnect
        setTimeout(done, 100);
      });
    });
  });

  it('should handle host disconnect', (done) => {
    const tempHost = new Client(`http://localhost:${server.address().port}`, { forceNew: true });
    tempHost.on('connect', () => {
      tempHost.emit('create-room', { architecture: 'legacy' }, (res) => {
        tempHost.disconnect();
        setTimeout(done, 100);
      });
    });
  });
});

describe('LiveKit Token Generation', () => {
  let originalEnv;
  beforeAll(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return 400 if params are missing', async () => {
    const res = await request(app).get('/api/livekit/token');
    expect(res.statusCode).toEqual(400);
  });

  it('should return 500 if missing API keys', async () => {
    const res = await request(app).get('/api/livekit/token?roomId=123&userId=456&role=host');
    expect(res.statusCode).toEqual(500);
  });
  
  it('should return token if valid credentials', async () => {
    process.env.LIVEKIT_API_KEY = 'test_key';
    process.env.LIVEKIT_API_SECRET = 'test_secret';
    process.env.LIVEKIT_URL = 'wss://test.livekit';
    const res = await request(app).get('/api/livekit/token?roomId=TESTROOM&userId=host1&role=host');
    expect(res.statusCode).toEqual(200);
    expect(res.body.token).toBe('mocked_token');
    expect(res.body.wsUrl).toBe('wss://test.livekit');
  });

  it('should fail for listener if room not found', async () => {
    process.env.LIVEKIT_API_KEY = 'test_key';
    process.env.LIVEKIT_API_SECRET = 'test_secret';
    const res = await request(app).get('/api/livekit/token?roomId=NOTFOUND&userId=listener1&role=listener');
    expect(res.statusCode).toEqual(404);
  });

  it('should fail for listener if room is legacy', (done) => {
    process.env.LIVEKIT_API_KEY = 'test_key';
    process.env.LIVEKIT_API_SECRET = 'test_secret';
    
    hostSocket.emit('create-room', { architecture: 'legacy' }, async (response) => {
      const res = await request(app).get(`/api/livekit/token?roomId=${response.roomCode}&userId=listener1&role=listener`);
      expect(res.statusCode).toEqual(403);
      done();
    });
  });

  it('should handle token generation error', async () => {
    process.env.LIVEKIT_API_KEY = 'test_key';
    process.env.LIVEKIT_API_SECRET = 'test_secret';
    const { AccessToken } = require('livekit-server-sdk');
    AccessToken.mockImplementationOnce(() => ({
      addGrant: jest.fn(),
      toJwt: jest.fn().mockRejectedValue(new Error('test error'))
    }));
    const res = await request(app).get('/api/livekit/token?roomId=TESTROOM&userId=host1&role=host');
    expect(res.statusCode).toEqual(500);
  });
});

describe('Bug Reports', () => {
  it('should get bug reports with empty file', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const res = await request(app).get('/api/bug-reports');
    expect(res.statusCode).toEqual(200);
    expect(res.body.reports).toEqual([]);
  });

  it('should get bug reports with existing file', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([{ id: 'test' }]));
    const res = await request(app).get('/api/bug-reports');
    expect(res.statusCode).toEqual(200);
    expect(res.body.reports[0].id).toBe('test');
  });

  it('should handle get bug reports error', async () => {
    jest.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('Test Error') });
    const res = await request(app).get('/api/bug-reports');
    expect(res.statusCode).toEqual(500);
  });

  it('should post bug report and enrich with server state', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    process.env.TELEGRAM_BOT_TOKEN = 'mock';
    process.env.TELEGRAM_CHAT_ID = 'mock';
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    
    const res = await request(app).post('/api/bug-reports').send({ 
      description: 'Test bug',
      debugData: { state: { host: { roomCode: createdRoomCode } } },
      deviceInfo: { brand: 'Test', modelName: 'Device' }
    });
    
    global.fetch = originalFetch;
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
  });

  it('should fallback to https request for telegram if fetch is not defined', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    process.env.TELEGRAM_BOT_TOKEN = 'mock';
    process.env.TELEGRAM_CHAT_ID = 'mock';
    const originalFetch = global.fetch;
    global.fetch = undefined; // trigger fallback
    
    const https = require('https');
    jest.spyOn(https, 'request').mockImplementation((url, options, cb) => {
      if (cb) cb({ statusCode: 200 });
      return {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };
    });

    const res = await request(app).post('/api/bug-reports').send({ description: 'Test fallback' });
    global.fetch = originalFetch;
    expect(res.statusCode).toEqual(200);
    https.request.mockRestore();
  });

  it('should handle post bug report error', async () => {
    jest.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('Test Error') });
    const res = await request(app).post('/api/bug-reports').send({});
    expect(res.statusCode).toEqual(500);
  });
});
