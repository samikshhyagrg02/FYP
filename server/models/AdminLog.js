const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  adminId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:     { type: String, required: true },   // ban_user, unban_user, delete_post, hide_post
  targetType: { type: String, required: true },   // user, post, report
  targetId:   { type: String, required: true },
  details:    { type: String, default: '' }
}, { timestamps: true });

adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ adminId: 1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
