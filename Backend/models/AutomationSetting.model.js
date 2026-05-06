const mongoose = require('mongoose');

const automationSettingSchema = new mongoose.Schema({
    autoPostEnabled: { type: Boolean, default: true },
    randomPostEnabled: { type: Boolean, default: false },
    dailyPostLimit: { type: Number, default: 5 },
    postTiming: { type: String, default: '0 */6 * * *' }, // Cron for n8n (e.g., every 6 hours)
    aiModel: { type: String, default: 'gpt-3.5-turbo' },
    metaAccessToken: String, // Encrypted preferrably
    googleSheetId: { type: String, default: '' },
    customerBackupSheetId: { type: String, default: '' },
    googleSheetEnabled: { type: Boolean, default: false },
    n8nWebhookUrls: {
        autoPost: { type: String, default: '' },
        commentReply: { type: String, default: '' },
        messageReply: { type: String, default: '' }
    },
    metaConfig: {
        pageId: String,
        instagramId: String
    },
    claudeConfig: {
        enabled: { type: Boolean, default: false },
        lastCommand: String,
        lastStatus: String
    },
    n8nConfig: {
        apiUrl: { type: String, default: 'https://n8n.knoozbook.com' },
        apiKey: { type: String, default: '' },
        syncEnabled: { type: Boolean, default: false }
    }
}, { timestamps: true });

// Singleton Pattern for settings
automationSettingSchema.statics.getInstance = async function () {
    const settings = await this.findOne();
    if (settings) return settings;
    return await this.create({});
};

module.exports = mongoose.model('AutomationSetting', automationSettingSchema);
