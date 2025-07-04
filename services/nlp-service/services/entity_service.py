"""
Entity Extraction Service
Task 5.3.2 - Custom NER per real estate entities
Task 5.3.4 - Entity validation e normalization  
Task 5.3.5 - Confidence scoring per ogni entity
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass
from datetime import datetime
import time

# Imports condizionali per spaCy (potrebbero non essere ancora installati)
try:
    import spacy
    from spacy import displacy
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False
    spacy = None

# Absolute imports
from models.entities import (
    EntityType, EntityConfidence, RealEstateEntity,
    LocationEntity, PriceEntity, PropertyTypeEntity,
    DimensionEntity, ConditionEntity,
    EntityExtractionRequest, EntityExtractionResponse
)
from utils.spacy_utils import spacy_manager, get_spacy_model
from utils.real_estate_utils import real_estate_normalizer

logger = logging.getLogger(__name__)

@dataclass
class EntityExtractionConfig:
    """Configurazione per l'estrazione delle entità"""
    model_name: str = "it_core_news_sm"
    confidence_threshold: float = 0.5
    enable_normalization: bool = True
    enable_validation: bool = True
    max_text_length: int = 5000
    custom_patterns_enabled: bool = True

class EntityExtractionResult:
    """Risultato dell'estrazione di entità"""
    
    def __init__(self, entities: List[RealEstateEntity], metadata: Dict[str, Any]):
        self.entities = entities
        self.metadata = metadata
        self.entity_count = len(entities)
        self.entities_by_type = self._group_by_type()
        
    def _group_by_type(self) -> Dict[EntityType, List[RealEstateEntity]]:
        """Raggruppa le entità per tipo"""
        groups = {}
        for entity in self.entities:
            entity_type = entity.label
            if entity_type not in groups:
                groups[entity_type] = []
            groups[entity_type].append(entity)
        return groups
        
    def get_entities_by_type(self, entity_type: EntityType) -> List[RealEstateEntity]:
        """Ottiene le entità di un tipo specifico"""
        return self.entities_by_type.get(entity_type, [])
        
    def get_highest_confidence_entity(self, entity_type: EntityType) -> Optional[RealEstateEntity]:
        """Ottiene l'entità con confidenza più alta di un tipo"""
        entities = self.get_entities_by_type(entity_type)
        if not entities:
            return None
        return max(entities, key=lambda e: e.confidence)

class EntityService:
    """Servizio per l'estrazione delle entità dal testo"""
    
    def __init__(self, config: Optional[EntityExtractionConfig] = None):
        self.config = config or EntityExtractionConfig()
        self.nlp_model = None
        self.is_initialized = False
        
    async def initialize(self) -> bool:
        """Inizializza il servizio"""
        try:
            logger.info("Inizializzazione EntityService...")
            
            if not SPACY_AVAILABLE:
                logger.error("spaCy non è disponibile. Installare con: pip install spacy")
                return False
                
            # Inizializza i modelli spaCy
            await spacy_manager.initialize_models()
            
            # Carica il modello principale
            if not await spacy_manager.ensure_model_available(self.config.model_name):
                logger.error(f"Impossibile caricare il modello {self.config.model_name}")
                return False
                
            self.nlp_model = spacy_manager.get_model(self.config.model_name)
            self.is_initialized = True
            
            logger.info(f"EntityService inizializzato con modello {self.config.model_name}")
            return True
            
        except Exception as e:
            logger.error(f"Errore nell'inizializzazione di EntityService: {e}")
            return False
            
    async def extract_entities(self, request: EntityExtractionRequest) -> EntityExtractionResponse:
        """Estrae entità dal testo"""
        start_time = time.time()
        
        try:
            # Verifica inizializzazione
            if not self.is_initialized:
                if not await self.initialize():
                    return EntityExtractionResponse(
                        success=False,
                        entities=[],
                        analysis_metadata={"error": "Servizio non inizializzato"}
                    )
            
            # Validazione input
            if not request.text or len(request.text.strip()) == 0:
                return EntityExtractionResponse(
                    success=False,
                    entities=[],
                    analysis_metadata={"error": "Testo vuoto"}
                )
                
            if len(request.text) > self.config.max_text_length:
                return EntityExtractionResponse(
                    success=False,
                    entities=[],
                    analysis_metadata={"error": "Testo troppo lungo"}
                )
            
            # Processa il testo
            doc = self.nlp_model(request.text)
            
            # Estrai entità
            entities = []
            for ent in doc.ents:
                # Filtra per soglia di confidenza
                confidence = self._calculate_confidence(ent, doc)
                if confidence < request.confidence_threshold:
                    continue
                    
                # Crea entità specifica per tipo
                entity = await self._create_entity_from_spacy(ent, confidence, request)
                if entity:
                    entities.append(entity)
            
            # Aggiungi entità custom (pattern matching)
            if self.config.custom_patterns_enabled:
                custom_entities = await self._extract_custom_entities(request.text, doc)
                entities.extend(custom_entities)
            
            # Filtra duplicati
            entities = self._remove_duplicate_entities(entities)
            
            # Ordina per confidenza
            entities.sort(key=lambda e: e.confidence, reverse=True)
            
            # Calcola metriche
            processing_time = (time.time() - start_time) * 1000
            
            return EntityExtractionResponse(
                success=True,
                entities=entities,
                text_length=len(request.text),
                processing_time_ms=processing_time,
                analysis_metadata={
                    "model_used": self.config.model_name,
                    "confidence_threshold": request.confidence_threshold,
                    "custom_patterns_enabled": self.config.custom_patterns_enabled,
                    "total_spacy_entities": len(doc.ents),
                    "filtered_entities": len(entities)
                }
            )
            
        except Exception as e:
            logger.error(f"Errore nell'estrazione di entità: {e}")
            processing_time = (time.time() - start_time) * 1000
            
            return EntityExtractionResponse(
                success=False,
                entities=[],
                processing_time_ms=processing_time,
                analysis_metadata={"error": str(e)}
            )
    
    def _calculate_confidence(self, ent, doc) -> float:
        """Calcola la confidenza di un'entità spaCy"""
        # Logica di base per la confidenza
        base_confidence = 0.6  # Abbassato da 0.7 per essere più permissivo
        
        # Filtro per parole comuni che non sono entità valide
        common_words = {"cerco", "cerca", "voglio", "desidero", "vorrei", "sono"}
        if ent.text.lower() in common_words:
            return 0.1  # Confidence molto bassa per parole comuni
        
        # Aumenta confidenza per entità lunghe
        if len(ent.text) > 3:
            base_confidence += 0.1
            
        # Aumenta confidenza per entità con caratteri maiuscoli
        if ent.text[0].isupper():
            base_confidence += 0.1
            
        # Aumenta confidenza per località conosciute
        known_cities = {"milano", "roma", "torino", "napoli", "firenze", "bologna", "venezia"}
        if ent.text.lower() in known_cities:
            base_confidence += 0.2
            
        # Diminuisce confidenza per entità molto corte
        if len(ent.text) <= 2:
            base_confidence -= 0.2
            
        return min(1.0, max(0.0, base_confidence))
    
    async def _create_entity_from_spacy(self, ent, confidence: float, request: EntityExtractionRequest) -> Optional[RealEstateEntity]:
        """Crea un'entità dal risultato spaCy"""
        try:
            # Determina il tipo di entità
            entity_type = self._map_spacy_label_to_entity_type(ent.label_)
            logger.debug(f"Processing entity: '{ent.text}' ({ent.label_}) -> {entity_type}")
            
            # Filtra entità non valide prima di tutto
            if self._should_filter_entity(ent.text, entity_type):
                logger.debug(f"Entity '{ent.text}' filtered out")
                return None
            
            # Filtra per tipi richiesti
            if request.entity_types and entity_type not in request.entity_types:
                logger.debug(f"Entity '{ent.text}' filtered out - type not requested")
                return None
            
            # Normalizza l'entità se richiesto
            normalized_data = {}
            if request.normalize_entities:
                try:
                    normalized_data = real_estate_normalizer.normalize_entity(ent.text, entity_type.value)
                    logger.debug(f"Normalized data for '{ent.text}': {normalized_data}")
                except Exception as e:
                    logger.warning(f"Normalization failed for '{ent.text}': {e}")
            
            # Crea l'entità base
            base_data = {
                "text": ent.text,
                "start_char": ent.start_char,
                "end_char": ent.end_char,
                "confidence": confidence,
                "label": entity_type,
                "metadata": {
                    "spacy_label": ent.label_,
                    "normalized": normalized_data
                }
            }
            
            logger.debug(f"Creating entity with base_data: {base_data}")
            
            # Crea sempre l'entità base per evitare problemi con i costruttori specializzati
            entity = RealEstateEntity(**base_data)
            
            # Aggiungi dati normalizzati se disponibili
            if normalized_data and 'normalized' in normalized_data:
                entity.normalized_value = normalized_data['normalized']
                
            logger.debug(f"Entity created successfully: {entity}")
            return entity
                
        except Exception as e:
            logger.error(f"Errore nella creazione dell'entità '{ent.text}': {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    
    def _should_filter_entity(self, text: str, entity_type: EntityType) -> bool:
        """Filtra entità non valide"""
        text_lower = text.lower().strip()
        
        # Filtra parole comuni che non sono entità utili
        common_words = {"cerco", "cerca", "voglio", "vorrei", "mi", "serve", "ho", "bisogno", "desidero"}
        if text_lower in common_words:
            return True
            
        # Filtra entità troppo corte (solo se non sono numeri)
        if len(text_lower) <= 1 and not text.isdigit():
            return True
            
        return False
    
    def _map_spacy_label_to_entity_type(self, spacy_label: str) -> EntityType:
        """Mappa i label spaCy ai tipi di entità"""
        label_mappings = {
            "GPE": EntityType.LOCATION,      # Luoghi geografici
            "LOC": EntityType.LOCATION,      # Località
            "MONEY": EntityType.PRICE,       # Valori monetari
            "PERSON": EntityType.PERSON,     # Persone
            "ORG": EntityType.ORGANIZATION,  # Organizzazioni
            "PROPERTY_TYPE": EntityType.PROPERTY_TYPE,  # Custom
            "DIMENSION": EntityType.DIMENSION,          # Custom
            "CONDITION": EntityType.CONDITION,          # Custom
        }
        
        return label_mappings.get(spacy_label, EntityType.MISC)
    
    async def _extract_custom_entities(self, text: str, doc) -> List[RealEstateEntity]:
        """Estrae entità con pattern custom"""
        entities = []
        
        # Pattern per prezzi (spaCy spesso non li riconosce)
        import re
        
        # Pattern per prezzi in euro
        price_patterns = [
            r'(\d+(?:\.\d+)?)\s*k?\s*€',
            r'€\s*(\d+(?:\.\d+)?)\s*k?',
            r'(\d+(?:\.\d+)?)\s*k?\s*euro',
            r'(\d+(?:\.\d+)?)\s*k?\s*eur'
        ]
        
        for pattern in price_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                # Controlla se non è già coperto da spaCy
                start_char = match.start()
                end_char = match.end()
                
                # Verifica overlap con entità spaCy
                overlap = False
                for ent in doc.ents:
                    if (start_char >= ent.start_char and start_char < ent.end_char) or \
                       (end_char > ent.start_char and end_char <= ent.end_char):
                        overlap = True
                        break
                
                if not overlap:
                    price_entity = RealEstateEntity(
                        text=match.group(0),
                        label=EntityType.PRICE,
                        start_char=start_char,
                        end_char=end_char,
                        confidence=0.8,
                        metadata={
                            "custom_pattern": True,
                            "pattern_type": "price"
                        }
                    )
                    entities.append(price_entity)
        
        return entities
    
    def _remove_duplicate_entities(self, entities: List[RealEstateEntity]) -> List[RealEstateEntity]:
        """Rimuove entità duplicate"""
        seen = set()
        unique_entities = []
        
        for entity in entities:
            # Crea una chiave unica basata su testo e posizione
            key = (entity.text.lower(), entity.start_char, entity.end_char)
            if key not in seen:
                seen.add(key)
                unique_entities.append(entity)
                
        return unique_entities
    
    def get_health_status(self) -> Dict[str, Any]:
        """Ottiene lo stato di salute del servizio"""
        return {
            "service_name": "EntityService",
            "initialized": self.is_initialized,
            "model_loaded": self.nlp_model is not None,
            "model_name": self.config.model_name,
            "spacy_available": SPACY_AVAILABLE,
            "config": {
                "confidence_threshold": self.config.confidence_threshold,
                "enable_normalization": self.config.enable_normalization,
                "max_text_length": self.config.max_text_length
            }
        }

# Istanza globale del servizio
entity_service = EntityService()
