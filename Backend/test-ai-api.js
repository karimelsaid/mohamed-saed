require('./loadEnv');
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/automation';

async function testAIExecuteEndpoint() {
  console.log('=== Testing AI Execute Endpoint ===\n');

  try {
    // Test 1: Generate Text
    console.log('Test 1: Generate Text');
    const textResponse = await axios.post(`${API_BASE}/ai/execute`, {
      task: 'generate_caption',
      data: {
        name: 'The Great Pyramids',
        description: 'A comprehensive guide to Egyptian pyramids',
        price: '150',
        category: 'روايات',
        tone: 'emotional'
      },
      options: {
        provider: 'gemini',
        model: 'gemini-2.5-flash'
      }
    });
    console.log('Status:', textResponse.status);
    console.log('Success:', textResponse.data.success);
    if (textResponse.data.success) {
      console.log('Generated Text:', textResponse.data.text);
      console.log('Provider:', textResponse.data.provider);
      console.log('Model:', textResponse.data.model);
      console.log('Tokens:', textResponse.data.tokens);
      console.log('Cost:', textResponse.data.cost);
      console.log('Execution Time:', textResponse.data.executionTime, 'ms');
    } else {
      console.log('Error:', textResponse.data.error);
    }
    console.log();

    // Test 2: Generate JSON
    console.log('Test 2: Generate JSON');
    const jsonResponse = await axios.post(`${API_BASE}/ai/execute`, {
      task: 'generate_caption',
      data: {
        name: 'The Great Pyramids',
        description: 'A comprehensive guide to Egyptian pyramids',
        category: 'روايات'
      },
      options: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        returnJSON: true
      }
    });
    console.log('Status:', jsonResponse.status);
    console.log('Success:', jsonResponse.data.success);
    if (jsonResponse.data.success) {
      console.log('Generated JSON:', JSON.stringify(jsonResponse.data.json, null, 2));
      console.log('Provider:', jsonResponse.data.provider);
      console.log('Model:', jsonResponse.data.model);
      console.log('Tokens:', jsonResponse.data.tokens);
      console.log('Cost:', jsonResponse.data.cost);
      console.log('Execution Time:', jsonResponse.data.executionTime, 'ms');
    } else {
      console.log('Error:', jsonResponse.data.error);
    }
    console.log();

    // Test 3: Generate Hashtags
    console.log('Test 3: Generate Hashtags');
    const hashtagsResponse = await axios.post(`${API_BASE}/ai/execute`, {
      task: 'generate_hashtags',
      data: {
        name: 'The Great Pyramids',
        description: 'A comprehensive guide to Egyptian pyramids',
        category: 'روايات'
      },
      options: {
        provider: 'gemini',
        model: 'gemini-2.5-flash'
      }
    });
    console.log('Status:', hashtagsResponse.status);
    console.log('Success:', hashtagsResponse.data.success);
    if (hashtagsResponse.data.success) {
      console.log('Generated Hashtags:', hashtagsResponse.data.text);
      console.log('Provider:', hashtagsResponse.data.provider);
      console.log('Model:', hashtagsResponse.data.model);
      console.log('Tokens:', hashtagsResponse.data.tokens);
      console.log('Cost:', hashtagsResponse.data.cost);
      console.log('Execution Time:', hashtagsResponse.data.executionTime, 'ms');
    } else {
      console.log('Error:', hashtagsResponse.data.error);
    }
    console.log();

  } catch (error) {
    console.error('Error testing AI Execute Endpoint:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

async function testAIHealthEndpoint() {
  console.log('\n=== Testing AI Health Endpoint ===\n');

  try {
    const response = await axios.get(`${API_BASE}/ai/health`);
    console.log('Status:', response.status);
    console.log('Health Status:', response.data);
  } catch (error) {
    console.error('Error testing AI Health Endpoint:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

async function testAIMetricsEndpoint() {
  console.log('\n=== Testing AI Metrics Endpoint ===\n');

  try {
    const response = await axios.get(`${API_BASE}/ai/metrics`);
    console.log('Status:', response.status);
    console.log('Metrics:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing AI Metrics Endpoint:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

async function testAICostReportEndpoint() {
  console.log('\n=== Testing AI Cost Report Endpoint ===\n');

  try {
    const response = await axios.get(`${API_BASE}/ai/cost-report`);
    console.log('Status:', response.status);
    console.log('Cost Report:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing AI Cost Report Endpoint:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

async function main() {
  try {
    await testAIExecuteEndpoint();
    await testAIHealthEndpoint();
    await testAIMetricsEndpoint();
    await testAICostReportEndpoint();
    console.log('\n=== All API Tests Completed ===');
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();
