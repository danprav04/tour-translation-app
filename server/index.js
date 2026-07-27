const express = require('express');
const http = require('http');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(cors());

// Serve static files from the public directory (for the landing page)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const server = http.createServer(app);

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



server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
