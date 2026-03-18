const mongoose = require('mongoose');

const MobileVersionSchema = new mongoose.Schema({
    android: {
        version: { type: String, default: '1.1.0' },
        minBuildNumber: { type: Number, default: 1 },
        storeUrl: { type: String, default: '' },
        forceUpdate: { type: Boolean, default: false }
    },
    ios: {
        version: { type: String, default: '1.1.0' },
        minBuildNumber: { type: Number, default: 1 },
        storeUrl: { type: String, default: '' },
        forceUpdate: { type: Boolean, default: false }
    },
    liveUpdate: {
        version: { type: String, default: '1.0.0' },
        zipUrl: { type: String, default: '' },
        enabled: { type: Boolean, default: false },
        lastZipMtime: { type: Date } // لتتبع وقت آخر تحديث للملف المضغوط
    }
}, { timestamps: true });

// Prevent multiple documents (Singleton pattern logic should be handled in controller/service)
const MobileVersion = mongoose.model('MobileVersion', MobileVersionSchema);

module.exports = MobileVersion;
