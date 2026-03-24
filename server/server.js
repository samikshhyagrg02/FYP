const express = require('express');
const http    = require('http');          // needed to attach Socket.IO
const { Server: SocketIOServer } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const moodRoutes = require('./routes/mood');
const journalRoutes = require('./routes/journal');
const communityRoutes = require('./routes/community');
const gamificationRoutes = require('./routes/gamification');
const adminRoutes = require('./routes/admin');
const chatRoutes  = require('./routes/chat');
const ChatMessage = require('./models/ChatMessage');
const ChatBlock   = require('./models/ChatBlock');

const app = express();
const httpServer = http.createServer(app); // wrap app in http server for Socket.IO
const PORT = process.env.PORT || 3001;

// Socket.IO setup — CORS mirrors the Express CORS config
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3002',
    credentials: true,
  },
});

// ── Socket.IO: authenticate via JWT on handshake ──────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    socket.userId = String(decoded.userId);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ── Socket.IO: connection handler ─────────────────────────────────────────────
io.on('connection', (socket) => {
  // Each user joins a personal room named by their userId
  socket.join(socket.userId);

  // Handle sending a message
  socket.on('chat:send', async (data) => {
    try {
      const { receiverId, content } = data;
      if (!receiverId || !content?.trim()) return;

      // Check if either party has blocked the other
      const blocked = await ChatBlock.findOne({
        $or: [
          { blockerId: socket.userId, targetId: receiverId },
          { blockerId: receiverId,    targetId: socket.userId },
        ],
      });
      if (blocked) {
        socket.emit('chat:error', { message: 'Cannot send message — user is blocked.' });
        return;
      }

      // Persist message
      const msg = await ChatMessage.create({
        senderId:   socket.userId,
        receiverId,
        content:    content.trim(),
        status:     'sent',
      });

      const populated = await msg.populate(['senderId', 'receiverId']);

      // Emit to receiver's room (real-time delivery)
      io.to(receiverId).emit('chat:message', populated);
      // Confirm back to sender
      socket.emit('chat:message', populated);
    } catch (err) {
      console.error('Socket chat:send error', err);
      socket.emit('chat:error', { message: 'Failed to send message.' });
    }
  });

  socket.on('disconnect', () => {});
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3002',
  credentials: true
}));

// Rate limiting - more lenient in development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 1000 in dev, 100 in production
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindbloom', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat',  chatRoutes);

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server — use httpServer (not app) so Socket.IO works
const server = httpServer.listen(PORT, () => {
  console.log(`MindBloom server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try stopping other instances or change PORT in your environment.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

module.exports = app;