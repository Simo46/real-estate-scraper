"""
Fallback endpoint per testare il servizio quando spaCy non è disponibile
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

# Router di fallback
fallback_router = APIRouter(
    prefix="/entities",
    tags=["Entity Extraction (Fallback)"]
)

@fallback_router.get("/health")
async def fallback_health():
    """Health check di fallback"""
    return {
        "success": True,
        "service": "EntityService",
        "status": "fallback",
        "message": "spaCy non disponibile - modalità fallback attiva",
        "spacy_available": False
    }

@fallback_router.get("/types")
async def fallback_entity_types():
    """Tipi di entità (fallback)"""
    return {
        "success": True,
        "entity_types": [
            {"type": "location", "description": "Luoghi geografici"},
            {"type": "price", "description": "Prezzi e valori monetari"},
            {"type": "property_type", "description": "Tipologie di proprietà"},
            {"type": "dimension", "description": "Dimensioni e metrature"},
            {"type": "condition", "description": "Condizioni dell'immobile"}
        ],
        "note": "Modalità fallback - spaCy non disponibile"
    }

@fallback_router.post("/extract")
async def fallback_extract():
    """Estrazione entità (fallback)"""
    raise HTTPException(
        status_code=503,
        detail={
            "error": "spaCy non disponibile",
            "message": "Il servizio di estrazione entità richiede spaCy",
            "suggestion": "Installare spaCy: pip install spacy && python -m spacy download it_core_news_sm"
        }
    )
