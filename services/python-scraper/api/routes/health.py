"""
Health Check API Routes

Provides health check endpoints for monitoring and load balancing.
Includes various health check types for different monitoring needs.
"""

import asyncio
from typing import Dict, Any
from datetime import datetime

import structlog
from fastapi import APIRouter, Response, status, HTTPException, Request
from pydantic import BaseModel

from config.settings import get_settings
from core.database import (
    check_database_health,
    get_database_statistics,
    get_database_manager
)
from api.models import (
    APIResponse, 
    HealthCheckResponse, 
    ReadinessCheckResponse,
    success_response, 
    error_response
)
from middleware.request_id_middleware import get_request_id

logger = structlog.get_logger(__name__)

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""
    
    status: str
    service: str
    version: str
    timestamp: datetime
    environment: str
    uptime_seconds: float


class ReadinessResponse(BaseModel):
    """Readiness check response model."""
    
    status: str
    service: str
    dependencies: Dict[str, str]
    timestamp: datetime


class LivenessResponse(BaseModel):
    """Liveness check response model."""
    
    status: str
    service: str
    timestamp: datetime


# Service start time for uptime calculation
SERVICE_START_TIME = datetime.utcnow()


@router.get("/", response_model=HealthResponse)
@router.get("/status", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Basic health check endpoint.
    
    Returns service status and basic information.
    Used by load balancers and monitoring systems.
    
    Returns:
        HealthResponse: Service health information
    """
    
    settings = get_settings()
    current_time = datetime.utcnow()
    uptime = (current_time - SERVICE_START_TIME).total_seconds()
    
    logger.debug("Health check requested")
    
    return HealthResponse(
        status="healthy",
        service="python-scraper",
        version="1.0.0",
        timestamp=current_time,
        environment=settings.environment,
        uptime_seconds=uptime
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check() -> ReadinessResponse:
    """
    Readiness check endpoint.
    
    Checks if service is ready to handle requests.
    Verifies database connections and external dependencies.
    
    Returns:
        ReadinessResponse: Service readiness information
        
    Raises:
        HTTPException: If service is not ready (503)
    """
    
    logger.debug("Readiness check requested")
    
    dependencies = {}
    all_ready = True
    
    # Check MongoDB connection
    try:
        # TODO: Implement actual MongoDB connection check
        dependencies["mongodb"] = "ready"
        logger.debug("MongoDB dependency check: ready")
    except Exception as exc:
        dependencies["mongodb"] = f"error: {str(exc)}"
        all_ready = False
        logger.error("MongoDB dependency check failed", error=str(exc))
    
    # Check Redis connection
    try:
        # TODO: Implement actual Redis connection check
        dependencies["redis"] = "ready"
        logger.debug("Redis dependency check: ready")
    except Exception as exc:
        dependencies["redis"] = f"error: {str(exc)}"
        all_ready = False
        logger.error("Redis dependency check failed", error=str(exc))
    
    # Check API Gateway connectivity
    try:
        # TODO: Implement actual API Gateway connectivity check
        dependencies["api_gateway"] = "ready"
        logger.debug("API Gateway dependency check: ready")
    except Exception as exc:
        dependencies["api_gateway"] = f"error: {str(exc)}"
        all_ready = False
        logger.error("API Gateway dependency check failed", error=str(exc))
    
    # Check Database Manager health
    try:
        db_manager = get_database_manager()
        db_health = await check_database_health(db_manager)
        dependencies["database"] = "ready" if db_health else "unhealthy"
        logger.debug("Database dependency check: %s", dependencies["database"])
    except Exception as exc:
        dependencies["database"] = f"error: {str(exc)}"
        all_ready = False
        logger.error("Database dependency check failed", error=str(exc))
    
    if not all_ready:
        logger.warning("Service not ready", dependencies=dependencies)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready"
        )
    
    return ReadinessResponse(
        status="ready",
        service="python-scraper",
        dependencies=dependencies,
        timestamp=datetime.utcnow()
    )


@router.get("/live", response_model=LivenessResponse)
async def liveness_check() -> LivenessResponse:
    """
    Liveness check endpoint.
    
    Checks if service is alive and responsive.
    Used by container orchestrators to detect if service needs restart.
    
    Returns:
        LivenessResponse: Service liveness information
    """
    
    logger.debug("Liveness check requested")
    
    # Basic liveness check - if we can respond, we're alive
    try:
        # Perform a simple operation to verify service is functional
        await asyncio.sleep(0)  # Yield control to ensure async loop is working
        
        return LivenessResponse(
            status="alive",
            service="python-scraper",
            timestamp=datetime.utcnow()
        )
        
    except Exception as exc:
        logger.error("Liveness check failed", error=str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service not responding"
        )


@router.get("/metrics")
async def metrics() -> Dict[str, Any]:
    """
    Metrics endpoint for monitoring systems.
    
    Provides basic metrics about service performance and status.
    Can be extended with more detailed metrics as needed.
    
    Returns:
        Dict[str, Any]: Service metrics
    """
    
    logger.debug("Metrics requested")
    
    settings = get_settings()
    current_time = datetime.utcnow()
    uptime = (current_time - SERVICE_START_TIME).total_seconds()
    
    # TODO: Add more detailed metrics:
    # - Request count and timing
    # - Scraping job statistics
    # - Error rates
    # - Queue sizes
    # - Database connection pool stats
    
    return {
        "service": "python-scraper",
        "version": "1.0.0",
        "environment": settings.environment,
        "uptime_seconds": uptime,
        "start_time": SERVICE_START_TIME.isoformat(),
        "current_time": current_time.isoformat(),
        "metrics": {
            # Placeholder for future metrics
            "requests_total": 0,
            "active_jobs": 0,
            "queue_size": 0,
            "errors_total": 0
        }
    }


@router.get("/database")
async def database_health() -> APIResponse:
    """
    Database connections health check endpoint.
    
    Checks health of MongoDB and Redis connections.
    Returns detailed status for each database.
    
    Returns:
        APIResponse: Database health status
    """
    
    try:
        logger.debug("Database health check requested")
        
        health_status = await check_database_health()
        
        if health_status.get("status") == "healthy":
            return success_response(
                data=health_status,
                message="All database connections are healthy"
            )
        else:
            logger.warning(f"Database health check failed: {health_status}")
            return error_response(
                message="Database connections are unhealthy",
                error_code="DATABASE_UNHEALTHY",
                data=health_status
            )
            
    except Exception as e:
        logger.error(f"Database health check error: {e}")
        return error_response(
            message="Database health check failed",
            error_code="HEALTH_CHECK_ERROR",
            data={"error": str(e)}
        )


@router.get("/database/stats")
async def database_statistics() -> APIResponse:
    """
    Database statistics endpoint.
    
    Provides detailed statistics about database connections,
    including connection pool status, queue sizes, and performance metrics.
    
    Returns:
        APIResponse: Database statistics
    """
    
    try:
        logger.debug("Database statistics requested")
        
        stats = await get_database_statistics()
        
        return success_response(
            data=stats,
            message="Database statistics retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Database statistics error: {e}")
        return error_response(
            message="Failed to retrieve database statistics",
            error_code="STATS_ERROR",
            data={"error": str(e)}
        )


@router.get("/database/reset")
async def reset_database_connections() -> APIResponse:
    """
    Reset database connections endpoint.
    
    Forces reconnection to all databases. Use with caution.
    Intended for debugging and recovery scenarios.
    
    Returns:
        APIResponse: Reset operation result
    """
    
    try:
        logger.info("Database connection reset requested")
        
        manager = get_database_manager()
        success = await manager.reset_connections()
        
        if success:
            logger.info("Database connections reset successfully")
            return success_response(
                data={"reset": True, "timestamp": datetime.utcnow().isoformat()},
                message="Database connections reset successfully"
            )
        else:
            logger.error("Database connection reset failed")
            return error_response(
                message="Database connection reset failed",
                error_code="RESET_FAILED"
            )
            
    except Exception as e:
        logger.error(f"Database reset error: {e}")
        return error_response(
            message="Database reset operation failed",
            error_code="RESET_ERROR",
            data={"error": str(e)}
        )
