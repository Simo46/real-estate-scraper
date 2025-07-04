"""
NLP Service - FastAPI Application
Task 5.2.1 - Nuovo servizio services/nlp-service/ con FastAPI

Servizio per elaborazione del linguaggio naturale con integrazione Ollama.
"""

from fastapi import FastAPI, HTTPException, Depends
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

# Configurazione logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configurazione da environment variables
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
SERVICE_PORT = int(os.getenv("NLP_SERVICE_PORT", "8002"))
SERVICE_HOST = os.getenv("NLP_SERVICE_HOST", "0.0.0.0")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Inizializzazione FastAPI
app = FastAPI(
    title="Real Estate NLP Service",
    description="Servizio per l'elaborazione del linguaggio naturale per il Real Estate Scraper",
    version="1.0.0",
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

# Modelli Pydantic per request/response
class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "nlp-service"
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    ollama_connection: bool = False
    version: str = "1.0.0"

class ErrorResponse(BaseModel):
    error: str
    message: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

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

# Dependency per verificare connessione Ollama
async def check_ollama_connection() -> bool:
    """Verifica se Ollama è raggiungibile"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_URL}/", timeout=5.0)
            return response.status_code == 200
    except Exception as e:
        logger.error(f"Errore connessione Ollama: {e}")
        return False

# Endpoints

@app.get("/", response_model=HealthResponse)
async def root():
    """Endpoint root con informazioni base del servizio"""
    ollama_healthy = await check_ollama_connection()
    return HealthResponse(
        ollama_connection=ollama_healthy
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint per monitoring"""
    ollama_healthy = await check_ollama_connection()
    
    health_status = HealthResponse(
        ollama_connection=ollama_healthy
    )
    
    # Se Ollama non è raggiungibile, ritorna status degraded
    if not ollama_healthy:
        health_status.status = "degraded"
    
    return health_status

@app.post("/process-query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    """
    Elabora una query in linguaggio naturale
    Placeholder per implementazione futura
    """
    start_time = datetime.now()
    
    try:
        # Placeholder per elaborazione NLP
        response = QueryResponse(
            original_query=request.query,
            processed=True,
            entities=[],  # Sarà popolato nelle prossime implementazioni
            conditions=[],  # Sarà popolato nelle prossime implementazioni
            confidence=0.0,
            processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
        )
        
        logger.info(f"Query processata: {request.query[:50]}...")
        return response
        
    except Exception as e:
        logger.error(f"Errore elaborazione query: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nell'elaborazione della query: {str(e)}"
        )

@app.get("/models")
async def get_available_models():
    """Ottieni modelli disponibili da Ollama"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags", timeout=10.0)
            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(
                    status_code=503,
                    detail="Servizio Ollama non disponibile"
                )
    except Exception as e:
        logger.error(f"Errore recupero modelli: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero dei modelli: {str(e)}"
        )

@app.get("/status")
async def get_service_status():
    """Stato dettagliato del servizio"""
    ollama_healthy = await check_ollama_connection()
    
    return {
        "service": "nlp-service",
        "status": "healthy" if ollama_healthy else "degraded",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "dependencies": {
            "ollama": {
                "url": OLLAMA_URL,
                "status": "healthy" if ollama_healthy else "unreachable"
            }
        },
        "configuration": {
            "port": SERVICE_PORT,
            "host": SERVICE_HOST,
            "log_level": LOG_LEVEL
        }
    }

# Handler per errori globali
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Errore non gestito: {exc}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal Server Error",
            message=str(exc)
        ).dict()
    )

# Startup event
@app.on_event("startup")
async def startup_event():
    """Evento di avvio del servizio"""
    logger.info("🚀 Avvio NLP Service")
    logger.info(f"Configurazione: {SERVICE_HOST}:{SERVICE_PORT}")
    logger.info(f"Ollama URL: {OLLAMA_URL}")
    
    # Verifica connessione Ollama
    ollama_healthy = await check_ollama_connection()
    if ollama_healthy:
        logger.info("✅ Connessione Ollama stabilita")
    else:
        logger.warning("⚠️ Ollama non raggiungibile - servizio in modalità degradata")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Evento di chiusura del servizio"""
    logger.info("🛑 Chiusura NLP Service")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=SERVICE_HOST,
        port=SERVICE_PORT,
        reload=True,
        log_level=LOG_LEVEL.lower()
    )
