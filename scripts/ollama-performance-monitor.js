#!/usr/bin/env node

/**
 * Performance benchmarking e resource monitoring per Ollama
 * Task 5.1.9 - Performance benchmarking e resource monitoring
 */

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const colors = require('colors');

// Configurazione
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MONITOR_DURATION = 30; // secondi
const BENCHMARK_ITERATIONS = 5;

console.log('📊 Starting Ollama Performance Monitor'.cyan.bold);
console.log(`Ollama URL: ${OLLAMA_URL}`.gray);
console.log(`Monitor Duration: ${MONITOR_DURATION}s`.gray);
console.log('─'.repeat(60).gray);

// Funzione per ottenere stats Docker del container Ollama
async function getDockerStats() {
  return new Promise((resolve, reject) => {
    const docker = spawn('docker', ['stats', '--no-stream', '--format', 'table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}']);
    
    let output = '';
    docker.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    docker.on('close', (code) => {
      if (code === 0) {
        const lines = output.split('\n').filter(line => line.includes('ollama'));
        if (lines.length > 0) {
          const stats = lines[0].split('\t');
          resolve({
            container: stats[0],
            cpu: stats[1],
            memory: stats[2],
            memoryPerc: stats[3]
          });
        } else {
          resolve(null);
        }
      } else {
        reject(new Error(`Docker stats failed with code ${code}`));
      }
    });
  });
}

// Funzione per test di latenza
async function testLatency() {
  const results = [];
  console.log('🔍 Testing latency...'.yellow);
  
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const start = Date.now();
    try {
      await axios.get(`${OLLAMA_URL}/`, { timeout: 5000 });
      const duration = Date.now() - start;
      results.push(duration);
      console.log(`   Test ${i + 1}: ${duration}ms`.gray);
    } catch (error) {
      console.log(`   Test ${i + 1}: FAILED - ${error.message}`.red);
      results.push(null);
    }
  }
  
  const validResults = results.filter(r => r !== null);
  if (validResults.length > 0) {
    const avg = validResults.reduce((a, b) => a + b, 0) / validResults.length;
    const min = Math.min(...validResults);
    const max = Math.max(...validResults);
    
    console.log(`✅ Latency stats: avg=${avg.toFixed(2)}ms, min=${min}ms, max=${max}ms`.green);
    return { avg, min, max, success: validResults.length, total: BENCHMARK_ITERATIONS };
  } else {
    console.log('❌ All latency tests failed'.red);
    return null;
  }
}

// Funzione per test di throughput
async function testThroughput() {
  console.log('🚀 Testing throughput...'.yellow);
  
  const start = Date.now();
  const promises = [];
  
  // Test con 10 richieste concorrenti
  for (let i = 0; i < 10; i++) {
    promises.push(
      axios.get(`${OLLAMA_URL}/`, { timeout: 10000 })
        .then(() => ({ success: true, index: i }))
        .catch(error => ({ success: false, index: i, error: error.message }))
    );
  }
  
  const results = await Promise.all(promises);
  const duration = Date.now() - start;
  const successful = results.filter(r => r.success).length;
  
  console.log(`✅ Throughput: ${successful}/10 requests in ${duration}ms`.green);
  console.log(`   Rate: ${(successful * 1000 / duration).toFixed(2)} req/sec`.gray);
  
  return { successful, total: 10, duration, rate: successful * 1000 / duration };
}

// Funzione per monitoraggio risorse
async function monitorResources() {
  console.log(`🔬 Monitoring resources for ${MONITOR_DURATION}s...`.yellow);
  
  const measurements = [];
  const interval = 2000; // 2 secondi
  const iterations = Math.floor(MONITOR_DURATION * 1000 / interval);
  
  for (let i = 0; i < iterations; i++) {
    try {
      const stats = await getDockerStats();
      if (stats) {
        measurements.push({
          timestamp: new Date().toISOString(),
          cpu: stats.cpu,
          memory: stats.memory,
          memoryPerc: stats.memoryPerc
        });
        console.log(`   ${i + 1}/${iterations}: CPU=${stats.cpu}, Memory=${stats.memory}`.gray);
      }
    } catch (error) {
      console.log(`   ${i + 1}/${iterations}: FAILED - ${error.message}`.red);
    }
    
    if (i < iterations - 1) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  
  return measurements;
}

// Funzione per verificare modelli disponibili
async function checkModels() {
  console.log('📋 Checking available models...'.yellow);
  
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    const models = response.data.models || [];
    
    console.log(`✅ Found ${models.length} models:`.green);
    models.forEach(model => {
      console.log(`   - ${model.name} (${model.size})`.gray);
    });
    
    return models;
  } catch (error) {
    console.log(`❌ Failed to check models: ${error.message}`.red);
    return [];
  }
}

// Funzione per generare report
function generateReport(data) {
  const report = {
    timestamp: new Date().toISOString(),
    ollama_url: OLLAMA_URL,
    ...data
  };
  
  const reportPath = `./logs/ollama-performance-${Date.now()}.json`;
  
  // Crea directory logs se non exists
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs');
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportPath}`.blue);
  
  return reportPath;
}

// Funzione principale
async function runPerformanceMonitoring() {
  console.log('\n🚀 Starting Performance Monitoring...\n'.cyan.bold);
  
  const results = {};
  
  // Test latenza
  results.latency = await testLatency();
  console.log('');
  
  // Test throughput
  results.throughput = await testThroughput();
  console.log('');
  
  // Verifica modelli
  results.models = await checkModels();
  console.log('');
  
  // Monitoraggio risorse
  results.resources = await monitorResources();
  console.log('');
  
  // Genera report
  const reportPath = generateReport(results);
  
  // Summary
  console.log('─'.repeat(60).gray);
  console.log('📊 Performance Summary'.cyan.bold);
  
  if (results.latency) {
    console.log(`   Average Latency: ${results.latency.avg.toFixed(2)}ms`.green);
  }
  
  if (results.throughput) {
    console.log(`   Throughput: ${results.throughput.rate.toFixed(2)} req/sec`.green);
  }
  
  console.log(`   Models Available: ${results.models.length}`.green);
  console.log(`   Resource Samples: ${results.resources.length}`.green);
  
  // Raccomandazioni
  console.log('\n💡 Recommendations:'.cyan.bold);
  
  if (results.latency && results.latency.avg > 1000) {
    console.log('   ⚠️  High latency detected. Consider optimizing Docker resources.'.yellow);
  }
  
  if (results.models.length === 0) {
    console.log('   ⚠️  No models available. Consider downloading llama3.2:3b.'.yellow);
  }
  
  if (results.throughput && results.throughput.rate < 5) {
    console.log('   ⚠️  Low throughput. Consider increasing memory allocation.'.yellow);
  }
  
  console.log(`\n📄 Full report: ${reportPath}`.blue);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run monitoring
runPerformanceMonitoring().catch(console.error);
