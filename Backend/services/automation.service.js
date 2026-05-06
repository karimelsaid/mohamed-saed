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
     * Run Claude Code CLI command.
     */
    async runClaudeAgent(prompt) {
        const { exec } = require('child_process');
        const path = require('path');
        const projectRoot = path.resolve(__dirname, '../../');

        return new Promise((resolve) => {
            const command = `claude "${prompt.replace(/"/g, '\\"')}" --print`;
            
            console.log(`🚀 [AutomationService] Received prompt: "${prompt}"`);
            console.log(`📂 [AutomationService] Executing in: ${projectRoot}`);

            // Set a timeout of 30 seconds for the command
            const child = exec(command, { 
                cwd: projectRoot,
                timeout: 30000, // 30 seconds
                maxBuffer: 1024 * 1024 // 1MB buffer
            }, async (error, stdout, stderr) => {
                const output = stdout || stderr || 'No output received from Claude';
                const status = error ? 'failed' : 'success';

                console.log(`✅ [AutomationService] Claude execution finished with status: ${status}`);

                // Log the operation to DB
                try {
                    await AutomationLog.create({
                        type: 'system',
                        platform: 'claude',
                        status: status,
                        title: `Claude: ${prompt.slice(0, 50)}`,
                        details: {
                            command: command,
                            output: output,
                            fullPrompt: prompt
                        },
                        error: error ? error.message : null
                    });
                } catch (logErr) {
                    console.error('⚠️ [AutomationService] Failed to save log to DB:', logErr.message);
                }

                resolve({ 
                    success: !error, 
                    output: output, 
                    error: error ? error.message : null 
                });
            });

            child.on('error', (err) => {
                console.error('🔥 [AutomationService] Child process error:', err);
                resolve({ success: false, output: 'Internal Process Error', error: err.message });
            });
        });
    }

    /**
     * Fetch statistics and workflow status from n8n API.
     */
    async fetchN8nStats() {
        try {
            const settings = await AutomationSetting.getInstance();
            if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
                return { error: 'n8n API Key or URL is missing' };
            }

            const response = await axios.get(`${settings.n8nConfig.apiUrl}/api/v1/workflows`, {
                headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
            });

            return {
                totalWorkflows: response.data.data.length,
                workflows: response.data.data,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ [AutomationService] Error fetching n8n stats:', error.message);
            return { error: error.message };
        }
    }

    /**
     * Preliminary deployment function.
     */
    async deployToProduction() {
        // This will be expanded based on your production setup (e.g., git push, firebase deploy, etc.)
        return { success: true, message: 'Deployment triggered successfully' };
    }
}

module.exports = new AutomationService();
