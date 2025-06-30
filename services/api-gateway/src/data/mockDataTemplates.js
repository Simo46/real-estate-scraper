'use strict';

/**
 * Mock Data Templates - Templates realistici e dati seed
 * Responsabilità:
 * - Templates realistici per diverse tipologie
 * - Dati seed per consistent generation
 * - Localization per mercato italiano
 * - Platform-specific formats
 */

const mockDataTemplates = {
  // Configurazioni piattaforme
  platforms: {
    'immobiliare.it': {
      baseUrl: 'https://www.immobiliare.it/annunci',
      idFormat: '/{id}/',
      titlePatterns: [
        '{type} {location} - {rooms} locali - {size}mq',
        '{condition} {type} in {area}, {city}',
        'Vendita {type} {location} {size}mq',
        '{type} di {size}mq in {area} - {rooms} locali'
      ],
      priceFormats: ['€ {price}', '{price} €'],
      features: {
        hasPhotos: true,
        hasVirtualTour: 0.3, // 30% chance
        hasFloorPlan: 0.4,
        verified: 0.7
      }
    },
    'casa.it': {
      baseUrl: 'https://www.casa.it/vendita',
      idFormat: '-{id}.html',
      titlePatterns: [
        'Vendita {type} {location}',
        '{type} di {size}mq in {area}',
        '{condition} {type} - {city} {area}',
        '{type} {rooms} locali - {location}'
      ],
      priceFormats: ['{price} €', '€{price}'],
      features: {
        hasPhotos: true,
        hasVirtualTour: 0.2,
        hasFloorPlan: 0.5,
        verified: 0.6
      }
    },
    'idealista.it': {
      baseUrl: 'https://www.idealista.it/immobile',
      idFormat: '/{id}/',
      titlePatterns: [
        '{type} in vendita a {location}',
        '{condition} {type} - {area}, {city}',
        '{type} {size}mq - {location}',
        'Vendita {type} {rooms} locali {location}'
      ],
      priceFormats: ['{price}€', '€ {price}'],
      features: {
        hasPhotos: true,
        hasVirtualTour: 0.25,
        hasFloorPlan: 0.35,
        verified: 0.8
      }
    }
  },

  // Tipologie proprietà
  propertyTypes: {
    apartment: {
      italian: 'Appartamento',
      variations: ['App.', 'Bilocale', 'Trilocale', 'Quadrilocale'],
      roomRange: [1, 5],
      sizeRange: [30, 150],
      priceMultiplier: 1.0,
      commonFeatures: ['elevator', 'balcony', 'heating']
    },
    house: {
      italian: 'Casa',
      variations: ['Casa indipendente', 'Villetta', 'Casa a schiera'],
      roomRange: [2, 6],
      sizeRange: [80, 250],
      priceMultiplier: 1.3,
      commonFeatures: ['garden', 'parking', 'terrace']
    },
    villa: {
      italian: 'Villa',
      variations: ['Villa singola', 'Villa bifamiliare'],
      roomRange: [3, 8],
      sizeRange: [120, 400],
      priceMultiplier: 1.8,
      commonFeatures: ['garden', 'parking', 'pool', 'terrace']
    },
    loft: {
      italian: 'Loft',
      variations: ['Attico', 'Mansarda', 'Open space'],
      roomRange: [1, 4],
      sizeRange: [50, 200],
      priceMultiplier: 1.2,
      commonFeatures: ['terrace', 'exposed_beams', 'high_ceilings']
    },
    office: {
      italian: 'Ufficio',
      variations: ['Studio', 'Locale commerciale', 'Ufficio'],
      roomRange: [1, 10],
      sizeRange: [25, 300],
      priceMultiplier: 0.8,
      commonFeatures: ['parking', 'air_conditioning', 'security']
    }
  },

  // Aree città principali
  cityAreas: {
    Milano: [
      { name: 'Centro', multiplier: 2.5, metro: true, desirability: 'high', description: 'Centro storico, Duomo, Scala' },
      { name: 'Porta Garibaldi', multiplier: 2.2, metro: true, desirability: 'high', description: 'Quartiere business, grattacieli' },
      { name: 'Navigli', multiplier: 2.0, metro: false, desirability: 'high', description: 'Zona movida, canali storici' },
      { name: 'Brera', multiplier: 2.4, metro: true, desirability: 'high', description: 'Quartiere artistico, elegante' },
      { name: 'Città Studi', multiplier: 1.4, metro: true, desirability: 'medium', description: 'Zona universitaria, Politecnico' },
      { name: 'Bicocca', multiplier: 1.2, metro: true, desirability: 'medium', description: 'Quartiere moderno, università' },
      { name: 'Lambrate', multiplier: 1.3, metro: true, desirability: 'medium', description: 'In sviluppo, ben collegato' },
      { name: 'Porta Romana', multiplier: 1.6, metro: true, desirability: 'medium-high', description: 'Zona residenziale, Bocconi' },
      { name: 'Isola', multiplier: 1.8, metro: true, desirability: 'high', description: 'Trendy, giovane, ristrutturato' },
      { name: 'Sempione', multiplier: 1.7, metro: true, desirability: 'medium-high', description: 'Parco Sempione, elegante' }
    ],
    Roma: [
      { name: 'Centro Storico', multiplier: 2.3, metro: true, desirability: 'high', description: 'Colosseo, Pantheon, monumenti' },
      { name: 'Prati', multiplier: 2.0, metro: true, desirability: 'high', description: 'Elegante, Vaticano' },
      { name: 'Trastevere', multiplier: 1.9, metro: false, desirability: 'high', description: 'Caratteristico, vita notturna' },
      { name: 'Testaccio', multiplier: 1.6, metro: true, desirability: 'medium-high', description: 'Emergente, autentico' },
      { name: 'San Giovanni', multiplier: 1.4, metro: true, desirability: 'medium', description: 'Residenziale, ben collegato' },
      { name: 'EUR', multiplier: 1.5, metro: true, desirability: 'medium', description: 'Moderno, business' },
      { name: 'Flaminio', multiplier: 1.7, metro: true, desirability: 'medium-high', description: 'Elegante, Villa Borghese' },
      { name: 'Monti', multiplier: 1.8, metro: true, desirability: 'high', description: 'Trendy, arte, cultura' }
    ],
    Torino: [
      { name: 'Centro', multiplier: 1.8, metro: false, desirability: 'high', description: 'Centro storico, elegante' },
      { name: 'San Salvario', multiplier: 1.4, metro: false, desirability: 'medium-high', description: 'Multiculturale, vivace' },
      { name: 'Crocetta', multiplier: 1.6, metro: false, desirability: 'high', description: 'Residenziale, prestigioso' },
      { name: 'Quadrilatero', multiplier: 1.7, metro: false, desirability: 'high', description: 'Shopping, storico' },
      { name: 'Lingotto', multiplier: 1.2, metro: true, desirability: 'medium', description: 'Moderno, in sviluppo' },
      { name: 'Borgo Po', multiplier: 1.3, metro: false, desirability: 'medium', description: 'Storico, fiume' }
    ],
    Firenze: [
      { name: 'Centro Storico', multiplier: 2.2, metro: false, desirability: 'high', description: 'UNESCO, Duomo, Uffizi' },
      { name: 'Oltrarno', multiplier: 1.9, metro: false, desirability: 'high', description: 'Artigiani, autentico' },
      { name: 'Santa Croce', multiplier: 1.7, metro: false, desirability: 'medium-high', description: 'Storico, vivace' },
      { name: 'San Niccolò', multiplier: 1.6, metro: false, desirability: 'medium-high', description: 'Panoramico, trendy' },
      { name: 'Campo di Marte', multiplier: 1.3, metro: false, desirability: 'medium', description: 'Residenziale, sportivo' }
    ],
    Napoli: [
      { name: 'Centro Storico', multiplier: 1.5, metro: true, desirability: 'medium-high', description: 'UNESCO, tradizione' },
      { name: 'Chiaia', multiplier: 1.8, metro: true, desirability: 'high', description: 'Elegante, mare' },
      { name: 'Posillipo', multiplier: 2.0, metro: false, desirability: 'high', description: 'Panoramico, lusso' },
      { name: 'Vomero', multiplier: 1.6, metro: true, desirability: 'medium-high', description: 'Collina, panorama' },
      { name: 'Mergellina', multiplier: 1.4, metro: true, desirability: 'medium', description: 'Mare, universitario' }
    ]
  },

  // Condizioni proprietà
  conditions: [
    { 
      key: 'excellent', 
      italian: 'Ottimo stato', 
      priceMultiplier: 1.2,
      description: 'Ristrutturato di recente, pronto per essere abitato',
      probability: 0.2
    },
    { 
      key: 'good', 
      italian: 'Buono stato', 
      priceMultiplier: 1.0,
      description: 'Ben mantenuto, piccoli interventi di personalizzazione',
      probability: 0.5
    },
    { 
      key: 'fair', 
      italian: 'Da ristrutturare', 
      priceMultiplier: 0.8,
      description: 'Necessita di ristrutturazione, buone potenzialità',
      probability: 0.25
    },
    { 
      key: 'poor', 
      italian: 'Da sistemare completamente', 
      priceMultiplier: 0.6,
      description: 'Ristrutturazione completa necessaria',
      probability: 0.05
    }
  ],

  // Features comuni
  features: {
    elevator: { italian: 'Ascensore', probability: 0.7 },
    parking: { italian: 'Posto auto', probability: 0.4 },
    balcony: { italian: 'Balcone', probability: 0.6 },
    terrace: { italian: 'Terrazzo', probability: 0.3 },
    garden: { italian: 'Giardino', probability: 0.2 },
    heating: { italian: 'Riscaldamento autonomo', probability: 0.8 },
    air_conditioning: { italian: 'Aria condizionata', probability: 0.3 },
    furnished: { italian: 'Arredato', probability: 0.25 },
    pool: { italian: 'Piscina', probability: 0.05 },
    security: { italian: 'Portineria', probability: 0.4 },
    fiber: { italian: 'Fibra ottica', probability: 0.6 },
    double_glazing: { italian: 'Doppi vetri', probability: 0.7 }
  },

  // Agenzie immobiliari mock
  agencies: [
    { name: 'Tecnocasa', reliability: 0.8, coverage: 'national' },
    { name: 'Gabetti', reliability: 0.8, coverage: 'national' },
    { name: 'Remax', reliability: 0.7, coverage: 'national' },
    { name: 'Coldwell Banker', reliability: 0.8, coverage: 'major_cities' },
    { name: 'Engel & Völkers', reliability: 0.9, coverage: 'luxury' },
    { name: 'Immobiliare.it', reliability: 0.7, coverage: 'online' },
    { name: 'Casa.it', reliability: 0.7, coverage: 'online' },
    { name: 'Agenzia Locale Milano', reliability: 0.6, coverage: 'local' },
    { name: 'Immobiliare Centrale Roma', reliability: 0.6, coverage: 'local' }
  ],

  // Metodi helper
  getPlatformConfig(platformName) {
    return this.platforms[platformName] || this.platforms['immobiliare.it'];
  },

  getPropertyTypeConfig(type) {
    return this.propertyTypes[type] || this.propertyTypes['apartment'];
  },

  getPropertyTypeItalian(type) {
    const config = this.getPropertyTypeConfig(type);
    return config.italian;
  },

  getCityAreas(city) {
    return this.cityAreas[city] || this.cityAreas['Milano'];
  },

  getAreaMultiplier(areaName) {
    // Trova area in tutte le città
    for (const cityAreas of Object.values(this.cityAreas)) {
      const area = cityAreas.find(a => a.name === areaName);
      if (area) return area.multiplier;
    }
    return 1.0; // Default multiplier
  },

  getConditionMultiplier(condition) {
    const conditionObj = this.conditions.find(c => c.key === condition);
    return conditionObj ? conditionObj.priceMultiplier : 1.0;
  },

  getConditionItalian(condition) {
    const conditionObj = this.conditions.find(c => c.key === condition);
    return conditionObj ? conditionObj.italian : 'Buono stato';
  },

  getTitleTemplates(propertyType) {
    // Ritorna templates per tutte le piattaforme per variety
    const allTemplates = [];
    Object.values(this.platforms).forEach(platform => {
      allTemplates.push(...platform.titlePatterns);
    });
    return allTemplates;
  },

  getRandomAgency() {
    const agency = this.agencies[Math.floor(Math.random() * this.agencies.length)];
    return {
      ...agency,
      contact: this.generateAgencyContact(agency)
    };
  },

  generateAgencyContact(agency) {
    const phoneBase = agency.coverage === 'national' ? '02' : '06';
    const phoneNumber = phoneBase + Math.floor(Math.random() * 90000000 + 10000000);
    
    return {
      phone: phoneNumber,
      email: `info@${agency.name.toLowerCase().replace(/\s+/g, '')}.it`,
      website: `www.${agency.name.toLowerCase().replace(/\s+/g, '')}.it`
    };
  },

  getRandomFeatures(propertyType, count = 3) {
    const typeConfig = this.getPropertyTypeConfig(propertyType);
    const availableFeatures = typeConfig.commonFeatures || Object.keys(this.features);
    
    const selectedFeatures = [];
    while (selectedFeatures.length < count && selectedFeatures.length < availableFeatures.length) {
      const feature = availableFeatures[Math.floor(Math.random() * availableFeatures.length)];
      if (!selectedFeatures.includes(feature)) {
        const featureConfig = this.features[feature];
        if (Math.random() < featureConfig.probability) {
          selectedFeatures.push(feature);
        }
      }
    }
    
    return selectedFeatures.map(feature => ({
      key: feature,
      italian: this.features[feature].italian
    }));
  },

  // Generatori di contenuto realistico
  generateDescription(propertyType, location, details) {
    const typeConfig = this.getPropertyTypeConfig(propertyType);
    const locationInfo = this.getCityAreas(location.city).find(a => a.name === location.area);
    
    const templates = [
      `${typeConfig.italian} di ${details.size}mq in ${location.area}, ${location.city}. ${details.rooms} locali in ${this.getConditionItalian(details.condition).toLowerCase()}. ${locationInfo?.description || 'Zona ben servita'}.`,
      
      `Proponiamo in vendita ${typeConfig.italian.toLowerCase()} di ${details.size} metri quadri situato in ${location.area}. L'immobile si presenta in ${this.getConditionItalian(details.condition).toLowerCase()} ed è composto da ${details.rooms} locali.`,
      
      `In ${location.area}, ${location.city}, vendiamo ${typeConfig.italian.toLowerCase()} di ${details.size}mq. La proprietà è in ${this.getConditionItalian(details.condition).toLowerCase()} e offre ${details.rooms} locali ben distribuiti.`
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
  },

  generateEnergyClass() {
    const classes = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];
    const weights = [0.05, 0.05, 0.1, 0.1, 0.15, 0.2, 0.15, 0.1, 0.05, 0.05];
    
    return this.weightedRandom(classes, weights);
  },

  generateYearBuilt() {
    const currentYear = new Date().getFullYear();
    const minYear = 1900;
    
    // Distribuzione realistica: più edifici degli anni '60-'80
    const periods = [
      { start: 1900, end: 1945, weight: 0.1 },
      { start: 1946, end: 1970, weight: 0.3 },
      { start: 1971, end: 1990, weight: 0.35 },
      { start: 1991, end: 2010, weight: 0.2 },
      { start: 2011, end: currentYear, weight: 0.05 }
    ];
    
    const period = this.weightedRandom(periods, periods.map(p => p.weight));
    return period.start + Math.floor(Math.random() * (period.end - period.start + 1));
  },

  // Utility helper
  weightedRandom(items, weights) {
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < items.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        return items[i];
      }
    }
    
    return items[items.length - 1];
  },

  // Validazione e sanitization
  validateTemplateData() {
    const errors = [];
    
    // Verifica che tutte le città abbiano aree
    Object.keys(this.cityAreas).forEach(city => {
      if (!this.cityAreas[city] || this.cityAreas[city].length === 0) {
        errors.push(`City ${city} has no areas defined`);
      }
    });
    
    // Verifica che tutti i property types abbiano configurazione completa
    Object.keys(this.propertyTypes).forEach(type => {
      const config = this.propertyTypes[type];
      if (!config.italian || !config.roomRange || !config.sizeRange) {
        errors.push(`Property type ${type} has incomplete configuration`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};

module.exports = mockDataTemplates;
