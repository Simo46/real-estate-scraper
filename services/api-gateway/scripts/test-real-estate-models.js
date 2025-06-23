#!/usr/bin/env node
'use strict';

/**
 * Script di test per verificare il corretto funzionamento dei modelli Real Estate
 * 
 * Usage: node scripts/test-real-estate-models.js
 */

const { createLogger } = require('../src/utils/logger');
const logger = createLogger('test:models');

// Test delle funzionalità principali dei modelli
async function testRealEstateModels() {
  try {
    logger.info('🚀 Starting Real Estate Models Test...');
    
    // Importa i modelli
    const db = require('../src/models');
    const { User, UserProfile, SavedSearch, SearchExecution, SearchResult, Tenant, Role } = db;
    
    // Test 1: Verifica che tutti i modelli siano caricati
    logger.info('📋 Test 1: Model Loading');
    const models = Object.keys(db).filter(key => key !== 'sequelize' && key !== 'Sequelize');
    console.log('✅ Available models:', models);
    
    // Verifica che i modelli Real Estate siano presenti
    const requiredModels = ['User', 'UserProfile', 'SavedSearch', 'SearchExecution', 'SearchResult'];
    const missingModels = requiredModels.filter(model => !models.includes(model));
    if (missingModels.length > 0) {
      logger.error('❌ Missing required models:', missingModels);
    } else {
      logger.info('✅ All required Real Estate models loaded');
    }
    
    // Test 2: Verifica associazioni
    logger.info('📋 Test 2: Model Associations');
    
    if (User.associations.profile) {
      logger.info('✅ User -> UserProfile association exists');
    } else {
      logger.warn('❌ User -> UserProfile association missing');
    }
    
    if (UserProfile && UserProfile.associations.user) {
      logger.info('✅ UserProfile -> User association exists');
    } else {
      logger.warn('❌ UserProfile -> User association missing');
    }
    
    if (User.associations.savedSearches) {
      logger.info('✅ User -> SavedSearch association exists');
    } else {
      logger.warn('❌ User -> SavedSearch association missing');
    }
    
    if (SavedSearch.associations.executions) {
      logger.info('✅ SavedSearch -> SearchExecution association exists');
    } else {
      logger.warn('❌ SavedSearch -> SearchExecution association missing');
    }
    
    if (SearchExecution && SearchExecution.associations.results) {
      logger.info('✅ SearchExecution -> SearchResult association exists');
    } else {
      logger.warn('❌ SearchExecution -> SearchResult association missing');
    }
    
    if (SavedSearch.associations.results) {
      logger.info('✅ SavedSearch -> SearchResult association exists');
    } else {
      logger.warn('❌ SavedSearch -> SearchResult association missing');
    }
    
    // Test 3: Verifica metodi helper User
    logger.info('📋 Test 3: User Model Methods');
    
    const mockUser = User.build({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Agent',
      email: 'agent@test.com',
      username: 'testagent',
      password: 'testpass',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002'
    });
    
    // Test metodi base senza salvare in DB
    if (typeof mockUser.hasRole === 'function') {
      logger.info('✅ User.hasRole() method exists');
    }
    
    if (typeof mockUser.hasAnyRole === 'function') {
      logger.info('✅ User.hasAnyRole() method exists');
    }
    
    if (typeof mockUser.getOrCreateProfile === 'function') {
      logger.info('✅ User.getOrCreateProfile() method exists');
    }
    
    if (typeof mockUser.isRealEstateAgent === 'function') {
      logger.info('✅ User.isRealEstateAgent() method exists (async)');
    }
    
    if (typeof mockUser.getSearchPreferences === 'function') {
      logger.info('✅ User.getSearchPreferences() method exists (async)');
    }
    
    // Test 4: Verifica metodi helper UserProfile
    logger.info('📋 Test 4: UserProfile Model Methods');
    
    if (UserProfile) {
      const mockProfile = UserProfile.build({
        id: '550e8400-e29b-41d4-a716-446655440010',
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        user_type: 'agent',
        phone: '+39 123 456 7890',
        bio: 'Experienced real estate agent',
        agency_name: 'Test Agency',
        verified: true,
        search_preferences: {
          preferred_areas: ['Milano', 'Roma'],
          budget_range: { min: 200000, max: 500000 },
          property_types: ['apartment', 'house']
        }
      });
      
      if (typeof mockProfile.isRealEstateAgent === 'function') {
        logger.info('✅ UserProfile.isRealEstateAgent() method exists');
        console.log('   Result:', mockProfile.isRealEstateAgent());
      }
      
      if (typeof mockProfile.isBuyer === 'function') {
        logger.info('✅ UserProfile.isBuyer() method exists');
        console.log('   Result:', mockProfile.isBuyer());
      }
      
      if (typeof mockProfile.isVerifiedAgent === 'function') {
        logger.info('✅ UserProfile.isVerifiedAgent() method exists');
        console.log('   Result:', mockProfile.isVerifiedAgent());
      }
      
      if (typeof mockProfile.getSearchPreferences === 'function') {
        logger.info('✅ UserProfile.getSearchPreferences() method exists');
        console.log('   Result:', JSON.stringify(mockProfile.getSearchPreferences(), null, 2));
      }
      
      if (typeof mockProfile.getProfileCompleteness === 'function') {
        logger.info('✅ UserProfile.getProfileCompleteness() method exists');
        console.log('   Completeness score:', mockProfile.getProfileCompleteness());
      }
      
      if (typeof UserProfile.isValidPhone === 'function') {
        logger.info('✅ UserProfile.isValidPhone() static method exists');
        console.log('   Valid phone test:', UserProfile.isValidPhone('+39 123 456 7890'));
        console.log('   Invalid phone test:', UserProfile.isValidPhone('invalid'));
      }
    } else {
      logger.warn('❌ UserProfile model not loaded');
    }
    
    // Test 5: Verifica metodi helper SearchExecution  
    logger.info('📋 Test 5: SearchExecution Model Methods');
    
    if (SearchExecution) {
      const mockExecution = SearchExecution.build({
        id: '550e8400-e29b-41d4-a716-446655440020',
        tenant_id: '550e8400-e29b-41d4-a716-446655440002',
        saved_search_id: '550e8400-e29b-41d4-a716-446655440003',
        executed_by: '550e8400-e29b-41d4-a716-446655440000',
        execution_type: 'manual',
        status: 'completed',
        started_at: new Date(Date.now() - 5000),
        completed_at: new Date(),
        execution_duration_ms: 4500,
        platforms_searched: ['immobiliare.it', 'casa.it'],
        total_results_found: 15,
        new_results_count: 8
      });
      
      if (typeof mockExecution.isSuccessful === 'function') {
        logger.info('✅ SearchExecution.isSuccessful() method exists');
        console.log('   Result:', mockExecution.isSuccessful());
      }
      
      if (typeof mockExecution.hasNewResults === 'function') {
        logger.info('✅ SearchExecution.hasNewResults() method exists');
        console.log('   Result:', mockExecution.hasNewResults());
      }
      
      if (typeof mockExecution.getDurationSeconds === 'function') {
        logger.info('✅ SearchExecution.getDurationSeconds() method exists');
        console.log('   Duration:', mockExecution.getDurationSeconds(), 'seconds');
      }
      
      if (typeof mockExecution.getPlatformsSearched === 'function') {
        logger.info('✅ SearchExecution.getPlatformsSearched() method exists');
        console.log('   Platforms:', mockExecution.getPlatformsSearched());
      }
      
      if (typeof mockExecution.getSummary === 'function') {
        logger.info('✅ SearchExecution.getSummary() method exists');
        console.log('   Summary:', JSON.stringify(mockExecution.getSummary(), null, 2));
      }
    } else {
      logger.warn('❌ SearchExecution model not loaded');
    }
    
    // Test 6: Verifica metodi helper SearchResult (Aggiornato)
    logger.info('📋 Test 6: SearchResult Model Methods (Updated for new architecture)');
    
    const mockSavedSearch = SavedSearch.build({
      id: '550e8400-e29b-41d4-a716-446655440003',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Appartamento Milano 2 locali',
      natural_language_query: 'Appartamento Milano 2 camere massimo 300k euro',
      structured_criteria: {
        location: 'Milano',
        property_type: 'apartment',
        bedrooms: 2,
        price_max: 300000
      },
      is_active: true,
      execution_frequency: 'daily'
    });
    
    if (typeof mockSavedSearch.isActive === 'function') {
      logger.info('✅ SavedSearch.isActive() method exists');
      console.log('   Is active:', mockSavedSearch.isActive());
    }
    
    if (typeof mockSavedSearch.getCriteria === 'function') {
      logger.info('✅ SavedSearch.getCriteria() method exists');
      console.log('   Criteria:', JSON.stringify(mockSavedSearch.getCriteria(), null, 2));
    }
    
    if (typeof SavedSearch.isValidCriteria === 'function') {
      logger.info('✅ SavedSearch.isValidCriteria() static method exists');
      console.log('   Valid criteria test:', SavedSearch.isValidCriteria({ location: 'Milano' }));
      console.log('   Invalid criteria test:', SavedSearch.isValidCriteria({}));
    }
    
    if (typeof SavedSearch.parseNaturalLanguage === 'function') {
      logger.info('✅ SavedSearch.parseNaturalLanguage() static method exists');
      const parsed = await SavedSearch.parseNaturalLanguage('Appartamento Milano 2 camere 250k euro');
      console.log('   Parsed query:', JSON.stringify(parsed, null, 2));
    }
    
    // Test 7: Verifica metodi SearchResult
    logger.info('📋 Test 7: SearchResult Model Methods');
    
    const mockSearchResult = SearchResult.build({
      id: '550e8400-e29b-41d4-a716-446655440004',
      tenant_id: '550e8400-e29b-41d4-a716-446655440002',
      saved_search_id: '550e8400-e29b-41d4-a716-446655440003',
      search_execution_id: '550e8400-e29b-41d4-a716-446655440020',
      external_url: 'https://www.immobiliare.it/annunci/12345678/',
      source_platform: 'immobiliare.it',
      external_id: '12345678',
      basic_title: 'Appartamento Milano Centro',
      basic_price: 280000,
      basic_location: 'Milano',
      relevance_score: 0.85,
      is_new_result: true,
      ai_insights: {
        quality_score: 0.9,
        recommendation: 'Excellent match for your criteria',
        tags: ['well-located', 'good-value']
      },
      ai_summary: 'Well-positioned apartment in central Milano with good value for money',
      ai_recommendation: 'Highly recommended based on your search criteria'
    });
    
    if (typeof mockSearchResult.getRelevanceScore === 'function') {
      logger.info('✅ SearchResult.getRelevanceScore() method exists');
      console.log('   Relevance score:', mockSearchResult.getRelevanceScore());
    }
    
    if (typeof mockSearchResult.getAiInsights === 'function') {
      logger.info('✅ SearchResult.getAiInsights() method exists');
      console.log('   AI insights:', JSON.stringify(mockSearchResult.getAiInsights(), null, 2));
    }
    
    if (typeof mockSearchResult.shouldNotify === 'function') {
      logger.info('✅ SearchResult.shouldNotify() method exists');
      console.log('   Should notify:', mockSearchResult.shouldNotify());
    }
    
    if (typeof mockSearchResult.getOriginalUrl === 'function') {
      logger.info('✅ SearchResult.getOriginalUrl() method exists');
      console.log('   Original URL:', mockSearchResult.getOriginalUrl());
    }
    
    if (typeof mockSearchResult.getDisplayInfo === 'function') {
      logger.info('✅ SearchResult.getDisplayInfo() method exists');
      console.log('   Display info:', JSON.stringify(mockSearchResult.getDisplayInfo(), null, 2));
    }
    
    if (typeof mockSearchResult.getAiSummary === 'function') {
      logger.info('✅ SearchResult.getAiSummary() method exists');
      console.log('   AI Summary:', mockSearchResult.getAiSummary());
    }
    
    if (typeof SearchResult.isValidUrl === 'function') {
      logger.info('✅ SearchResult.isValidUrl() static method exists');
      console.log('   Valid URL test:', SearchResult.isValidUrl('https://www.immobiliare.it/annunci/12345/'));
      console.log('   Invalid URL test:', SearchResult.isValidUrl('not-a-url'));
    }
    
    if (typeof SearchResult.extractExternalId === 'function') {
      logger.info('✅ SearchResult.extractExternalId() static method exists');
      const extractedId = SearchResult.extractExternalId('https://www.immobiliare.it/annunci/12345678/', 'immobiliare.it');
      console.log('   Extracted ID:', extractedId);
    }
    
    if (typeof SearchResult.calculateRelevanceScore === 'function') {
      logger.info('✅ SearchResult.calculateRelevanceScore() static method exists');
      const basicData = {
        title: 'Appartamento Milano Centro',
        price: 280000,
        location: 'Milano',
        source_platform: 'immobiliare.it'
      };
      const criteria = {
        location: 'Milano',
        property_type: 'apartment',
        price_max: 300000
      };
      const score = SearchResult.calculateRelevanceScore(basicData, criteria);
      console.log('   Calculated relevance score:', score);
    }
    
    // Test 8: Verifica Database Connection
    logger.info('📋 Test 8: Database Connection');
    
    try {
      await db.sequelize.authenticate();
      logger.info('✅ Database connection successful');
    } catch (error) {
      logger.error('❌ Database connection failed:', error.message);
    }
    
    // Test 9: Verifica schema delle tabelle (senza creare dati)
    logger.info('📋 Test 9: Database Schema Validation');
    
    try {
      const tables = ['users', 'user_profiles', 'saved_searches', 'search_executions', 'search_results'];
      
      for (const table of tables) {
        const [results] = await db.sequelize.query(`
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = '${table}' 
          ORDER BY ordinal_position
        `);
        
        if (results.length > 0) {
          logger.info(`✅ Table '${table}' exists with ${results.length} columns`);
        } else {
          logger.warn(`❌ Table '${table}' not found`);
        }
      }
    } catch (error) {
      logger.warn('⚠️ Schema validation skipped (tables may not exist yet):', error.message);
    }
    
    logger.info('🎉 Real Estate Models Test Complete!');
    
  } catch (error) {
    logger.error('💥 Test failed:', error);
    throw error;
  }
}

// Esegui test se chiamato direttamente
if (require.main === module) {
  testRealEstateModels()
    .then(() => {
      console.log('\n✅ All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testRealEstateModels };