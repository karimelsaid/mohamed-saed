const axios = require('axios');
const AutomationSetting = require('../models/AutomationSetting.model');
const AutomationLog = require('../models/AutomationLog.model');
const AnalyticsEvent = require('../models/AnalyticsEvent.model');

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
            const n8nApiKey = process.env.N8N_API_KEY;
            const n8nApiUrl = process.env.N8N_API_URL || settings.n8nConfig.apiUrl;

            if (!n8nApiKey || !n8nApiUrl) {
                return { error: 'n8n API Key or URL is missing from environment' };
            }

            // Fetch workflows using official API v1
            const workflowsResponse = await axios.get(`${n8nApiUrl}/api/v1/workflows`, {
                headers: { 'X-N8N-API-KEY': n8nApiKey }
            });

            // Fetch recent executions using official API v1
            const executionsResponse = await axios.get(
                `${n8nApiUrl}/api/v1/executions?limit=100`,
                {
                    headers: { 'X-N8N-API-KEY': n8nApiKey }
                }
            );

            const workflows = workflowsResponse.data.data || [];
            const executions = executionsResponse.data.data || [];

            // Calculate stats from executions
            const successfulExecutions = executions.filter(e => e.finished && !e.stoppedAt).length;
            const failedExecutions = executions.filter(e =>e.stoppedAt).length;
            const totalExecutions = executions.length;

            // Calculate execution rate by workflow
            const workflowStats = {};
            executions.forEach(exec => {
                const workflowId = exec.workflowId;
                if (!workflowStats[workflowId]) {
                    workflowStats[workflowId] = { total: 0, success: 0, failed: 0 };
                }
                workflowStats[workflowId].total++;
                if (exec.finished && !exec.stoppedAt) {
                    workflowStats[workflowId].success++;
                } else {
                    workflowStats[workflowId].failed++;
                }
            });

            // Attach execution stats to workflows
            const workflowsWithStats = workflows.map(w => ({
                ...w,
                executionStats: workflowStats[w.id] || { total: 0, success: 0, failed: 0 }
            }));

            // Get analytics stats from MongoDB
            const analyticsStats = await this.getAnalyticsStats();

            return {
                totalWorkflows: workflows.length,
                activeWorkflows: workflows.filter(w => w.active).length,
                totalExecutions,
                successfulExecutions,
                failedExecutions,
                successRate: totalExecutions > 0 ? ((successfulExecutions / totalExecutions) * 100).toFixed(1) : 0,
                workflows: workflowsWithStats,
                ...analyticsStats,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ [AutomationService] Error fetching n8n stats:', error.message);
            return { error: error.message };
        }
    }

    /**
     * Get analytics statistics from MongoDB for the current month
     */
    async getAnalyticsStats() {
        try {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            // المنشورات التلقائية = impression events this month
            const impressions = await AnalyticsEvent.countDocuments({
                eventType: 'impression',
                createdAt: { $gte: startOfMonth }
            });

            // الردود الذكية = comment events this month
            const comments = await AnalyticsEvent.countDocuments({
                eventType: 'comment',
                createdAt: { $gte: startOfMonth }
            });

            // معدل التفاعل = clicks / impressions
            const clicks = await AnalyticsEvent.countDocuments({
                eventType: 'click',
                createdAt: { $gte: startOfMonth }
            });
            const engagementRate = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : 0;

            // معدل التحويل = purchase_batch / clicks
            const purchases = await AnalyticsEvent.countDocuments({
                eventType: 'purchase_batch',
                createdAt: { $gte: startOfMonth }
            });
            const conversionRate = clicks > 0 ? ((purchases / clicks) * 100).toFixed(1) : 0;

            // searches this month
            const searches = await AnalyticsEvent.countDocuments({
                eventType: 'search',
                createdAt: { $gte: startOfMonth }
            });

            return {
                impressions,
                comments,
                clicks,
                engagementRate: parseFloat(engagementRate),
                purchases,
                conversionRate: parseFloat(conversionRate),
                searches
            };
        } catch (error) {
            console.error('❌ [AutomationService] Error fetching analytics stats:', error.message);
            return {
                impressions: 0,
                comments: 0,
                clicks: 0,
                engagementRate: 0,
                purchases: 0,
                conversionRate: 0,
                searches: 0
            };
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
