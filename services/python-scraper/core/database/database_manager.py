"""
Database manager module for coordinating MongoDB and Redis connections.

This module provides a unified interface for database operations,
initialization procedures, and health monitoring.
"""

import asyncio
import logging
from typing import Dict, Any, Optional

from .mongodb import MongoDBManager, get_mongodb_manager
from .redis_manager import RedisManager, get_redis_manager

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    Unified database manager for MongoDB and Redis.
    
    Features:
    - Coordinated initialization of both databases
    - Health monitoring and status reporting
    - Graceful shutdown procedures
    - Connection statistics aggregation
    """
    
    def __init__(self):
        self.mongodb: MongoDBManager = get_mongodb_manager()
        self.redis: RedisManager = get_redis_manager()
        self._initialized = False
        
    async def initialize(self) -> bool:
        """
        Initialize all database connections.
        
        Returns:
            bool: True if all databases initialized successfully
        """
        logger.info("Initializing database connections...")
        
        # Initialize MongoDB
        mongodb_success = await self.mongodb.connect()
        if not mongodb_success:
            logger.error("Failed to initialize MongoDB connection")
            
        # Initialize Redis
        redis_success = await self.redis.connect()
        if not redis_success:
            logger.error("Failed to initialize Redis connection")
            
        self._initialized = mongodb_success and redis_success
        
        if self._initialized:
            logger.info("All database connections initialized successfully")
            await self._setup_database_schema()
        else:
            logger.error("Database initialization failed")
            
        return self._initialized
    
    async def _setup_database_schema(self):
        """
        Setup MongoDB collections and indexes if needed.
        """
        try:
            logger.info("Setting up database schema...")
            
            # Setup collections and indexes for scraping data
            await self._setup_scraping_collections()
            await self._setup_job_collections()
            
            logger.info("Database schema setup completed")
            
        except Exception as e:
            logger.error(f"Failed to setup database schema: {e}")
            
    async def _setup_scraping_collections(self):
        """Setup collections for scraped real estate data"""
        try:
            # Properties collection
            properties_collection = await self.mongodb.get_collection("properties")
            
            # Create indexes for efficient querying
            await properties_collection.create_index([
                ("source", 1),
                ("external_id", 1)
            ], unique=True, name="source_external_id_unique")
            
            await properties_collection.create_index([
                ("location.city", 1),
                ("property_type", 1),
                ("price", 1)
            ], name="location_type_price_index")
            
            await properties_collection.create_index([
                ("created_at", -1)
            ], name="created_at_desc_index")
            
            await properties_collection.create_index([
                ("status", 1),
                ("updated_at", -1)
            ], name="status_updated_index")
            
            logger.debug("Properties collection and indexes created")
            
        except Exception as e:
            logger.error(f"Failed to setup properties collection: {e}")
            
    async def _setup_job_collections(self):
        """Setup collections for scraping jobs"""
        try:
            # Scraping jobs collection
            jobs_collection = await self.mongodb.get_collection("scraping_jobs")
            
            # Create indexes for job management
            await jobs_collection.create_index([
                ("job_id", 1)
            ], unique=True, name="job_id_unique")
            
            await jobs_collection.create_index([
                ("status", 1),
                ("created_at", -1)
            ], name="status_created_index")
            
            await jobs_collection.create_index([
                ("source", 1),
                ("created_at", -1)
            ], name="source_created_index")
            
            # Job logs collection
            logs_collection = await self.mongodb.get_collection("job_logs")
            
            await logs_collection.create_index([
                ("job_id", 1),
                ("timestamp", -1)
            ], name="job_logs_index")
            
            # TTL index for log cleanup (keep logs for 30 days)
            await logs_collection.create_index([
                ("timestamp", 1)
            ], expireAfterSeconds=2592000, name="logs_ttl_index")
            
            logger.debug("Job collections and indexes created")
            
        except Exception as e:
            logger.error(f"Failed to setup job collections: {e}")
    
    async def shutdown(self):
        """
        Gracefully shutdown all database connections.
        """
        logger.info("Shutting down database connections...")
        
        try:
            await asyncio.gather(
                self.mongodb.disconnect(),
                self.redis.disconnect(),
                return_exceptions=True
            )
            self._initialized = False
            logger.info("Database connections closed successfully")
            
        except Exception as e:
            logger.error(f"Error during database shutdown: {e}")
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on all database connections.
        
        Returns:
            Dict with health status for each database
        """
        if not self._initialized:
            return {
                "status": "unhealthy",
                "initialized": False,
                "mongodb": {"healthy": False},
                "redis": {"healthy": False}
            }
        
        try:
            # Check MongoDB health
            mongodb_healthy = await self.mongodb.is_healthy()
            
            # Check Redis health
            redis_healthy = await self.redis.is_healthy()
            
            overall_healthy = mongodb_healthy and redis_healthy
            
            return {
                "status": "healthy" if overall_healthy else "unhealthy",
                "initialized": self._initialized,
                "mongodb": {
                    "healthy": mongodb_healthy,
                    "connected": self.mongodb._is_connected
                },
                "redis": {
                    "healthy": redis_healthy,
                    "connected": self.redis._is_connected
                }
            }
            
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "initialized": self._initialized
            }
    
    async def get_statistics(self) -> Dict[str, Any]:
        """
        Get comprehensive database statistics.
        
        Returns:
            Dict with statistics from all databases
        """
        try:
            # Get MongoDB stats
            mongodb_stats = await self.mongodb.get_stats()
            
            # Get Redis stats
            redis_stats = await self.redis.get_stats()
            
            # Get queue statistics
            queue_stats = await self._get_queue_statistics()
            
            return {
                "initialized": self._initialized,
                "mongodb": mongodb_stats,
                "redis": redis_stats,
                "queues": queue_stats,
                "timestamp": asyncio.get_event_loop().time()
            }
            
        except Exception as e:
            logger.error(f"Failed to get database statistics: {e}")
            return {
                "error": str(e),
                "initialized": self._initialized
            }
    
    async def _get_queue_statistics(self) -> Dict[str, Any]:
        """Get statistics for Redis queues"""
        try:
            queue_names = [
                "scraping_jobs",
                "priority_jobs", 
                "completed_jobs",
                "failed_jobs"
            ]
            
            queue_stats = {}
            for queue_name in queue_names:
                size = await self.redis.get_queue_size(queue_name)
                queue_stats[queue_name] = {
                    "size": size,
                    "name": queue_name
                }
            
            return queue_stats
            
        except Exception as e:
            logger.error(f"Failed to get queue statistics: {e}")
            return {}
    
    async def reset_connections(self) -> bool:
        """
        Reset all database connections.
        
        Returns:
            bool: True if reset successful
        """
        logger.info("Resetting database connections...")
        
        try:
            # Shutdown existing connections
            await self.shutdown()
            
            # Wait a moment for cleanup
            await asyncio.sleep(1)
            
            # Reinitialize
            return await self.initialize()
            
        except Exception as e:
            logger.error(f"Failed to reset database connections: {e}")
            return False
    
    @property
    def is_initialized(self) -> bool:
        """Check if database manager is initialized"""
        return self._initialized
    
    async def ensure_connections(self) -> bool:
        """
        Ensure all database connections are active.
        
        Returns:
            bool: True if all connections are active
        """
        if not self._initialized:
            return await self.initialize()
            
        # Check and reconnect if needed
        mongodb_ok = await self.mongodb.ensure_connected()
        redis_ok = await self.redis.ensure_connected()
        
        return mongodb_ok and redis_ok


# Global database manager instance
_database_manager: Optional[DatabaseManager] = None


def get_database_manager() -> DatabaseManager:
    """
    Get global database manager instance.
    
    Returns:
        DatabaseManager instance
    """
    global _database_manager
    if _database_manager is None:
        _database_manager = DatabaseManager()
    return _database_manager


async def initialize_databases() -> bool:
    """
    Initialize all database connections.
    
    Returns:
        bool: True if initialization successful
    """
    manager = get_database_manager()
    return await manager.initialize()


async def close_databases():
    """Close all database connections"""
    global _database_manager
    if _database_manager:
        await _database_manager.shutdown()
        _database_manager = None
