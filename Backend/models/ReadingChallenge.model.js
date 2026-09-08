const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    progressPercent: { type: Number, default: 0 },
    lastProgressUpdate: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    rank: { type: Number, default: null }, // 1st, 2nd, etc.
    pointsAwarded: { type: Boolean, default: false }
});

const readingChallengeSchema = new mongoose.Schema({
    bookId: { type: String, required: true },
    bookTitle: { type: String, default: '' },
    bookCover: { type: String, default: '' },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    
    // Privacy and Type
    isPublic: { type: Boolean, default: false }, // If true, anyone can join from book details page
    maxParticipants: { type: Number, default: 50 },
    
    // Targets
    targetType: { type: String, enum: ['full_book', 'chapter', 'percentage'], default: 'full_book' },
    targetValue: { type: Number, default: 100 }, // e.g. 100% or chapter index
    
    // Dates
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    
    // Status
    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    
    participants: [participantSchema],
    
    // Unique shareable link hash
    inviteCode: { type: String, unique: true }
    
}, { timestamps: true });

// Pre-save hook to generate invite code if not exists
readingChallengeSchema.pre('save', function(next) {
    if (!this.inviteCode) {
        // Generate a random 8-character string for invites
        this.inviteCode = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
    }
    next();
});

// Methods
readingChallengeSchema.methods.updateParticipantProgress = async function(userId, newPercent) {
    const participant = this.participants.find(p => p.userId.toString() === userId.toString());
    if (participant) {
        participant.progressPercent = newPercent;
        participant.lastProgressUpdate = new Date();
        
        // Check if completed
        if (newPercent >= this.targetValue && !participant.completedAt) {
            participant.completedAt = new Date();
            // Determine rank based on existing completions
            const completedCount = this.participants.filter(p => p.completedAt).length;
            participant.rank = completedCount;
        }
        return true;
    }
    return false;
};

module.exports = mongoose.model('ReadingChallenge', readingChallengeSchema);
