"""
Entity models for Real Estate NLP Processing
Task 5.3.1 - spaCy italiano models download e setup
Task 5.3.2 - Custom NER per real estate entities
"""

from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field, validator
from datetime import datetime
from enum import Enum

from models.common import BaseResponse

class EntityType(str, Enum):
    """Tipi di entità riconosciute per il settore immobiliare"""
    LOCATION = "location"          # Milano, Roma, zona Brera, etc.
    PRICE = "price"               # €300k, 500000 euro, etc.
    PROPERTY_TYPE = "property_type"  # casa, appartamento, villa, etc.
    DIMENSION = "dimension"        # 2 locali, 80 mq, etc.
    CONDITION = "condition"        # nuovo, da ristrutturare, etc.
    FEATURE = "feature"           # balcone, giardino, garage, etc.
    PERSON = "person"             # nomi di persone
    ORGANIZATION = "organization"  # agenzie immobiliari
    MISC = "misc"                 # altre entità

class EntityConfidence(str, Enum):
    """Livelli di confidenza per l'estrazione delle entità"""
    HIGH = "high"        # >90%
    MEDIUM = "medium"    # 70-90%
    LOW = "low"          # 50-70%
    VERY_LOW = "very_low"  # <50%

class RealEstateEntity(BaseModel):
    """Entità base per il settore immobiliare"""
    text: str = Field(..., description="Testo originale dell'entità")
    label: EntityType = Field(..., description="Tipo di entità")
    start_char: int = Field(..., description="Posizione iniziale nel testo")
    end_char: int = Field(..., description="Posizione finale nel testo")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Livello di confidenza (0-1)")
    confidence_level: Optional[EntityConfidence] = Field(None, description="Livello di confidenza categorico")
    normalized_value: Optional[str] = Field(None, description="Valore normalizzato dell'entità")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadati aggiuntivi")
    
    @validator('confidence_level', pre=True, always=True)
    def set_confidence_level(cls, v, values):
        # Se confidence_level è già impostato, lo manteniamo
        if v is not None:
            return v
            
        # Altrimenti lo calcoliamo dalla confidence
        if 'confidence' in values:
            confidence = values['confidence']
            if confidence >= 0.9:
                return EntityConfidence.HIGH
            elif confidence >= 0.7:
                return EntityConfidence.MEDIUM
            elif confidence >= 0.5:
                return EntityConfidence.LOW
            else:
                return EntityConfidence.VERY_LOW
        
        # Fallback
        return EntityConfidence.MEDIUM
    
    def __init__(self, **data):
        super().__init__(**data)
        # Assicuriamoci che confidence_level sia impostato
        if self.confidence_level is None:
            if self.confidence >= 0.9:
                self.confidence_level = EntityConfidence.HIGH
            elif self.confidence >= 0.7:
                self.confidence_level = EntityConfidence.MEDIUM
            elif self.confidence >= 0.5:
                self.confidence_level = EntityConfidence.LOW
            else:
                self.confidence_level = EntityConfidence.VERY_LOW

class LocationEntity(RealEstateEntity):
    """Entità per luoghi e località"""
    city: Optional[str] = Field(None, description="Città identificata")
    district: Optional[str] = Field(None, description="Quartiere/zona identificata")
    region: Optional[str] = Field(None, description="Regione identificata")
    country: Optional[str] = Field(None, description="Paese identificato")
    coordinates: Optional[Dict[str, float]] = Field(None, description="Coordinate geografiche")
    
    def __init__(self, **data):
        super().__init__(**data)
        self.label = EntityType.LOCATION

class PriceEntity(RealEstateEntity):
    """Entità per prezzi e valori monetari"""
    amount: Optional[float] = Field(None, description="Importo numerico")
    currency: str = Field(default="EUR", description="Valuta")
    price_type: Optional[str] = Field(None, description="Tipo di prezzo (vendita, affitto, etc.)")
    
    def __init__(self, **data):
        super().__init__(**data)
        self.label = EntityType.PRICE

class PropertyTypeEntity(RealEstateEntity):
    """Entità per tipologie di proprietà"""
    property_category: Optional[str] = Field(None, description="Categoria (residenziale, commerciale, etc.)")
    property_subtype: Optional[str] = Field(None, description="Sottotipo specifico")
    
    def __init__(self, **data):
        super().__init__(**data)
        self.label = EntityType.PROPERTY_TYPE

class DimensionEntity(RealEstateEntity):
    """Entità per dimensioni e metrature"""
    value: Optional[float] = Field(None, description="Valore numerico")
    unit: Optional[str] = Field(None, description="Unità di misura (mq, locali, etc.)")
    dimension_type: Optional[str] = Field(None, description="Tipo di dimensione")
    
    def __init__(self, **data):
        super().__init__(**data)
        self.label = EntityType.DIMENSION

class ConditionEntity(RealEstateEntity):
    """Entità per condizioni dell'immobile"""
    condition_category: Optional[str] = Field(None, description="Categoria di condizione")
    renovation_level: Optional[str] = Field(None, description="Livello di ristrutturazione necessaria")
    
    def __init__(self, **data):
        super().__init__(**data)
        self.label = EntityType.CONDITION

class EntityExtractionRequest(BaseModel):
    """Richiesta di estrazione entità"""
    text: str = Field(..., description="Testo da analizzare")
    language: str = Field(default="it", description="Lingua del testo")
    entity_types: Optional[List[EntityType]] = Field(None, description="Tipi di entità da estrarre")
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Soglia minima di confidenza")
    normalize_entities: bool = Field(default=True, description="Normalizzare le entità estratte")
    include_metadata: bool = Field(default=True, description="Includere metadati nelle entità")
    
    @validator('text')
    def validate_text(cls, v):
        if not v or not v.strip():
            raise ValueError('Il testo non può essere vuoto')
        if len(v) > 5000:
            raise ValueError('Il testo non può superare i 5000 caratteri')
        return v.strip()

class EntityExtractionResponse(BaseResponse):
    """Risposta di estrazione entità"""
    entities: List[RealEstateEntity] = Field(default_factory=list, description="Entità estratte")
    entity_count: int = Field(0, description="Numero totale di entità estratte")
    entities_by_type: Dict[EntityType, int] = Field(default_factory=dict, description="Conteggio per tipo di entità")
    text_length: int = Field(0, description="Lunghezza del testo analizzato")
    analysis_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadati dell'analisi")
    
    def __init__(self, **data):
        super().__init__(**data)
        if self.entities:
            self.entity_count = len(self.entities)
            self.entities_by_type = {}
            for entity in self.entities:
                entity_type = entity.label
                self.entities_by_type[entity_type] = self.entities_by_type.get(entity_type, 0) + 1
