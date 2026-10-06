const mongoose = require('mongoose');

const LocalizedStringSchema = new mongoose.Schema({
  ar: { type: String, required: true, trim: true, maxlength: 200 },
  en: { type: String, trim: true, maxlength: 200 }
}, { _id: false });

const WatinAppSchema = new mongoose.Schema({
  key: { 
    type: String, required: true, unique: true, lowercase: true, trim: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    immutable: true
  },
  name: { type: LocalizedStringSchema, required: true },
  tagline: { type: LocalizedStringSchema },
  icon: {
    key: { type: String },    // design-system icon key e.g. 'fas fa-book'
    url: { type: String }     // or an uploaded image URL
  },
  links: {
    web:      { type: String, validate: { validator: v => !v || /^https:\/\//i.test(v), message: 'Web link must use HTTPS' } },
    android:  { type: String, validate: { validator: v => !v || /^(https:\/\/play\.google\.com\/|market:\/\/)/i.test(v), message: 'Invalid Google Play link' } },
    ios:      { type: String, validate: { validator: v => !v || /^https:\/\/apps\.apple\.com\//i.test(v), message: 'Invalid App Store link' } },
    deepLink: { type: String, validate: { validator: v => !v || (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^(javascript|data|file|vbscript):/i.test(v)), message: 'Invalid or unsafe deep link scheme' } },
  },
  openMode: { 
    type: String, 
    enum: ['external_browser', 'in_app_browser', 'deep_link_then_store'], 
    default: 'external_browser' 
  },
  visibility: {
    platforms:  { type: [String], enum: ['web', 'android', 'ios'], default: ['web', 'android', 'ios'] },
    placements: { type: [String], enum: ['home', 'drawer', 'more'], default: ['more'] },
  },
  sortOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'watin_apps' });

WatinAppSchema.index({ status: 1, sortOrder: 1 });

module.exports = mongoose.model('WatinApp', WatinAppSchema);
