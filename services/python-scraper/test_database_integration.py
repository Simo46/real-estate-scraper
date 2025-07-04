"""
Test script for database integration.

This script tests MongoDB and Redis connections to verify
that the database integration is working correctly.
"""

import asyncio
import sys
import logging
from pathlib import Path

# Add the service root to Python path
service_root = Path(__file__).parent
sys.path.insert(0, str(service_root))

from core.database import (
    get_database_manager,
    check_database_health,
    get_database_statistics
)
from config.settings import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_database_connections():
    """Test database connections and operations"""
    
    print("=" * 60)
    print("🧪 TESTING DATABASE INTEGRATION")
    print("=" * 60)
    
    try:
        # Get settings
        settings = get_settings()
        print(f"✅ Settings loaded - Environment: {settings.environment}")
        
        # Get database manager
        manager = get_database_manager()
        
        # Test initialization
        print("\n1️⃣ Testing database initialization...")
        success = await manager.initialize()
        
        if success:
            print("✅ Database initialization successful")
        else:
            print("❌ Database initialization failed")
            return False
        
        # Test health check
        print("\n2️⃣ Testing health check...")
        health = await check_database_health()
        print(f"Health status: {health}")
        
        # Test statistics
        print("\n3️⃣ Testing statistics...")
        stats = await get_database_statistics()
        print(f"Statistics: {stats}")
        
        # Test MongoDB operations
        print("\n4️⃣ Testing MongoDB operations...")
        await test_mongodb_operations(manager)
        
        # Test Redis operations
        print("\n5️⃣ Testing Redis operations...")
        await test_redis_operations(manager)
        
        print("\n✅ All database tests completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Database test failed: {e}")
        logger.exception("Database test error")
        return False
    
    finally:
        # Cleanup
        try:
            await manager.shutdown()
            print("\n🧹 Database connections closed")
        except Exception as e:
            print(f"⚠️ Cleanup error: {e}")


async def test_mongodb_operations(manager):
    """Test MongoDB operations"""
    try:
        # Test collection access
        properties_collection = await manager.mongodb.get_collection("properties")
        
        # Test insert
        test_doc = {
            "source": "test",
            "external_id": "test_001",
            "title": "Test Property",
            "price": 100000,
            "location": {
                "city": "Test City",
                "address": "Test Address"
            },
            "property_type": "apartment",
            "status": "active",
            "created_at": asyncio.get_event_loop().time()
        }
        
        result = await properties_collection.insert_one(test_doc)
        print(f"✅ MongoDB insert successful - ID: {result.inserted_id}")
        
        # Test find
        found_doc = await properties_collection.find_one({"_id": result.inserted_id})
        if found_doc:
            print("✅ MongoDB find successful")
        
        # Test delete (cleanup)
        await properties_collection.delete_one({"_id": result.inserted_id})
        print("✅ MongoDB delete successful")
        
    except Exception as e:
        print(f"❌ MongoDB test failed: {e}")
        raise


async def test_redis_operations(manager):
    """Test Redis operations"""
    try:
        # Test basic key-value operations
        test_key = "test_key"
        test_value = {"test": "data", "timestamp": asyncio.get_event_loop().time()}
        
        # Test set
        success = await manager.redis.set(test_key, test_value, expires=300)
        if success:
            print("✅ Redis set successful")
        
        # Test get
        retrieved_value = await manager.redis.get(test_key)
        if retrieved_value and retrieved_value.get("test") == "data":
            print("✅ Redis get successful")
        
        # Test queue operations
        queue_name = "test_queue"
        job_data = {
            "id": "test_job_001",
            "type": "test",
            "data": {"url": "https://example.com"}
        }
        
        # Test enqueue
        success = await manager.redis.enqueue_job(queue_name, job_data, priority=1)
        if success:
            print("✅ Redis enqueue successful")
        
        # Test dequeue
        dequeued_job = await manager.redis.dequeue_job(queue_name)
        if dequeued_job and dequeued_job.get("id") == "test_job_001":
            print("✅ Redis dequeue successful")
        
        # Test cleanup
        await manager.redis.delete(test_key)
        await manager.redis.clear_queue(queue_name)
        print("✅ Redis cleanup successful")
        
    except Exception as e:
        print(f"❌ Redis test failed: {e}")
        raise


async def main():
    """Main test function"""
    success = await test_database_connections()
    
    if success:
        print("\n🎉 DATABASE INTEGRATION TEST PASSED!")
        sys.exit(0)
    else:
        print("\n💥 DATABASE INTEGRATION TEST FAILED!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
