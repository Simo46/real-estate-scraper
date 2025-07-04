#!/usr/bin/env python3
"""
Test script per Entity Extraction - NLP Service
Task 5.3.1 - spaCy italiano models download e setup
Task 5.3.3 - /extract-entities endpoint implementation

Questo test è interno al servizio nlp-service e può essere eseguito con:
cd services/nlp-service && python -m pytest tests/test_entity_extraction.py -v
oppure:
cd services/nlp-service && python tests/test_entity_extraction.py
"""

import asyncio
import httpx
import json
import sys
import os
from typing import Dict, Any, List

# Configurazione test
NLP_SERVICE_URL = "http://localhost:8002"

# Query di test per il settore immobiliare
TEST_QUERIES = [
    "Cerco casa a Milano zona Brera massimo 500000 euro",
    "Appartamento Roma Trastevere 3 locali 80 mq €300k",
    "Villa Torino con giardino da ristrutturare 250 mq",
    "Monolocale nuovo Milano centro 40 mq affitto €1200",
    "Casa abitabile Firenze zona Oltrarno 150 mq €450000",
    "Attico penthouse Milano Porta Nuova 120 mq €800k",
    "Bilocale buono stato Bologna zona universitaria 60 mq",
    "Loft industriale Roma Ostiense da sistemare 200 mq",
    "Trilocale luminoso Napoli Vomero 85 mq €220000",
    "Appartamento signorile Venezia San Marco 90 mq €600k"
]

async def test_entity_extraction():
    """Test dell'endpoint di estrazione entità"""
    print("🧪 Testing Entity Extraction Service...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test health check
        await test_health_check(client)
        
        # Test entity types
        await test_entity_types(client)
        
        # Test extraction con query di esempio
        await test_extraction_examples(client)
        
        # Test validation
        await test_validation(client)

async def test_health_check(client: httpx.AsyncClient):
    """Test health check del servizio"""
    print("\n📊 Testing Health Check...")
    
    try:
        response = await client.get(f"{NLP_SERVICE_URL}/api/v1/entities/health")
        print(f"✅ Health check: {response.status_code}")
        
        if response.status_code == 200:
            health_data = response.json()
            print(f"   Service: {health_data.get('service')}")
            print(f"   Initialized: {health_data.get('health', {}).get('initialized')}")
            print(f"   Model loaded: {health_data.get('health', {}).get('model_loaded')}")
            print(f"   spaCy available: {health_data.get('health', {}).get('spacy_available')}")
        else:
            print(f"❌ Health check failed with status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Health check error: {e}")

async def test_entity_types(client: httpx.AsyncClient):
    """Test endpoint tipi di entità"""
    print("\n📋 Testing Entity Types...")
    
    try:
        response = await client.get(f"{NLP_SERVICE_URL}/api/v1/entities/types")
        print(f"✅ Entity types: {response.status_code}")
        
        if response.status_code == 200:
            types_data = response.json()
            print(f"   Supported types: {len(types_data.get('entity_types', []))}")
            for entity_type in types_data.get('entity_types', [])[:3]:
                print(f"   - {entity_type.get('type')}: {entity_type.get('description')}")
        else:
            print(f"❌ Entity types failed with status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Entity types error: {e}")

async def test_extraction_examples(client: httpx.AsyncClient):
    """Test estrazione entità con query di esempio"""
    print("\n🎯 Testing Entity Extraction Examples...")
    
    successful_extractions = 0
    total_entities = 0
    
    for i, query in enumerate(TEST_QUERIES[:5]):  # Test prime 5 query
        try:
            print(f"\n📝 Query {i+1}: {query}")
            
            request_data = {
                "text": query,
                "language": "it",
                "confidence_threshold": 0.5,
                "normalize_entities": True,
                "include_metadata": True
            }
            
            response = await client.post(
                f"{NLP_SERVICE_URL}/api/v1/entities/extract",
                json=request_data
            )
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get('success'):
                    entity_count = result.get('entity_count', 0)
                    processing_time = result.get('processing_time_ms', 0)
                    
                    print(f"   ✅ Extracted {entity_count} entities in {processing_time:.2f}ms")
                    
                    # Mostra entità per tipo
                    entities_by_type = result.get('entities_by_type', {})
                    for entity_type, count in entities_by_type.items():
                        print(f"   - {entity_type}: {count}")
                    
                    # Mostra prime 3 entità
                    entities = result.get('entities', [])[:3]
                    for entity in entities:
                        text = entity.get('text', '')
                        label = entity.get('label', '')
                        confidence = entity.get('confidence', 0)
                        normalized = entity.get('normalized_value', '')
                        print(f"   📌 '{text}' ({label}) - {confidence:.2f} -> {normalized}")
                    
                    successful_extractions += 1
                    total_entities += entity_count
                else:
                    print(f"   ❌ Extraction failed: {result.get('analysis_metadata', {}).get('error', 'Unknown error')}")
            else:
                print(f"   ❌ Request failed with status {response.status_code}")
                
        except Exception as e:
            print(f"   ❌ Error processing query: {e}")
    
    print(f"\n📊 Summary: {successful_extractions}/{len(TEST_QUERIES[:5])} successful extractions")
    print(f"   Total entities extracted: {total_entities}")
    print(f"   Average entities per query: {total_entities/max(1, successful_extractions):.1f}")

async def test_validation(client: httpx.AsyncClient):
    """Test validazione richieste"""
    print("\n🔍 Testing Validation...")
    
    # Test con testo vuoto
    try:
        response = await client.post(
            f"{NLP_SERVICE_URL}/api/v1/entities/validate",
            json={
                "text": "",
                "language": "it"
            }
        )
        print(f"✅ Empty text validation: {response.status_code}")
    except Exception as e:
        print(f"❌ Empty text validation error: {e}")
    
    # Test con testo valido
    try:
        response = await client.post(
            f"{NLP_SERVICE_URL}/api/v1/entities/validate",
            json={
                "text": "Casa Milano €300k",
                "language": "it",
                "confidence_threshold": 0.1
            }
        )
        print(f"✅ Valid text validation: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            warnings = result.get('warnings', [])
            print(f"   Warnings: {len(warnings)}")
            for warning in warnings:
                print(f"   ⚠️  {warning}")
                
    except Exception as e:
        print(f"❌ Valid text validation error: {e}")

async def test_performance_benchmark():
    """Test prestazioni del servizio"""
    print("\n⚡ Performance Benchmark...")
    
    test_text = "Cerco casa a Milano zona Brera massimo 500000 euro con giardino"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        import time
        
        # Esegui 10 richieste
        times = []
        for i in range(10):
            start = time.time()
            
            try:
                response = await client.post(
                    f"{NLP_SERVICE_URL}/api/v1/entities/extract",
                    json={
                        "text": test_text,
                        "language": "it",
                        "confidence_threshold": 0.5
                    }
                )
                
                if response.status_code == 200:
                    elapsed = time.time() - start
                    times.append(elapsed)
                    print(f"   Request {i+1}: {elapsed*1000:.2f}ms")
                else:
                    print(f"   Request {i+1}: Failed ({response.status_code})")
                    
            except Exception as e:
                print(f"   Request {i+1}: Error - {e}")
        
        if times:
            avg_time = sum(times) / len(times)
            min_time = min(times)
            max_time = max(times)
            
            print(f"\n📊 Performance Summary:")
            print(f"   Average: {avg_time*1000:.2f}ms")
            print(f"   Min: {min_time*1000:.2f}ms")
            print(f"   Max: {max_time*1000:.2f}ms")
            print(f"   Successful requests: {len(times)}/10")
            
            # Valutazione target (<3 secondi)
            target_time = 3.0
            if avg_time < target_time:
                print(f"   ✅ Target met: {avg_time:.2f}s < {target_time}s")
            else:
                print(f"   ❌ Target missed: {avg_time:.2f}s >= {target_time}s")

async def main():
    """Funzione principale"""
    print("🏠 Real Estate NLP Service - Entity Extraction Test")
    print("=" * 60)
    print("📂 Test interno al servizio nlp-service")
    print(f"📍 Current directory: {os.getcwd()}")
    print("=" * 60)
    
    try:
        # Test principali
        await test_entity_extraction()
        
        # Test prestazioni
        await test_performance_benchmark()
        
        print("\n" + "=" * 60)
        print("✅ All tests completed!")
        
    except KeyboardInterrupt:
        print("\n❌ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
