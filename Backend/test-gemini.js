require('./loadEnv');
const GeminiProvider = require('./ai/providers/gemini.provider');
const aiOrchestrator = require('./ai/services/ai-orchestrator.service');

async function testGeminiProvider() {
  console.log('=== Testing Gemini Provider ===\n');

  const geminiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    timeout: 30000
  };

  const gemini = new GeminiProvider(geminiConfig);

  try {
    // Test 1: Health Check
    console.log('Test 1: Health Check');
    const isHealthy = await gemini.healthCheck();
    console.log('Health Status:', isHealthy ? '✅ Healthy' : '❌ Unhealthy');
    console.log();

    // Test 2: Generate Text
    console.log('Test 2: Generate Text');
    try {
      const textResult = await gemini.generateText({
        prompt: 'Write a short caption for a book about Egyptian history in Arabic',
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxTokens: 200
      });
      console.log('Success:', textResult.success);
      if (textResult.success) {
        console.log('Generated Text:', textResult.text);
        console.log('Tokens:', textResult.tokens);
        console.log('Cost:', textResult.cost);
        console.log('Execution Time:', textResult.executionTime, 'ms');
      } else {
        console.log('Error:', textResult.error);
      }
    } catch (error) {
      console.log('Exception:', error.message);
      console.log('Stack:', error.stack);
    }
    console.log();

    // Test 3: Generate JSON
    console.log('Test 3: Generate JSON');
    const jsonResult = await gemini.generateJSON({
      prompt: 'Generate a JSON object with caption and hashtags for a book about Egyptian history',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 200
    });
    console.log('Success:', jsonResult.success);
    if (jsonResult.success) {
      console.log('Generated JSON:', JSON.stringify(jsonResult.json, null, 2));
      console.log('Tokens:', jsonResult.tokens);
      console.log('Cost:', jsonResult.cost);
      console.log('Execution Time:', jsonResult.executionTime, 'ms');
    } else {
      console.log('Error:', jsonResult.error);
    }
    console.log();

    // Test 4: Generate Embedding
    console.log('Test 4: Generate Embedding');
    const embeddingResult = await gemini.generateEmbedding({
      text: 'Egyptian history book',
      model: 'gemini-embedding-001'
    });
    console.log('Success:', embeddingResult.success);
    if (embeddingResult.success) {
      console.log('Embedding Dimensions:', embeddingResult.embedding.length);
      console.log('Tokens:', embeddingResult.tokens);
      console.log('Cost:', embeddingResult.cost);
      console.log('Execution Time:', embeddingResult.executionTime, 'ms');
    } else {
      console.log('Error:', embeddingResult.error);
    }
    console.log();

    // Test 5: Get Available Models
    console.log('Test 5: Get Available Models');
    const models = await gemini.getAvailableModels();
    console.log('Available Models:', models);
    console.log();

  } catch (error) {
    console.error('Error testing Gemini Provider:', error.message);
  }
}

async function testAIOrchestrator() {
  console.log('\n=== Testing AI Orchestrator with Gemini ===\n');

  try {
    // Test 1: Execute generate_caption task
    console.log('Test 1: Execute generate_caption task');
    const captionResult = await aiOrchestrator.execute('generate_caption', {
      name: 'The Great Pyramids',
      description: 'A comprehensive guide to Egyptian pyramids',
      price: '150',
      category: 'روايات',
      tone: 'emotional'
    });
    console.log('Success:', captionResult.success);
    if (captionResult.success) {
      console.log('Generated Caption:', captionResult.text);
      console.log('Provider:', captionResult.provider);
      console.log('Model:', captionResult.model);
      console.log('Tokens:', captionResult.tokens);
      console.log('Cost:', captionResult.cost);
      console.log('Execution Time:', captionResult.executionTime, 'ms');
      console.log('Cached:', captionResult.cached);
    } else {
      console.log('Error:', captionResult.error);
    }
    console.log();

    // Test 2: Execute generate_hashtags task
    console.log('Test 2: Execute generate_hashtags task');
    const hashtagsResult = await aiOrchestrator.execute('generate_hashtags', {
      name: 'The Great Pyramids',
      description: 'A comprehensive guide to Egyptian pyramids',
      category: 'روايات'
    });
    console.log('Success:', hashtagsResult.success);
    if (hashtagsResult.success) {
      console.log('Generated Hashtags:', hashtagsResult.text);
      console.log('Provider:', hashtagsResult.provider);
      console.log('Model:', hashtagsResult.model);
      console.log('Tokens:', hashtagsResult.tokens);
      console.log('Cost:', hashtagsResult.cost);
      console.log('Execution Time:', hashtagsResult.executionTime, 'ms');
    } else {
      console.log('Error:', hashtagsResult.error);
    }
    console.log();

    // Test 3: Health Check
    console.log('Test 3: Health Check');
    const health = await aiOrchestrator.healthCheck();
    console.log('Health Status:', health);
    console.log();

    // Test 4: Get Available Models
    console.log('Test 4: Get Available Models for Gemini');
    const models = await aiOrchestrator.getAvailableModels('gemini');
    console.log('Available Models:', models);
    console.log();

  } catch (error) {
    console.error('Error testing AI Orchestrator:', error.message);
  }
}

async function main() {
  try {
    await testGeminiProvider();
    await testAIOrchestrator();
    console.log('\n=== All Tests Completed ===');
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();
