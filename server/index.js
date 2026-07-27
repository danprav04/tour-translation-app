const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(cors());

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

// Rooms are stored in-memory as a Map
// Key: roomCode, Value: { hostSocketId, listeners: Map<socketId, {id, name, joinedAt}>, createdAt }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// HTTP endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() });
});

app.get('/room/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms.get(code);
  if (room) {
    res.json({ exists: true, listenerCount: room.listeners.size });
  } else {
    res.json({ exists: false, listenerCount: 0 });
  }
});

// LiveKit Token Generation
app.get('/api/livekit/token', async (req, res) => {
  const { roomId, userId, role } = req.query;
  
  if (!roomId || !userId || !role) {
    return res.status(400).json({ error: 'Missing required parameters: roomId, userId, role' });
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
      ttl: '10m', // 10 minutes
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
  
  socket.on('create-room', ({ existingRoomCode } = {}, callback) => {
    let roomCode = existingRoomCode;
    
    // Reconnection case: host re-creates the same room
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.hostSocketId = socket.id; // Update host socket ID
      socket.join(roomCode);
      if (typeof callback === 'function') {
        callback({ success: true, roomCode, roomId: roomCode, reconnected: true });
      }
      return;
    }

    roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }
    
    rooms.set(roomCode, {
      hostSocketId: socket.id,
      listeners: new Map(),
      createdAt: Date.now()
    });
    
    socket.join(roomCode);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode, roomId: roomCode, reconnected: false });
    }
  });

  socket.on('join-room', ({ roomCode, deviceName, existingListenerId }, callback) => {
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
    socket.join(code);
    
    if (!isReconnecting) {
      // Notify host only if it's a new join
      io.to(room.hostSocketId).emit('listener-joined', listenerInfo);
    }
    
    if (typeof callback === 'function') {
      callback({ success: true, roomId: code, listenerId: listenerInfo.id, reconnected: isReconnecting });
    }
  });

  socket.on('audio-chunk', (data, sampleRate, seq, timestamp) => {
    // Broadcast audio-data to all other sockets in the room, volatile
    let targetRoomId;
    for (const [id, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        targetRoomId = id;
        break;
      }
    }
    if (targetRoomId) {
      // Passing seq and timestamp to listeners
      socket.volatile.to(targetRoomId).emit('audio-data', data, sampleRate, seq, timestamp);
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

  // Graceful disconnect vs abrupt disconnect
  // We can use a timeout to remove rooms, but for now we'll just delay the notification
  socket.on('disconnect', () => {
    let isHost = false;
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        isHost = true;
        // Don't close immediately, give host 10 seconds to reconnect
        setTimeout(() => {
          const checkRoom = rooms.get(roomId);
          if (checkRoom && checkRoom.hostSocketId === socket.id) {
            socket.to(roomId).emit('room-closed');
            rooms.delete(roomId);
          }
        }, 10000);
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
              }
            }
          }, 10000);
          break;
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
