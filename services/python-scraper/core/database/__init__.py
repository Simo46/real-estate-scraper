"""
Database integration module for Python Scraper Service.

This module provides database connection management, connection pooling,
and retry logic for MongoDB and Redis.
"""

from .mongodb import MongoDBManager, get_mongodb_manager, initialize_mongodb, close_mongodb
from .redis_manager import RedisManager, get_redis_manager, initialize_redis, close_redis
from .database_manager import DatabaseManager, get_database_manager, initialize_databases, close_databases
from .initialization import (
    startup_databases,
    shutdown_databases,
    check_database_health,
    get_database_statistics,
    database_lifespan_startup,
    database_lifespan_shutdown
)

__all__ = [
    # MongoDB
    "MongoDBManager",
    "get_mongodb_manager",
    "initialize_mongodb",
    "close_mongodb",
    
    # Redis
    "RedisManager", 
    "get_redis_manager",
    "initialize_redis",
    "close_redis",
    
    # Database Manager
    "DatabaseManager",
    "get_database_manager",
    "initialize_databases",
    "close_databases",
    
    # Initialization
    "startup_databases",
    "shutdown_databases",
    "check_database_health",
    "get_database_statistics",
    "database_lifespan_startup",
    "database_lifespan_shutdown"
]
