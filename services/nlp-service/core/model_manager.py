"""
Ollama Model Manager
Task 5.2.7 - Model loading e caching mechanisms

Gestisce il caricamento, caching e ottimizzazione dei modelli Ollama.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Set
from datetime import datetime, timedelta
import json
import os
from dataclasses import dataclass, field
from enum import Enum
import hashlib
import time

from .ollama_client import OllamaClient, OllamaConfig, ModelInfo, ModelStatus, OllamaModelError

logger = logging.getLogger(__name__)

class ModelPriority(Enum):
    """Priorità dei modelli per il caching"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

@dataclass
class ModelUsageStats:
    """Statistiche di utilizzo di un modello"""
    model_name: str
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    avg_response_time: float = 0.0
    last_used: Optional[datetime] = None
    first_used: Optional[datetime] = None
    total_tokens: int = 0
    
    def update_usage(self, response_time: float, success: bool, tokens: int = 0):
        """Aggiorna statistiche di utilizzo"""
        self.total_requests += 1
        self.total_tokens += tokens
        
        if success:
            self.successful_requests += 1
            # Calcola media mobile del tempo di risposta
            if self.avg_response_time == 0:
                self.avg_response_time = response_time
            else:
                self.avg_response_time = (self.avg_response_time * 0.9) + (response_time * 0.1)
        else:
            self.failed_requests += 1
        
        self.last_used = datetime.now()
        if self.first_used is None:
            self.first_used = self.last_used
    
    def get_success_rate(self) -> float:
        """Calcola tasso di successo"""
        if self.total_requests == 0:
            return 0.0
        return self.successful_requests / self.total_requests
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_name": self.model_name,
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": self.get_success_rate(),
            "avg_response_time": self.avg_response_time,
            "last_used": self.last_used.isoformat() if self.last_used else None,
            "first_used": self.first_used.isoformat() if self.first_used else None,
            "total_tokens": self.total_tokens
        }

@dataclass
class ModelCacheConfig:
    """Configurazione per il cache dei modelli"""
    max_loaded_models: int = 2
    model_ttl: int = 1800  # 30 minuti
    preload_models: List[str] = field(default_factory=lambda: ["llama3.2"])
    auto_unload_threshold: float = 0.8  # Scarica modelli quando uso memoria > 80%
    priority_boost_hours: int = 24  # Ore per cui un modello usato mantiene priorità alta
    
    @classmethod
    def from_env(cls) -> 'ModelCacheConfig':
        """Crea configurazione da environment variables"""
        preload_models = os.getenv("OLLAMA_PRELOAD_MODELS", "llama3.2").split(",")
        return cls(
            max_loaded_models=int(os.getenv("OLLAMA_MAX_LOADED_MODELS", "2")),
            model_ttl=int(os.getenv("OLLAMA_MODEL_TTL", "1800")),
            preload_models=[m.strip() for m in preload_models if m.strip()],
            auto_unload_threshold=float(os.getenv("OLLAMA_AUTO_UNLOAD_THRESHOLD", "0.8")),
            priority_boost_hours=int(os.getenv("OLLAMA_PRIORITY_BOOST_HOURS", "24"))
        )

class ModelManager:
    """Gestisce il caricamento e caching dei modelli Ollama"""
    
    def __init__(self, client: OllamaClient, config: Optional[ModelCacheConfig] = None):
        self.client = client
        self.config = config or ModelCacheConfig.from_env()
        self.loaded_models: Set[str] = set()
        self.model_usage_stats: Dict[str, ModelUsageStats] = {}
        self.model_load_times: Dict[str, float] = {}
        self.preloading_in_progress: Set[str] = set()
        self._lock = asyncio.Lock()
        
        logger.info(f"Inizializzato ModelManager con config: max_loaded={self.config.max_loaded_models}, preload={self.config.preload_models}")
    
    async def initialize(self):
        """Inizializza il manager e precarica i modelli"""
        logger.info("Inizializzazione ModelManager...")
        
        # Verifica modelli disponibili
        try:
            available_models = await self.client.get_models()
            available_names = [model.name for model in available_models]
            logger.info(f"Modelli disponibili: {available_names}")
            
            # Precarica modelli configurati
            for model_name in self.config.preload_models:
                if model_name in available_names:
                    asyncio.create_task(self._preload_model(model_name))
                else:
                    logger.warning(f"Modello {model_name} non disponibile per preload")
                    
        except Exception as e:
            logger.error(f"Errore inizializzazione ModelManager: {e}")
    
    async def _preload_model(self, model_name: str):
        """Precarica un modello in background"""
        if model_name in self.preloading_in_progress:
            return
        
        self.preloading_in_progress.add(model_name)
        
        try:
            logger.info(f"Precaricamento modello {model_name}...")
            await self.ensure_model_loaded(model_name)
            logger.info(f"Modello {model_name} precaricato con successo")
        except Exception as e:
            logger.error(f"Errore precaricamento modello {model_name}: {e}")
        finally:
            self.preloading_in_progress.discard(model_name)
    
    async def ensure_model_loaded(self, model_name: str, force: bool = False) -> bool:
        """
        Assicura che un modello sia caricato
        
        Args:
            model_name: Nome del modello
            force: Forza ricaricamento anche se già caricato
            
        Returns:
            bool: True se modello è caricato
        """
        async with self._lock:
            # Se già caricato e non force, ritorna True
            if model_name in self.loaded_models and not force:
                return True
            
            # Verifica se modello è disponibile
            if not await self.client.is_model_available(model_name):
                raise OllamaModelError(f"Modello {model_name} non disponibile")
            
            # Gestisci limite modelli caricati
            if len(self.loaded_models) >= self.config.max_loaded_models:
                await self._unload_least_priority_model()
            
            # Carica il modello
            return await self._load_model(model_name)
    
    async def _load_model(self, model_name: str) -> bool:
        """
        Carica un modello specifico
        
        Args:
            model_name: Nome del modello
            
        Returns:
            bool: True se caricato con successo
        """
        start_time = time.time()
        
        try:
            logger.info(f"Caricamento modello {model_name}...")
            
            # Primo tentativo di generazione per "scaldare" il modello
            response = await self.client._make_request(
                "POST", 
                "/api/generate",
                json={
                    "model": model_name,
                    "prompt": "Hello",
                    "stream": False,
                    "options": {
                        "num_predict": 1,  # Genera solo 1 token
                        "temperature": 0.1
                    }
                },
                timeout=self.client.config.model_load_timeout
            )
            
            if response.status_code == 200:
                self.loaded_models.add(model_name)
                load_time = time.time() - start_time
                self.model_load_times[model_name] = load_time
                
                # Aggiorna statistiche
                if model_name not in self.model_usage_stats:
                    self.model_usage_stats[model_name] = ModelUsageStats(model_name)
                
                logger.info(f"Modello {model_name} caricato in {load_time:.2f}s")
                return True
            else:
                logger.error(f"Errore caricamento modello {model_name}: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Errore caricamento modello {model_name}: {e}")
            return False
    
    async def _unload_least_priority_model(self):
        """Scarica il modello con priorità più bassa"""
        if not self.loaded_models:
            return
        
        # Calcola priorità per ogni modello caricato
        model_priorities = {}
        current_time = datetime.now()
        
        for model_name in self.loaded_models:
            if model_name in self.model_usage_stats:
                stats = self.model_usage_stats[model_name]
                
                # Calcola priorità basata su:
                # 1. Frequenza d'uso
                # 2. Tasso di successo
                # 3. Tempo dall'ultimo utilizzo
                # 4. Se è in preload
                
                frequency_score = stats.total_requests / max(1, (current_time - stats.first_used).total_seconds() / 3600) if stats.first_used else 0
                success_score = stats.get_success_rate()
                recency_score = 1.0 / max(1, (current_time - stats.last_used).total_seconds() / 3600) if stats.last_used else 0
                preload_bonus = 1.0 if model_name in self.config.preload_models else 0
                
                priority = (frequency_score * 0.3) + (success_score * 0.3) + (recency_score * 0.3) + (preload_bonus * 0.1)
                model_priorities[model_name] = priority
            else:
                model_priorities[model_name] = 0.0
        
        # Trova modello con priorità più bassa
        least_priority_model = min(model_priorities, key=model_priorities.get)
        
        logger.info(f"Scaricamento modello {least_priority_model} (priorità: {model_priorities[least_priority_model]:.3f})")
        await self._unload_model(least_priority_model)
    
    async def _unload_model(self, model_name: str):
        """
        Scarica un modello dalla memoria
        
        Args:
            model_name: Nome del modello
        """
        try:
            # Nota: Ollama non ha un endpoint esplicito per scaricare modelli
            # Rimuoviamo solo dal nostro tracking
            self.loaded_models.discard(model_name)
            logger.info(f"Modello {model_name} rimosso dal tracking")
            
            # In futuro, potremmo implementare strategie più sofisticate
            # come il restart del container Ollama o l'uso di API specifiche
            
        except Exception as e:
            logger.error(f"Errore scaricamento modello {model_name}: {e}")
    
    async def get_model_priority(self, model_name: str) -> ModelPriority:
        """
        Calcola priorità di un modello
        
        Args:
            model_name: Nome del modello
            
        Returns:
            ModelPriority: Priorità del modello
        """
        if model_name in self.config.preload_models:
            return ModelPriority.HIGH
        
        if model_name in self.model_usage_stats:
            stats = self.model_usage_stats[model_name]
            current_time = datetime.now()
            
            # Modello usato recentemente = priorità alta
            if stats.last_used and (current_time - stats.last_used).total_seconds() < self.config.priority_boost_hours * 3600:
                return ModelPriority.HIGH
            
            # Modello con buon tasso di successo = priorità media
            if stats.get_success_rate() > 0.8:
                return ModelPriority.MEDIUM
        
        return ModelPriority.LOW
    
    def record_model_usage(self, model_name: str, response_time: float, success: bool, tokens: int = 0):
        """
        Registra utilizzo di un modello
        
        Args:
            model_name: Nome del modello
            response_time: Tempo di risposta in secondi
            success: Se la richiesta è riuscita
            tokens: Numero di token generati
        """
        if model_name not in self.model_usage_stats:
            self.model_usage_stats[model_name] = ModelUsageStats(model_name)
        
        self.model_usage_stats[model_name].update_usage(response_time, success, tokens)
    
    async def get_loaded_models(self) -> List[str]:
        """
        Ottieni lista modelli attualmente caricati
        
        Returns:
            List[str]: Lista nomi modelli caricati
        """
        return list(self.loaded_models)
    
    async def get_model_stats(self) -> Dict[str, Any]:
        """
        Ottieni statistiche complete sui modelli
        
        Returns:
            Dict[str, Any]: Statistiche modelli
        """
        return {
            "loaded_models": list(self.loaded_models),
            "total_models_available": len(await self.client.get_models()),
            "usage_stats": {name: stats.to_dict() for name, stats in self.model_usage_stats.items()},
            "load_times": self.model_load_times.copy(),
            "config": {
                "max_loaded_models": self.config.max_loaded_models,
                "preload_models": self.config.preload_models,
                "model_ttl": self.config.model_ttl
            }
        }
    
    async def cleanup_old_stats(self):
        """Pulisci statistiche vecchie"""
        current_time = datetime.now()
        cutoff_time = current_time - timedelta(days=7)  # Mantieni statistiche per 7 giorni
        
        to_remove = []
        for model_name, stats in self.model_usage_stats.items():
            if stats.last_used and stats.last_used < cutoff_time:
                to_remove.append(model_name)
        
        for model_name in to_remove:
            del self.model_usage_stats[model_name]
            logger.info(f"Rimossa statistica obsoleta per modello {model_name}")
    
    async def force_reload_model(self, model_name: str) -> bool:
        """
        Forza ricaricamento di un modello
        
        Args:
            model_name: Nome del modello
            
        Returns:
            bool: True se ricaricato con successo
        """
        async with self._lock:
            if model_name in self.loaded_models:
                await self._unload_model(model_name)
            
            return await self._load_model(model_name)
