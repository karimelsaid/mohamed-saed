require('./loadEnv');
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/automation';

async function testSingleRequest() {
  console.log('=== Testing Single AI Request ===\n');

  try {
    console.log('Sending request...');
    const response = await axios.post(`${API_BASE}/ai/execute`, {
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
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    if (response.data.success) {
      console.log('Generated Hashtags:', response.data.text);
      console.log('Provider:', response.data.provider);
      console.log('Model:', response.data.model);
      console.log('Tokens:', response.data.tokens);
      console.log('Cost:', response.data.cost);
      console.log('Execution Time:', response.data.executionTime, 'ms');
    } else {
      console.log('Error:', response.data.error);
    }
    console.log();

    // Wait a bit for logging to complete
    console.log('Waiting 2 seconds for logging...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check metrics
    console.log('\n=== Checking Metrics After Request ===');
    const metricsResponse = await axios.get(`${API_BASE}/ai/metrics`);
    console.log('Metrics:', JSON.stringify(metricsResponse.data, null, 2));

    // Check cost report
    console.log('\n=== Checking Cost Report After Request ===');
    const costResponse = await axios.get(`${API_BASE}/ai/cost-report`);
    console.log('Cost Report:', JSON.stringify(costResponse.data, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

testSingleRequest();
