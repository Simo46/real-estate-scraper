"""
Ollama Client Manager
Task 5.2.6 - Ollama client setup e connection management

Gestisce la connessione e comunicazione con Ollama per il NLP Service.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import httpx
import json
import os
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

class ModelStatus(Enum):
    """Stati possibili per i modelli Ollama"""
    AVAILABLE = "available"
    LOADING = "loading"
    LOADED = "loaded"
    ERROR = "error"
    UNKNOWN = "unknown"

@dataclass
class OllamaConfig:
    """Configurazione per il client Ollama"""
    base_url: str = "http://ollama:11434"
    timeout: float = 30.0
    max_retries: int = 3
    retry_delay: float = 1.0
    connection_pool_size: int = 10
    keepalive_timeout: float = 30.0
    default_model: str = "llama3.2"
    
    # Configurazione modelli
    models_cache_ttl: int = 300  # 5 minuti
    model_load_timeout: float = 120.0  # 2 minuti per caricare un modello
    
    @classmethod
    def from_env(cls) -> 'OllamaConfig':
        """Crea configurazione da environment variables"""
        return cls(
            base_url=os.getenv("OLLAMA_URL", "http://ollama:11434"),
            timeout=float(os.getenv("OLLAMA_TIMEOUT", "30.0")),
            max_retries=int(os.getenv("OLLAMA_MAX_RETRIES", "3")),
            retry_delay=float(os.getenv("OLLAMA_RETRY_DELAY", "1.0")),
            default_model=os.getenv("OLLAMA_DEFAULT_MODEL", "llama3.2"),
            models_cache_ttl=int(os.getenv("OLLAMA_MODELS_CACHE_TTL", "300")),
            model_load_timeout=float(os.getenv("OLLAMA_MODEL_LOAD_TIMEOUT", "120.0"))
        )

@dataclass
class ModelInfo:
    """Informazioni su un modello Ollama"""
    name: str
    size: int
    modified_at: datetime
    digest: str
    status: ModelStatus = ModelStatus.UNKNOWN
    last_used: Optional[datetime] = None
    load_time: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "size": self.size,
            "modified_at": self.modified_at.isoformat(),
            "digest": self.digest,
            "status": self.status.value,
            "last_used": self.last_used.isoformat() if self.last_used else None,
            "load_time": self.load_time
        }

class OllamaConnectionError(Exception):
    """Eccezione per errori di connessione Ollama"""
    pass

class OllamaModelError(Exception):
    """Eccezione per errori relativi ai modelli"""
    pass

class OllamaClient:
    """Client per interagire con Ollama"""
    
    def __init__(self, config: Optional[OllamaConfig] = None):
        self.config = config or OllamaConfig.from_env()
        self.client: Optional[httpx.AsyncClient] = None
        self.models_cache: Dict[str, ModelInfo] = {}
        self.models_cache_timestamp: Optional[datetime] = None
        self.connection_healthy = False
        self.last_health_check: Optional[datetime] = None
        self._lock = asyncio.Lock()
        
        logger.info(f"Inizializzato OllamaClient con URL: {self.config.base_url}")
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.disconnect()
    
    async def connect(self):
        """Stabilisce connessione con Ollama"""
        if self.client is None:
            self.client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=httpx.Timeout(self.config.timeout),
                limits=httpx.Limits(
                    max_keepalive_connections=self.config.connection_pool_size,
                    keepalive_expiry=self.config.keepalive_timeout
                )
            )
            logger.info("Connessione Ollama stabilita")
        
        # Verifica connessione
        await self.health_check()
    
    async def disconnect(self):
        """Chiude connessione con Ollama"""
        if self.client:
            await self.client.aclose()
            self.client = None
            self.connection_healthy = False
            logger.info("Connessione Ollama chiusa")
    
    async def health_check(self, force: bool = False) -> bool:
        """
        Verifica salute della connessione Ollama
        
        Args:
            force: Forza check anche se recente
            
        Returns:
            bool: True se connessione è salutare
        """
        # Cache del health check per evitare troppi controlli
        if (not force and 
            self.last_health_check and 
            (datetime.now() - self.last_health_check).total_seconds() < 30):
            return self.connection_healthy
        
        try:
            if not self.client:
                await self.connect()
            
            response = await self.client.get("/", timeout=5.0)
            self.connection_healthy = response.status_code == 200
            self.last_health_check = datetime.now()
            
            if self.connection_healthy:
                logger.debug("Health check Ollama: OK")
            else:
                logger.warning(f"Health check Ollama fallito: {response.status_code}")
                
        except Exception as e:
            self.connection_healthy = False
            self.last_health_check = datetime.now()
            logger.error(f"Errore health check Ollama: {e}")
        
        return self.connection_healthy
    
    async def _make_request(self, method: str, endpoint: str, **kwargs) -> httpx.Response:
        """
        Esegue una richiesta HTTP con retry logic
        
        Args:
            method: Metodo HTTP (GET, POST, etc.)
            endpoint: Endpoint relativo
            **kwargs: Parametri per la richiesta
            
        Returns:
            httpx.Response: Risposta HTTP
            
        Raises:
            OllamaConnectionError: Se non riesce a connettersi
        """
        if not self.client:
            await self.connect()
        
        last_exception = None
        
        for attempt in range(self.config.max_retries + 1):
            try:
                response = await self.client.request(method, endpoint, **kwargs)
                
                # Se la risposta è OK, restituiscila
                if response.status_code < 500:
                    return response
                
                # Errore server, retry
                logger.warning(f"Errore server Ollama (tentativo {attempt + 1}): {response.status_code}")
                
            except Exception as e:
                last_exception = e
                logger.warning(f"Errore richiesta Ollama (tentativo {attempt + 1}): {e}")
            
            # Attendi prima del retry (tranne l'ultimo tentativo)
            if attempt < self.config.max_retries:
                await asyncio.sleep(self.config.retry_delay * (2 ** attempt))
        
        # Tutti i tentativi falliti
        raise OllamaConnectionError(f"Impossibile connettersi a Ollama dopo {self.config.max_retries + 1} tentativi: {last_exception}")
    
    async def get_models(self, force_refresh: bool = False) -> List[ModelInfo]:
        """
        Ottieni lista modelli disponibili
        
        Args:
            force_refresh: Forza aggiornamento cache
            
        Returns:
            List[ModelInfo]: Lista modelli
        """
        # Verifica cache
        if (not force_refresh and 
            self.models_cache_timestamp and 
            (datetime.now() - self.models_cache_timestamp).total_seconds() < self.config.models_cache_ttl):
            return list(self.models_cache.values())
        
        async with self._lock:
            try:
                response = await self._make_request("GET", "/api/tags")
                
                if response.status_code == 200:
                    data = response.json()
                    models = []
                    
                    for model_data in data.get("models", []):
                        model_info = ModelInfo(
                            name=model_data["name"],
                            size=model_data["size"],
                            modified_at=datetime.fromisoformat(model_data["modified_at"].replace("Z", "+00:00")),
                            digest=model_data["digest"],
                            status=ModelStatus.AVAILABLE
                        )
                        models.append(model_info)
                        self.models_cache[model_info.name] = model_info
                    
                    self.models_cache_timestamp = datetime.now()
                    logger.info(f"Cache modelli aggiornata: {len(models)} modelli trovati")
                    return models
                
                else:
                    raise OllamaModelError(f"Errore recupero modelli: {response.status_code}")
                    
            except Exception as e:
                logger.error(f"Errore recupero modelli: {e}")
                raise OllamaModelError(f"Impossibile recuperare modelli: {e}")
    
    async def is_model_available(self, model_name: str) -> bool:
        """
        Verifica se un modello è disponibile
        
        Args:
            model_name: Nome del modello
            
        Returns:
            bool: True se disponibile
        """
        try:
            models = await self.get_models()
            return any(model.name == model_name for model in models)
        except Exception:
            return False
    
    async def get_model_info(self, model_name: str) -> Optional[ModelInfo]:
        """
        Ottieni informazioni su un modello specifico
        
        Args:
            model_name: Nome del modello
            
        Returns:
            Optional[ModelInfo]: Informazioni modello o None se non trovato
        """
        try:
            models = await self.get_models()
            for model in models:
                if model.name == model_name:
                    return model
            return None
        except Exception:
            return None
    
    def get_connection_stats(self) -> Dict[str, Any]:
        """
        Ottieni statistiche sulla connessione
        
        Returns:
            Dict[str, Any]: Statistiche connessione
        """
        return {
            "healthy": self.connection_healthy,
            "last_health_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "models_cached": len(self.models_cache),
            "models_cache_age": (datetime.now() - self.models_cache_timestamp).total_seconds() if self.models_cache_timestamp else None,
            "base_url": self.config.base_url,
            "timeout": self.config.timeout,
            "max_retries": self.config.max_retries
        }

# Singleton globale per il client
_ollama_client: Optional[OllamaClient] = None

async def get_ollama_client() -> OllamaClient:
    """
    Ottieni istanza singleton del client Ollama
    
    Returns:
        OllamaClient: Client Ollama
    """
    global _ollama_client
    
    if _ollama_client is None:
        _ollama_client = OllamaClient()
        await _ollama_client.connect()
    
    return _ollama_client

async def close_ollama_client():
    """Chiudi client Ollama singleton"""
    global _ollama_client
    
    if _ollama_client:
        await _ollama_client.disconnect()
        _ollama_client = None
