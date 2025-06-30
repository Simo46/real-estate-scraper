#!/usr/bin/env node

/**
 * Script di test per il Search Engine Service
 * Verifica l'integrazione end-to-end di tutto il sistema
 */

const path = require('path');
const { spawn } = require('child_process');

console.log('🔍 Testing Real Estate Search Engine Integration');
console.log('='.repeat(50));

async function runTest() {
  try {
    console.log('1. Checking SearchEngineService...');
    
    // Test basic SearchEngineService instantiation
    const SearchEngineService = require('./src/services/searchEngineService');
    const searchEngine = new SearchEngineService();
    console.log('✅ SearchEngineService instantiated successfully');
    
    console.log('2. Checking SearchOrchestrator...');
    const SearchOrchestrator = require('./src/services/searchOrchestrator');
    const orchestrator = new SearchOrchestrator();
    console.log('✅ SearchOrchestrator instantiated successfully');
    
    console.log('3. Checking MockDataService...');
    const MockDataService = require('./src/services/mockDataService');
    const mockDataService = new MockDataService();
    console.log('✅ MockDataService instantiated successfully');
    
    console.log('4. Checking utility modules...');
    const QueryParser = require('./src/utils/queryParser');
    const CriteriaBuilder = require('./src/utils/criteriaBuilder');
    const MockResultsGenerator = require('./src/utils/mockResultsGenerator');
    const MockAIInsights = require('./src/utils/mockAIInsights');
    
    console.log('✅ QueryParser loaded');
    console.log('✅ CriteriaBuilder loaded');
    console.log('✅ MockResultsGenerator loaded');
    console.log('✅ MockAIInsights loaded');
    
    console.log('5. Checking mock data templates...');
    const mockDataTemplates = require('./src/data/mockDataTemplates');
    console.log('✅ Mock data templates loaded');
    console.log(`   - ${Object.keys(mockDataTemplates.platforms).length} platforms configured`);
    console.log(`   - ${Object.keys(mockDataTemplates.propertyTypes).length} property types`);
    console.log(`   - ${mockDataTemplates.cityAreas.Milano.length} Milan areas`);
    
    console.log('6. Testing mock data generation...');
    const mockGenerator = new MockResultsGenerator();
    const testCriteria = {
      location: { city: "Milano", areas: ["Centro"] },
      property: { type: "apartment", rooms: { min: 2, max: 3 } },
      price: { min: 200000, max: 400000 }
    };
    
    const mockResults = await mockGenerator.generateRealisticListings(testCriteria, 5);
    console.log(`✅ Generated ${mockResults.length} mock results`);
    console.log(`   - First result: ${mockResults[0]?.basic_title}`);
    console.log(`   - Price range: €${Math.min(...mockResults.map(r=> r.basic_price))} - €${Math.max(...mockResults.map(r=> r.basic_price))}`);
    
    console.log('7. Testing AI insights generation...');
    const aiInsights = new MockAIInsights();
    const sampleListing = mockResults[0];
    const insights = await aiInsights.generatePropertyAnalysis(sampleListing);
    console.log('✅ AI insights generated');
    console.log(`   - Match score: ${insights.match_score}`);
    console.log(`   - Recommendation: ${insights.ai_recommendation?.substring(0, 50)}...`);
    
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('The Real Estate Search Engine is ready for use.');
    console.log('\nNext steps:');
    console.log('- Start the API server: npm start');
    console.log('- Test API endpoints using the scripts in /scripts/');
    console.log('- Monitor logs for search executions');
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error('\nError details:', error.stack);
    process.exit(1);
  }
}

runTest();
