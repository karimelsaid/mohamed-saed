const mongoose = require('mongoose');

const MobileVersionSchema = new mongoose.Schema({
    android: {
        minBuildNumber: { type: Number, default: 1 },
        storeUrl: { type: String, default: '' },
        forceUpdate: { type: Boolean, default: false }
    },
    ios: {
        minBuildNumber: { type: Number, default: 1 },
        storeUrl: { type: String, default: '' },
        forceUpdate: { type: Boolean, default: false }
    }
}, { timestamps: true });

// Prevent multiple documents (Singleton pattern logic should be handled in controller/service)
const MobileVersion = mongoose.model('MobileVersion', MobileVersionSchema);

module.exports = MobileVersion;
