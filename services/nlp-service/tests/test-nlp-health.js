#!/usr/bin/env node

/**
 * Test di health check per NLP Service
 * Verifica che il servizio sia raggiungibile e operativo
 */

const axios = require('axios');
const colors = require('colors');

// Configurazione
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://localhost:8002';

console.log('🏥 NLP Service Health Check'.cyan.bold);
console.log(`Service URL: ${NLP_SERVICE_URL}`.gray);
console.log('─'.repeat(50).gray);

async function healthCheck() {
  try {
    console.log('Checking NLP Service health...'.yellow);
    
    const response = await axios.get(`${NLP_SERVICE_URL}/health`, { timeout: 5000 });
    
    console.log(`✅ Health check: ${response.status}`.green);
    console.log(`   Status: ${response.data.status}`.gray);
    console.log(`   Ollama connection: ${response.data.ollama_connection}`.gray);
    console.log(`   Service version: ${response.data.version}`.gray);
    
    if (response.data.status === 'healthy') {
      console.log('🎉 NLP Service is healthy!'.green.bold);
      return true;
    } else if (response.data.status === 'warning') {
      console.log('⚠️  NLP Service has warnings (acceptable in development)'.yellow);
      return true;
    } else {
      console.log('❌ NLP Service is not healthy'.red);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Health check failed: ${error.message}`.red);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   💡 Is the NLP Service running?'.blue);
      console.log('   Try: docker-compose up nlp-service'.blue);
    }
    
    return false;
  }
}

async function statusCheck() {
  try {
    console.log('Checking NLP Service status...'.yellow);
    
    const response = await axios.get(`${NLP_SERVICE_URL}/status`, { timeout: 5000 });
    
    console.log(`✅ Status check: ${response.status}`.green);
    console.log(`   Service: ${response.data.service}`.gray);
    console.log(`   Uptime: ${response.data.uptime}s`.gray);
    
    return true;
    
  } catch (error) {
    console.log(`❌ Status check failed: ${error.message}`.red);
    return false;
  }
}

async function runHealthChecks() {
  console.log('\n🚀 Running NLP Service Health Checks...\n'.cyan.bold);
  
  const healthResult = await healthCheck();
  console.log('');
  
  const statusResult = await statusCheck();
  console.log('');
  
  console.log('─'.repeat(50).gray);
  
  if (healthResult && statusResult) {
    console.log('✅ All health checks passed!'.green.bold);
    process.exit(0);
  } else {
    console.log('❌ Some health checks failed'.red.bold);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run health checks
runHealthChecks();
