const mongoose = require('mongoose');

const halaqaSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    gender: { type: String, enum: ['male', 'female'], required: true },
    leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assistants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    maxMembers: { type: Number, default: 20 },
    inviteCode: { type: String, required: true },
    inviteCodeExpiry: { type: Date },
    isPrivate: { type: Boolean, default: false },
    isDM: { type: Boolean, default: false },
    dmParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    active: { type: Boolean, default: true },
    tags: [String],
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// إنشاء فهرس فريد للبحث السريع بالكود
halaqaSchema.index({ inviteCode: 1 }, { unique: true });

module.exports = mongoose.model('Halaqa', halaqaSchema);
