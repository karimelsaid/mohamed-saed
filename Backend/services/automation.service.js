const axios = require('axios');
const AutomationSetting = require('../models/AutomationSetting.model');
const AutomationLog = require('../models/AutomationLog.model');

class AutomationService {
    /**
     * Trigger n8n Auto-Post Webhook when a product is added or approved.
     */
    async triggerAutoPost(product) {
        try {
            const settings = await AutomationSetting.getInstance();
            if (!settings.autoPostEnabled || !settings.n8nWebhookUrls.autoPost) {
                console.log('⚠️ [AutomationService] Auto-Post is disabled or Webhook URL is missing');
                return null;
            }

            const payload = {
                action: 'product_added',
                products_id: product.products_id,
                name: product.product_name,
                category: product.product_category,
                price: product.product_price,
                image: product.image_path || product.product_image,
                description: product.product_description,
                link: `https://knoozbook.com/product/${product.products_id}`
            };

            const response = await axios.post(settings.n8nWebhookUrls.autoPost, payload);
            
            // Log the attempt
            await AutomationLog.create({
                type: 'post',
                platform: 'facebook', // Assuming Facebook/Instagram as default
                status: 'pending', // n8n handles the actual post
                title: `Auto-Post triggered: ${product.product_name}`,
                details: {
                    caption: product.product_name,
                    imageUrl: payload.image,
                    link: payload.link,
                    response: response.data
                },
                metadata: {
                    productId: product._id
                }
            });

            return response.data;
        } catch (error) {
            console.error('❌ [AutomationService] Error triggering Auto-Post:', error.message);
            await AutomationLog.create({
                type: 'post',
                platform: 'system',
                status: 'failed',
                title: `Auto-Post Error: ${product.product_name}`,
                error: error.message,
                metadata: {
                    productId: product._id
                }
            });
            return null;
        }
    }

    /**
     * Get aggregated stats for the dashboard.
     */
    async getStats(days = 30) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - days);

        const stats = await AutomationLog.aggregate([
            { $match: { createdAt: { $gte: threshold } } },
            { $group: {
                _id: '$type',
                total: { $sum: 1 },
                success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
            }}
        ]);

        return stats;
    }
}

module.exports = new AutomationService();
