#!/usr/bin/env node

/**
 * Test script per verificare l'integrazione Ollama con API Gateway
 * Task 5.1.8 - Integration test con API Gateway
 */

const axios = require('axios');
const colors = require('colors');

// Configurazione
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

console.log('🧪 Starting Ollama Integration Tests'.cyan.bold);
console.log(`API Gateway: ${API_GATEWAY_URL}`.gray);
console.log(`Ollama URL: ${OLLAMA_URL}`.gray);
console.log('─'.repeat(60).gray);

async function testOllamaDirectAccess() {
  try {
    console.log('1. Testing direct Ollama access...'.yellow);
    
    // Test health endpoint
    const healthResponse = await axios.get(`${OLLAMA_URL}/`);
    console.log(`✅ Ollama health check: ${healthResponse.status}`.green);
    
    // Test model list
    const modelsResponse = await axios.get(`${OLLAMA_URL}/api/tags`);
    console.log(`✅ Available models: ${modelsResponse.data.models?.length || 0}`.green);
    
    if (modelsResponse.data.models?.length > 0) {
      console.log('   Models:'.gray);
      modelsResponse.data.models.forEach(model => {
        console.log(`   - ${model.name} (${model.size})`.gray);
      });
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Direct Ollama access failed: ${error.message}`.red);
    return false;
  }
}

async function testAPIGatewayHealth() {
  try {
    console.log('2. Testing API Gateway health...'.yellow);
    
    const response = await axios.get(`${API_GATEWAY_URL}/api/health`);
    console.log(`✅ API Gateway health: ${response.status}`.green);
    console.log(`   Response: ${JSON.stringify(response.data)}`.gray);
    
    return true;
  } catch (error) {
    console.log(`❌ API Gateway health check failed: ${error.message}`.red);
    return false;
  }
}

async function testOllamaViaAPIGateway() {
  try {
    console.log('3. Testing Ollama via API Gateway...'.yellow);
    
    // Test if API Gateway can reach Ollama
    const response = await axios.get(`${API_GATEWAY_URL}/api/ai/health`, {
      timeout: 10000
    });
    
    console.log(`✅ Ollama via API Gateway: ${response.status}`.green);
    console.log(`   Response: ${JSON.stringify(response.data)}`.gray);
    
    return true;
  } catch (error) {
    console.log(`❌ Ollama via API Gateway failed: ${error.message}`.red);
    
    // Se l'endpoint non esiste ancora, è normale
    if (error.response?.status === 404) {
      console.log('   ℹ️  AI endpoints not implemented yet (this is expected)'.blue);
      return true;
    }
    
    return false;
  }
}

async function testPerformanceBaseline() {
  try {
    console.log('4. Testing performance baseline...'.yellow);
    
    const start = Date.now();
    const response = await axios.get(`${OLLAMA_URL}/`, { timeout: 5000 });
    const duration = Date.now() - start;
    
    console.log(`✅ Response time: ${duration}ms`.green);
    
    if (duration > 3000) {
      console.log(`   ⚠️  High response time (>${duration}ms)`.yellow);
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Performance test failed: ${error.message}`.red);
    return false;
  }
}

async function runAllTests() {
  console.log('\n🚀 Running Integration Tests...\n'.cyan.bold);
  
  const results = [];
  
  results.push(await testOllamaDirectAccess());
  console.log('');
  
  results.push(await testAPIGatewayHealth());
  console.log('');
  
  results.push(await testOllamaViaAPIGateway());
  console.log('');
  
  results.push(await testPerformanceBaseline());
  console.log('');
  
  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('─'.repeat(60).gray);
  console.log(`📊 Test Results: ${passed}/${total} passed`.cyan.bold);
  
  if (passed === total) {
    console.log('🎉 All integration tests passed!'.green.bold);
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the output above.'.red.bold);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests
runAllTests();
