"""
Entity Controller
Task 5.3.3 - /extract-entities endpoint implementation
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import JSONResponse
import time

# Absolute imports
from models.entities import (
    EntityExtractionRequest, EntityExtractionResponse,
    EntityType, RealEstateEntity
)
from models.common import BaseResponse, ErrorResponse
from services.entity_service import entity_service, EntityService

logger = logging.getLogger(__name__)

# Router per gli endpoint di entity extraction
entity_router = APIRouter(
    prefix="/entities",
    tags=["Entity Extraction"],
    responses={404: {"description": "Not found"}}
)

class EntityController:
    """Controller per gli endpoint di estrazione entità"""
    
    def __init__(self, service: EntityService):
        self.service = service
        
    async def extract_entities(self, request: EntityExtractionRequest) -> EntityExtractionResponse:
        """Estrae entità dal testo"""
        try:
            logger.info(f"Richiesta estrazione entità: {len(request.text)} caratteri")
            
            # Delega al servizio
            response = await self.service.extract_entities(request)
            
            if response.success:
                logger.info(f"Estratte {response.entity_count} entità")
            else:
                logger.error(f"Errore nell'estrazione: {response.analysis_metadata}")
                
            return response
            
        except Exception as e:
            logger.error(f"Errore nel controller extract_entities: {e}")
            return EntityExtractionResponse(
                success=False,
                entities=[],
                analysis_metadata={"error": str(e)}
            )
    
    async def get_entity_types(self) -> Dict[str, Any]:
        """Ottiene i tipi di entità supportati"""
        return {
            "success": True,
            "entity_types": [
                {
                    "type": EntityType.LOCATION.value,
                    "description": "Luoghi geografici (città, zone, indirizzi)"
                },
                {
                    "type": EntityType.PRICE.value,
                    "description": "Prezzi e valori monetari"
                },
                {
                    "type": EntityType.PROPERTY_TYPE.value,
                    "description": "Tipologie di proprietà (casa, appartamento, villa)"
                },
                {
                    "type": EntityType.DIMENSION.value,
                    "description": "Dimensioni e metrature"
                },
                {
                    "type": EntityType.CONDITION.value,
                    "description": "Condizioni dell'immobile"
                },
                {
                    "type": EntityType.FEATURE.value,
                    "description": "Caratteristiche aggiuntive"
                }
            ]
        }
    
    async def get_service_health(self) -> Dict[str, Any]:
        """Ottiene lo stato del servizio di entity extraction"""
        return {
            "success": True,
            "service": "EntityService",
            "health": self.service.get_health_status()
        }
    
    async def debug_entity_extraction(self, request: EntityExtractionRequest) -> Dict[str, Any]:
        """Debug dell'estrazione entità per capire cosa sta succedendo"""
        try:
            logger.info(f"Debug estrazione entità: {request.text}")
            
            # Prima verifica se il servizio è inizializzato
            if not self.service.is_initialized:
                await self.service.initialize()
            
            # Processa direttamente con spaCy per debug
            nlp_model = self.service.nlp_model
            if not nlp_model:
                return {
                    "success": False,
                    "error": "Modello spaCy non disponibile",
                    "debug_info": {}
                }
            
            doc = nlp_model(request.text)
            
            # Raccoglie informazioni debug
            spacy_entities = []
            processing_errors = []
            
            for ent in doc.ents:
                spacy_entities.append({
                    "text": ent.text,
                    "label": ent.label_,
                    "start_char": ent.start_char,
                    "end_char": ent.end_char
                })
            
            # Prova a creare le entità come nel servizio
            entities = []
            for ent in doc.ents:
                try:
                    # Calcola confidence come nel servizio
                    confidence = self.service._calculate_confidence(ent, doc)
                    
                    # Verifica soglia
                    if confidence < request.confidence_threshold:
                        processing_errors.append(f"Entità '{ent.text}' filtrata per bassa confidenza: {confidence:.2f} < {request.confidence_threshold}")
                        continue
                    
                    # Prova a creare l'entità
                    entity = await self.service._create_entity_from_spacy(ent, confidence, request)
                    if entity:
                        entities.append({
                            "text": entity.text,
                            "label": entity.label.value,
                            "confidence": entity.confidence,
                            "normalized_value": entity.normalized_value
                        })
                    else:
                        processing_errors.append(f"Entità '{ent.text}' non creata (entity è None)")
                        
                except Exception as e:
                    processing_errors.append(f"Errore processing '{ent.text}': {str(e)}")
            
            return {
                "success": True,
                "text": request.text,
                "entity_count": len(entities),
                "entities": entities,
                "debug_info": {
                    "spacy_entities": spacy_entities,
                    "processing_errors": processing_errors,
                    "confidence_threshold": request.confidence_threshold,
                    "model_used": self.service.config.model_name
                }
            }
            
        except Exception as e:
            logger.error(f"Errore nel debug entity extraction: {e}")
            return {
                "success": False,
                "error": str(e),
                "debug_info": {}
            }

# Istanza del controller
entity_controller = EntityController(entity_service)

# Endpoint Routes

@entity_router.post("/extract", response_model=EntityExtractionResponse)
async def extract_entities_endpoint(
    request: EntityExtractionRequest,
    background_tasks: BackgroundTasks
) -> EntityExtractionResponse:
    """
    Estrae entità dal testo per il settore immobiliare.
    
    - **text**: Il testo da analizzare
    - **language**: Lingua del testo (default: "it")
    - **entity_types**: Tipi di entità da estrarre (opzionale)
    - **confidence_threshold**: Soglia minima di confidenza (default: 0.5)
    - **normalize_entities**: Normalizza le entità estratte (default: True)
    
    Returns:
        EntityExtractionResponse con le entità estratte
    """
    try:
        response = await entity_controller.extract_entities(request)
        
        # Background task per logging/monitoring
        background_tasks.add_task(
            _log_extraction_stats,
            len(request.text),
            response.entity_count,
            response.processing_time_ms
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Errore nell'endpoint extract_entities: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Errore interno del server",
                "message": str(e)
            }
        )

@entity_router.get("/types")
async def get_entity_types_endpoint() -> Dict[str, Any]:
    """
    Ottiene i tipi di entità supportati dal servizio.
    
    Returns:
        Lista dei tipi di entità con descrizioni
    """
    try:
        return await entity_controller.get_entity_types()
    except Exception as e:
        logger.error(f"Errore nell'endpoint get_entity_types: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Errore interno del server",
                "message": str(e)
            }
        )

@entity_router.get("/health")
async def get_entity_service_health() -> Dict[str, Any]:
    """
    Ottiene lo stato di salute del servizio di estrazione entità.
    
    Returns:
        Stato di salute del servizio
    """
    try:
        return await entity_controller.get_service_health()
    except Exception as e:
        logger.error(f"Errore nell'endpoint get_entity_service_health: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Errore interno del server",
                "message": str(e)
            }
        )

@entity_router.post("/validate")
async def validate_entity_extraction(
    request: EntityExtractionRequest
) -> Dict[str, Any]:
    """
    Valida una richiesta di estrazione entità senza elaborarla.
    
    Args:
        request: Richiesta di estrazione entità
        
    Returns:
        Risultato della validazione
    """
    try:
        validation_result = {
            "success": True,
            "valid": True,
            "text_length": len(request.text),
            "language": request.language,
            "confidence_threshold": request.confidence_threshold,
            "warnings": []
        }
        
        # Validazioni
        if len(request.text) > 5000:
            validation_result["warnings"].append("Testo molto lungo, l'elaborazione potrebbe richiedere tempo")
        
        if request.confidence_threshold < 0.3:
            validation_result["warnings"].append("Soglia di confidenza molto bassa, potrebbero esserci molti falsi positivi")
        
        if request.confidence_threshold > 0.9:
            validation_result["warnings"].append("Soglia di confidenza molto alta, potrebbero esserci poche entità estratte")
        
        return validation_result
        
    except Exception as e:
        logger.error(f"Errore nell'endpoint validate_entity_extraction: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Errore interno del server",
                "message": str(e)
            }
        )

@entity_router.post("/debug")
async def debug_entity_extraction_endpoint(
    request: EntityExtractionRequest
) -> Dict[str, Any]:
    """
    Debug dell'estrazione entità per sviluppo e troubleshooting.
    
    Args:
        request: Richiesta di estrazione entità
        
    Returns:
        Informazioni dettagliate sul processo di estrazione
    """
    try:
        return await entity_controller.debug_entity_extraction(request)
    except Exception as e:
        logger.error(f"Errore nell'endpoint debug_entity_extraction: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Errore interno del server",
                "message": str(e)
            }
        )

# Background tasks

async def _log_extraction_stats(text_length: int, entity_count: int, processing_time: Optional[float]):
    """Log statistiche di estrazione"""
    try:
        logger.info(f"Estrazione completata: {text_length} caratteri, {entity_count} entità, {processing_time:.2f}ms")
    except Exception as e:
        logger.error(f"Errore nel logging delle statistiche: {e}")

# Inizializzazione del servizio all'avvio
@entity_router.on_event("startup")
async def startup_entity_service():
    """Inizializza il servizio di estrazione entità"""
    logger.info("Inizializzazione EntityService...")
    try:
        success = await entity_service.initialize()
        if success:
            logger.info("EntityService inizializzato con successo")
        else:
            logger.error("Errore nell'inizializzazione di EntityService")
    except Exception as e:
        logger.error(f"Errore nell'inizializzazione di EntityService: {e}")
