#!/usr/bin/env python3
"""
Debug script per Entity Extraction
Verifica cosa sta succedendo nella logica di elaborazione
"""

import asyncio
import httpx
import json

async def debug_entity_extraction():
    """Debug dell'estrazione entità"""
    
    # Test con debug endpoint
    debug_data = {
        "text": "Cerco casa a Milano zona Brera massimo 500000 euro",
        "language": "it",
        "confidence_threshold": 0.1
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8002/api/v1/entities/debug",
                json=debug_data
            )
            
            if response.status_code == 200:
                result = response.json()
                print("🔍 Debug Entity Extraction:")
                print(f"Success: {result.get('success')}")
                print(f"Entities found: {result.get('entity_count', 0)}")
                
                # Mostra entità spaCy raw
                spacy_entities = result.get('debug_info', {}).get('spacy_entities', [])
                print(f"\n📋 spaCy Entities ({len(spacy_entities)}):")
                for i, entity in enumerate(spacy_entities):
                    print(f"  {i+1}. '{entity.get('text')}' ({entity.get('label')}) - {entity.get('start_char')}-{entity.get('end_char')}")
                
                # Mostra entità filtrate
                filtered_entities = result.get('entities', [])
                print(f"\n✅ Filtered Entities ({len(filtered_entities)}):")
                for i, entity in enumerate(filtered_entities):
                    print(f"  {i+1}. '{entity.get('text')}' ({entity.get('label')}) - confidence: {entity.get('confidence')}")
                
                # Mostra errori
                errors = result.get('debug_info', {}).get('processing_errors', [])
                if errors:
                    print(f"\n❌ Processing Errors ({len(errors)}):")
                    for error in errors:
                        print(f"  - {error}")
            else:
                print(f"❌ Debug failed: {response.status_code}")
                print(response.text)
        except Exception as e:
            print(f"❌ Debug error: {e}")

if __name__ == "__main__":
    asyncio.run(debug_entity_extraction())
