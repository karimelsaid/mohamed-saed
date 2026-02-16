const mongoose = require('mongoose');

const userChallengeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', required: true },
    progress: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'failed'], default: 'active' },
    completedAt: { type: Date },
    // Snapshot of rewards to ensure they don't change if challenge changes
    rewardsClaimed: { type: Boolean, default: false }
}, { timestamps: true });

userChallengeSchema.index({ userId: 1, challengeId: 1 }, { unique: true });

module.exports = mongoose.model('UserChallenge', userChallengeSchema);
