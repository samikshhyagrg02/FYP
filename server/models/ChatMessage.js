const mongoose = require('mongoose');

/**
 * ChatMessage — stores individual messages between two users.
 * isRequest: true means the message is a pending message request
 * (sender not yet accepted by receiver). Once accepted, all messages
 * between the pair become normal (isRequest: false).
 */
const chatMessageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:    { type: String, required: true, maxlength: 2000 },
  // sent → delivered → seen
  status:     { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  // true = pending message request, not shown in normal chat
  isRequest:  { type: Boolean, default: false },
}, { timestamps: true });

chatMessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
chatMessageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });
chatMessageSchema.index({ receiverId: 1, isRequest: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
