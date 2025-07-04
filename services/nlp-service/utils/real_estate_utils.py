"""
Real Estate utilities for NLP Service
Task 5.3.4 - Entity validation e normalization
"""

import re
import logging
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class RealEstateNormalizer:
    """Normalizzatore base per entità immobiliari"""
    
    def __init__(self):
        self.location_normalizer = LocationNormalizer()
        self.price_normalizer = PriceNormalizer()
        self.property_type_normalizer = PropertyTypeNormalizer()
        self.dimension_normalizer = DimensionNormalizer()
        self.condition_normalizer = ConditionNormalizer()
        
    def normalize_entity(self, entity_text: str, entity_type: str) -> Dict[str, Any]:
        """Normalizza un'entità in base al tipo"""
        try:
            if entity_type == "location":
                return self.location_normalizer.normalize(entity_text)
            elif entity_type == "price":
                return self.price_normalizer.normalize(entity_text)
            elif entity_type == "property_type":
                return self.property_type_normalizer.normalize(entity_text)
            elif entity_type == "dimension":
                return self.dimension_normalizer.normalize(entity_text)
            elif entity_type == "condition":
                return self.condition_normalizer.normalize(entity_text)
            else:
                return {"normalized": entity_text, "confidence": 0.5}
        except Exception as e:
            logger.error(f"Errore nella normalizzazione di {entity_text}: {e}")
            return {"normalized": entity_text, "confidence": 0.1}

class LocationNormalizer:
    """Normalizzatore per entità geografiche"""
    
    def __init__(self):
        # Mapping comuni città italiane
        self.city_mappings = {
            "milano": "Milano",
            "roma": "Roma", 
            "torino": "Torino",
            "napoli": "Napoli",
            "firenze": "Firenze",
            "bologna": "Bologna",
            "genova": "Genova",
            "venezia": "Venezia",
            "bari": "Bari",
            "catania": "Catania"
        }
        
        # Zone famose di Milano
        self.milan_districts = {
            "brera": "Brera",
            "navigli": "Navigli",
            "porta garibaldi": "Porta Garibaldi",
            "isola": "Isola",
            "porta nuova": "Porta Nuova",
            "corso buenos aires": "Corso Buenos Aires",
            "quadrilatero": "Quadrilatero della Moda"
        }
        
        # Zone famose di Roma
        self.rome_districts = {
            "trastevere": "Trastevere",
            "parioli": "Parioli",
            "eur": "EUR",
            "testaccio": "Testaccio",
            "centro storico": "Centro Storico"
        }
        
    def normalize(self, text: str) -> Dict[str, Any]:
        """Normalizza un nome di località"""
        text_lower = text.lower().strip()
        
        # Controlla città
        if text_lower in self.city_mappings:
            return {
                "normalized": self.city_mappings[text_lower],
                "type": "city",
                "confidence": 0.9
            }
            
        # Controlla zone di Milano
        if text_lower in self.milan_districts:
            return {
                "normalized": self.milan_districts[text_lower],
                "type": "district",
                "city": "Milano",
                "confidence": 0.8
            }
            
        # Controlla zone di Roma
        if text_lower in self.rome_districts:
            return {
                "normalized": self.rome_districts[text_lower],
                "type": "district", 
                "city": "Roma",
                "confidence": 0.8
            }
            
        # Fallback
        return {
            "normalized": text.title(),
            "type": "unknown",
            "confidence": 0.5
        }

class PriceNormalizer:
    """Normalizzatore per prezzi"""
    
    def __init__(self):
        # Pattern per prezzi
        self.price_patterns = [
            r"€\s*(\d+(?:\.\d+)?)k?",
            r"(\d+(?:\.\d+)?)\s*k?\s*€",
            r"(\d+(?:\.\d+)?)\s*k?\s*euro",
            r"(\d+(?:\.\d+)?)\s*k?\s*eur"
        ]
        
    def normalize(self, text: str) -> Dict[str, Any]:
        """Normalizza un prezzo"""
        text_lower = text.lower().strip()
        
        for pattern in self.price_patterns:
            match = re.search(pattern, text_lower)
            if match:
                amount_str = match.group(1)
                amount = float(amount_str)
                
                # Gestisce notazione 'k' per migliaia
                if 'k' in text_lower:
                    amount *= 1000
                    
                return {
                    "normalized": f"€{amount:,.0f}",
                    "amount": amount,
                    "currency": "EUR",
                    "confidence": 0.9
                }
                
        # Fallback: cerca solo numeri
        number_match = re.search(r'(\d+(?:\.\d+)?)', text)
        if number_match:
            amount = float(number_match.group(1))
            return {
                "normalized": f"€{amount:,.0f}",
                "amount": amount,
                "currency": "EUR",
                "confidence": 0.6
            }
            
        return {
            "normalized": text,
            "confidence": 0.1
        }

class PropertyTypeNormalizer:
    """Normalizzatore per tipologie di proprietà"""
    
    def __init__(self):
        # Mapping tipologie comuni
        self.property_mappings = {
            "casa": "Casa",
            "appartamento": "Appartamento",
            "villa": "Villa",
            "attico": "Attico",
            "loft": "Loft",
            "monolocale": "Monolocale",
            "bilocale": "Bilocale",
            "trilocale": "Trilocale",
            "quadrilocale": "Quadrilocale",
            "locale": "Locale Commerciale",
            "ufficio": "Ufficio",
            "negozio": "Negozio",
            "garage": "Garage",
            "box": "Box Auto"
        }
        
    def normalize(self, text: str) -> Dict[str, Any]:
        """Normalizza un tipo di proprietà"""
        text_lower = text.lower().strip()
        
        # Controlla pattern "X locali"
        locali_match = re.search(r'(\d+)\s*locali?', text_lower)
        if locali_match:
            num_locali = int(locali_match.group(1))
            locali_names = {
                1: "Monolocale",
                2: "Bilocale", 
                3: "Trilocale",
                4: "Quadrilocale"
            }
            if num_locali in locali_names:
                return {
                    "normalized": locali_names[num_locali],
                    "rooms": num_locali,
                    "confidence": 0.9
                }
            else:
                return {
                    "normalized": f"{num_locali} locali",
                    "rooms": num_locali,
                    "confidence": 0.8
                }
                
        # Controlla mapping diretto
        if text_lower in self.property_mappings:
            return {
                "normalized": self.property_mappings[text_lower],
                "confidence": 0.9
            }
            
        # Fallback
        return {
            "normalized": text.title(),
            "confidence": 0.5
        }

class DimensionNormalizer:
    """Normalizzatore per dimensioni"""
    
    def normalize(self, text: str) -> Dict[str, Any]:
        """Normalizza una dimensione"""
        text_lower = text.lower().strip()
        
        # Pattern per metri quadri
        mq_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:mq|m2|m²|metri)', text_lower)
        if mq_match:
            value = float(mq_match.group(1))
            return {
                "normalized": f"{value} mq",
                "value": value,
                "unit": "mq",
                "confidence": 0.9
            }
            
        # Pattern per locali
        locali_match = re.search(r'(\d+)\s*locali?', text_lower)
        if locali_match:
            value = int(locali_match.group(1))
            return {
                "normalized": f"{value} locali",
                "value": value,
                "unit": "locali",
                "confidence": 0.9
            }
            
        # Fallback
        return {
            "normalized": text,
            "confidence": 0.3
        }

class ConditionNormalizer:
    """Normalizzatore per condizioni dell'immobile"""
    
    def __init__(self):
        # Mapping condizioni
        self.condition_mappings = {
            "nuovo": "Nuovo",
            "nuova": "Nuovo",
            "da ristrutturare": "Da ristrutturare",
            "abitabile": "Abitabile",
            "ottimo stato": "Ottimo stato",
            "buono stato": "Buono stato",
            "discreto": "Discreto",
            "da sistemare": "Da sistemare",
            "ristrutturato": "Ristrutturato"
        }
        
    def normalize(self, text: str) -> Dict[str, Any]:
        """Normalizza una condizione"""
        text_lower = text.lower().strip()
        
        # Controlla mapping diretto
        if text_lower in self.condition_mappings:
            return {
                "normalized": self.condition_mappings[text_lower],
                "confidence": 0.9
            }
            
        # Controlla pattern "da ristrutturare"
        if "da" in text_lower and "ristruttur" in text_lower:
            return {
                "normalized": "Da ristrutturare",
                "confidence": 0.8
            }
            
        # Fallback
        return {
            "normalized": text.title(),
            "confidence": 0.5
        }

# Istanza globale
real_estate_normalizer = RealEstateNormalizer()
