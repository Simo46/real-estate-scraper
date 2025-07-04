"""
NLP Service - FastAPI Application
Task 5.2 - NLP Service Foundation with Ollama Integration

Servizio per elaborazione del linguaggio naturale con integrazione Ollama completa.
Implementa client Ollama, gestione modelli, chat service, error handling e monitoring.
"""

from fastapi import FastAPI, HTTPException, Depends, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import uvicorn
import asyncio
import logging
from datetime import datetime
import os
import sys
import time
import uuid

# Import core modules
from core import (
    OllamaClient, OllamaConfig, ModelManager, ModelCacheConfig,
    ChatService, ChatRequest, ChatResponse, ChatMessage,
    ErrorHandler, FallbackConfig, ErrorType, ErrorSeverity,
    get_logger, get_metrics, get_performance_monitor, get_health_checker,
    OllamaModelError, OllamaConnectionError
)

# Import exception types
from core.ollama_client import OllamaModelError, OllamaConnectionError

# Configurazione da environment variables
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
SERVICE_PORT = int(os.getenv("NLP_SERVICE_PORT", "8002"))
SERVICE_HOST = os.getenv("NLP_SERVICE_HOST", "0.0.0.0")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Inizializza sistemi di logging e monitoring
logger = get_logger()
metrics = get_metrics()
performance_monitor = get_performance_monitor()
health_checker = get_health_checker()

# Servizi globali
ollama_client: Optional[OllamaClient] = None
model_manager: Optional[ModelManager] = None
chat_service: Optional[ChatService] = None
error_handler: Optional[ErrorHandler] = None

# Inizializzazione FastAPI
app = FastAPI(
    title="Real Estate NLP Service",
    description="Servizio per l'elaborazione del linguaggio naturale per il Real Estate Scraper con integrazione Ollama completa",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Middleware CORS per permettere chiamate da API Gateway
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione, specificare domini specifici
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware per monitoring delle richieste
@app.middleware("http")
async def monitor_requests(request: Request, call_next):
    # Genera ID richiesta
    request_id = str(uuid.uuid4())
    
    # Inizia monitoring
    start_time = time.time()
    await performance_monitor.start_request(
        request_id, 
        request.method, 
        str(request.url.path)
    )
    
    try:
        # Esegui richiesta
        response = await call_next(request)
        
        # Termina monitoring
        processing_time = time.time() - start_time
        await performance_monitor.end_request(
            request_id,
            request.method,
            str(request.url.path),
            response.status_code,
            processing_time=processing_time
        )
        
        return response
        
    except Exception as e:
        # Registra errore
        processing_time = time.time() - start_time
        await performance_monitor.end_request(
            request_id,
            request.method,
            str(request.url.path),
            500,
            processing_time=processing_time,
            error=str(e)
        )
        
        # Log errore
        logger.error(f"Errore durante richiesta: {str(e)}", 
                    request_id=request_id, 
                    method=request.method, 
                    path=str(request.url.path))
        
        raise e

# Modelli Pydantic per request/response
class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "nlp-service"
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    ollama_connection: bool = False
    version: str = "2.0.0"
    models_loaded: int = 0
    active_requests: int = 0

class ErrorResponse(BaseModel):
    error: str
    message: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    request_id: Optional[str] = None

class QueryRequest(BaseModel):
    query: str = Field(..., description="Testo da elaborare")
    language: str = Field(default="it", description="Lingua del testo")
    extract_entities: bool = Field(default=True, description="Estrai entità")
    process_conditions: bool = Field(default=True, description="Elabora condizioni")

class QueryResponse(BaseModel):
    original_query: str
    processed: bool
    entities: List[Dict[str, Any]] = []
    conditions: List[Dict[str, Any]] = []
    confidence: float = 0.0
    processing_time_ms: int = 0
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class ModelListResponse(BaseModel):
    models: List[Dict[str, Any]]
    total: int
    loaded: List[str]
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class ServiceStatsResponse(BaseModel):
    service: str = "nlp-service"
    uptime: float
    requests: Dict[str, int]
    performance: Dict[str, float]
    models: Dict[str, Any]
    errors: Dict[str, Any]
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

# Dependency per ottenere i servizi
async def get_chat_service() -> ChatService:
    """Dependency per ottenere il chat service"""
    if chat_service is None:
        raise HTTPException(status_code=503, detail="Chat service non inizializzato")
    return chat_service

async def get_model_manager() -> ModelManager:
    """Dependency per ottenere il model manager"""
    if model_manager is None:
        raise HTTPException(status_code=503, detail="Model manager non inizializzato")
    return model_manager

async def get_ollama_client() -> OllamaClient:
    """Dependency per ottenere il client Ollama"""
    if ollama_client is None:
        raise HTTPException(status_code=503, detail="Ollama client non inizializzato")
    return ollama_client

# Endpoints

@app.get("/", response_model=HealthResponse)
async def root():
    """Endpoint root con informazioni base del servizio"""
    try:
        client = await get_ollama_client()
        ollama_healthy = await client.health_check()
        
        manager = await get_model_manager()
        loaded_models = await manager.get_loaded_models()
        
        active_requests_dict = performance_monitor.get_active_requests()
        active_requests = len(active_requests_dict)
        
        return HealthResponse(
            ollama_connection=ollama_healthy,
            models_loaded=len(loaded_models),
            active_requests=active_requests
        )
    except Exception as e:
        logger.error(f"Errore endpoint root: {e}")
        return HealthResponse(
            status="degraded",
            ollama_connection=False,
            models_loaded=0,
            active_requests=0
        )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint per monitoring"""
    try:
        # Verifica salute completa del sistema
        health_status = await health_checker.check_health()
        
        client = await get_ollama_client()
        ollama_healthy = await client.health_check()
        
        manager = await get_model_manager()
        loaded_models = await manager.get_loaded_models()
        
        active_requests_dict = performance_monitor.get_active_requests()
        active_requests = len(active_requests_dict)
        
        status = "healthy"
        if health_status["status"] != "healthy":
            status = health_status["status"]
        elif not ollama_healthy:
            status = "degraded"
        
        return HealthResponse(
            status=status,
            ollama_connection=ollama_healthy,
            models_loaded=len(loaded_models),
            active_requests=active_requests
        )
    except Exception as e:
        logger.error(f"Errore health check: {e}")
        return HealthResponse(
            status="unhealthy",
            ollama_connection=False,
            models_loaded=0,
            active_requests=0
        )

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest, chat_svc: ChatService = Depends(get_chat_service)):
    """
    Endpoint per chat con Ollama
    Task 5.2.8 - Basic /chat endpoint per testing
    """
    try:
        logger.info(f"Richiesta chat: {request.message[:50]}...", 
                   model=request.model, 
                   conversation_id=request.conversation_id)
        
        response = await chat_svc.chat(request)
        
        logger.info(f"Chat completata: {response.processing_time:.2f}s, {response.total_tokens} tokens",
                   model=response.model,
                   processing_time=response.processing_time,
                   tokens=response.total_tokens)
        
        return response
        
    except OllamaModelError as e:
        # Modello non trovato o non disponibile
        logger.error(f"Modello non disponibile: {e}", 
                    request_message=request.message[:50],
                    model=request.model)
        raise HTTPException(
            status_code=404,
            detail=f"Modello non disponibile: {request.model}"
        )
    except OllamaConnectionError as e:
        # Errore di connessione a Ollama
        logger.error(f"Errore connessione Ollama: {e}", 
                    request_message=request.message[:50],
                    model=request.model)
        raise HTTPException(
            status_code=503,
            detail="Servizio Ollama temporaneamente non disponibile"
        )
    except ValueError as e:
        # Errori di validazione (es. parametri non validi)
        logger.error(f"Errore validazione chat: {e}", 
                    request_message=request.message[:50],
                    model=request.model)
        raise HTTPException(
            status_code=400,
            detail=f"Errore di validazione: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Errore chat endpoint: {e}", 
                    request_message=request.message[:50],
                    model=request.model)
        raise HTTPException(
            status_code=500,
            detail=f"Errore nell'elaborazione della chat: {str(e)}"
        )

@app.get("/chat/history/{conversation_id}")
async def get_conversation_history(conversation_id: str, chat_svc: ChatService = Depends(get_chat_service)):
    """Ottiene storico conversazione"""
    try:
        history = await chat_svc.get_conversation_history(conversation_id)
        return {
            "conversation_id": conversation_id,
            "messages": history,
            "total_messages": len(history),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Errore recupero conversazione: {e}", conversation_id=conversation_id)
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero della conversazione: {str(e)}"
        )

@app.delete("/chat/history/{conversation_id}")
async def clear_conversation_history(conversation_id: str, chat_svc: ChatService = Depends(get_chat_service)):
    """Pulisce storico conversazione"""
    try:
        await chat_svc.clear_conversation(conversation_id)
        return {
            "conversation_id": conversation_id,
            "status": "cleared",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Errore pulizia conversazione: {e}", conversation_id=conversation_id)
        raise HTTPException(
            status_code=500,
            detail=f"Errore nella pulizia della conversazione: {str(e)}"
        )

@app.post("/process-query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    """
    Elabora una query in linguaggio naturale
    Placeholder per implementazioni future NLP
    """
    start_time = datetime.now()
    
    try:
        # Placeholder per elaborazione NLP avanzata
        # In futuro qui implementeremo l'estrazione di entità, 
        # analisi semantica, etc.
        
        response = QueryResponse(
            original_query=request.query,
            processed=True,
            entities=[],  # Sarà popolato nelle prossime implementazioni
            conditions=[],  # Sarà popolato nelle prossime implementazioni
            confidence=0.0,
            processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
        )
        
        logger.info(f"Query processata: {request.query[:50]}...", 
                   language=request.language,
                   extract_entities=request.extract_entities,
                   process_conditions=request.process_conditions)
        
        return response
        
    except Exception as e:
        logger.error(f"Errore elaborazione query: {e}", 
                    query=request.query[:50])
        raise HTTPException(
            status_code=500,
            detail=f"Errore nell'elaborazione della query: {str(e)}"
        )

@app.get("/models", response_model=ModelListResponse)
async def get_available_models(client: OllamaClient = Depends(get_ollama_client), 
                              manager: ModelManager = Depends(get_model_manager)):
    """Ottieni modelli disponibili da Ollama"""
    try:
        # Ottieni modelli disponibili
        available_models = await client.get_models()
        
        # Ottieni modelli caricati
        loaded_models = await manager.get_loaded_models()
        
        models_data = []
        for model in available_models:
            model_dict = model.to_dict()
            model_dict["loaded"] = model.name in loaded_models
            models_data.append(model_dict)
        
        return ModelListResponse(
            models=models_data,
            total=len(models_data),
            loaded=loaded_models
        )
        
    except Exception as e:
        logger.error(f"Errore recupero modelli: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero dei modelli: {str(e)}"
        )

@app.post("/models/{model_name}/load")
async def load_model(model_name: str, manager: ModelManager = Depends(get_model_manager)):
    """Carica un modello specifico"""
    try:
        logger.info(f"Caricamento modello: {model_name}")
        
        success = await manager.ensure_model_loaded(model_name, force=True)
        
        if success:
            logger.info(f"Modello {model_name} caricato con successo")
            return {
                "model": model_name,
                "status": "loaded",
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Impossibile caricare il modello {model_name}"
            )
            
    except Exception as e:
        logger.error(f"Errore caricamento modello {model_name}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel caricamento del modello: {str(e)}"
        )

@app.post("/models/{model_name}/test")
async def test_model(model_name: str, chat_svc: ChatService = Depends(get_chat_service)):
    """Testa un modello specifico"""
    try:
        logger.info(f"Test modello: {model_name}")
        
        result = await chat_svc.test_model(model_name)
        
        logger.info(f"Test modello {model_name} completato: {result['status']}")
        return result
        
    except Exception as e:
        logger.error(f"Errore test modello {model_name}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel test del modello: {str(e)}"
        )

@app.get("/stats", response_model=ServiceStatsResponse)
async def get_service_stats(chat_svc: ChatService = Depends(get_chat_service)):
    """Ottieni statistiche dettagliate del servizio"""
    try:
        # Statistiche generali
        metrics_stats = metrics.get_summary_stats()
        
        # Statistiche chat service
        chat_stats = chat_svc.get_service_stats()
        
        # Statistiche modelli
        model_stats = await model_manager.get_model_stats() if model_manager else {}
        
        # Statistiche errori
        error_stats = error_handler.get_error_stats() if error_handler else {}
        
        return ServiceStatsResponse(
            uptime=metrics_stats.get("uptime_seconds", 0),
            requests={
                "total": metrics_stats.get("total_requests", 0),
                "successful": metrics_stats.get("total_requests", 0) - metrics_stats.get("total_errors", 0),
                "failed": metrics_stats.get("total_errors", 0)
            },
            performance={
                "avg_response_time": metrics_stats.get("avg_processing_time", 0),
                "requests_per_second": metrics_stats.get("requests_per_second", 0),
                "tokens_per_second": metrics_stats.get("tokens_per_second", 0)
            },
            models=model_stats,
            errors=error_stats
        )
        
    except Exception as e:
        logger.error(f"Errore recupero statistiche: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero delle statistiche: {str(e)}"
        )

@app.get("/status")
async def get_service_status():
    """Stato dettagliato del servizio"""
    try:
        # Verifica connessione Ollama
        client = await get_ollama_client()
        ollama_healthy = await client.health_check()
        
        # Statistiche connessione
        connection_stats = client.get_connection_stats()
        
        # Statistiche generali
        general_stats = metrics.get_summary_stats()
        
        return {
            "service": "nlp-service",
            "status": "healthy" if ollama_healthy else "degraded",
            "version": "2.0.0",
            "timestamp": datetime.now().isoformat(),
            "dependencies": {
                "ollama": {
                    "url": OLLAMA_URL,
                    "status": "healthy" if ollama_healthy else "unreachable",
                    "connection_stats": connection_stats
                }
            },
            "configuration": {
                "port": SERVICE_PORT,
                "host": SERVICE_HOST,
                "log_level": LOG_LEVEL
            },
            "stats": general_stats
        }
        
    except Exception as e:
        logger.error(f"Errore recupero status: {e}")
        return {
            "service": "nlp-service",
            "status": "error",
            "version": "2.0.0",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }

# Handler per errori globali
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handler globale per errori"""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    logger.error(f"Errore non gestito: {exc}", 
                request_id=request_id,
                path=str(request.url.path),
                method=request.method)
    
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal Server Error",
            message=str(exc),
            request_id=request_id
        ).dict()
    )

# Startup event
@app.on_event("startup")
async def startup_event():
    """Evento di avvio del servizio"""
    global ollama_client, model_manager, chat_service, error_handler
    
    logger.info("🚀 Avvio NLP Service v2.0.0")
    logger.info(f"Configurazione: {SERVICE_HOST}:{SERVICE_PORT}")
    logger.info(f"Ollama URL: {OLLAMA_URL}")
    
    try:
        # Inizializza error handler
        error_handler = ErrorHandler()
        logger.info("✅ Error handler inizializzato")
        
        # Inizializza client Ollama
        ollama_client = OllamaClient()
        await ollama_client.connect()
        logger.info("✅ Client Ollama inizializzato")
        
        # Inizializza model manager
        model_manager = ModelManager(ollama_client)
        await model_manager.initialize()
        logger.info("✅ Model manager inizializzato")
        
        # Inizializza chat service
        chat_service = ChatService(ollama_client, model_manager)
        logger.info("✅ Chat service inizializzato")
        
        # Verifica connessione Ollama
        ollama_healthy = await ollama_client.health_check()
        if ollama_healthy:
            logger.info("✅ Connessione Ollama stabilita")
        else:
            logger.warning("⚠️ Ollama non raggiungibile - servizio in modalità degradata")
        
        # Avvia task di background per monitoring
        asyncio.create_task(background_monitoring())
        
        logger.info("🎉 NLP Service avviato con successo")
        
    except Exception as e:
        logger.critical(f"❌ Errore durante avvio: {e}")
        # Il servizio continua anche in caso di errori, ma in modalità degradata
        
# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Evento di chiusura del servizio"""
    logger.info("🛑 Chiusura NLP Service")
    
    try:
        # Chiudi connessioni
        if ollama_client:
            await ollama_client.disconnect()
            logger.info("✅ Client Ollama disconnesso")
        
        # Pulisci cache e statistiche
        if model_manager:
            await model_manager.cleanup_old_stats()
            logger.info("✅ Model manager pulito")
        
        if error_handler:
            await error_handler.response_cache.clear()
            logger.info("✅ Error handler pulito")
        
        logger.info("✅ Chiusura completata")
        
    except Exception as e:
        logger.error(f"Errore durante chiusura: {e}")

async def background_monitoring():
    """Task di background per monitoring e manutenzione"""
    while True:
        try:
            await asyncio.sleep(300)  # 5 minuti
            
            # Cleanup periodico
            if model_manager:
                await model_manager.cleanup_old_stats()
            
            # Health check periodico
            if ollama_client:
                await ollama_client.health_check(force=True)
            
            # Log statistiche periodiche
            if metrics:
                stats = metrics.get_summary_stats()
                logger.info("📊 Statistiche periodiche",
                          total_requests=stats.get("total_requests", 0),
                          error_rate=stats.get("error_rate", 0),
                          avg_response_time=stats.get("avg_processing_time", 0))
            
        except Exception as e:
            logger.error(f"Errore monitoring background: {e}")
            await asyncio.sleep(60)  # Attesa più breve in caso di errore

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=SERVICE_HOST,
        port=SERVICE_PORT,
        reload=True,
        log_level=LOG_LEVEL.lower()
    )
