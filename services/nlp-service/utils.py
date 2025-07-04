"""
Utility functions per il servizio NLP
Task 5.2.4 - Basic service structure con health check
"""

import asyncio
import logging
import time
from typing import Dict, Any, Optional
from datetime import datetime
import httpx
from config import settings

logger = logging.getLogger(__name__)

class HealthChecker:
    """Classe per verificare lo stato dei servizi dipendenti"""
    
    def __init__(self):
        self.last_check = {}
        self.cache_duration = 30  # secondi
    
    async def check_ollama(self) -> Dict[str, Any]:
        """Verifica stato Ollama"""
        cache_key = "ollama"
        now = time.time()
        
        # Usa cache se disponibile e non scaduta
        if (cache_key in self.last_check and 
            now - self.last_check[cache_key]["timestamp"] < self.cache_duration):
            return self.last_check[cache_key]
        
        result = {
            "service": "ollama",
            "status": "unknown",
            "url": settings.ollama_url,
            "timestamp": now,
            "response_time_ms": 0,
            "error": None
        }
        
        try:
            start_time = time.time()
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{settings.ollama_url}/",
                    timeout=settings.ollama_timeout
                )
                
                result["response_time_ms"] = int((time.time() - start_time) * 1000)
                
                if response.status_code == 200:
                    result["status"] = "healthy"
                else:
                    result["status"] = "unhealthy"
                    result["error"] = f"HTTP {response.status_code}"
                    
        except Exception as e:
            result["status"] = "unreachable"
            result["error"] = str(e)
            logger.error(f"Errore controllo Ollama: {e}")
        
        self.last_check[cache_key] = result
        return result
    
    async def check_redis(self) -> Dict[str, Any]:
        """Verifica stato Redis"""
        cache_key = "redis"
        now = time.time()
        
        # Usa cache se disponibile
        if (cache_key in self.last_check and 
            now - self.last_check[cache_key]["timestamp"] < self.cache_duration):
            return self.last_check[cache_key]
        
        result = {
            "service": "redis",
            "status": "unknown",
            "host": settings.redis_host,
            "port": settings.redis_port,
            "timestamp": now,
            "response_time_ms": 0,
            "error": None
        }
        
        try:
            import redis
            start_time = time.time()
            
            r = redis.Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                db=settings.redis_db,
                password=settings.redis_password,
                socket_timeout=5,
                socket_connect_timeout=5
            )
            
            r.ping()
            result["response_time_ms"] = int((time.time() - start_time) * 1000)
            result["status"] = "healthy"
            
        except Exception as e:
            result["status"] = "unreachable"
            result["error"] = str(e)
            logger.error(f"Errore controllo Redis: {e}")
        
        self.last_check[cache_key] = result
        return result
    
    async def comprehensive_health_check(self) -> Dict[str, Any]:
        """Controllo completo dello stato del servizio"""
        start_time = time.time()
        
        # Controlla tutti i servizi dipendenti
        ollama_status = await self.check_ollama()
        redis_status = await self.check_redis()
        
        # Determina stato generale
        overall_status = "healthy"
        if ollama_status["status"] != "healthy":
            overall_status = "degraded"
        
        if redis_status["status"] != "healthy":
            logger.warning("Redis non disponibile - caching disabilitato")
        
        return {
            "service": settings.service_name,
            "version": settings.service_version,
            "status": overall_status,
            "timestamp": datetime.now().isoformat(),
            "uptime_seconds": int(time.time() - start_time),
            "dependencies": {
                "ollama": ollama_status,
                "redis": redis_status
            },
            "configuration": {
                "host": settings.service_host,
                "port": settings.service_port,
                "debug": settings.debug,
                "log_level": settings.log_level
            }
        }

# Istanza globale health checker
health_checker = HealthChecker()

def format_error_response(error: str, message: str) -> Dict[str, Any]:
    """Formatta una risposta di errore standard"""
    return {
        "error": error,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "service": settings.service_name
    }

def validate_query_length(query: str) -> bool:
    """Valida la lunghezza di una query"""
    return len(query) <= settings.max_query_length

def sanitize_query(query: str) -> str:
    """Sanifica una query rimuovendo caratteri potenzialmente pericolosi"""
    # Rimuovi caratteri di controllo
    sanitized = ''.join(char for char in query if ord(char) >= 32)
    
    # Limita lunghezza
    if len(sanitized) > settings.max_query_length:
        sanitized = sanitized[:settings.max_query_length]
    
    return sanitized.strip()

async def measure_processing_time(func, *args, **kwargs):
    """Misura il tempo di elaborazione di una funzione"""
    start_time = time.time()
    result = await func(*args, **kwargs)
    processing_time = int((time.time() - start_time) * 1000)
    return result, processing_time

class RateLimiter:
    """Semplice rate limiter per controllare le richieste concorrenti"""
    
    def __init__(self, max_concurrent: int = None):
        self.max_concurrent = max_concurrent or settings.max_concurrent_requests
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
    
    async def acquire(self):
        """Acquisisce il semaforo"""
        await self.semaphore.acquire()
    
    def release(self):
        """Rilascia il semaforo"""
        self.semaphore.release()
    
    async def __aenter__(self):
        await self.acquire()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.release()

# Istanza globale rate limiter
rate_limiter = RateLimiter()
