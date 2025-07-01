"""
MongoDB connection and management module.

This module provides MongoDB connection pooling, retry logic,
and connection management for the Python scraper service.
"""

import asyncio
import logging
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import (
    ConnectionFailure,
    ServerSelectionTimeoutError,
    OperationFailure,
    NetworkTimeout
)

from config.settings import get_settings

logger = logging.getLogger(__name__)


class MongoDBManager:
    """
    MongoDB connection manager with connection pooling and retry logic.
    
    Features:
    - Async connection pooling
    - Connection health monitoring
    - Automatic retry on failures
    - Graceful connection management
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.client: Optional[AsyncIOMotorClient] = None
        self.database = None
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        
    async def connect(self) -> bool:
        """
        Establish connection to MongoDB with retry logic.
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        async with self._connection_lock:
            if self._is_connected and self.client:
                return True
                
            try:
                logger.info("Connecting to MongoDB...")
                
                # Create MongoDB client with connection pooling
                self.client = AsyncIOMotorClient(
                    self.settings.database.mongo_url,
                    maxPoolSize=self.settings.database.mongo_max_pool_size,
                    minPoolSize=self.settings.database.mongo_min_pool_size,
                    maxIdleTimeMS=30000,  # 30 seconds
                    connectTimeoutMS=10000,  # 10 seconds
                    serverSelectionTimeoutMS=5000,  # 5 seconds
                    heartbeatFrequencyMS=10000,  # 10 seconds
                    retryWrites=True,
                    retryReads=True
                )
                
                # Get database reference
                self.database = self.client[self.settings.database.mongo_database]
                
                # Test connection
                await self._test_connection()
                
                self._is_connected = True
                logger.info(f"Successfully connected to MongoDB database: {self.settings.database.mongo_database}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to connect to MongoDB: {e}")
                await self._cleanup_connection()
                return False
    
    async def disconnect(self):
        """Gracefully disconnect from MongoDB"""
        async with self._connection_lock:
            await self._cleanup_connection()
            
    async def _cleanup_connection(self):
        """Clean up MongoDB connection"""
        if self.client:
            try:
                self.client.close()
                logger.info("MongoDB connection closed")
            except Exception as e:
                logger.warning(f"Error closing MongoDB connection: {e}")
            finally:
                self.client = None
                self.database = None
                self._is_connected = False
    
    async def _test_connection(self):
        """Test MongoDB connection with ping"""
        if not self.client:
            raise ConnectionFailure("No MongoDB client available")
            
        try:
            # Test with admin command
            await self.client.admin.command('ping')
            logger.debug("MongoDB ping successful")
        except Exception as e:
            logger.error(f"MongoDB ping failed: {e}")
            raise
    
    async def is_healthy(self) -> bool:
        """
        Check if MongoDB connection is healthy.
        
        Returns:
            bool: True if connection is healthy, False otherwise
        """
        if not self._is_connected or not self.client:
            return False
            
        try:
            await self._test_connection()
            return True
        except Exception as e:
            logger.warning(f"MongoDB health check failed: {e}")
            return False
    
    async def get_collection(self, collection_name: str):
        """
        Get MongoDB collection with connection validation.
        
        Args:
            collection_name: Name of the collection
            
        Returns:
            Collection object or None if connection failed
        """
        if not await self.ensure_connected():
            raise ConnectionFailure("Failed to establish MongoDB connection")
            
        return self.database[collection_name]
    
    async def ensure_connected(self) -> bool:
        """
        Ensure MongoDB connection is active, reconnect if necessary.
        
        Returns:
            bool: True if connected, False otherwise
        """
        if await self.is_healthy():
            return True
            
        logger.warning("MongoDB connection unhealthy, attempting reconnection...")
        return await self.connect()
    
    @asynccontextmanager
    async def get_session(self):
        """
        Get MongoDB session for transactions.
        
        Yields:
            MongoDB session object
        """
        if not await self.ensure_connected():
            raise ConnectionFailure("Failed to establish MongoDB connection")
            
        async with await self.client.start_session() as session:
            yield session
    
    async def execute_with_retry(self, operation, max_retries: int = 3, **kwargs) -> Any:
        """
        Execute MongoDB operation with retry logic.
        
        Args:
            operation: Async function to execute
            max_retries: Maximum number of retries
            **kwargs: Additional arguments for operation
            
        Returns:
            Operation result
            
        Raises:
            Exception: If all retries failed
        """
        last_exception = None
        
        for attempt in range(max_retries + 1):
            try:
                if not await self.ensure_connected():
                    raise ConnectionFailure("Failed to establish MongoDB connection")
                    
                return await operation(**kwargs)
                
            except (ConnectionFailure, ServerSelectionTimeoutError, NetworkTimeout) as e:
                last_exception = e
                if attempt < max_retries:
                    wait_time = (attempt + 1) * 2  # Exponential backoff
                    logger.warning(f"MongoDB operation failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                    # Force reconnection on next attempt
                    self._is_connected = False
                else:
                    logger.error(f"MongoDB operation failed after {max_retries + 1} attempts")
                    
            except Exception as e:
                logger.error(f"Non-retryable MongoDB error: {e}")
                raise
        
        raise last_exception
    
    async def get_stats(self) -> Dict[str, Any]:
        """
        Get MongoDB connection statistics.
        
        Returns:
            Dict with connection stats
        """
        if not self._is_connected or not self.client:
            return {
                "connected": False,
                "database": None,
                "server_info": None
            }
        
        try:
            server_info = await self.client.server_info()
            db_stats = await self.database.command("dbStats")
            
            return {
                "connected": True,
                "database": self.settings.database.mongo_database,
                "server_version": server_info.get("version"),
                "collections_count": len(await self.database.list_collection_names()),
                "db_size_mb": round(db_stats.get("dataSize", 0) / (1024 * 1024), 2),
                "pool_size": self.settings.database.mongo_max_pool_size
            }
        except Exception as e:
            logger.error(f"Failed to get MongoDB stats: {e}")
            return {
                "connected": False,
                "error": str(e)
            }


# Global MongoDB manager instance
_mongodb_manager: Optional[MongoDBManager] = None


def get_mongodb_manager() -> MongoDBManager:
    """
    Get global MongoDB manager instance.
    
    Returns:
        MongoDBManager instance
    """
    global _mongodb_manager
    if _mongodb_manager is None:
        _mongodb_manager = MongoDBManager()
    return _mongodb_manager


async def initialize_mongodb() -> bool:
    """
    Initialize MongoDB connection.
    
    Returns:
        bool: True if initialization successful
    """
    manager = get_mongodb_manager()
    return await manager.connect()


async def close_mongodb():
    """Close MongoDB connection"""
    global _mongodb_manager
    if _mongodb_manager:
        await _mongodb_manager.disconnect()
        _mongodb_manager = None
