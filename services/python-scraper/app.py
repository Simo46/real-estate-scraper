# FastAPI Entry Point - Python Scraper Service
"""
Real Estate Python Scraper Service

This is the main entry point for the Python scraping service.
It provides FastAPI application setup with middleware stack,
routes, and lifespan management.
"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any
from datetime import datetime

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import structlog

from config.settings import get_settings
from core.database import database_lifespan_startup, database_lifespan_shutdown
from api.routes.health import router as health_router
from api.routes.scraping import router as scraping_router
from api.routes.monitoring import router as monitoring_router
from middleware.logging_middleware import LoggingMiddleware
from middleware.auth_middleware import AuthMiddleware
from middleware.request_id_middleware import RequestIDMiddleware


# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan management.
    
    Handles startup and shutdown procedures for the application,
    including database connections, service initialization, etc.
    """
    logger.info("🚀 Starting Python Scraper Service...")
    
    # Startup procedures
    try:
        settings = get_settings()
        logger.info("✅ Configuration loaded successfully")
        
        # Initialize database connections
        db_success = await database_lifespan_startup()
        if not db_success:
            logger.error("❌ Database initialization failed")
            raise RuntimeError("Failed to initialize database connections")
        
        logger.info("✅ Database connections initialized successfully")
        
        # TODO: Setup background tasks/workers
        
        logger.info("✅ Python Scraper Service started successfully")
        yield
        
    except Exception as e:
        logger.error("❌ Failed to start Python Scraper Service", error=str(e))
        raise
    
    finally:
        # Shutdown procedures
        logger.info("🛑 Shutting down Python Scraper Service...")
        
        # Close database connections
        await database_lifespan_shutdown()
        logger.info("✅ Database connections closed")
        
        # TODO: Clean up background tasks
        
        logger.info("✅ Python Scraper Service shut down successfully")


def create_app() -> FastAPI:
    """
    Create and configure FastAPI application.
    
    Returns:
        FastAPI: Configured application instance
    """
    settings = get_settings()
    
    app = FastAPI(
        title="Real Estate Python Scraper Service",
        description="Python service for real estate scraping with FastAPI integration",
        version="1.0.0",
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url="/redoc" if settings.environment == "development" else None,
        lifespan=lifespan
    )
    
    # Configure middleware stack
    setup_middleware(app, settings)
    
    # Configure global exception handling
    setup_exception_handlers(app)
    
    # Include API routes
    setup_routes(app)
    
    return app


def setup_middleware(app: FastAPI, settings) -> None:
    """
    Configure middleware stack for the application.
    
    Args:
        app: FastAPI application instance
        settings: Application settings
    """
    
    # Trusted Host Middleware (security)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"]  # TODO: Configure proper hosts for production
    )
    
    # CORS Middleware for frontend integration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.server.cors_origins,
        allow_credentials=True,
        allow_methods=settings.server.cors_methods,
        allow_headers=settings.server.cors_headers,
    )
    
    # Request ID middleware for correlation tracking
    app.add_middleware(RequestIDMiddleware)
    
    # Custom logging middleware
    app.add_middleware(LoggingMiddleware)
    
    # Custom authentication middleware
    # TODO: Re-enable after debugging middleware order
    # app.add_middleware(AuthMiddleware)


def setup_exception_handlers(app: FastAPI) -> None:
    """
    Setup global exception handling for the application.
    
    Args:
        app: FastAPI application instance
    """
    
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """
        Global exception handler for unhandled exceptions.
        
        NOTE: This should NOT catch HTTPException - those are handled by FastAPI
        
        Args:
            request: HTTP request object
            exc: Exception that occurred
            
        Returns:
            JSONResponse: Error response
        """
        
        # Don't handle HTTPException here - let FastAPI handle them
        from fastapi import HTTPException
        if isinstance(exc, HTTPException):
            # Re-raise HTTPException so FastAPI can handle it properly
            raise exc
        
        logger.error(
            "Unhandled exception occurred",
            error=str(exc),
            path=request.url.path,
            method=request.method,
            exc_info=True
        )
        
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "message": "An unexpected error occurred",
                "path": request.url.path,
                "method": request.method
            }
        )
    
    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        """
        Handler for validation errors.
        
        Args:
            request: HTTP request object
            exc: ValueError that occurred
            
        Returns:
            JSONResponse: Error response
        """
        logger.warning(
            "Validation error occurred",
            error=str(exc),
            path=request.url.path,
            method=request.method
        )
        
        return JSONResponse(
            status_code=422,
            content={
                "error": "Validation error",
                "message": str(exc),
                "path": request.url.path,
                "method": request.method
            }
        )


def setup_routes(app: FastAPI) -> None:
    """
    Include all API routes in the application.
    
    Args:
        app: FastAPI application instance
    """
    
    # Include health check routes
    app.include_router(
        health_router,
        prefix="/api/health",
        tags=["health"]
    )
    
    # Include scraping control routes
    app.include_router(
        scraping_router,
        prefix="/api/scraping",
        tags=["scraping"]
    )
    
    # Include monitoring routes
    app.include_router(
        monitoring_router,
        prefix="/api/monitoring",
        tags=["monitoring"]
    )


# Create application instance
app = create_app()


# Root endpoint for service identification
@app.get("/")
async def root() -> Dict[str, Any]:
    """
    Root endpoint providing service information.
    
    Returns:
        Dict: Service information
    """
    settings = get_settings()
    return {
        "service": "python-scraper",
        "version": "1.0.0",
        "status": "running",
        "environment": settings.environment,
        "message": "Real Estate Python Scraper Service"
    }


# Docker health check endpoint
@app.get("/health")
async def docker_health_check() -> Dict[str, Any]:
    """
    Docker health check endpoint.
    
    Simple health check specifically for Docker health checks.
    Returns basic service status without dependencies.
    
    Returns:
        Dict: Health status
    """
    return {
        "status": "healthy",
        "service": "python-scraper",
        "timestamp": datetime.utcnow().isoformat()
    }
