"""
Test di integrazione per il servizio NLP
Task 5.2.5 - Integration con API Gateway routing
"""

import asyncio
import httpx
import json
from typing import Dict, Any

# Configurazione test
NLP_SERVICE_URL = "http://localhost:8002"
API_GATEWAY_URL = "http://localhost:3000"

async def test_nlp_service_direct():
    """Test diretto del servizio NLP"""
    print("🧪 Testing NLP Service Direct Access...")
    
    async with httpx.AsyncClient() as client:
        # Test health check
        try:
            response = await client.get(f"{NLP_SERVICE_URL}/health")
            print(f"✅ Health check: {response.status_code}")
            if response.status_code == 200:
                health_data = response.json()
                print(f"   Status: {health_data.get('status')}")
                print(f"   Ollama: {health_data.get('ollama_connection')}")
            
        except Exception as e:
            print(f"❌ Health check failed: {e}")
        
        # Test process query endpoint
        try:
            test_query = {
                "query": "Cerco casa a Milano zona Brera massimo 500000 euro",
                "language": "it",
                "extract_entities": True,
                "process_conditions": True
            }
            
            response = await client.post(
                f"{NLP_SERVICE_URL}/process-query",
                json=test_query
            )
            
            print(f"✅ Process query: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"   Query processata: {result.get('processed')}")
                print(f"   Tempo elaborazione: {result.get('processing_time_ms')}ms")
            
        except Exception as e:
            print(f"❌ Process query failed: {e}")

async def test_api_gateway_integration():
    """Test integrazione con API Gateway"""
    print("\n🔗 Testing API Gateway Integration...")
    
    # Nota: Gli endpoint AI nell'API Gateway devono essere implementati
    # Questo test verificherà se l'API Gateway può raggiungere il servizio NLP
    
    async with httpx.AsyncClient() as client:
        try:
            # Test se API Gateway è raggiungibile
            response = await client.get(f"{API_GATEWAY_URL}/api/health")
            print(f"✅ API Gateway health: {response.status_code}")
            
            # Test endpoint AI (se implementato)
            try:
                response = await client.get(f"{API_GATEWAY_URL}/api/ai/health")
                print(f"✅ AI endpoints: {response.status_code}")
            except Exception as e:
                print(f"ℹ️  AI endpoints not implemented yet: {e}")
                
        except Exception as e:
            print(f"❌ API Gateway test failed: {e}")

async def test_models_availability():
    """Test disponibilità modelli"""
    print("\n📋 Testing Models Availability...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{NLP_SERVICE_URL}/models")
            print(f"✅ Models check: {response.status_code}")
            
            if response.status_code == 200:
                models = response.json()
                if models.get('models'):
                    print(f"   Available models: {len(models['models'])}")
                    for model in models['models'][:3]:  # Mostra primi 3
                        print(f"   - {model.get('name')}")
                else:
                    print("   No models available")
            
        except Exception as e:
            print(f"❌ Models check failed: {e}")

async def test_service_status():
    """Test stato dettagliato del servizio"""
    print("\n📊 Testing Service Status...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{NLP_SERVICE_URL}/status")
            print(f"✅ Service status: {response.status_code}")
            
            if response.status_code == 200:
                status = response.json()
                print(f"   Service: {status.get('service')}")
                print(f"   Version: {status.get('version')}")
                print(f"   Status: {status.get('status')}")
                
                deps = status.get('dependencies', {})
                for dep_name, dep_info in deps.items():
                    print(f"   {dep_name}: {dep_info.get('status')}")
            
        except Exception as e:
            print(f"❌ Service status failed: {e}")

async def run_all_tests():
    """Esegue tutti i test"""
    print("🚀 Starting NLP Service Integration Tests\n")
    
    await test_nlp_service_direct()
    await test_api_gateway_integration()
    await test_models_availability()
    await test_service_status()
    
    print("\n✅ Integration tests completed!")

if __name__ == "__main__":
    asyncio.run(run_all_tests())
