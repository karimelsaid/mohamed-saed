const mongoose = require('mongoose');

const WatinCategorySchema = new mongoose.Schema({
  slug: { 
    type: String, required: true, unique: true, lowercase: true, trim: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  },
  name: {
    ar: { type: String, required: true, trim: true, maxlength: 200 },
    en: { type: String, trim: true, maxlength: 200 }
  },
  description: {
    ar: { type: String, trim: true, maxlength: 500 },
    en: { type: String, trim: true, maxlength: 500 }
  },
  icon: { type: String, default: 'fas fa-book' },
  colorToken: { type: String, default: 'forest' },     // forest, olive, sand, sage
  bgColor: { type: String, default: 'rgba(31, 58, 46, 0.1)' },
  iconColor: { type: String, default: '#1F3A2E' },
  sortOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  lectureCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'watin_categories' });

WatinCategorySchema.index({ status: 1, sortOrder: 1 });

module.exports = mongoose.model('WatinCategory', WatinCategorySchema);
