#!/usr/bin/env python3
"""
Test script per Health Check - NLP Service
Test base per verificare che il servizio sia operativo
"""

import asyncio
import httpx
import sys
import os

# Configurazione test
NLP_SERVICE_URL = "http://localhost:8002"

async def test_health_check():
    """Test health check del servizio"""
    print("🩺 Testing NLP Service Health Check...")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{NLP_SERVICE_URL}/health")
            
            print(f"✅ Health check: {response.status_code}")
            
            if response.status_code == 200:
                health_data = response.json()
                print(f"   Service: {health_data.get('service', 'Unknown')}")
                print(f"   Status: {health_data.get('status', 'Unknown')}")
                print(f"   Timestamp: {health_data.get('timestamp', 'Unknown')}")
                return True
            else:
                print(f"❌ Health check failed with status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

async def test_entity_health():
    """Test health check specifico per entity extraction"""
    print("\n📊 Testing Entity Service Health Check...")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{NLP_SERVICE_URL}/api/v1/entities/health")
            
            print(f"✅ Entity health check: {response.status_code}")
            
            if response.status_code == 200:
                health_data = response.json()
                print(f"   Service: {health_data.get('service', 'Unknown')}")
                health_info = health_data.get('health', {})
                print(f"   Initialized: {health_info.get('initialized', False)}")
                print(f"   Model loaded: {health_info.get('model_loaded', False)}")
                print(f"   spaCy available: {health_info.get('spacy_available', False)}")
                return True
            else:
                print(f"❌ Entity health check failed with status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"❌ Entity health check error: {e}")
        return False

async def main():
    """Funzione principale"""
    print("🏠 Real Estate NLP Service - Health Check Test")
    print("=" * 60)
    print("📂 Test interno al servizio nlp-service")
    print(f"📍 Current directory: {os.getcwd()}")
    print("=" * 60)
    
    try:
        # Test health check generale
        basic_health = await test_health_check()
        
        # Test health check entity service
        entity_health = await test_entity_health()
        
        print("\n" + "=" * 60)
        
        if basic_health and entity_health:
            print("✅ All health checks passed!")
            return 0
        else:
            print("❌ Some health checks failed!")
            return 1
        
    except KeyboardInterrupt:
        print("\n❌ Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
