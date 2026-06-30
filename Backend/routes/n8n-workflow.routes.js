const express = require('express');
const router = express.Router();
const n8nWorkflowController = require('../controllers/n8n-workflow.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// Get n8n statistics
router.get('/stats', n8nWorkflowController.getN8nStats);

// Get n8n configuration status
router.get('/config', n8nWorkflowController.getN8nConfig);

// Set n8n API key (for initial setup)
router.post('/set-api-key', n8nWorkflowController.setN8nApiKey);

// Update n8n configuration
router.post('/config', n8nWorkflowController.updateN8nConfig);

// Get all workflows
router.get('/workflows', n8nWorkflowController.getWorkflows);

// Get specific workflow
router.get('/workflows/:id', n8nWorkflowController.getWorkflow);

// Create workflow
router.post('/workflows', n8nWorkflowController.createWorkflow);

// Update workflow
router.patch('/workflows/:id', n8nWorkflowController.updateWorkflow);

// Toggle workflow (activate/deactivate)
router.patch('/workflows/:id/toggle', n8nWorkflowController.toggleWorkflow);

// Delete workflow
router.delete('/workflows/:id', n8nWorkflowController.deleteWorkflow);

// Get workflow executions
router.get('/workflows/:id/executions', n8nWorkflowController.getWorkflowExecutions);

// Import workflow from JSON
router.post('/workflows/import', n8nWorkflowController.importWorkflow);

// Execute workflow manually
router.post('/workflows/:id/execute', n8nWorkflowController.executeWorkflow);

module.exports = router;
