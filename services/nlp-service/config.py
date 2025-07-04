"""
Configurazione del servizio NLP
Task 5.2.4 - Basic service structure con health check
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Configurazione del servizio NLP"""
    
    # Configurazione servizio
    service_name: str = "nlp-service"
    service_version: str = "1.0.0"
    service_host: str = "0.0.0.0"
    service_port: int = 8002
    
    # Configurazione logging
    log_level: str = "INFO"
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Configurazione Ollama
    ollama_url: str = "http://ollama:11434"
    ollama_timeout: int = 30
    ollama_retry_attempts: int = 3
    ollama_retry_delay: int = 5
    
    # Configurazione modelli
    default_model: str = "llama3.2:3b"
    models_cache_size: int = 1
    model_keep_alive: str = "5m"
    
    # Configurazione spaCy
    spacy_model_it: str = "it_core_news_sm"
    spacy_model_en: str = "en_core_web_sm"
    
    # Configurazione Redis (per caching)
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: Optional[str] = None
    
    # Configurazione performance
    max_query_length: int = 2000
    max_concurrent_requests: int = 10
    request_timeout: int = 30
    
    # Configurazione sviluppo
    debug: bool = False
    reload: bool = False
    
    # Configurazione CORS
    cors_origins: list = ["*"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list = ["*"]
    cors_allow_headers: list = ["*"]
    
    class Config:
        env_file = ".env"
        env_prefix = "NLP_"
        case_sensitive = False

# Istanza globale settings
settings = Settings()

# Configurazione per diversi ambienti
def get_settings() -> Settings:
    """Ottieni configurazione del servizio"""
    return settings

# Configurazione logging
def setup_logging():
    """Configura il sistema di logging"""
    import logging
    
    # Configurazione base
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper()),
        format=settings.log_format,
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("nlp_service.log") if not settings.debug else logging.StreamHandler()
        ]
    )
    
    # Configura logger specifici
    loggers = [
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "fastapi",
        "httpx",
        "ollama"
    ]
    
    for logger_name in loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(getattr(logging, settings.log_level.upper()))
    
    return logging.getLogger(__name__)

# Validazione configurazione
def validate_settings():
    """Valida la configurazione del servizio"""
    errors = []
    
    # Validazione porte
    if not (1024 <= settings.service_port <= 65535):
        errors.append("service_port deve essere tra 1024 e 65535")
    
    # Validazione URL Ollama
    if not settings.ollama_url.startswith(("http://", "https://")):
        errors.append("ollama_url deve iniziare con http:// o https://")
    
    # Validazione timeouts
    if settings.ollama_timeout <= 0:
        errors.append("ollama_timeout deve essere positivo")
    
    if settings.request_timeout <= 0:
        errors.append("request_timeout deve essere positivo")
    
    # Validazione limiti
    if settings.max_query_length <= 0:
        errors.append("max_query_length deve essere positivo")
    
    if settings.max_concurrent_requests <= 0:
        errors.append("max_concurrent_requests deve essere positivo")
    
    if errors:
        raise ValueError(f"Errori di configurazione: {', '.join(errors)}")
    
    return True
