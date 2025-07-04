"""
Database initialization and lifecycle management.

This module provides startup and shutdown procedures for database connections,
along with health monitoring and connection management.
"""

import asyncio
import logging
from typing import Dict, Any

from .database_manager import get_database_manager, initialize_databases, close_databases

logger = logging.getLogger(__name__)


async def startup_databases() -> bool:
    """
    Initialize database connections during application startup.
    
    This function should be called during FastAPI startup event.
    
    Returns:
        bool: True if all databases initialized successfully
    """
    logger.info("Starting database initialization...")
    
    try:
        success = await initialize_databases()
        
        if success:
            logger.info("Database initialization completed successfully")
            
            # Log connection statistics
            manager = get_database_manager()
            stats = await manager.get_statistics()
            logger.info(f"Database statistics: {stats}")
            
        else:
            logger.error("Database initialization failed")
            
        return success
        
    except Exception as e:
        logger.error(f"Database startup failed: {e}")
        return False


async def shutdown_databases():
    """
    Close database connections during application shutdown.
    
    This function should be called during FastAPI shutdown event.
    """
    logger.info("Starting database shutdown...")
    
    try:
        await close_databases()
        logger.info("Database shutdown completed successfully")
        
    except Exception as e:
        logger.error(f"Database shutdown failed: {e}")


async def check_database_health() -> Dict[str, Any]:
    """
    Check health of all database connections.
    
    Returns:
        Dict with health status information
    """
    try:
        manager = get_database_manager()
        health_status = await manager.health_check()
        
        logger.debug(f"Database health check result: {health_status}")
        return health_status
        
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "initialized": False
        }


async def get_database_statistics() -> Dict[str, Any]:
    """
    Get comprehensive database statistics.
    
    Returns:
        Dict with database statistics
    """
    try:
        manager = get_database_manager()
        stats = await manager.get_statistics()
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get database statistics: {e}")
        return {
            "error": str(e),
            "initialized": False
        }


def setup_database_logging():
    """
    Configure logging for database operations.
    """
    # Configure MongoDB motor logging
    motor_logger = logging.getLogger("motor")
    motor_logger.setLevel(logging.WARNING)
    
    # Configure pymongo logging
    pymongo_logger = logging.getLogger("pymongo")
    pymongo_logger.setLevel(logging.WARNING)
    
    # Configure redis logging
    redis_logger = logging.getLogger("redis")
    redis_logger.setLevel(logging.WARNING)
    
    logger.debug("Database logging configured")


# Convenience functions for FastAPI lifespan integration
async def database_lifespan_startup():
    """Startup function for FastAPI lifespan"""
    setup_database_logging()
    return await startup_databases()


async def database_lifespan_shutdown():
    """Shutdown function for FastAPI lifespan"""
    await shutdown_databases()
