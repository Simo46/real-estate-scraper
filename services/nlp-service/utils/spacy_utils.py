"""
spaCy utilities for NLP Service
Task 5.3.1 - spaCy italiano models download e setup
"""

import os
import sys
import subprocess
import logging
from typing import Optional, Dict, Any, List
from enum import Enum
import spacy
from spacy.lang.it import Italian
from spacy.lang.en import English

logger = logging.getLogger(__name__)

class ModelStatus(Enum):
    """Stato dei modelli spaCy"""
    AVAILABLE = "available"
    DOWNLOADING = "downloading"
    NOT_AVAILABLE = "not_available"
    ERROR = "error"

class SpacyManager:
    """Gestore dei modelli spaCy per l'NLP Service"""
    
    def __init__(self):
        self.models = {}
        self.model_configs = {
            "it_core_news_sm": {
                "language": "it",
                "description": "Modello italiano piccolo",
                "download_name": "it_core_news_sm"
            },
            "it_core_news_md": {
                "language": "it", 
                "description": "Modello italiano medio",
                "download_name": "it_core_news_md"
            },
            "en_core_web_sm": {
                "language": "en",
                "description": "Modello inglese piccolo",
                "download_name": "en_core_web_sm"
            }
        }
        
    async def initialize_models(self):
        """Inizializza i modelli spaCy necessari"""
        logger.info("Inizializzazione modelli spaCy...")
        
        # Priorità per i modelli (italiano prima)
        priority_models = ["it_core_news_sm", "en_core_web_sm"]
        
        for model_name in priority_models:
            try:
                await self.ensure_model_available(model_name)
                logger.info(f"Modello {model_name} disponibile")
            except Exception as e:
                logger.error(f"Errore nell'inizializzazione del modello {model_name}: {e}")
                
    async def ensure_model_available(self, model_name: str) -> bool:
        """Assicura che un modello sia disponibile"""
        if model_name not in self.model_configs:
            raise ValueError(f"Modello {model_name} non supportato")
            
        # Controlla se già caricato
        if model_name in self.models:
            return True
            
        # Controlla se installato
        if self.is_model_installed(model_name):
            return await self.load_model(model_name)
        else:
            # Scarica e installa
            return await self.download_and_install_model(model_name)
            
    def is_model_installed(self, model_name: str) -> bool:
        """Controlla se un modello è installato"""
        try:
            spacy.load(model_name)
            return True
        except (OSError, IOError):
            return False
            
    async def download_and_install_model(self, model_name: str) -> bool:
        """Scarica e installa un modello spaCy"""
        try:
            logger.info(f"Scaricamento modello {model_name}...")
            
            # Comando per scaricare il modello
            download_cmd = [
                sys.executable, "-m", "spacy", "download", model_name
            ]
            
            # Esegui il download
            process = subprocess.Popen(
                download_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            stdout, stderr = process.communicate()
            
            if process.returncode == 0:
                logger.info(f"Modello {model_name} scaricato con successo")
                return await self.load_model(model_name)
            else:
                logger.error(f"Errore nel download del modello {model_name}: {stderr}")
                return False
                
        except Exception as e:
            logger.error(f"Errore durante il download del modello {model_name}: {e}")
            return False
            
    async def load_model(self, model_name: str) -> bool:
        """Carica un modello spaCy"""
        try:
            logger.info(f"Caricamento modello {model_name}...")
            
            # Carica il modello
            nlp = spacy.load(model_name)
            
            # Aggiungi componenti custom se necessario
            self.add_real_estate_components(nlp, model_name)
            
            self.models[model_name] = nlp
            logger.info(f"Modello {model_name} caricato con successo")
            return True
            
        except Exception as e:
            logger.error(f"Errore nel caricamento del modello {model_name}: {e}")
            return False
            
    def add_real_estate_components(self, nlp, model_name: str):
        """Aggiunge componenti custom per il settore immobiliare"""
        try:
            # Aggiungi pattern per entità immobiliari
            ruler = nlp.add_pipe("entity_ruler", before="ner")
            
            # Pattern per prezzi
            price_patterns = [
                {"label": "MONEY", "pattern": [{"TEXT": {"REGEX": r"€\d+k?"}}, {"LOWER": {"IN": ["euro", "eur"]}, "OP": "?"}]},
                {"label": "MONEY", "pattern": [{"TEXT": {"REGEX": r"\d+\.?\d*"}}, {"LOWER": {"IN": ["euro", "eur", "€"]}}]},
                {"label": "MONEY", "pattern": [{"TEXT": {"REGEX": r"\d+k"}}, {"LOWER": {"IN": ["euro", "eur"]}, "OP": "?"}]},
            ]
            
            # Pattern per proprietà
            property_patterns = [
                {"label": "PROPERTY_TYPE", "pattern": [{"LOWER": {"IN": ["casa", "appartamento", "villa", "attico", "loft", "monolocale", "bilocale", "trilocale"]}}]},
                {"label": "PROPERTY_TYPE", "pattern": [{"TEXT": {"REGEX": r"\d+"}}, {"LOWER": "locali"}]},
            ]
            
            # Pattern per dimensioni
            dimension_patterns = [
                {"label": "DIMENSION", "pattern": [{"TEXT": {"REGEX": r"\d+"}}, {"LOWER": {"IN": ["mq", "metri", "m2", "m²"]}}]},
                {"label": "DIMENSION", "pattern": [{"TEXT": {"REGEX": r"\d+"}}, {"LOWER": "locali"}]},
            ]
            
            # Pattern per condizioni
            condition_patterns = [
                {"label": "CONDITION", "pattern": [{"LOWER": {"IN": ["nuovo", "nuova", "da ristrutturare", "abitabile", "ottimo stato", "buono stato"]}}]},
                {"label": "CONDITION", "pattern": [{"LOWER": "da"}, {"LOWER": "ristrutturare"}]},
            ]
            
            # Aggiungi tutti i pattern
            all_patterns = price_patterns + property_patterns + dimension_patterns + condition_patterns
            ruler.add_patterns(all_patterns)
            
            logger.info(f"Aggiunti {len(all_patterns)} pattern custom per {model_name}")
            
        except Exception as e:
            logger.warning(f"Errore nell'aggiunta di componenti custom: {e}")
            
    def get_model(self, model_name: str = "it_core_news_sm"):
        """Ottiene un modello spaCy"""
        if model_name not in self.models:
            raise ValueError(f"Modello {model_name} non caricato")
        return self.models[model_name]
        
    def get_available_models(self) -> List[str]:
        """Ottiene la lista dei modelli disponibili"""
        return list(self.models.keys())
        
    def get_model_info(self, model_name: str) -> Dict[str, Any]:
        """Ottiene informazioni su un modello"""
        if model_name not in self.model_configs:
            raise ValueError(f"Modello {model_name} non supportato")
            
        config = self.model_configs[model_name]
        status = ModelStatus.AVAILABLE if model_name in self.models else ModelStatus.NOT_AVAILABLE
        
        return {
            "name": model_name,
            "language": config["language"],
            "description": config["description"],
            "status": status.value,
            "loaded": model_name in self.models
        }

# Istanza globale del manager
spacy_manager = SpacyManager()

# Funzioni di utilità
async def download_spacy_model(model_name: str) -> bool:
    """Scarica un modello spaCy"""
    return await spacy_manager.download_and_install_model(model_name)

def get_spacy_model(model_name: str = "it_core_news_sm"):
    """Ottiene un modello spaCy"""
    return spacy_manager.get_model(model_name)
