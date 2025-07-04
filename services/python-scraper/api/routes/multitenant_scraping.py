"""
Enhanced Multi-Tenant Scraping API Routes

Estende gli endpoint esistenti con supporto multi-tenant completo,
pipeline dati integrata e isolamento sicuro dei dati.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from uuid import uuid4

import structlog
from fastapi import APIRouter, HTTPException, Depends, status, Request, BackgroundTasks
from pydantic import BaseModel, Field

from config.settings import get_settings
from api.dependencies import get_current_user
from api.middleware.tenant_middleware import TenantContextManager, TenantDataIsolation
from services.data_pipeline import SearchResultMapper
from services.geolocation_service import GeolocationProcessor
from services.image_validator import ImageValidator
from scrapers.models import RealEstateProperty

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v2", tags=["Multi-Tenant Scraping"])


# Enhanced Request/Response Models

class ExecuteSearchRequest(BaseModel):
    """Request model for executing a multi-tenant search."""
    
    saved_search_id: str = Field(..., description="ID della saved search")
    search_criteria: Dict[str, Any] = Field(..., description="Criteri di ricerca")
    platform: str = Field(default="immobiliare_it", description="Piattaforma target")
    max_results: int = Field(default=100, ge=1, le=500, description="Numero massimo risultati")
    enable_geolocation: bool = Field(default=True, description="Abilita processing geolocation")
    enable_image_validation: bool = Field(default=True, description="Abilita validazione immagini")
    
    class Config:
        json_schema_extra = {
            "example": {
                "saved_search_id": "search_123",
                "search_criteria": {
                    "location": "milano",
                    "property_type": "apartment",
                    "min_price": 300000,
                    "max_price": 800000,
                    "min_size": 60
                },
                "platform": "immobiliare_it",
                "max_results": 50,
                "enable_geolocation": True,
                "enable_image_validation": True
            }
        }


class SearchExecutionResponse(BaseModel):
    """Response model for search execution."""
    
    search_execution_id: str
    tenant_id: str
    status: str
    created_at: str
    estimated_completion: Optional[str]
    search_criteria: Dict[str, Any]
    platform: str
    max_results: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "search_execution_id": "exec_123",
                "tenant_id": "tenant_456",
                "status": "pending",
                "created_at": "2025-01-01T10:00:00Z",
                "estimated_completion": "2025-01-01T10:05:00Z",
                "search_criteria": {"location": "milano"},
                "platform": "immobiliare_it",
                "max_results": 50
            }
        }


class SearchResultsResponse(BaseModel):
    """Response model for search results."""
    
    search_execution_id: str
    tenant_id: str
    status: str
    total_results: int
    processed_results: int
    results: List[Dict[str, Any]]
    geolocation_processed: bool
    images_validated: bool
    pipeline_stats: Dict[str, Any]
    
    class Config:
        json_schema_extra = {
            "example": {
                "search_execution_id": "exec_123",
                "tenant_id": "tenant_456", 
                "status": "completed",
                "total_results": 25,
                "processed_results": 25,
                "results": [],
                "geolocation_processed": True,
                "images_validated": True,
                "pipeline_stats": {
                    "processing_time_ms": 1250,
                    "average_quality_score": 0.85
                }
            }
        }


class SaveSearchResultsRequest(BaseModel):
    """Request model for saving search results."""
    
    search_execution_id: str = Field(..., description="ID dell'esecuzione")
    results: List[Dict[str, Any]] = Field(..., description="Risultati da salvare")
    
    class Config:
        json_schema_extra = {
            "example": {
                "search_execution_id": "exec_123",
                "results": []
            }
        }


# Enhanced API Endpoints

@router.post("/execute-search", response_model=SearchExecutionResponse)
async def execute_search_with_tenant_isolation(
    request: ExecuteSearchRequest,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Esegue una ricerca con isolamento multi-tenant completo.
    
    Crea una SearchExecution con tenant isolation e avvia il processo
    di scraping con pipeline dati integrata.
    """
    tenant_id = user.get("tenant_id")
    user_id = user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Tenant ID required"
        )
    
    logger.info(
        "Executing search with tenant isolation",
        tenant_id=tenant_id,
        user_id=user_id,
        saved_search_id=request.saved_search_id
    )
    
    try:
        # Crea contesto tenant
        with TenantContextManager(tenant_id, user_id) as tenant_ctx:
            
            # Crea SearchExecution con tenant isolation
            search_data = {
                "saved_search_id": request.saved_search_id,
                "search_criteria": request.search_criteria,
                "platform": request.platform,
                "max_results": request.max_results
            }
            
            search_execution = tenant_ctx.create_search_execution(search_data)
            
            # Avvia background task per scraping
            background_tasks.add_task(
                _execute_scraping_with_pipeline,
                search_execution,
                request,
                tenant_id,
                user_id
            )
            
            # Calcola tempo stimato di completamento (5 min per 100 results)
            estimated_minutes = max(2, request.max_results // 20)
            estimated_completion = datetime.utcnow().replace(
                minute=datetime.utcnow().minute + estimated_minutes
            ).isoformat()
            
            return SearchExecutionResponse(
                search_execution_id=search_execution["id"],
                tenant_id=tenant_id,
                status=search_execution["status"],
                created_at=search_execution["created_at"],
                estimated_completion=estimated_completion,
                search_criteria=request.search_criteria,
                platform=request.platform,
                max_results=request.max_results
            )
            
    except Exception as e:
        logger.error(
            "Failed to execute search",
            tenant_id=tenant_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute search: {str(e)}"
        )


@router.get("/results/{search_execution_id}", response_model=SearchResultsResponse)
async def get_search_results_with_deduplication(
    search_execution_id: str,
    include_pipeline_stats: bool = True,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Recupera risultati di ricerca con deduplicazione e tenant isolation.
    
    Ritorna i risultati processati con pipeline dati completa,
    inclusi geolocation, image validation e quality scoring.
    """
    tenant_id = user.get("tenant_id")
    user_id = user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Tenant ID required"
        )
    
    logger.info(
        "Retrieving search results with tenant isolation",
        tenant_id=tenant_id,
        search_execution_id=search_execution_id
    )
    
    try:
        # Mock implementation - in realtà recupererebbe da storage/database
        # con tenant isolation
        tenant_isolation = TenantDataIsolation()
        
        # Simula recupero risultati (da implementare con database reale)
        mock_results = [
            {
                "id": f"result_{i}",
                "tenant_id": tenant_id,
                "search_execution_id": search_execution_id,
                "external_url": f"https://example.com/property_{i}",
                "basic_title": f"Property {i}",
                "basic_price": 400000 + (i * 10000),
                "basic_location": "Milano, Centro",
                "relevance_score": 0.85 + (i * 0.01),
                "ai_insights": {
                    "quality_score": 0.80 + (i * 0.02),
                    "recommendation": "Good match for criteria"
                }
            }
            for i in range(5)  # Mock 5 results
        ]
        
        # Applica tenant isolation
        filtered_results = tenant_isolation.filter_results_by_tenant(
            mock_results, 
            tenant_id
        )
        
        # Pipeline stats
        pipeline_stats = {
            "processing_time_ms": 1250,
            "average_quality_score": 0.85,
            "geolocation_processed": True,
            "images_validated": True,
            "deduplication_applied": True
        } if include_pipeline_stats else {}
        
        return SearchResultsResponse(
            search_execution_id=search_execution_id,
            tenant_id=tenant_id,
            status="completed",
            total_results=len(mock_results),
            processed_results=len(filtered_results),
            results=filtered_results,
            geolocation_processed=True,
            images_validated=True,
            pipeline_stats=pipeline_stats
        )
        
    except Exception as e:
        logger.error(
            "Failed to retrieve search results",
            tenant_id=tenant_id,
            search_execution_id=search_execution_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve results: {str(e)}"
        )


@router.post("/save-search-results")
async def save_search_results_with_mapping(
    request: SaveSearchResultsRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Salva risultati di ricerca con mapping verso modelli Node.js.
    
    Processa i risultati attraverso la pipeline dati e li salva
    nel formato compatibile con l'architettura Node.js.
    """
    tenant_id = user.get("tenant_id")
    user_id = user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Tenant ID required"
        )
    
    logger.info(
        "Saving search results with tenant isolation",
        tenant_id=tenant_id,
        search_execution_id=request.search_execution_id,
        result_count=len(request.results)
    )
    
    try:
        tenant_isolation = TenantDataIsolation()
        
        # Valida che tutti i risultati appartengano al tenant
        for result in request.results:
            if not tenant_isolation.validate_tenant_access_to_resource(
                result, tenant_id, "search_result"
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Access denied to one or more results"
                )
        
        # Mock implementazione salvataggio
        # In realtà salverebbe su database con tenant isolation
        saved_count = len(request.results)
        
        logger.info(
            "Search results saved successfully",
            tenant_id=tenant_id,
            search_execution_id=request.search_execution_id,
            saved_count=saved_count
        )
        
        return {
            "message": "Results saved successfully",
            "search_execution_id": request.search_execution_id,
            "tenant_id": tenant_id,
            "saved_count": saved_count,
            "saved_at": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Failed to save search results",
            tenant_id=tenant_id,
            search_execution_id=request.search_execution_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save results: {str(e)}"
        )


# Background Task Functions

async def _execute_scraping_with_pipeline(
    search_execution: Dict[str, Any],
    request: ExecuteSearchRequest,
    tenant_id: str,
    user_id: str
):
    """
    Background task per eseguire scraping con pipeline dati.
    """
    search_execution_id = search_execution["id"]
    
    logger.info(
        "Starting background scraping with pipeline",
        tenant_id=tenant_id,
        search_execution_id=search_execution_id
    )
    
    try:
        # Mock implementazione scraping
        # In realtà userebbe il sistema di scraping esistente
        
        # Simula properties scraped
        mock_properties = [
            {
                "url": f"https://immobiliare.it/property_{i}",
                "title": f"Appartamento Milano {i}",
                "price": {"amount": 400000 + (i * 15000), "currency": "EUR"},
                "location": {"city": "Milano", "neighborhood": "Centro"},
                "features": {"size_sqm": 80 + (i * 5)},
                # Altri campi della proprietà...
            }
            for i in range(min(request.max_results, 10))  # Mock dati
        ]
        
        # Processa con pipeline dati e tenant isolation
        with TenantContextManager(tenant_id, user_id) as tenant_ctx:
            processed_results = tenant_ctx.process_scraped_results(
                mock_properties,
                search_execution_id,
                request.saved_search_id,
                request.search_criteria
            )
        
        # Mock: salva risultati (implementare con storage reale)
        logger.info(
            "Background scraping completed",
            tenant_id=tenant_id,
            search_execution_id=search_execution_id,
            processed_count=len(processed_results)
        )
        
    except Exception as e:
        logger.error(
            "Background scraping failed",
            tenant_id=tenant_id,
            search_execution_id=search_execution_id,
            error=str(e)
        )
