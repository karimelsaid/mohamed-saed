const mongoose = require('mongoose');

const WatinAuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String },  // denormalized for quick display
  action: { 
    type: String, required: true,
    // e.g. 'speaker.create', 'speaker.update', 'speaker.archive',
    //      'category.create', 'lecture.publish', 'transcript.approve', 'app.toggle'
  },
  entity: { 
    type: String, required: true,
    enum: ['speaker', 'category', 'lecture', 'transcript', 'app', 'daily_verse']
  },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  entityTitle: { type: String },  // denormalized for quick display
  changes: { type: mongoose.Schema.Types.Mixed },  // { field: { from, to } }
  meta: { type: mongoose.Schema.Types.Mixed },      // extra context (e.g. counts, flags)
  ip: { type: String },
  userAgent: { type: String },
}, { 
  timestamps: { createdAt: 'at', updatedAt: false },
  collection: 'watin_audit_logs'
});

WatinAuditLogSchema.index({ entity: 1, entityId: 1, at: -1 });
WatinAuditLogSchema.index({ at: -1 });
WatinAuditLogSchema.index({ actorId: 1, at: -1 });

module.exports = mongoose.model('WatinAuditLog', WatinAuditLogSchema);
