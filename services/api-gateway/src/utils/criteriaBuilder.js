'use strict';

const { createLogger } = require('./logger');
const logger = createLogger('utils:criteriaBuilder');

/**
 * Criteria Builder Utility - Costruzione criteri strutturati
 * Responsabilità:
 * - Costruire criteri strutturati da input parsed
 * - Mapping verso diversi platform formats (preparazione)
 * - Validation e sanitization
 * - Criteria optimization
 */
class CriteriaBuilder {
  constructor() {
    this.defaultCriteria = {
      location: {
        country: 'Italy',
        radius_km: 15
      },
      property: {
        type: 'apartment',
        furnished: 'any'
      },
      price: {
        currency: 'EUR',
        negotiable: true
      },
      filters: {
        platforms: ['immobiliare.it', 'casa.it'],
        max_results: 50,
        sort_by: 'relevance_desc',
        exclude_agencies: []
      }
    };

    this.platformMappings = {
      'immobiliare.it': {
        property_types: {
          'apartment': 'appartamento',
          'house': 'casa',
          'villa': 'villa',
          'loft': 'attico'
        },
        sort_options: {
          'price_asc': 'prezzo_crescente',
          'price_desc': 'prezzo_decrescente',
          'relevance_desc': 'rilevanza'
        }
      },
      'casa.it': {
        property_types: {
          'apartment': 'appartamento',
          'house': 'casa indipendente',
          'villa': 'villa',
          'loft': 'loft'
        },
        sort_options: {
          'price_asc': 'price-asc',
          'price_desc': 'price-desc',
          'relevance_desc': 'relevance'
        }
      }
    };
  }

  /**
   * Costruisce criteri da query parsed
   * @param {Object} parsedQuery - Query output da QueryParser
   * @returns {Object} Criteri strutturati
   */
  async buildCriteriaFromParsed(parsedQuery) {
    logger.debug('Building criteria from parsed query', {
      entities: parsedQuery.entities,
      intent: parsedQuery.intent
    });

    try {
      const criteria = { ...this.defaultCriteria };

      // Costruisci location
      if (parsedQuery.entities.location) {
        criteria.location = {
          ...criteria.location,
          ...this._buildLocationCriteria(parsedQuery.entities.location)
        };
      }

      // Costruisci property
      if (parsedQuery.entities.property_type || 
          parsedQuery.entities.rooms || 
          parsedQuery.entities.size ||
          parsedQuery.entities.condition) {
        
        criteria.property = {
          ...criteria.property,
          ...this._buildPropertyCriteria(parsedQuery.entities)
        };
      }

      // Costruisci price
      if (parsedQuery.entities.price) {
        criteria.price = {
          ...criteria.price,
          ...this._buildPriceCriteria(parsedQuery.entities.price)
        };
      }

      // Adatta per intent (buy/rent)
      if (parsedQuery.intent === 'rent') {
        criteria.transaction_type = 'rent';
        criteria.price.period = 'monthly';
      } else {
        criteria.transaction_type = 'buy';
        delete criteria.price.period;
      }

      const validatedCriteria = await this._validateAndSanitize(criteria);
      
      logger.debug('Criteria built successfully', {
        originalEntities: parsedQuery.entities,
        builtCriteria: validatedCriteria
      });

      return validatedCriteria;

    } catch (error) {
      logger.error('Failed to build criteria from parsed query', {
        error: error.message,
        parsedQuery
      });
      throw error;
    }
  }

  /**
   * Costruisce criteri da input strutturato
   * @param {Object} structuredInput - Input già strutturato
   * @returns {Object} Criteri validated e normalized
   */
  async buildCriteriaFromStructured(structuredInput) {
    logger.debug('Building criteria from structured input', { structuredInput });

    try {
      // Merge con defaults
      const criteria = this._deepMerge(this.defaultCriteria, structuredInput);
      
      // Validate e sanitize
      const validatedCriteria = await this._validateAndSanitize(criteria);
      
      logger.debug('Structured criteria built successfully', {
        input: structuredInput,
        output: validatedCriteria
      });

      return validatedCriteria;

    } catch (error) {
      logger.error('Failed to build criteria from structured input', {
        error: error.message,
        structuredInput
      });
      throw error;
    }
  }

  /**
   * Merge criteri con preferenze utente
   * @param {Object} criteria - Criteri base
   * @param {Object} preferences - Preferenze utente
   * @returns {Object} Criteri merged
   */
  async mergeCriteriaWithPreferences(criteria, preferences) {
    if (!preferences || typeof preferences !== 'object') {
      return criteria;
    }

    logger.debug('Merging criteria with user preferences', {
      criteria,
      preferences
    });

    const merged = { ...criteria };

    // Merge location preferences
    if (preferences.preferred_areas) {
      merged.location = {
        ...merged.location,
        preferred_areas: preferences.preferred_areas
      };
    }

    // Merge budget preferences
    if (preferences.max_budget && (!merged.price.max || merged.price.max > preferences.max_budget)) {
      merged.price = {
        ...merged.price,
        max: preferences.max_budget
      };
    }

    // Merge property preferences
    if (preferences.preferred_property_types) {
      merged.property = {
        ...merged.property,
        preferred_types: preferences.preferred_property_types
      };
    }

    // Merge platform preferences
    if (preferences.preferred_platforms) {
      merged.filters = {
        ...merged.filters,
        platforms: preferences.preferred_platforms
      };
    }

    return merged;
  }

  /**
   * Adatta criteri per piattaforma specifica (preparazione multi-platform)
   * @param {Object} criteria - Criteri generici
   * @param {string} platformName - Nome piattaforma
   * @returns {Object} Criteri adattati
   */
  async adaptCriteriaForPlatform(criteria, platformName) {
    const mapping = this.platformMappings[platformName];
    if (!mapping) {
      logger.warn(`No mapping found for platform: ${platformName}`);
      return criteria;
    }

    const adapted = { ...criteria };

    // Adatta property type
    if (adapted.property?.type && mapping.property_types[adapted.property.type]) {
      adapted.property.platform_type = mapping.property_types[adapted.property.type];
    }

    // Adatta sort options
    if (adapted.filters?.sort_by && mapping.sort_options[adapted.filters.sort_by]) {
      adapted.filters.platform_sort = mapping.sort_options[adapted.filters.sort_by];
    }

    logger.debug('Criteria adapted for platform', {
      platform: platformName,
      original: criteria,
      adapted: adapted
    });

    return adapted;
  }

  /**
   * Valida compatibilità con piattaforme
   * @param {Object} criteria - Criteri da validare
   * @param {Array} platforms - Lista piattaforme
   * @returns {Object} Risultato validazione
   */
  async validatePlatformCompatibility(criteria, platforms) {
    const validation = {
      compatible: true,
      warnings: [],
      platform_specific: {}
    };

    for (const platform of platforms) {
      const platformValidation = await this._validateForPlatform(criteria, platform);
      validation.platform_specific[platform] = platformValidation;
      
      if (!platformValidation.compatible) {
        validation.warnings.push(`Incompatible with ${platform}: ${platformValidation.issues.join(', ')}`);
      }
    }

    return validation;
  }

  /**
   * Ottimizza criteri per performance
   * @param {Object} criteria - Criteri da ottimizzare
   * @returns {Object} Criteri ottimizzati
   */
  async optimizeCriteriaForPerformance(criteria) {
    const optimized = { ...criteria };

    // Limita risultati massimi per performance
    if (optimized.filters.max_results > 200) {
      optimized.filters.max_results = 200;
      logger.debug('Limited max_results for performance');
    }

    // Limita raggio di ricerca
    if (optimized.location.radius_km > 50) {
      optimized.location.radius_km = 50;
      logger.debug('Limited search radius for performance');
    }

    // Prioritizza piattaforme più veloci se molte sono selezionate
    if (optimized.filters.platforms.length > 3) {
      optimized.filters.platforms = optimized.filters.platforms.slice(0, 3);
      logger.debug('Limited platforms count for performance');
    }

    return optimized;
  }

  /**
   * Aggiunge filtri di qualità
   * @param {Object} criteria - Criteri base
   * @returns {Object} Criteri con filtri qualità
   */
  async addQualityFilters(criteria) {
    const enhanced = { ...criteria };

    // Aggiungi filtri default per qualità
    enhanced.quality_filters = {
      min_photo_count: 3,
      exclude_no_description: true,
      min_description_length: 50,
      exclude_duplicates: true,
      verified_only: false // Per ora false, in futuro configurabile
    };

    // Aggiungi score minimo
    enhanced.filters = {
      ...enhanced.filters,
      min_relevance_score: 0.3
    };

    return enhanced;
  }

  /**
   * Aggiunge boost di rilevanza basati su profilo utente
   * @param {Object} criteria - Criteri base
   * @param {Object} userProfile - Profilo utente
   * @returns {Object} Criteri con boost
   */
  async addRelevanceBoosts(criteria, userProfile) {
    if (!userProfile) return criteria;

    const boosted = { ...criteria };

    boosted.relevance_boosts = {
      location_match: 1.2,  // Boost per location preferite
      price_range_match: 1.1, // Boost per range prezzi preferito
      property_type_match: 1.15, // Boost per tipo proprietà preferita
      agency_preference: 1.05 // Boost per agenzie preferite
    };

    // Applica boost specifici basati su user profile
    if (userProfile.search_preferences) {
      const prefs = userProfile.search_preferences;
      
      if (prefs.location_priority === 'high') {
        boosted.relevance_boosts.location_match = 1.5;
      }
      
      if (prefs.price_sensitivity === 'high') {
        boosted.relevance_boosts.price_range_match = 1.3;
      }
    }

    return boosted;
  }

  /**
   * Genera piano di esecuzione
   * @param {Object} criteria - Criteri finali
   * @returns {Object} Piano di esecuzione
   */
  async generateExecutionPlan(criteria) {
    const plan = {
      platforms: criteria.filters.platforms || ['immobiliare.it'],
      estimated_time_minutes: 0,
      estimated_results: 0,
      complexity: 'medium',
      steps: []
    };

    // Calcola tempo stimato
    plan.estimated_time_minutes = this._estimateExecutionTime(criteria);
    
    // Calcola risultati stimati
    plan.estimated_results = await this.estimateResultsCount(criteria);
    
    // Determina complessità
    plan.complexity = this._determineComplexity(criteria);
    
    // Genera steps
    plan.steps = this._generateExecutionSteps(criteria);

    return plan;
  }

  /**
   * Stima numero risultati
   * @param {Object} criteria - Criteri di ricerca
   * @returns {number} Numero stimato risultati
   */
  async estimateResultsCount(criteria) {
    let baseCount = 100; // Base estimate

    // Aggiusta per location
    if (criteria.location?.city === 'milano') {
      baseCount *= 2; // Milano ha più annunci
    } else if (criteria.location?.city === 'roma') {
      baseCount *= 1.8;
    }

    // Aggiusta per property type
    if (criteria.property?.type === 'apartment') {
      baseCount *= 1.5; // Appartamenti più comuni
    } else if (criteria.property?.type === 'villa') {
      baseCount *= 0.3; // Ville meno comuni
    }

    // Aggiusta per price range
    if (criteria.price?.max && criteria.price.max < 200000) {
      baseCount *= 0.7; // Meno opzioni budget basso
    } else if (criteria.price?.min && criteria.price.min > 500000) {
      baseCount *= 0.4; // Meno opzioni budget alto
    }

    // Limita al max_results specificato
    const maxResults = criteria.filters?.max_results || 50;
    return Math.min(Math.round(baseCount), maxResults);
  }

  /**
   * Private helper methods
   */
  _buildLocationCriteria(locationEntity) {
    const location = {};

    if (locationEntity.city) {
      location.city = locationEntity.city;
    }

    // Aggiungi area detection se presente
    if (locationEntity.areas) {
      location.areas = locationEntity.areas;
    }

    return location;
  }

  _buildPropertyCriteria(entities) {
    const property = {};

    if (entities.property_type) {
      property.type = entities.property_type.type;
    }

    if (entities.rooms) {
      property.rooms = entities.rooms;
    }

    if (entities.size) {
      property.size_sqm = entities.size;
    }

    if (entities.condition) {
      property.condition = entities.condition.condition;
    }

    if (entities.features) {
      property.features = entities.features;
    }

    return property;
  }

  _buildPriceCriteria(priceEntity) {
    const price = {
      currency: 'EUR'
    };

    if (priceEntity.min) {
      price.min = priceEntity.min;
    }

    if (priceEntity.max) {
      price.max = priceEntity.max;
    }

    if (priceEntity.exact) {
      price.target = priceEntity.exact;
      price.tolerance = 0.1; // ±10%
    }

    return price;
  }

  async _validateAndSanitize(criteria) {
    const sanitized = { ...criteria };

    // Sanitize strings
    if (sanitized.location?.city) {
      sanitized.location.city = sanitized.location.city.toLowerCase().trim();
    }

    // Validate ranges
    if (sanitized.price?.min && sanitized.price?.max) {
      if (sanitized.price.min >= sanitized.price.max) {
        // Fix invalid range
        const temp = sanitized.price.min;
        sanitized.price.min = sanitized.price.max;
        sanitized.price.max = temp;
        logger.warn('Fixed invalid price range');
      }
    }

    // Validate rooms
    if (sanitized.property?.rooms?.min && sanitized.property?.rooms?.max) {
      if (sanitized.property.rooms.min > sanitized.property.rooms.max) {
        const temp = sanitized.property.rooms.min;
        sanitized.property.rooms.min = sanitized.property.rooms.max;
        sanitized.property.rooms.max = temp;
        logger.warn('Fixed invalid rooms range');
      }
    }

    // Ensure required fields
    if (!sanitized.filters) {
      sanitized.filters = { ...this.defaultCriteria.filters };
    }

    return sanitized;
  }

  async _validateForPlatform(criteria, platform) {
    const validation = {
      compatible: true,
      issues: []
    };

    // Validazione specifica per piattaforma
    if (platform === 'immobiliare.it') {
      if (criteria.price?.max && criteria.price.max > 5000000) {
        validation.compatible = false;
        validation.issues.push('Price too high for platform limits');
      }
    }

    return validation;
  }

  _estimateExecutionTime(criteria) {
    let timeMinutes = 1; // Base time

    // Aggiungi tempo per platform multipli
    const platformCount = criteria.filters?.platforms?.length || 1;
    timeMinutes += (platformCount - 1) * 0.5;

    // Aggiungi tempo per area search ampia
    if (criteria.location?.radius_km > 20) {
      timeMinutes += 1;
    }

    // Aggiungi tempo per max_results alto
    if (criteria.filters?.max_results > 100) {
      timeMinutes += 0.5;
    }

    return Math.ceil(timeMinutes);
  }

  _determineComplexity(criteria) {
    let complexityScore = 0;

    // Complessità location
    if (criteria.location?.areas?.length > 3) complexityScore += 2;
    if (criteria.location?.radius_km > 30) complexityScore += 1;

    // Complessità property
    if (criteria.property?.features?.length > 3) complexityScore += 1;
    
    // Complessità filters
    if (criteria.filters?.platforms?.length > 2) complexityScore += 2;
    if (criteria.filters?.max_results > 100) complexityScore += 1;

    if (complexityScore <= 2) return 'low';
    if (complexityScore <= 5) return 'medium';
    return 'high';
  }

  _generateExecutionSteps(criteria) {
    const steps = [
      { name: 'validation', estimated_time_seconds: 5 },
      { name: 'query_building', estimated_time_seconds: 10 }
    ];

    // Aggiungi step per ogni piattaforma
    const platforms = criteria.filters?.platforms || ['immobiliare.it'];
    platforms.forEach(platform => {
      steps.push({
        name: `search_${platform}`,
        platform: platform,
        estimated_time_seconds: 30
      });
    });

    steps.push(
      { name: 'results_processing', estimated_time_seconds: 15 },
      { name: 'ai_analysis', estimated_time_seconds: 20 },
      { name: 'finalization', estimated_time_seconds: 10 }
    );

    return steps;
  }

  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

module.exports = CriteriaBuilder;
