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
const notificationRoutes = require('./routes/notifications');
const { createNotification } = require('./utils/notificationHelper');
const { startScheduler } = require('./utils/reminderScheduler');
const ChatMessage = require('./models/ChatMessage');
const ChatBlock   = require('./models/ChatBlock');
const User        = require('./models/User');

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

// Expose io on app so routes can emit events
app.set('io', io);

// ── Socket.IO: connection handler ─────────────────────────────────────────────
io.on('connection', (socket) => {
  // Each user joins a personal room named by their userId
  socket.join(socket.userId);

  // ── Online/Offline tracking ─────────────────────────────────────────────────
  const onlineUsers = app.get('onlineUsers') || new Set();
  onlineUsers.add(socket.userId);
  app.set('onlineUsers', onlineUsers);
  // Broadcast updated online list to all connected clients
  io.emit('chat:online', Array.from(onlineUsers));

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

      // Determine if this is a message request.
      // A message is a REQUEST if the receiver has NEVER sent an accepted
      // (non-request) message to the sender before.
      // Only check one direction: has receiver → sender ever happened?
      const receiverHasReplied = await ChatMessage.findOne({
        senderId:   receiverId,        // receiver previously sent
        receiverId: socket.userId,     // to the current sender
        isRequest:  false,             // and it was an accepted message
      });
      const isRequest = !receiverHasReplied;

      // Persist message
      const msg = await ChatMessage.create({
        senderId:   socket.userId,
        receiverId,
        content:    content.trim(),
        status:     'sent',
        isRequest,
      });

      const populated = await msg.populate(['senderId', 'receiverId']);

      if (isRequest) {
        // Notify receiver of a new message request (separate event)
        io.to(receiverId).emit('chat:request', populated);
        // Create persistent notification
        createNotification(app, {
          userId:     receiverId,
          type:       'message_request',
          title:      'New Message Request',
          message:    `${populated.senderId.username} sent you a message request`,
          link:       '/chat',
          fromUserId: socket.userId,
        });
      } else {
        // Normal message — deliver to receiver's room
        io.to(receiverId).emit('chat:message', populated);
        // Create persistent notification
        createNotification(app, {
          userId:     receiverId,
          type:       'new_message',
          title:      'New Message',
          message:    `${populated.senderId.username}: ${content.trim().slice(0, 80)}${content.trim().length > 80 ? '…' : ''}`,
          link:       '/chat',
          fromUserId: socket.userId,
        });
      }
      // Always confirm back to sender
      socket.emit('chat:message', populated);
    } catch (err) {
      console.error('Socket chat:send error', err);
      socket.emit('chat:error', { message: 'Failed to send message.' });
    }
  });

  // ── Seen receipt ────────────────────────────────────────────────────────────
  // Client emits this when they open a conversation
  socket.on('chat:seen', async ({ senderId }) => {
    try {
      await ChatMessage.updateMany(
        { senderId, receiverId: socket.userId, status: { $ne: 'seen' }, isRequest: false },
        { status: 'seen' }
      );
      // Notify the original sender that their messages were seen
      io.to(senderId).emit('chat:seen', { by: socket.userId });
    } catch (err) {
      console.error('Socket chat:seen error', err);
    }
  });

  socket.on('disconnect', () => {
    // Remove from online set and broadcast
    const online = app.get('onlineUsers') || new Set();
    online.delete(socket.userId);
    app.set('onlineUsers', online);
    // Store last seen time on user document (best-effort)
    User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() }).catch(() => {});
    io.emit('chat:online', Array.from(online));
  });
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3002',
  credentials: true
}));

// Rate limiting - more lenient in development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindbloom', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
  startScheduler(app); // start reminder scheduler after DB is ready
})
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
app.use('/api/notifications', notificationRoutes);

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