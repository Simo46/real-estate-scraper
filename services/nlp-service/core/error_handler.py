"""
Error Handling e Fallback Strategies
Task 5.2.9 - Error handling e fallback strategies

Implementa gestione errori robusta e strategie di fallback per il NLP Service.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Callable, Union
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, field
import json
import traceback
from functools import wraps
import time

logger = logging.getLogger(__name__)

class ErrorType(Enum):
    """Tipi di errore del NLP Service"""
    CONNECTION_ERROR = "connection_error"
    MODEL_ERROR = "model_error"
    TIMEOUT_ERROR = "timeout_error"
    RATE_LIMIT_ERROR = "rate_limit_error"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"
    RESOURCE_ERROR = "resource_error"

class ErrorSeverity(Enum):
    """Livelli di gravità degli errori"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class ErrorRecord:
    """Record di un errore"""
    error_type: ErrorType
    message: str
    timestamp: datetime
    severity: ErrorSeverity
    context: Dict[str, Any] = field(default_factory=dict)
    stack_trace: Optional[str] = None
    resolved: bool = False
    resolution_time: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": self.error_type.value,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "severity": self.severity.value,
            "context": self.context,
            "stack_trace": self.stack_trace,
            "resolved": self.resolved,
            "resolution_time": self.resolution_time.isoformat() if self.resolution_time else None
        }

class FallbackStrategy(Enum):
    """Strategie di fallback"""
    RETRY = "retry"
    ALTERNATIVE_MODEL = "alternative_model"
    SIMPLIFIED_RESPONSE = "simplified_response"
    CACHED_RESPONSE = "cached_response"
    GRACEFUL_DEGRADATION = "graceful_degradation"

@dataclass
class FallbackConfig:
    """Configurazione per strategie di fallback"""
    max_retries: int = 3
    retry_delay: float = 1.0
    retry_exponential_backoff: bool = True
    alternative_models: List[str] = field(default_factory=lambda: ["llama3.2", "llama3.1"])
    enable_caching: bool = True
    cache_ttl: int = 3600  # 1 ora
    graceful_degradation: bool = True
    
    @classmethod
    def from_env(cls) -> 'FallbackConfig':
        """Crea configurazione da environment variables"""
        import os
        
        alt_models = os.getenv("OLLAMA_FALLBACK_MODELS", "llama3.2,llama3.1").split(",")
        
        return cls(
            max_retries=int(os.getenv("OLLAMA_MAX_RETRIES", "3")),
            retry_delay=float(os.getenv("OLLAMA_RETRY_DELAY", "1.0")),
            retry_exponential_backoff=os.getenv("OLLAMA_EXPONENTIAL_BACKOFF", "true").lower() == "true",
            alternative_models=[m.strip() for m in alt_models if m.strip()],
            enable_caching=os.getenv("OLLAMA_ENABLE_CACHING", "true").lower() == "true",
            cache_ttl=int(os.getenv("OLLAMA_CACHE_TTL", "3600")),
            graceful_degradation=os.getenv("OLLAMA_GRACEFUL_DEGRADATION", "true").lower() == "true"
        )

class ResponseCache:
    """Cache per risposte di fallback"""
    
    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.max_size = max_size
        self.ttl = ttl
        self._lock = asyncio.Lock()
    
    def _generate_key(self, prompt: str, model: str, params: Dict[str, Any]) -> str:
        """Genera chiave per cache"""
        import hashlib
        key_data = f"{prompt}:{model}:{json.dumps(params, sort_keys=True)}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    async def get(self, prompt: str, model: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Recupera risposta dalla cache"""
        async with self._lock:
            key = self._generate_key(prompt, model, params)
            
            if key in self.cache:
                entry = self.cache[key]
                # Verifica TTL
                if (datetime.now() - entry["timestamp"]).total_seconds() < self.ttl:
                    logger.info(f"Cache hit per chiave: {key[:10]}...")
                    return entry["response"]
                else:
                    # Rimuovi entry scaduta
                    del self.cache[key]
            
            return None
    
    async def set(self, prompt: str, model: str, params: Dict[str, Any], response: Dict[str, Any]):
        """Salva risposta in cache"""
        async with self._lock:
            key = self._generate_key(prompt, model, params)
            
            # Gestisci dimensione cache
            if len(self.cache) >= self.max_size:
                # Rimuovi entry più vecchia
                oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k]["timestamp"])
                del self.cache[oldest_key]
            
            self.cache[key] = {
                "response": response,
                "timestamp": datetime.now()
            }
            
            logger.debug(f"Salvata risposta in cache: {key[:10]}...")
    
    async def clear(self):
        """Pulisce cache"""
        async with self._lock:
            self.cache.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Ottiene statistiche cache"""
        return {
            "size": len(self.cache),
            "max_size": self.max_size,
            "ttl": self.ttl
        }

class ErrorHandler:
    """Gestore errori centralizzato"""
    
    def __init__(self, config: Optional[FallbackConfig] = None):
        self.config = config or FallbackConfig.from_env()
        self.error_history: List[ErrorRecord] = []
        self.response_cache = ResponseCache(ttl=self.config.cache_ttl)
        self.error_counts: Dict[ErrorType, int] = {}
        self.last_error_time: Optional[datetime] = None
        self._lock = asyncio.Lock()
        
        logger.info(f"Inizializzato ErrorHandler con config: {self.config}")
    
    async def record_error(self, error_type: ErrorType, message: str, severity: ErrorSeverity, 
                          context: Dict[str, Any] = None, exception: Exception = None):
        """Registra un errore"""
        async with self._lock:
            error_record = ErrorRecord(
                error_type=error_type,
                message=message,
                timestamp=datetime.now(),
                severity=severity,
                context=context or {},
                stack_trace=traceback.format_exc() if exception else None
            )
            
            self.error_history.append(error_record)
            self.error_counts[error_type] = self.error_counts.get(error_type, 0) + 1
            self.last_error_time = datetime.now()
            
            # Mantieni solo ultimi 1000 errori
            if len(self.error_history) > 1000:
                self.error_history = self.error_history[-1000:]
            
            # Log dell'errore
            log_level = {
                ErrorSeverity.LOW: logging.INFO,
                ErrorSeverity.MEDIUM: logging.WARNING,
                ErrorSeverity.HIGH: logging.ERROR,
                ErrorSeverity.CRITICAL: logging.CRITICAL
            }.get(severity, logging.ERROR)
            
            logger.log(log_level, f"[{error_type.value}] {message}")
    
    async def handle_with_fallback(self, primary_func: Callable, fallback_strategies: List[FallbackStrategy],
                                  context: Dict[str, Any] = None) -> Any:
        """
        Esegue funzione con strategie di fallback
        
        Args:
            primary_func: Funzione primaria da eseguire
            fallback_strategies: Lista di strategie di fallback
            context: Contesto per debugging
            
        Returns:
            Any: Risultato della funzione o fallback
        """
        context = context or {}
        last_exception = None
        
        # Tentativo primario
        try:
            return await primary_func()
        except Exception as e:
            last_exception = e
            await self.record_error(
                ErrorType.INTERNAL_ERROR,
                f"Errore funzione primaria: {str(e)}",
                ErrorSeverity.MEDIUM,
                context,
                e
            )
        
        # Esegui strategie di fallback
        for strategy in fallback_strategies:
            try:
                result = await self._execute_fallback_strategy(strategy, primary_func, context, last_exception)
                if result is not None:
                    return result
            except Exception as e:
                last_exception = e
                await self.record_error(
                    ErrorType.INTERNAL_ERROR,
                    f"Errore strategia fallback {strategy.value}: {str(e)}",
                    ErrorSeverity.HIGH,
                    context,
                    e
                )
        
        # Tutti i fallback falliti
        await self.record_error(
            ErrorType.INTERNAL_ERROR,
            "Tutti i fallback falliti",
            ErrorSeverity.CRITICAL,
            context,
            last_exception
        )
        
        raise last_exception
    
    async def _execute_fallback_strategy(self, strategy: FallbackStrategy, primary_func: Callable, 
                                       context: Dict[str, Any], last_exception: Exception) -> Any:
        """Esegue una strategia di fallback specifica"""
        
        if strategy == FallbackStrategy.RETRY:
            return await self._retry_strategy(primary_func, context)
        
        elif strategy == FallbackStrategy.ALTERNATIVE_MODEL:
            return await self._alternative_model_strategy(primary_func, context)
        
        elif strategy == FallbackStrategy.CACHED_RESPONSE:
            return await self._cached_response_strategy(context)
        
        elif strategy == FallbackStrategy.SIMPLIFIED_RESPONSE:
            return await self._simplified_response_strategy(context)
        
        elif strategy == FallbackStrategy.GRACEFUL_DEGRADATION:
            return await self._graceful_degradation_strategy(context)
        
        else:
            logger.warning(f"Strategia fallback non implementata: {strategy.value}")
            return None
    
    async def _retry_strategy(self, primary_func: Callable, context: Dict[str, Any]) -> Any:
        """Strategia di retry con backoff"""
        for attempt in range(self.config.max_retries):
            try:
                delay = self.config.retry_delay
                if self.config.retry_exponential_backoff:
                    delay *= (2 ** attempt)
                
                if attempt > 0:
                    logger.info(f"Retry tentativo {attempt + 1} dopo {delay}s...")
                    await asyncio.sleep(delay)
                
                return await primary_func()
                
            except Exception as e:
                if attempt == self.config.max_retries - 1:
                    raise e
                
                logger.warning(f"Retry {attempt + 1} fallito: {str(e)}")
        
        return None
    
    async def _alternative_model_strategy(self, primary_func: Callable, context: Dict[str, Any]) -> Any:
        """Strategia con modello alternativo"""
        original_model = context.get("model")
        
        for alt_model in self.config.alternative_models:
            if alt_model != original_model:
                try:
                    logger.info(f"Tentativo con modello alternativo: {alt_model}")
                    
                    # Modifica contesto per usare modello alternativo
                    context["model"] = alt_model
                    
                    # Funzione wrapper che usa il modello alternativo
                    async def alt_func():
                        return await primary_func()
                    
                    return await alt_func()
                    
                except Exception as e:
                    logger.warning(f"Modello alternativo {alt_model} fallito: {str(e)}")
                    continue
        
        return None
    
    async def _cached_response_strategy(self, context: Dict[str, Any]) -> Any:
        """Strategia con risposta cachata"""
        if not self.config.enable_caching:
            return None
        
        prompt = context.get("prompt", "")
        model = context.get("model", "")
        params = context.get("params", {})
        
        if prompt and model:
            cached_response = await self.response_cache.get(prompt, model, params)
            if cached_response:
                logger.info("Utilizzando risposta cachata per fallback")
                return cached_response
        
        return None
    
    async def _simplified_response_strategy(self, context: Dict[str, Any]) -> Any:
        """Strategia con risposta semplificata"""
        if not self.config.graceful_degradation:
            return None
        
        # Risposta semplificata basata sul contesto
        message = context.get("message", "")
        
        if "immobiliare" in message.lower() or "casa" in message.lower():
            return {
                "response": "Mi dispiace, il servizio di analisi immobiliare non è temporaneamente disponibile. Riprova più tardi.",
                "fallback": True,
                "timestamp": datetime.now().isoformat()
            }
        
        return {
            "response": "Mi dispiace, non riesco a elaborare la tua richiesta in questo momento. Il servizio è temporaneamente non disponibile.",
            "fallback": True,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _graceful_degradation_strategy(self, context: Dict[str, Any]) -> Any:
        """Strategia di degradamento graceful"""
        if not self.config.graceful_degradation:
            return None
        
        # Risposta che indica il problema ma mantiene il servizio operativo
        return {
            "response": "Il servizio di elaborazione del linguaggio naturale è temporaneamente limitato. Alcune funzionalità potrebbero non essere disponibili.",
            "status": "degraded",
            "available_features": ["basic_response", "health_check"],
            "fallback": True,
            "timestamp": datetime.now().isoformat()
        }
    
    async def cache_response(self, prompt: str, model: str, params: Dict[str, Any], response: Dict[str, Any]):
        """Salva risposta in cache"""
        if self.config.enable_caching:
            await self.response_cache.set(prompt, model, params, response)
    
    def get_error_stats(self) -> Dict[str, Any]:
        """Ottiene statistiche errori"""
        recent_errors = [
            error for error in self.error_history 
            if (datetime.now() - error.timestamp).total_seconds() < 3600  # Ultima ora
        ]
        
        return {
            "total_errors": len(self.error_history),
            "recent_errors": len(recent_errors),
            "error_counts": {et.value: count for et, count in self.error_counts.items()},
            "last_error_time": self.last_error_time.isoformat() if self.last_error_time else None,
            "cache_stats": self.response_cache.get_stats(),
            "config": {
                "max_retries": self.config.max_retries,
                "retry_delay": self.config.retry_delay,
                "alternative_models": self.config.alternative_models,
                "enable_caching": self.config.enable_caching,
                "graceful_degradation": self.config.graceful_degradation
            }
        }
    
    def get_recent_errors(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Ottiene errori recenti"""
        return [error.to_dict() for error in self.error_history[-limit:]]
    
    async def clear_error_history(self):
        """Pulisce storico errori"""
        async with self._lock:
            self.error_history.clear()
            self.error_counts.clear()
            self.last_error_time = None
    
    async def health_check(self) -> Dict[str, Any]:
        """Verifica salute del sistema di gestione errori"""
        recent_critical_errors = [
            error for error in self.error_history 
            if (datetime.now() - error.timestamp).total_seconds() < 300  # Ultimi 5 minuti
            and error.severity == ErrorSeverity.CRITICAL
        ]
        
        is_healthy = len(recent_critical_errors) == 0
        
        return {
            "healthy": is_healthy,
            "recent_critical_errors": len(recent_critical_errors),
            "total_errors": len(self.error_history),
            "cache_enabled": self.config.enable_caching,
            "cache_size": len(self.response_cache.cache),
            "fallback_strategies_enabled": True
        }

def with_error_handling(error_handler: ErrorHandler, fallback_strategies: List[FallbackStrategy] = None):
    """
    Decorator per gestione errori automatica
    
    Args:
        error_handler: Gestore errori
        fallback_strategies: Strategie di fallback
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            context = {
                "function": func.__name__,
                "args": str(args)[:100],  # Limita lunghezza
                "kwargs": str(kwargs)[:100]
            }
            
            strategies = fallback_strategies or [
                FallbackStrategy.RETRY,
                FallbackStrategy.GRACEFUL_DEGRADATION
            ]
            
            return await error_handler.handle_with_fallback(
                lambda: func(*args, **kwargs),
                strategies,
                context
            )
        
        return wrapper
    return decorator
