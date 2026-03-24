const mongoose = require('mongoose');

/**
 * ChatMessage — stores individual messages between two users.
 * Fields match the spec: messageId (auto _id), senderId, receiverId,
 * content, timestamp, status.
 */
const chatMessageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:    { type: String, required: true, maxlength: 2000 },
  status:     { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
}, { timestamps: true }); // createdAt = timestamp

// Index for fast conversation history lookups
chatMessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
chatMessageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
