const mongoose = require('mongoose');
const crypto = require('crypto');

const journalEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: false,  // Not stored in DB, only used for encryption
    maxlength: 10000
  },
  encryptedContent: {
    type: String,
    required: false  // Set by pre-save hook
  },
  isShared: {
    type: Boolean,
    default: false
  },
  sharedAt: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  mood: {
    type: Number,
    min: 1,
    max: 5
  },
  lastEditedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
journalEntrySchema.index({ userId: 1, createdAt: -1 });
journalEntrySchema.index({ userId: 1, isShared: 1 });
journalEntrySchema.index({ isShared: 1, sharedAt: -1 });

// Encryption key from environment
const ENCRYPTION_KEY = process.env.JOURNAL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

// Encrypt content before saving
journalEntrySchema.pre('save', function(next) {
  // Encrypt if content exists and (is new or content was modified)
  if (this.content && (this.isNew || this.isModified('content'))) {
    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(this.content, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      this.encryptedContent = iv.toString('hex') + ':' + encrypted;
      
      // Clear the plaintext content so it's not stored
      this.content = undefined;
    } catch (error) {
      console.error('Encryption error:', error);
      return next(error);
    }
  }
  next();
});

// Decrypt content when retrieving
journalEntrySchema.methods.getDecryptedContent = function() {
  try {
    const parts = this.encryptedContent.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
};

// Override toJSON to include decrypted content
journalEntrySchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.content = this.getDecryptedContent();
  delete obj.encryptedContent;
  
  // Remove userId if shared (for anonymous sharing)
  if (obj.isShared) {
    delete obj.userId;
  }
  
  return obj;
};

// Static method to get user's journal entries
journalEntrySchema.statics.getUserEntries = async function(userId, options = {}) {
  const { limit = 20, skip = 0, sortBy = '-createdAt' } = options;
  
  return this.find({ userId })
    .sort(sortBy)
    .limit(limit)
    .skip(skip);
};

// Static method to get shared entries (anonymous)
journalEntrySchema.statics.getSharedEntries = async function(options = {}) {
  const { limit = 20, skip = 0 } = options;
  
  return this.find({ isShared: true })
    .select('-userId -encryptedContent')
    .sort('-sharedAt')
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
