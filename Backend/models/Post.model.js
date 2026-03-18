const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userAvatar: { type: String },
  content: { type: String, required: true },
  type: { type: String, enum: ['thought', 'review'], default: 'thought' },
  bookTitle: { type: String },
  rating: { type: Number, min: 0, max: 5 },
  likes: [{ type: String }], // Array of userIds
  comments: [{
    userId: String,
    userName: String,
    content: String,
    createdAt: { type: Date, default: Date.now },
    replies: [{
      userId: String,
      userName: String,
      content: String,
      createdAt: { type: Date, default: Date.now }
    }]
  }],
  createdAt: { type: Date, default: Date.now },
  isPinned: { type: Boolean, default: false },
  pinType: { type: String, enum: ['personal', 'community'], default: null },
  userRole: { type: String, default: 'user' }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Post', PostSchema);
