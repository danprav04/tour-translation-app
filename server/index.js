const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from the public directory (for the landing page)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100 MB limit
});

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Rooms are stored in-memory as a Map
// Key: roomCode, Value: { hostSocketId, listeners: Map<socketId, {id, name, joinedAt}>, createdAt }
const rooms = new Map();

const USED_ROOM_CODES_FILE = path.join(DATA_DIR, 'used-room-codes.json');
const recentRoomCodes = new Map();
if (fs.existsSync(USED_ROOM_CODES_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(USED_ROOM_CODES_FILE, 'utf8'));
    for (const [code, timestamp] of Object.entries(data)) {
      recentRoomCodes.set(code, timestamp);
    }
  } catch (e) {
    console.error('Error reading used-room-codes.json:', e);
  }
}

function saveRecentRoomCodes() {
  const data = Object.fromEntries(recentRoomCodes);
  fs.writeFileSync(USED_ROOM_CODES_FILE, JSON.stringify(data, null, 2));
}

function markRoomCodeUsed(code) {
  recentRoomCodes.set(code, Date.now());
  saveRecentRoomCodes();
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isCodeRecentlyUsed(code) {
  const timestamp = recentRoomCodes.get(code);
  if (!timestamp) return false;
  return (Date.now() - timestamp) < SEVEN_DAYS_MS;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Garbage collect old room codes from the recentRoomCodes map
setInterval(() => {
  const now = Date.now();
  for (const [code, timestamp] of recentRoomCodes.entries()) {
    if ((now - timestamp) >= SEVEN_DAYS_MS) {
      recentRoomCodes.delete(code);
    }
  }
}, 24 * 60 * 60 * 1000); // Run daily

// HTTP endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    uptime: process.uptime(),
    minSupportedVersion: process.env.MIN_SUPPORTED_VERSION || '1.5.5'
  });
});

app.get('/room/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms.get(code);
  if (room) {
    res.json({ exists: true, listenerCount: room.listeners.size, architecture: room.architecture || 'legacy' });
  } else {
    res.json({ exists: false, listenerCount: 0 });
  }
});

app.get('/api/rooms', (req, res) => {
  const activeRooms = [];
  for (const [code, room] of rooms.entries()) {
    activeRooms.push({
      code: code,
      listenerCount: room.listeners.size,
      createdAt: room.createdAt
    });
  }
  res.json({ rooms: activeRooms });
});

const BUG_REPORTS_FILE = path.join(DATA_DIR, 'bug-reports.json');

app.post('/api/bug-reports', (req, res) => {
  try {
    const report = req.body;
    
    // Enrich with server's internal state of the room
    let serverRoomState = null;
    let targetCode = null;
    
    if (report.debugData?.state?.host?.roomCode) targetCode = report.debugData.state.host.roomCode;
    else if (report.debugData?.state?.listener?.roomCode) targetCode = report.debugData.state.listener.roomCode;
    else if (report.settings?.lastRoomCode) targetCode = report.settings.lastRoomCode;
    
    if (targetCode) {
      targetCode = targetCode.toUpperCase();
      if (rooms.has(targetCode)) {
        const r = rooms.get(targetCode);
        serverRoomState = {
          roomCode: targetCode,
          hostSocketId: r.hostSocketId,
          architecture: r.architecture,
          createdAt: r.createdAt,
          lastHostDisconnect: r.lastHostDisconnect,
          listenersCount: r.listeners.size,
          listeners: Array.from(r.listeners.entries()).map(([sid, l]) => ({
            socketId: sid,
            id: l.id,
            name: l.name,
            joinedAt: l.joinedAt
          }))
        };
      }
    }
    report.serverRoomState = serverRoomState;

    let reports = [];
    if (fs.existsSync(BUG_REPORTS_FILE)) {
      reports = JSON.parse(fs.readFileSync(BUG_REPORTS_FILE, 'utf8'));
    }
    report.id = uuidv4();
    if (!report.timestamp) report.timestamp = new Date().toISOString();
    
    // add to beginning of array so newest is first
    reports.unshift(report);
    
    fs.writeFileSync(BUG_REPORTS_FILE, JSON.stringify(reports, null, 2));

    // Forward to Telegram asynchronously
    sendToTelegram(report).catch(e => console.error('Telegram forwarding error:', e));

    res.json({ success: true, id: report.id });
  } catch (error) {
    console.error('Error saving bug report:', error);
    res.status(500).json({ error: 'Failed to save bug report' });
  }
});

app.get('/api/bug-reports', (req, res) => {
  try {
    let reports = [];
    if (fs.existsSync(BUG_REPORTS_FILE)) {
      reports = JSON.parse(fs.readFileSync(BUG_REPORTS_FILE, 'utf8'));
    }
    res.json({ reports });
  } catch (error) {
    console.error('Error reading bug reports:', error);
    res.status(500).json({ error: 'Failed to read bug reports' });
  }
});

// LiveKit Token Generation
app.get('/api/livekit/token', async (req, res) => {
  const { roomId, userId, role } = req.query;
  
  if (!roomId || !userId || !role) {
    return res.status(400).json({ error: 'Missing required parameters: roomId, userId, role' });
  }

  if (role === 'listener') {
    const code = roomId.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.architecture === 'legacy') {
      return res.status(403).json({ error: 'Host is using Legacy WebSockets. Please turn on Legacy Socket.io Mode in settings.' });
    }
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Server misconfigured: Missing LiveKit credentials' });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: userId,
      ttl: '4h', // 4 hours
    });

    const isHost = role === 'host';
    
    at.addGrant({
      roomJoin: true,
      room: roomId.toUpperCase(),
      canPublish: isHost,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    res.json({ token, wsUrl: process.env.LIVEKIT_URL });
  } catch (err) {
    console.error('Error generating LiveKit token:', err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Socket.IO Events
io.on('connection', (socket) => {
  
  socket.on('create-room', ({ existingRoomCode, architecture } = {}, callback) => {
    let roomCode = existingRoomCode;
    
    if (roomCode) {
      roomCode = roomCode.toUpperCase();
      // Reconnection case: host re-creates the same room
      if (rooms.has(roomCode)) {
        const room = rooms.get(roomCode);
        room.hostSocketId = socket.id; // Update host socket ID
        socket.roomCode = roomCode; // Set on socket for O(1) lookup
        if (architecture) {
          room.architecture = architecture;
        }
        room.lastHostDisconnect = null;
        socket.join(roomCode);
        markRoomCodeUsed(roomCode);

        // Clean stale listener entries before re-emitting
        for (const [socketId, listener] of room.listeners.entries()) {
          if (!io.sockets.sockets.has(socketId)) {
            room.listeners.delete(socketId);
            console.log(`[Room ${roomCode}] Removed stale listener ${listener.id} (socket ${socketId} no longer connected)`);
          }
        }

        // Send existing listeners to the reconnected host
        for (const listener of room.listeners.values()) {
          socket.emit('listener-joined', listener);
        }

        // Notify listeners that host has reconnected
        io.to(roomCode).emit('host-reconnected', { timestamp: Date.now() });

        if (typeof callback === 'function') {
          callback({ success: true, roomCode, roomId: roomCode, reconnected: true });
        }
        return;
      }
    } else {
      roomCode = generateRoomCode();
      while (rooms.has(roomCode) || isCodeRecentlyUsed(roomCode)) {
        roomCode = generateRoomCode();
      }
    }
    
    rooms.set(roomCode, {
      hostSocketId: socket.id,
      architecture: architecture || 'legacy',
      listeners: new Map(),
      createdAt: Date.now(),
      lastHostDisconnect: null,
      lastAudioTimestamp: null
    });
    
    socket.roomCode = roomCode;
    socket.join(roomCode);
    markRoomCodeUsed(roomCode);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode, roomId: roomCode, reconnected: false });
    }
  });

  socket.on('join-room', ({ roomCode, deviceName, existingListenerId, architecture }, callback) => {
    if (!roomCode) {
      if (typeof callback === 'function') callback({ success: false, error: 'Missing room code' });
      return;
    }

    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }

    if (room.architecture && room.architecture !== 'legacy') {
      if (typeof callback === 'function') callback({ success: false, error: 'Host is using WebRTC. Please turn off Legacy Socket.io Mode in settings.' });
      return;
    }

    // Check if listener is reconnecting
    let isReconnecting = false;
    let listenerInfo;

    if (existingListenerId) {
      for (const [sId, listener] of room.listeners.entries()) {
        if (listener.id === existingListenerId) {
          isReconnecting = true;
          listenerInfo = listener;
          room.listeners.delete(sId); // Remove old socket id mapping
          break;
        }
      }
    }

    if (!listenerInfo) {
      listenerInfo = {
        id: uuidv4(),
        name: deviceName || 'Anonymous',
        joinedAt: new Date().toISOString()
      };
    }
    
    room.listeners.set(socket.id, listenerInfo);
    socket.roomCode = code;
    socket.join(code);
    
    if (!isReconnecting) {
      // Notify host only if it's a new join
      io.to(room.hostSocketId).emit('listener-joined', listenerInfo);
    }
    
    if (typeof callback === 'function') {
      callback({ success: true, roomId: code, listenerId: listenerInfo.id, reconnected: isReconnecting });
    }
  });

  socket.on('audio-chunk', (data, seq, timestamp, sampleRate) => {
    // Broadcast audio-data to all other sockets in the room, volatile
    // (Volatile means if the connection is slow, the packet can be dropped rather than buffered)
    const targetRoomId = socket.roomCode;
    
    if (targetRoomId) {
      const room = rooms.get(targetRoomId);
      if (room) {
        room.lastAudioTimestamp = Date.now();
      }
      // Passing seq, timestamp, and sampleRate to listeners
      socket.volatile.to(targetRoomId).emit('audio-data', data, seq, timestamp, sampleRate);
    }
  });

  socket.on('kick-listener', ({ listenerId }) => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        for (const [sId, listener] of room.listeners.entries()) {
          if (listener.id === listenerId) {
            io.sockets.sockets.get(sId)?.emit('kicked');
            io.sockets.sockets.get(sId)?.disconnect(true);
            room.listeners.delete(sId);
            socket.emit('listener-left', { listenerId });
            break;
          }
        }
      }
    }
  });

  socket.on('rename-listener', ({ listenerId, newName }) => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        for (const [sId, listener] of room.listeners.entries()) {
          if (listener.id === listenerId) {
            listener.name = newName;
            socket.emit('listener-renamed', { listenerId, newName });
            io.sockets.sockets.get(sId)?.emit('renamed', { newName });
            break;
          }
        }
      }
    }
  });

  socket.on('health-check', ({ nonce }) => {
    let roomActive = false;
    for (const room of rooms.values()) {
      if (room.hostSocketId === socket.id || room.listeners.has(socket.id)) {
        roomActive = true;
        break;
      }
    }
    socket.emit('health-check-ack', { nonce, timestamp: Date.now(), roomActive });
  });

  socket.on('request-resync', ({ roomCode }, callback) => {
    if (!roomCode) {
      if (typeof callback === 'function') callback({ hostConnected: false, hostStreaming: false, listenerCount: 0 });
      return;
    }
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    
    if (!room) {
      if (typeof callback === 'function') callback({ hostConnected: false, hostStreaming: false, listenerCount: 0 });
      return;
    }
    
    const hostConnected = io.sockets.sockets.has(room.hostSocketId);
    const hostStreaming = Boolean(room.lastAudioTimestamp && (Date.now() - room.lastAudioTimestamp) < 10000);
    
    if (typeof callback === 'function') {
      callback({
        hostConnected,
        hostStreaming,
        listenerCount: room.listeners.size
      });
    }
  });

  // Graceful disconnect vs abrupt disconnect
  // We can use a timeout to remove rooms, but for now we'll just delay the notification
  socket.on('disconnect', () => {
    let isHost = false;
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        isHost = true;
        room.lastHostDisconnect = Date.now();
        
        // Notify listeners immediately so they can show a reconnecting UI
        io.to(roomId).emit('host-disconnected', { 
          timestamp: Date.now(),
          gracePeriodMs: 30000 
        });
        
        // Don't close immediately, give host 30 seconds to reconnect
        setTimeout(() => {
          const checkRoom = rooms.get(roomId);
          if (checkRoom && checkRoom.hostSocketId === socket.id) {
            io.to(roomId).emit('room-closed');
            rooms.delete(roomId);
          }
        }, 30000);
        break;
      }
    }

    if (!isHost) {
      for (const [roomId, room] of rooms.entries()) {
        if (room.listeners.has(socket.id)) {
          const listener = room.listeners.get(socket.id);
          // Wait before notifying host of leave, in case of quick reconnect
          setTimeout(() => {
            const checkRoom = rooms.get(roomId);
            if (checkRoom) {
              // Check if listener reconnected with a different socket ID
              let reconnected = false;
              for (const [sId, l] of checkRoom.listeners.entries()) {
                if (l.id === listener.id && sId !== socket.id) {
                  reconnected = true;
                  break;
                }
              }
              if (!reconnected) {
                // Not found, they really left
                if (checkRoom.listeners.has(socket.id)) {
                   checkRoom.listeners.delete(socket.id);
                }
                io.to(checkRoom.hostSocketId).emit('listener-left', { listenerId: listener.id });
              } else {
                // Reconnected with a new socket — clean up old entry if it's still there
                if (checkRoom.listeners.has(socket.id)) {
                  checkRoom.listeners.delete(socket.id);
                  console.log(`[Room] Cleaned up old socket entry for reconnected listener ${listener.id}`);
                }
              }
            }
          }, 10000);
          break;
        }
      }
    }
  });
});

// Garbage collection for stale rooms (runs every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    const hostSocket = io.sockets.sockets.get(room.hostSocketId);
    if (!hostSocket) {
      if (!room.lastHostDisconnect) {
        room.lastHostDisconnect = now;
      } else if (now - room.lastHostDisconnect > 10 * 60 * 1000) {
        console.log(`[Garbage Collection] Removing stale room ${roomId}`);
        io.to(roomId).emit('room-closed');
        rooms.delete(roomId);
      }
    } else {
      room.lastHostDisconnect = null;
    }
  }
}, 5 * 60 * 1000);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = { app, server, io };

// Helper: Send Bug Report to Telegram
async function sendToTelegram(report) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const device = report.deviceInfo ? `${report.deviceInfo.brand} ${report.deviceInfo.modelName}` : 'Unknown Device';
  const serverUrl = report.settings?.serverUrl ? report.settings.serverUrl.replace(/\/$/, '') : 'http://your-server-ip:3000';
  const text = `🐛 *New Bug Report*\n\n*ID:* ${report.id}\n*Description:* ${report.description}\n*Device:* ${device}\n\n[View Full Report](${serverUrl}/bug-reports.html)`;
  
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  
  const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
  const jsonPayload = JSON.stringify(report, null, 2);
  
  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n`;
  body += `${chatId}\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="caption"\r\n\r\n`;
  body += `${text}\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="parse_mode"\r\n\r\n`;
  body += `Markdown\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="document"; filename="report-${report.id.substring(0,8)}.json"\r\n`;
  body += `Content-Type: application/json\r\n\r\n`;
  body += `${jsonPayload}\r\n`;
  body += `--${boundary}--\r\n`;

  if (typeof fetch !== 'undefined') {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body
    });
  } else {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        resolve();
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
