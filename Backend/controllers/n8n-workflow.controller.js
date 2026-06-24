const axios = require('axios');
const AutomationSetting = require('../models/AutomationSetting.model');
const AutomationLog = require('../models/AutomationLog.model');
const fs = require('fs');
const path = require('path');

/**
 * Get all workflows from n8n
 */
exports.getWorkflows = async (req, res) => {
    try {
        const settings = await AutomationSetting.getInstance();
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.get(`${settings.n8nConfig.apiUrl}/rest/workflows`, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        res.json({
            success: true,
            workflows: response.data.data,
            total: response.data.data.length
        });
    } catch (error) {
        console.error('Error fetching workflows:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch workflows' });
    }
};

/**
 * Get a specific workflow by ID
 */
exports.getWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.get(`${settings.n8nConfig.apiUrl}/rest/workflows/${id}`, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        res.json({ success: true, workflow: response.data });
    } catch (error) {
        console.error('Error fetching workflow:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch workflow' });
    }
};

/**
 * Create a new workflow in n8n
 */
exports.createWorkflow = async (req, res) => {
    try {
        const { workflowData } = req.body;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.post(`${settings.n8nConfig.apiUrl}/rest/workflows`, workflowData, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'success',
            title: 'Workflow Created',
            details: { workflowId: response.data.id, name: response.data.name }
        });

        res.json({ success: true, workflow: response.data });
    } catch (error) {
        console.error('Error creating workflow:', error.message);
        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'failed',
            title: 'Workflow Creation Failed',
            error: error.message
        });
        res.status(500).json({ success: false, message: 'Failed to create workflow' });
    }
};

/**
 * Update an existing workflow
 */
exports.updateWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const { workflowData } = req.body;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.patch(`${settings.n8nConfig.apiUrl}/rest/workflows/${id}`, workflowData, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'success',
            title: 'Workflow Updated',
            details: { workflowId: id }
        });

        res.json({ success: true, workflow: response.data });
    } catch (error) {
        console.error('Error updating workflow:', error.message);
        res.status(500).json({ success: false, message: 'Failed to update workflow' });
    }
};

/**
 * Activate/Deactivate a workflow
 */
exports.toggleWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const { active } = req.body;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.patch(`${settings.n8nConfig.apiUrl}/rest/workflows/${id}`, {
            active: active
        }, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'success',
            title: `Workflow ${active ? 'Activated' : 'Deactivated'}`,
            details: { workflowId: id }
        });

        res.json({ success: true, workflow: response.data });
    } catch (error) {
        console.error('Error toggling workflow:', error.message);
        res.status(500).json({ success: false, message: 'Failed to toggle workflow' });
    }
};

/**
 * Delete a workflow
 */
exports.deleteWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        await axios.delete(`${settings.n8nConfig.apiUrl}/rest/workflows/${id}`, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'success',
            title: 'Workflow Deleted',
            details: { workflowId: id }
        });

        res.json({ success: true, message: 'Workflow deleted successfully' });
    } catch (error) {
        console.error('Error deleting workflow:', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete workflow' });
    }
};

/**
 * Get workflow execution logs
 */
exports.getWorkflowExecutions = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 20 } = req.query;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.get(
            `${settings.n8nConfig.apiUrl}/rest/executions?workflowId=${id}&limit=${limit}`,
            {
                headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
            }
        );

        res.json({
            success: true,
            executions: response.data.data,
            total: response.data.data.length
        });
    } catch (error) {
        console.error('Error fetching executions:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch executions' });
    }
};

/**
 * Import workflow from JSON file
 */
exports.importWorkflow = async (req, res) => {
    try {
        const { workflowName } = req.body;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        // Map workflow names to file paths
        const workflowFiles = {
            'social-media-automation': 'social-media-automation.json',
            'ai-sales-agent': 'ai-sales-agent.json',
            'event-tracking': 'event-tracking-system.json'
        };

        const fileName = workflowFiles[workflowName];
        if (!fileName) {
            return res.status(400).json({ success: false, message: 'Invalid workflow name' });
        }

        const filePath = path.join(__dirname, '../n8n-workflows', fileName);
        const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const response = await axios.post(`${settings.n8nConfig.apiUrl}/rest/workflows`, workflowData, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'success',
            title: 'Workflow Imported',
            details: { workflowName, workflowId: response.data.id }
        });

        res.json({ success: true, workflow: response.data });
    } catch (error) {
        console.error('Error importing workflow:', error.message);
        res.status(500).json({ success: false, message: 'Failed to import workflow' });
    }
};

/**
 * Execute a workflow manually
 */
exports.executeWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = req.body;
        const settings = await AutomationSetting.getInstance();
        
        if (!settings.n8nConfig.apiKey || !settings.n8nConfig.apiUrl) {
            return res.status(400).json({ success: false, message: 'n8n API credentials not configured' });
        }

        const response = await axios.post(`${settings.n8nConfig.apiUrl}/rest/workflows/${id}/execute`, data || {}, {
            headers: { 'X-N8N-API-KEY': settings.n8nConfig.apiKey }
        });

        await AutomationLog.create({
            type: 'system',
            platform: 'n8n',
            status: 'success',
            title: 'Workflow Executed Manually',
            details: { workflowId: id, executionId: response.data.id }
        });

        res.json({ success: true, execution: response.data });
    } catch (error) {
        console.error('Error executing workflow:', error.message);
        res.status(500).json({ success: false, message: 'Failed to execute workflow' });
    }
};
