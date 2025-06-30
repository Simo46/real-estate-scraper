'use strict';

const { createLogger } = require('./logger');
const logger = createLogger('utils:mockResultsGenerator');

/**
 * Mock Results Generator - Generazione contenuti realistici
 * Responsabilità:
 * - Generazione contenuti realistici
 * - Diversity nei risultati (prezzi, locations, conditions)
 * - Compliance con metadata-only format
 * - Realistic data distributions
 */
class MockResultsGenerator {
  constructor() {
    // Inizializzazione lazy
    this.mockDataTemplates = null;
    this.mockAIInsights = null;
    
    this.usedCombinations = new Set(); // Per evitare duplicati
  }

  /**
   * Inizializzazione lazy dei templates
   */
  _initializeTemplates() {
    if (!this.mockDataTemplates) {
      this.mockDataTemplates = require('../data/mockDataTemplates');
    }
  }

  /**
   * Genera listing realistici
   * @param {Object} criteria - Criteri di ricerca
   * @param {number} count - Numero di listing da generare
   * @returns {Array} Array di listing realistici
   */
  async generateRealisticListings(criteria, count) {
    this._initializeTemplates();
    
    logger.debug('Generating realistic listings', {
      count,
      location: criteria.location?.city,
      propertyType: criteria.property?.type
    });

    const listings = [];
    this.usedCombinations.clear();

    for (let i = 0; i < count; i++) {
      try {
        const listing = await this.generateListingMetadata(i, criteria);
        
        // Evita duplicati
        const key = `${listing.basic_title}_${listing.basic_price}`;
        if (!this.usedCombinations.has(key)) {
          this.usedCombinations.add(key);
          listings.push(listing);
        }
        
      } catch (error) {
        logger.error('Failed to generate listing', {
          error: error.message,
          index: i
        });
        // Continuiamo con gli altri
      }
    }

    // Aggiungi varietà realistica
    const variedListings = listings.map(listing => 
      this.addRealisticVariation(listing)
    );

    logger.debug('Generated realistic listings', {
      requestedCount: count,
      generatedCount: variedListings.length
    });

    return variedListings;
  }

  /**
   * Genera metadata per un singolo listing
   * @param {number} index - Indice del listing
   * @param {Object} criteria - Criteri di ricerca
   * @returns {Object} Listing metadata
   */
  async generateListingMetadata(index, criteria) {
    this._initializeTemplates();

    // Determina platform
    const platforms = criteria.filters?.platforms || ['immobiliare.it'];
    const platform = platforms[index % platforms.length];

    // Determina location
    const location = this._generateLocation(criteria);

    // Determina property type
    const propertyType = this._generatePropertyType(criteria);

    // Determina details
    const details = this._generatePropertyDetails(criteria, propertyType);

    // Genera prezzo
    const price = this.generateRealisticPricing(
      this._getBasePrice(location, propertyType),
      location.area,
      details.condition
    );

    // Genera titolo
    const title = this.generatePropertyTitle(propertyType, location, details);

    // Genera URL
    const externalUrl = this.generateExternalUrl(platform, index);

    // Genera location string
    const basicLocation = this.generateBasicLocation(location.city, location.area);

    // Calcola relevance score
    const relevanceScore = this._calculateRelevanceScore(
      { title, price, location, details },
      criteria
    );

    return {
      external_url: externalUrl,
      source_platform: platform,
      basic_title: title,
      basic_price: price,
      basic_location: basicLocation,
      relevance_score: relevanceScore,
      metadata: {
        property_type: propertyType,
        location: location,
        details: details,
        generated_at: new Date()
      }
    };
  }

  /**
   * Genera prezzo realistico
   * @param {number} basePrice - Prezzo base
   * @param {string} area - Area della proprietà
   * @param {string} condition - Condizione proprietà
   * @returns {number} Prezzo finale
   */
  generateRealisticPricing(basePrice, area, condition) {
    this._initializeTemplates();

    let finalPrice = basePrice;

    // Moltiplicatore per area
    const areaMultiplier = this.mockDataTemplates.getAreaMultiplier(area);
    finalPrice *= areaMultiplier;

    // Moltiplicatore per condizione
    const conditionMultiplier = this.mockDataTemplates.getConditionMultiplier(condition);
    finalPrice *= conditionMultiplier;

    // Aggiunta di randomness realistica (±15%)
    const randomFactor = 0.85 + Math.random() * 0.3;
    finalPrice *= randomFactor;

    // Arrotonda a migliaia
    finalPrice = Math.round(finalPrice / 1000) * 1000;

    // Assicurati che sia ragionevole
    finalPrice = Math.max(50000, finalPrice);
    finalPrice = Math.min(5000000, finalPrice);

    return finalPrice;
  }

  /**
   * Genera titolo proprietà
   * @param {string} type - Tipo proprietà
   * @param {Object} location - Location info
   * @param {Object} details - Dettagli proprietà
   * @returns {string} Titolo generato
   */
  generatePropertyTitle(type, location, details) {
    this._initializeTemplates();

    const templates = this.mockDataTemplates.getTitleTemplates(type);
    const template = templates[Math.floor(Math.random() * templates.length)];

    return template
      .replace('{type}', this.mockDataTemplates.getPropertyTypeItalian(type))
      .replace('{location}', location.city)
      .replace('{area}', location.area)
      .replace('{rooms}', details.rooms)
      .replace('{size}', details.size)
      .replace('{condition}', this.mockDataTemplates.getConditionItalian(details.condition));
  }

  /**
   * Genera location basica
   * @param {string} city - Città
   * @param {string} area - Area/zona
   * @returns {string} Location string
   */
  generateBasicLocation(city, area) {
    if (area && area !== city) {
      return `${area}, ${city}`;
    }
    return city;
  }

  /**
   * Genera URL esterno
   * @param {string} platform - Piattaforma
   * @param {number} index - Indice per ID univoco
   * @returns {string} URL esterno
   */
  generateExternalUrl(platform, index) {
    this._initializeTemplates();

    const platformConfig = this.mockDataTemplates.getPlatformConfig(platform);
    const listingId = 10000000 + index + Math.floor(Math.random() * 1000000);

    return `${platformConfig.baseUrl}${platformConfig.idFormat.replace('{id}', listingId)}`;
  }

  /**
   * Genera insights AI (preparazione per AI integration)
   * @param {Object} listingData - Dati listing
   * @returns {Object} AI insights
   */
  async generateAIInsights(listingData) {
    // Per ora generiamo insights mock, in futuro sarà AI reale
    return {
      condition_assessment: listingData.metadata.details.condition,
      condition_confidence: 0.7 + Math.random() * 0.3,
      value_analysis: this._assessValue(listingData),
      value_confidence: 0.6 + Math.random() * 0.4,
      location_score: this._scoreLocation(listingData.metadata.location),
      investment_potential: this._assessInvestmentPotential(listingData),
      risk_factors: this._generateRiskFactors(listingData),
      opportunities: this._generateOpportunities(listingData)
    };
  }

  /**
   * Genera summary AI
   * @param {Object} listingData - Dati listing
   * @param {Object} criteria - Criteri ricerca
   * @returns {string} AI summary
   */
  async generateAISummary(listingData, criteria) {
    const summaryTemplates = [
      "Proprietà ben posizionata in zona {area}. Prezzo {price_assessment} al mercato.",
      "{property_type} in {condition} condizioni. Buona opportunità per {target_buyer}.",
      "Immobile interessante con potenziale di {potential}. Ideale per {use_case}.",
      "Proprietà {condition} in zona {desirability}. Consigliata valutazione diretta."
    ];

    const template = summaryTemplates[Math.floor(Math.random() * summaryTemplates.length)];
    
    return template
      .replace('{area}', listingData.metadata.location.area)
      .replace('{price_assessment}', this._getPriceAssessment(listingData))
      .replace('{property_type}', this.mockDataTemplates.getPropertyTypeItalian(listingData.metadata.property_type))
      .replace('{condition}', this.mockDataTemplates.getConditionItalian(listingData.metadata.details.condition))
      .replace('{target_buyer}', this._getTargetBuyer(listingData))
      .replace('{potential}', this._getPotential(listingData))
      .replace('{use_case}', this._getUseCase(listingData))
      .replace('{desirability}', this._getDesirability(listingData.metadata.location));
  }

  /**
   * Genera raccomandazione AI
   * @param {Object} listingData - Dati listing
   * @param {Object} userProfile - Profilo utente (opzionale)
   * @returns {string} AI recommendation
   */
  async generateAIRecommendation(listingData, userProfile = null) {
    const recommendationTemplates = [
      "Consigliato per visita. {action_suggestion}",
      "Buona opportunità. {evaluation_suggestion}",
      "Prezzo interessante. {negotiation_suggestion}",
      "Proprietà promettente. {investigation_suggestion}"
    ];

    const template = recommendationTemplates[Math.floor(Math.random() * recommendationTemplates.length)];
    
    return template
      .replace('{action_suggestion}', this._getActionSuggestion(listingData))
      .replace('{evaluation_suggestion}', this._getEvaluationSuggestion(listingData))
      .replace('{negotiation_suggestion}', this._getNegotiationSuggestion(listingData))
      .replace('{investigation_suggestion}', this._getInvestigationSuggestion(listingData));
  }

  /**
   * Aggiunge variazione realistica ai dati
   * @param {Object} data - Dati base
   * @returns {Object} Dati con variazione
   */
  addRealisticVariation(data) {
    const varied = { ...data };

    // Variazione nel relevance score
    varied.relevance_score = Math.max(0.1, 
      Math.min(1.0, varied.relevance_score + (Math.random() - 0.5) * 0.2)
    );

    // Piccole variazioni nel prezzo (±2%)
    const priceVariation = 1 + (Math.random() - 0.5) * 0.04;
    varied.basic_price = Math.round(varied.basic_price * priceVariation);

    return varied;
  }

  /**
   * Simula qualità dati variabile
   * @param {Object} data - Dati base
   * @param {string} qualityLevel - Livello qualità ('high', 'medium', 'low')
   * @returns {Object} Dati con qualità simulata
   */
  simulateDataQuality(data, qualityLevel = 'medium') {
    const qualityData = { ...data };

    switch (qualityLevel) {
      case 'low':
        // Rimuovi alcuni campi per simulare dati incompleti
        if (Math.random() < 0.3) delete qualityData.basic_location;
        if (Math.random() < 0.2) qualityData.basic_title = qualityData.basic_title.substring(0, 20) + '...';
        break;

      case 'high':
        // Aggiungi dettagli extra
        qualityData.metadata.extra_details = this._generateExtraDetails();
        break;

      default: // medium
        // Qualità normale, nessuna modifica
        break;
    }

    return qualityData;
  }

  /**
   * Genera variazioni di duplicati
   * @param {Object} originalListing - Listing originale
   * @returns {Object} Listing duplicato con variazioni
   */
  generateDuplicateVariations(originalListing) {
    const duplicate = { ...originalListing };

    // Variazioni tipiche nei duplicati
    const titleVariations = [
      duplicate.basic_title,
      duplicate.basic_title.replace('Appartamento', 'App.'),
      duplicate.basic_title.replace('Milano', 'MI'),
      duplicate.basic_title + ' - Libero subito'
    ];

    duplicate.basic_title = titleVariations[Math.floor(Math.random() * titleVariations.length)];

    // Piccole variazioni nel prezzo
    const priceVariations = [0.98, 0.99, 1.01, 1.02];
    const variation = priceVariations[Math.floor(Math.random() * priceVariations.length)];
    duplicate.basic_price = Math.round(duplicate.basic_price * variation);

    // Cambia piattaforma
    const otherPlatforms = ['immobiliare.it', 'casa.it', 'idealista.it']
      .filter(p => p !== duplicate.source_platform);
    duplicate.source_platform = otherPlatforms[Math.floor(Math.random() * otherPlatforms.length)];

    // Genera nuovo URL
    duplicate.external_url = this.generateExternalUrl(
      duplicate.source_platform,
      Math.floor(Math.random() * 1000000)
    );

    return duplicate;
  }

  /**
   * Private helper methods
   */
  _generateLocation(criteria) {
    this._initializeTemplates();

    const city = criteria.location?.city || 'Milano';
    const areas = this.mockDataTemplates.getCityAreas(city);
    const area = areas[Math.floor(Math.random() * areas.length)];

    return {
      city: city,
      area: area.name,
      metro: area.metro,
      multiplier: area.multiplier
    };
  }

  _generatePropertyType(criteria) {
    const preferredType = criteria.property?.type;
    
    if (preferredType && Math.random() < 0.7) {
      return preferredType;
    }

    const types = ['apartment', 'house', 'villa', 'loft'];
    const weights = [0.6, 0.25, 0.1, 0.05]; // Appartamenti più comuni
    
    return this._weightedRandom(types, weights);
  }

  _generatePropertyDetails(criteria, propertyType) {
    this._initializeTemplates();

    const typeConfig = this.mockDataTemplates.getPropertyTypeConfig(propertyType);
    
    // Genera rooms
    let rooms;
    if (criteria.property?.rooms?.exact) {
      rooms = criteria.property.rooms.exact;
    } else if (criteria.property?.rooms?.min || criteria.property?.rooms?.max) {
      const min = criteria.property.rooms.min || 1;
      const max = criteria.property.rooms.max || 5;
      rooms = min + Math.floor(Math.random() * (max - min + 1));
    } else {
      rooms = typeConfig.roomRange[0] + 
        Math.floor(Math.random() * (typeConfig.roomRange[1] - typeConfig.roomRange[0] + 1));
    }

    // Genera size
    let size;
    if (criteria.property?.size_sqm?.min || criteria.property?.size_sqm?.max) {
      const min = criteria.property.size_sqm.min || typeConfig.sizeRange[0];
      const max = criteria.property.size_sqm.max || typeConfig.sizeRange[1];
      size = min + Math.floor(Math.random() * (max - min + 1));
    } else {
      size = typeConfig.sizeRange[0] + 
        Math.floor(Math.random() * (typeConfig.sizeRange[1] - typeConfig.sizeRange[0] + 1));
    }

    // Genera condition
    const conditions = ['excellent', 'good', 'fair'];
    const conditionWeights = [0.2, 0.6, 0.2];
    const condition = this._weightedRandom(conditions, conditionWeights);

    return {
      rooms,
      size,
      condition,
      furnished: Math.random() < 0.3 ? 'yes' : 'no',
      elevator: Math.random() < 0.7,
      parking: Math.random() < 0.4
    };
  }

  _getBasePrice(location, propertyType) {
    this._initializeTemplates();

    const typeConfig = this.mockDataTemplates.getPropertyTypeConfig(propertyType);
    const basePrices = {
      'Milano': 300000,
      'Roma': 250000,
      'Torino': 180000,
      'Firenze': 280000,
      'Napoli': 150000
    };

    const basePrice = basePrices[location.city] || 200000;
    return basePrice * typeConfig.priceMultiplier;
  }

  _calculateRelevanceScore(listing, criteria) {
    let score = 0.5; // Base score

    // Location match
    if (criteria.location?.city && 
        listing.location.city.toLowerCase() === criteria.location.city.toLowerCase()) {
      score += 0.2;
    }

    // Property type match
    if (criteria.property?.type && 
        listing.details.property_type === criteria.property.type) {
      score += 0.15;
    }

    // Price range match
    if (criteria.price) {
      if (criteria.price.min && listing.price >= criteria.price.min) {
        score += 0.1;
      }
      if (criteria.price.max && listing.price <= criteria.price.max) {
        score += 0.1;
      }
    }

    // Rooms match
    if (criteria.property?.rooms?.exact && 
        listing.details.rooms === criteria.property.rooms.exact) {
      score += 0.1;
    }

    // Random factor for realism
    score += (Math.random() - 0.5) * 0.1;

    return Math.max(0.1, Math.min(1.0, score));
  }

  _weightedRandom(items, weights) {
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < items.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        return items[i];
      }
    }
    
    return items[items.length - 1];
  }

  _assessValue(listingData) {
    const assessments = ['under_market', 'market_value', 'over_market'];
    return assessments[Math.floor(Math.random() * assessments.length)];
  }

  _scoreLocation(location) {
    const scores = {
      'Centro': 0.9,
      'Porta Garibaldi': 0.85,
      'Navigli': 0.8,
      'Città Studi': 0.7,
      'Bicocca': 0.65
    };
    
    return scores[location.area] || 0.6;
  }

  _assessInvestmentPotential(listingData) {
    const potentials = ['low', 'medium', 'medium_high', 'high'];
    return potentials[Math.floor(Math.random() * potentials.length)];
  }

  _generateRiskFactors(listingData) {
    const allRisks = [
      'parking_limited',
      'noise_potential', 
      'old_building',
      'high_maintenance',
      'market_volatility'
    ];
    
    const riskCount = Math.floor(Math.random() * 3);
    const risks = [];
    
    for (let i = 0; i < riskCount; i++) {
      const risk = allRisks[Math.floor(Math.random() * allRisks.length)];
      if (!risks.includes(risk)) {
        risks.push(risk);
      }
    }
    
    return risks;
  }

  _generateOpportunities(listingData) {
    const allOpportunities = [
      'metro_expansion_planned',
      'area_gentrification',
      'price_negotiable',
      'quick_sale',
      'renovation_potential'
    ];
    
    const oppCount = Math.floor(Math.random() * 3);
    const opportunities = [];
    
    for (let i = 0; i < oppCount; i++) {
      const opp = allOpportunities[Math.floor(Math.random() * allOpportunities.length)];
      if (!opportunities.includes(opp)) {
        opportunities.push(opp);
      }
    }
    
    return opportunities;
  }

  _getPriceAssessment(listingData) {
    const assessments = ['sotto', 'allineato', 'sopra'];
    return assessments[Math.floor(Math.random() * assessments.length)];
  }

  _getTargetBuyer(listingData) {
    const buyers = ['prima casa', 'investimento', 'famiglia', 'giovani professionisti'];
    return buyers[Math.floor(Math.random() * buyers.length)];
  }

  _getPotential(listingData) {
    const potentials = ['rivalutazione', 'reddito', 'ristrutturazione'];
    return potentials[Math.floor(Math.random() * potentials.length)];
  }

  _getUseCase(listingData) {
    const useCases = ['abitazione principale', 'investimento', 'casa vacanze'];
    return useCases[Math.floor(Math.random() * useCases.length)];
  }

  _getDesirability(location) {
    const desirabilities = ['emergente', 'consolidata', 'prestigiosa'];
    return desirabilities[Math.floor(Math.random() * desirabilities.length)];
  }

  _getActionSuggestion(listingData) {
    const suggestions = [
      'Verificare stato immobile',
      'Valutare possibilità negoziazione',
      'Controllare documenti',
      'Pianificare sopralluogo'
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  _getEvaluationSuggestion(listingData) {
    const suggestions = [
      'Richiedere perizia tecnica',
      'Confrontare prezzi zona',
      'Verificare spese condominiali',
      'Analizzare potenziale reddito'
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  _getNegotiationSuggestion(listingData) {
    const suggestions = [
      'Margine di trattativa presente',
      'Prezzo leggermente alto',
      'Valutare offerta inferiore',
      'Possibile sconto per pronta consegna'
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  _getInvestigationSuggestion(listingData) {
    const suggestions = [
      'Approfondire analisi di mercato',
      'Verificare trend prezzi zona',
      'Analizzare servizi e trasporti',
      'Controllare piani urbanistici'
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  _generateExtraDetails() {
    return {
      floor: Math.floor(Math.random() * 8) + 1,
      year_built: 1950 + Math.floor(Math.random() * 70),
      energy_class: ['A', 'B', 'C', 'D', 'E'][Math.floor(Math.random() * 5)],
      balconies: Math.floor(Math.random() * 3)
    };
  }
}

module.exports = MockResultsGenerator;
