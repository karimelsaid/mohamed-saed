const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration - Update these values
const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.knoozbook.com';
const N8N_API_KEY = process.env.N8N_API_KEY || ''; // Add your n8n API key here

const workflowsDir = path.join(__dirname, '../n8n-workflows');

async function importWorkflow(workflowName, workflowFile) {
  try {
    console.log(`📤 Importing workflow: ${workflowName}`);
    
    const workflowData = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
    
    const response = await axios.post(
      `${N8N_API_URL}/rest/workflows`,
      workflowData,
      {
        headers: {
          'Authorization': `Bearer ${N8N_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Successfully imported: ${workflowName}`);
    console.log(`   Workflow ID: ${response.data.id}`);
    console.log(`   Workflow Name: ${response.data.name}`);
    
    return { success: true, workflow: response.data };
  } catch (error) {
    console.error(`❌ Failed to import ${workflowName}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function activateWorkflow(workflowId) {
  try {
    console.log(`🔄 Activating workflow: ${workflowId}`);
    
    const response = await axios.patch(
      `${N8N_API_URL}/rest/workflows/${workflowId}`,
      { active: true },
      {
        headers: {
          'Authorization': `Bearer ${N8N_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Workflow activated: ${workflowId}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to activate workflow ${workflowId}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function listWorkflows() {
  try {
    console.log('📋 Listing existing workflows...');
    
    const response = await axios.get(
      `${N8N_API_URL}/rest/workflows`,
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY
        }
      }
    );

    console.log(`✅ Found ${response.data.data.length} workflows:`);
    response.data.data.forEach(w => {
      console.log(`   - ${w.name} (ID: ${w.id}, Active: ${w.active})`);
    });
    
    return response.data.data;
  } catch (error) {
    console.error('❌ Failed to list workflows:', error.response?.data || error.message);
    return [];
  }
}

async function main() {
  console.log('🚀 Starting n8n Workflow Import Process');
  console.log(`📍 n8n URL: ${N8N_API_URL}`);
  console.log(`🔑 API Key: ${N8N_API_KEY ? '***' + N8N_API_KEY.slice(-4) : 'NOT SET'}`);
  console.log('');

  if (!N8N_API_KEY) {
    console.error('❌ ERROR: N8N_API_KEY is not set!');
    console.log('Please set it as environment variable or update this script.');
    process.exit(1);
  }

  // List existing workflows first
  await listWorkflows();
  console.log('');

  // Define workflows to import
  const workflows = [
    { name: 'Social Media Automation', file: 'social-media-automation.json' },
    { name: 'AI Sales Agent', file: 'ai-sales-agent.json' },
    { name: 'Event Tracking System', file: 'event-tracking-system.json' }
  ];

  const results = [];

  for (const workflow of workflows) {
    const workflowPath = path.join(workflowsDir, workflow.file);
    
    if (!fs.existsSync(workflowPath)) {
      console.error(`❌ File not found: ${workflowPath}`);
      results.push({ name: workflow.name, success: false, error: 'File not found' });
      continue;
    }

    const result = await importWorkflow(workflow.name, workflowPath);
    results.push({ name: workflow.name, ...result });

    // Activate if import was successful
    if (result.success && result.workflow) {
      await activateWorkflow(result.workflow.id);
    }

    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 IMPORT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log('');
  
  results.forEach(r => {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.name}: ${r.success ? 'Imported' : r.error}`);
  });

  console.log('═══════════════════════════════════════════════════════════');
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
