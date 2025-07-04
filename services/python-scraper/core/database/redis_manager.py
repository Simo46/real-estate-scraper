"""
Redis connection and management module.

This module provides Redis connection pooling, retry logic,
and queue management for the Python scraper service.
"""

import asyncio
import json
import logging
from typing import Optional, Dict, Any, Union
from contextlib import asynccontextmanager

import redis.asyncio as redis
from redis.exceptions import (
    ConnectionError,
    TimeoutError,
    RedisError,
    ResponseError
)

from config.settings import get_settings

logger = logging.getLogger(__name__)


class RedisManager:
    """
    Redis connection manager with connection pooling and retry logic.
    
    Features:
    - Async connection pooling
    - Connection health monitoring
    - Automatic retry on failures
    - Queue management for scraping jobs
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.pool: Optional[redis.ConnectionPool] = None
        self.client: Optional[redis.Redis] = None
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        
    async def connect(self) -> bool:
        """
        Establish connection to Redis with retry logic.
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        async with self._connection_lock:
            if self._is_connected and self.client:
                return True
                
            try:
                logger.info("Connecting to Redis...")
                
                # Create Redis connection pool
                self.pool = redis.ConnectionPool.from_url(
                    self.settings.database.redis_url,
                    max_connections=self.settings.database.redis_max_connections,
                    retry_on_timeout=self.settings.database.redis_retry_on_timeout,
                    retry_on_error=[ConnectionError, TimeoutError],
                    health_check_interval=30  # Health check every 30 seconds
                )
                
                # Create Redis client
                self.client = redis.Redis(
                    connection_pool=self.pool,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                
                # Test connection
                await self._test_connection()
                
                self._is_connected = True
                logger.info("Successfully connected to Redis")
                return True
                
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                await self._cleanup_connection()
                return False
    
    async def disconnect(self):
        """Gracefully disconnect from Redis"""
        async with self._connection_lock:
            await self._cleanup_connection()
            
    async def _cleanup_connection(self):
        """Clean up Redis connection"""
        if self.client:
            try:
                await self.client.aclose()
                logger.info("Redis connection closed")
            except Exception as e:
                logger.warning(f"Error closing Redis connection: {e}")
            finally:
                self.client = None
                
        if self.pool:
            try:
                await self.pool.aclose()
            except Exception as e:
                logger.warning(f"Error closing Redis pool: {e}")
            finally:
                self.pool = None
                
        self._is_connected = False
    
    async def _test_connection(self):
        """Test Redis connection with ping"""
        if not self.client:
            raise ConnectionError("No Redis client available")
            
        try:
            response = await self.client.ping()
            if response:
                logger.debug("Redis ping successful")
            else:
                raise ConnectionError("Redis ping returned False")
        except Exception as e:
            logger.error(f"Redis ping failed: {e}")
            raise
    
    async def is_healthy(self) -> bool:
        """
        Check if Redis connection is healthy.
        
        Returns:
            bool: True if connection is healthy, False otherwise
        """
        if not self._is_connected or not self.client:
            return False
            
        try:
            await self._test_connection()
            return True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return False
    
    async def ensure_connected(self) -> bool:
        """
        Ensure Redis connection is active, reconnect if necessary.
        
        Returns:
            bool: True if connected, False otherwise
        """
        if await self.is_healthy():
            return True
            
        logger.warning("Redis connection unhealthy, attempting reconnection...")
        return await self.connect()
    
    async def execute_with_retry(self, operation, max_retries: int = 3, **kwargs) -> Any:
        """
        Execute Redis operation with retry logic.
        
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
                    raise ConnectionError("Failed to establish Redis connection")
                    
                return await operation(**kwargs)
                
            except (ConnectionError, TimeoutError) as e:
                last_exception = e
                if attempt < max_retries:
                    wait_time = (attempt + 1) * 2  # Exponential backoff
                    logger.warning(f"Redis operation failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                    # Force reconnection on next attempt
                    self._is_connected = False
                else:
                    logger.error(f"Redis operation failed after {max_retries + 1} attempts")
                    
            except Exception as e:
                logger.error(f"Non-retryable Redis error: {e}")
                raise
        
        raise last_exception
    
    # ===== QUEUE OPERATIONS =====
    
    async def enqueue_job(self, queue_name: str, job_data: Dict[str, Any], priority: int = 0) -> bool:
        """
        Add job to Redis queue.
        
        Args:
            queue_name: Name of the queue
            job_data: Job data to enqueue
            priority: Job priority (higher = more priority)
            
        Returns:
            bool: True if job enqueued successfully
        """
        try:
            job_payload = {
                "data": job_data,
                "priority": priority,
                "timestamp": asyncio.get_event_loop().time()
            }
            
            async def _enqueue():
                # Use ZADD for priority queue
                score = priority * 1000000 + job_payload["timestamp"]
                return await self.client.zadd(queue_name, {json.dumps(job_payload): score})
            
            result = await self.execute_with_retry(_enqueue)
            logger.debug(f"Job enqueued to {queue_name}: {job_data.get('id', 'unknown')}")
            return bool(result)
            
        except Exception as e:
            logger.error(f"Failed to enqueue job to {queue_name}: {e}")
            return False
    
    async def dequeue_job(self, queue_name: str) -> Optional[Dict[str, Any]]:
        """
        Get next job from Redis queue.
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            Job data or None if queue is empty
        """
        try:
            async def _dequeue():
                # Get highest priority job
                result = await self.client.zpopmax(queue_name)
                if result:
                    return json.loads(result[0][0])
                return None
            
            job_payload = await self.execute_with_retry(_dequeue)
            if job_payload:
                logger.debug(f"Job dequeued from {queue_name}")
                return job_payload.get("data")
            return None
            
        except Exception as e:
            logger.error(f"Failed to dequeue job from {queue_name}: {e}")
            return None
    
    async def get_queue_size(self, queue_name: str) -> int:
        """
        Get number of jobs in queue.
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            Number of jobs in queue
        """
        try:
            async def _get_size():
                return await self.client.zcard(queue_name)
            
            return await self.execute_with_retry(_get_size)
            
        except Exception as e:
            logger.error(f"Failed to get queue size for {queue_name}: {e}")
            return 0
    
    async def clear_queue(self, queue_name: str) -> bool:
        """
        Clear all jobs from queue.
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            bool: True if queue cleared successfully
        """
        try:
            async def _clear():
                return await self.client.delete(queue_name)
            
            result = await self.execute_with_retry(_clear)
            logger.info(f"Queue {queue_name} cleared")
            return bool(result)
            
        except Exception as e:
            logger.error(f"Failed to clear queue {queue_name}: {e}")
            return False
    
    # ===== KEY-VALUE OPERATIONS =====
    
    async def set(self, key: str, value: Union[str, Dict, Any], expires: Optional[int] = None) -> bool:
        """
        Set key-value pair in Redis.
        
        Args:
            key: Redis key
            value: Value to store
            expires: Expiration time in seconds
            
        Returns:
            bool: True if set successfully
        """
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
                
            async def _set():
                return await self.client.set(key, value, ex=expires)
            
            result = await self.execute_with_retry(_set)
            return bool(result)
            
        except Exception as e:
            logger.error(f"Failed to set key {key}: {e}")
            return False
    
    async def get(self, key: str, default: Any = None) -> Any:
        """
        Get value from Redis.
        
        Args:
            key: Redis key
            default: Default value if key not found
            
        Returns:
            Value or default
        """
        try:
            async def _get():
                return await self.client.get(key)
            
            value = await self.execute_with_retry(_get)
            if value is None:
                return default
                
            # Try to parse as JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
                
        except Exception as e:
            logger.error(f"Failed to get key {key}: {e}")
            return default
    
    async def delete(self, key: str) -> bool:
        """
        Delete key from Redis.
        
        Args:
            key: Redis key to delete
            
        Returns:
            bool: True if key deleted
        """
        try:
            async def _delete():
                return await self.client.delete(key)
            
            result = await self.execute_with_retry(_delete)
            return bool(result)
            
        except Exception as e:
            logger.error(f"Failed to delete key {key}: {e}")
            return False
    
    async def get_stats(self) -> Dict[str, Any]:
        """
        Get Redis connection statistics.
        
        Returns:
            Dict with connection stats
        """
        if not self._is_connected or not self.client:
            return {
                "connected": False,
                "info": None
            }
        
        try:
            info = await self.client.info()
            return {
                "connected": True,
                "redis_version": info.get("redis_version"),
                "used_memory_mb": round(info.get("used_memory", 0) / (1024 * 1024), 2),
                "connected_clients": info.get("connected_clients", 0),
                "total_commands_processed": info.get("total_commands_processed", 0),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "pool_max_connections": self.settings.database.redis_max_connections
            }
        except Exception as e:
            logger.error(f"Failed to get Redis stats: {e}")
            return {
                "connected": False,
                "error": str(e)
            }


# Global Redis manager instance
_redis_manager: Optional[RedisManager] = None


def get_redis_manager() -> RedisManager:
    """
    Get global Redis manager instance.
    
    Returns:
        RedisManager instance
    """
    global _redis_manager
    if _redis_manager is None:
        _redis_manager = RedisManager()
    return _redis_manager


async def initialize_redis() -> bool:
    """
    Initialize Redis connection.
    
    Returns:
        bool: True if initialization successful
    """
    manager = get_redis_manager()
    return await manager.connect()


async def close_redis():
    """Close Redis connection"""
    global _redis_manager
    if _redis_manager:
        await _redis_manager.disconnect()
        _redis_manager = None
