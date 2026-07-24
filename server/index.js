const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
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

// Socket.IO Events
io.on('connection', (socket) => {
  
  socket.on('create-room', (callback) => {
    let roomCode = generateRoomCode();
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
      callback({ success: true, roomCode, roomId: roomCode });
    }
  });

  socket.on('join-room', ({ roomCode, deviceName }, callback) => {
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

    const listenerId = uuidv4();
    const listenerInfo = {
      id: listenerId,
      name: deviceName || 'Anonymous',
      joinedAt: new Date().toISOString()
    };
    
    room.listeners.set(socket.id, listenerInfo);
    socket.join(code);
    
    // Notify host
    io.to(room.hostSocketId).emit('listener-joined', listenerInfo);
    
    if (typeof callback === 'function') {
      callback({ success: true, roomId: code, listenerId });
    }
  });

  socket.on('audio-chunk', (data, roomId) => {
    // Broadcast audio-data to all other sockets in the room, volatile
    // Determine the room ID if not explicitly sent
    let targetRoomId = roomId;
    if (!targetRoomId) {
      for (const [id, room] of rooms.entries()) {
        if (room.hostSocketId === socket.id) {
          targetRoomId = id;
          break;
        }
      }
    }
    if (targetRoomId) {
      socket.volatile.to(targetRoomId).emit('audio-data', data);
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

  socket.on('disconnect', () => {
    let isHost = false;
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        isHost = true;
        socket.to(roomId).emit('room-closed');
        rooms.delete(roomId);
        break;
      }
    }

    if (!isHost) {
      for (const [roomId, room] of rooms.entries()) {
        if (room.listeners.has(socket.id)) {
          const listener = room.listeners.get(socket.id);
          room.listeners.delete(socket.id);
          io.to(room.hostSocketId).emit('listener-left', { listenerId: listener.id });
          break;
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
