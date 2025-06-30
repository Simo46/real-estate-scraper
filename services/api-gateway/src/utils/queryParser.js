'use strict';

const { createLogger } = require('./logger');
const logger = createLogger('utils:queryParser');

/**
 * Query Parser Utility - Parsing di query in linguaggio naturale
 * Responsabilità:
 * - Parsing initial di natural language queries
 * - Estrazione di entità e intent (preparazione per AI)
 * - Fallback su structured criteria parsing
 * - Query normalization e cleanup
 */
class QueryParser {
  constructor() {
    this.locationKeywords = {
      'milano': ['milano', 'milan', 'milano centro', 'mi'],
      'roma': ['roma', 'rome', 'roma centro'],
      'torino': ['torino', 'turin', 'to'],
      'napoli': ['napoli', 'naples', 'na']
    };

    this.propertyTypes = {
      'apartment': ['appartamento', 'app', 'bilocale', 'trilocale', 'quadrilocale', 'monolocale'],
      'house': ['casa', 'villetta', 'casetta'],
      'villa': ['villa', 'villa singola'],
      'loft': ['loft', 'attico'],
      'office': ['ufficio', 'studio', 'locale commerciale']
    };

    this.conditionKeywords = {
      'excellent': ['ottimo', 'ottima', 'eccellente', 'perfetto', 'perfetta', 'nuovo', 'nuova'],
      'good': ['buono', 'buona', 'bene', 'discreto', 'discreta'],
      'fair': ['da ristrutturare', 'da sistemare', 'da rinnovare'],
      'poor': ['malridotto', 'malridotta', 'da demolire']
    };

    this.pricePatterns = [
      /(\d+)k/gi,                    // 300k
      /(\d+)\.(\d+)k/gi,             // 300.5k
      /(\d+)mila/gi,                 // 300mila
      /€\s*(\d+(?:\.\d+)?)/gi,       // €300000 o €300.000
      /(\d+(?:\.\d+)?)\s*€/gi,       // 300000€
      /(\d+(?:\.\d+)?)\s*euro/gi,    // 300000 euro
      /max\s+(\d+)/gi,               // max 300000
      /fino\s+a\s+(\d+)/gi,          // fino a 300000
      /budget\s+(\d+)/gi             // budget 300000
    ];

    this.sizePatterns = [
      /(\d+)\s*mq/gi,                // 80mq
      /(\d+)\s*metri/gi,             // 80 metri
      /(\d+)\s*m²/gi,                // 80m²
      /size\s+(\d+)/gi               // size 80
    ];

    this.roomPatterns = [
      /(\d+)\s*locat?i/gi,           // 2 locali
      /(\d+)\s*camere/gi,            // 2 camere
      /(\d+)\s*stanze/gi,            // 2 stanze
      /(mono|bi|tri|quadri)locale/gi // bilocale, trilocale, etc.
    ];
  }

  /**
   * Parse natural language query (preparazione per AI)
   * @param {string} query - Query in linguaggio naturale
   * @returns {Object} Parsed query object
   */
  async parseNaturalLanguage(query) {
    if (!query || typeof query !== 'string') {
      return this._getEmptyParsedQuery();
    }

    logger.debug('Parsing natural language query', { query });

    try {
      const normalizedQuery = query.toLowerCase().trim();
      
      const parsedQuery = {
        original: query,
        normalized: normalizedQuery,
        entities: await this.extractEntities(normalizedQuery),
        intent: await this.classifyIntent(normalizedQuery),
        confidence: 0.7, // Score fisso per ora, in futuro da AI
        parsing_method: 'rule_based'
      };

      logger.debug('Query parsed successfully', {
        original: query,
        entities: parsedQuery.entities,
        intent: parsedQuery.intent
      });

      return parsedQuery;

    } catch (error) {
      logger.error('Failed to parse natural language query', {
        error: error.message,
        query
      });

      return this._getEmptyParsedQuery();
    }
  }

  /**
   * Estrae entità dalla query (location, price, size, etc.)
   * @param {string} query - Query normalizzata
   * @returns {Object} Entità estratte
   */
  async extractEntities(query) {
    const entities = {
      location: this._extractLocation(query),
      property_type: this._extractPropertyType(query),
      price: this._extractPrice(query),
      size: this._extractSize(query),
      rooms: this._extractRooms(query),
      condition: this._extractCondition(query),
      features: this._extractFeatures(query)
    };

    // Rimuovi entità vuote
    Object.keys(entities).forEach(key => {
      if (!entities[key] || (Array.isArray(entities[key]) && entities[key].length === 0)) {
        delete entities[key];
      }
    });

    return entities;
  }

  /**
   * Classifica l'intent della query (buy, rent, invest, etc.)
   * @param {string} query - Query normalizzata
   * @returns {string} Intent classificato
   */
  async classifyIntent(query) {
    const rentKeywords = ['affitto', 'affittare', 'rent', 'locazione', 'canone'];
    const buyKeywords = ['acquisto', 'acquistare', 'comprare', 'vendita', 'buy', 'purchase'];
    const investKeywords = ['investimento', 'investire', 'reddito', 'rendita'];

    if (rentKeywords.some(keyword => query.includes(keyword))) {
      return 'rent';
    }
    if (investKeywords.some(keyword => query.includes(keyword))) {
      return 'invest';
    }
    if (buyKeywords.some(keyword => query.includes(keyword))) {
      return 'buy';
    }

    // Default intent
    return 'buy';
  }

  /**
   * Parse structured criteria object
   * @param {Object} criteria - Criteri strutturati
   * @returns {Object} Criteri validati e normalizzati
   */
  parseStructuredCriteria(criteria) {
    if (!criteria || typeof criteria !== 'object') {
      return {};
    }

    logger.debug('Parsing structured criteria', { criteria });

    try {
      const normalized = this.normalizeCriteria(criteria);
      const validation = this.validateCriteriaFormat(normalized);
      
      if (!validation.valid) {
        logger.warn('Invalid structured criteria', {
          errors: validation.errors,
          criteria
        });
      }

      return normalized;

    } catch (error) {
      logger.error('Failed to parse structured criteria', {
        error: error.message,
        criteria
      });
      return {};
    }
  }

  /**
   * Valida formato dei criteri strutturati
   * @param {Object} criteria - Criteri da validare
   * @returns {Object} Risultato validazione
   */
  validateCriteriaFormat(criteria) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Validazione location
    if (criteria.location) {
      if (criteria.location.radius_km && criteria.location.radius_km > 50) {
        validation.warnings.push('Large search radius may affect performance');
      }
    }

    // Validazione property
    if (criteria.property) {
      if (criteria.property.rooms) {
        const { min, max } = criteria.property.rooms;
        if (min && max && min > max) {
          validation.valid = false;
          validation.errors.push('Invalid room range: min > max');
        }
      }
    }

    // Validazione price
    if (criteria.price) {
      const { min, max } = criteria.price;
      if (min && max && min >= max) {
        validation.valid = false;
        validation.errors.push('Invalid price range: min >= max');
      }
      if (max && max > 10000000) {
        validation.warnings.push('Very high price range specified');
      }
    }

    return validation;
  }

  /**
   * Normalizza criteri per consistency
   * @param {Object} criteria - Criteri raw
   * @returns {Object} Criteri normalizzati
   */
  normalizeCriteria(criteria) {
    const normalized = JSON.parse(JSON.stringify(criteria)); // Deep clone

    // Normalizza location
    if (normalized.location?.city) {
      normalized.location.city = this._normalizeCity(normalized.location.city);
    }

    // Normalizza property type
    if (normalized.property?.type) {
      normalized.property.type = normalized.property.type.toLowerCase();
    }

    // Normalizza currency
    if (normalized.price && !normalized.price.currency) {
      normalized.price.currency = 'EUR';
    }

    return normalized;
  }

  /**
   * Arricchisce criteri con defaults
   * @param {Object} criteria - Criteri base
   * @param {Object} userProfile - Profilo utente
   * @returns {Object} Criteri arricchiti
   */
  enrichWithDefaults(criteria, userProfile) {
    const enriched = { ...criteria };

    // Default location se non specificata
    if (!enriched.location && userProfile?.preferred_city) {
      enriched.location = {
        city: userProfile.preferred_city
      };
    }

    // Default currency
    if (enriched.price && !enriched.price.currency) {
      enriched.price.currency = 'EUR';
    }

    // Default filters
    if (!enriched.filters) {
      enriched.filters = {
        platforms: ['immobiliare.it', 'casa.it'],
        max_results: 50,
        sort_by: 'relevance_desc'
      };
    }

    return enriched;
  }

  /**
   * Applica preferenze salvate
   * @param {Object} criteria - Criteri base  
   * @param {Object} userPreferences - Preferenze utente
   * @returns {Object} Criteri con preferenze applicate
   */
  applySavedPreferences(criteria, userPreferences) {
    if (!userPreferences) return criteria;

    const enhanced = { ...criteria };

    // Applica budget preferito se non specificato
    if (!enhanced.price?.max && userPreferences.max_budget) {
      enhanced.price = {
        ...enhanced.price,
        max: userPreferences.max_budget
      };
    }

    // Applica aree preferite
    if (!enhanced.location?.areas && userPreferences.preferred_areas) {
      enhanced.location = {
        ...enhanced.location,
        areas: userPreferences.preferred_areas
      };
    }

    return enhanced;
  }

  /**
   * Costruisce query per esecuzione
   * @param {Object} parsedQuery - Query parsed
   * @param {Object} preferences - Preferenze utente
   * @returns {Object} Query execution-ready
   */
  buildExecutionQuery(parsedQuery, preferences = {}) {
    const executionQuery = {
      source: parsedQuery.original,
      criteria: this._buildCriteriaFromEntities(parsedQuery.entities),
      intent: parsedQuery.intent,
      confidence: parsedQuery.confidence,
      enhanced_with_preferences: false
    };

    // Applica preferenze se disponibili
    if (preferences && Object.keys(preferences).length > 0) {
      executionQuery.criteria = this.applySavedPreferences(
        executionQuery.criteria, 
        preferences
      );
      executionQuery.enhanced_with_preferences = true;
    }

    return executionQuery;
  }

  /**
   * Private methods - Estrazione entità specifiche
   */
  _extractLocation(query) {
    for (const [city, keywords] of Object.entries(this.locationKeywords)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        return {
          city: city,
          detected_keywords: keywords.filter(kw => query.includes(kw))
        };
      }
    }
    return null;
  }

  _extractPropertyType(query) {
    for (const [type, keywords] of Object.entries(this.propertyTypes)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        return {
          type: type,
          detected_keywords: keywords.filter(kw => query.includes(kw))
        };
      }
    }
    return null;
  }

  _extractPrice(query) {
    const prices = [];
    
    for (const pattern of this.pricePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        let price = parseFloat(match[1]);
        
        // Handle k suffix
        if (match[0].toLowerCase().includes('k')) {
          price *= 1000;
        }
        
        prices.push(price);
      }
    }

    if (prices.length === 0) return null;

    // Se abbiamo un solo prezzo, consideralo come max
    if (prices.length === 1) {
      return { max: Math.max(...prices) };
    }

    // Se abbiamo più prezzi, prendi min e max
    return {
      min: Math.min(...prices),
      max: Math.max(...prices)
    };
  }

  _extractSize(query) {
    const sizes = [];
    
    for (const pattern of this.sizePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        sizes.push(parseInt(match[1]));
      }
    }

    if (sizes.length === 0) return null;

    if (sizes.length === 1) {
      return { min: sizes[0] };
    }

    return {
      min: Math.min(...sizes),
      max: Math.max(...sizes)
    };
  }

  _extractRooms(query) {
    const rooms = [];
    
    for (const pattern of this.roomPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        if (match[1] === 'mono') rooms.push(1);
        else if (match[1] === 'bi') rooms.push(2);
        else if (match[1] === 'tri') rooms.push(3);
        else if (match[1] === 'quadri') rooms.push(4);
        else rooms.push(parseInt(match[1]));
      }
    }

    if (rooms.length === 0) return null;

    if (rooms.length === 1) {
      return { exact: rooms[0] };
    }

    return {
      min: Math.min(...rooms),
      max: Math.max(...rooms)
    };
  }

  _extractCondition(query) {
    for (const [condition, keywords] of Object.entries(this.conditionKeywords)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        return {
          condition: condition,
          detected_keywords: keywords.filter(kw => query.includes(kw))
        };
      }
    }
    return null;
  }

  _extractFeatures(query) {
    const features = [];
    
    const featureKeywords = {
      'parking': ['parcheggio', 'box', 'garage', 'posto auto'],
      'balcony': ['balcone', 'terrazzo', 'veranda'],
      'elevator': ['ascensore'],
      'garden': ['giardino', 'verde'],
      'furnished': ['arredato', 'arredata', 'mobiliato']
    };

    for (const [feature, keywords] of Object.entries(featureKeywords)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        features.push(feature);
      }
    }

    return features.length > 0 ? features : null;
  }

  _buildCriteriaFromEntities(entities) {
    const criteria = {};

    if (entities.location) {
      criteria.location = {
        city: entities.location.city
      };
    }

    if (entities.property_type) {
      criteria.property = {
        type: entities.property_type.type
      };
    }

    if (entities.rooms) {
      criteria.property = {
        ...criteria.property,
        rooms: entities.rooms
      };
    }

    if (entities.price) {
      criteria.price = {
        ...entities.price,
        currency: 'EUR'
      };
    }

    if (entities.size) {
      criteria.property = {
        ...criteria.property,
        size_sqm: entities.size
      };
    }

    if (entities.condition) {
      criteria.property = {
        ...criteria.property,
        condition: entities.condition.condition
      };
    }

    if (entities.features) {
      criteria.property = {
        ...criteria.property,
        features: entities.features
      };
    }

    return criteria;
  }

  _getEmptyParsedQuery() {
    return {
      original: '',
      normalized: '',
      entities: {},
      intent: 'buy',
      confidence: 0,
      parsing_method: 'fallback'
    };
  }

  _normalizeCity(city) {
    const cityLower = city.toLowerCase();
    
    // Mappa città comuni
    const cityMap = {
      'mi': 'milano',
      'milan': 'milano', 
      'rome': 'roma',
      'turin': 'torino',
      'naples': 'napoli'
    };

    return cityMap[cityLower] || cityLower;
  }
}

module.exports = QueryParser;
