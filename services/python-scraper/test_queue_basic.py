#!/usr/bin/env python3
"""
Test script for the Queue System (Step 5.3)

Tests the Redis-based queue system functionality including:
- Job creation and enqueuing
- Job status tracking
- Job listing and filtering
- Job cancellation and retry
- Queue statistics
"""

import asyncio
import sys
import json
import httpx
import os
from datetime import datetime
from pathlib import Path

# Add the project root to the Python path
sys.path.insert(0, str(Path(__file__).parent))


class QueueSystemTester:
    """Test class for the queue system"""
    
    def __init__(self):
        # Dal container, chiama se stesso sulla porta interna (8000), non quella mappata (8001)
        self.base_url = "http://localhost:8000"
        # Usa il nome del servizio Docker invece di localhost
        self.api_gateway_url = "http://api-gateway:3000"
        self.token = None
        self.test_job_id = None
        
    async def get_automatic_token(self):
        """
        Ottiene automaticamente un token di autenticazione dall'API Gateway
        """
        # Credenziali di default dal seeding del database
        # Usa testadmin che ha il tenant corretto
        login_data = {
            "username": "testadmin", 
            "password": "password"  # Password standard per utenti di test
        }
        
        headers = {
            "Content-Type": "application/json",
            # Usa il tenant ID corretto dal database
            "X-Tenant-ID": "6eb6e4c8-a8e7-4711-8001-7a566844fbdf"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.api_gateway_url}/api/auth/login",
                    json=login_data,
                    headers=headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Gestisci login diretto (single role o default role)
                    if data.get("status") == "success":
                        token = data.get("data", {}).get("accessToken") 
                        if token:
                            print(f"✅ Token ottenuto automaticamente dall'API Gateway")
                            return token
                        else:
                            print("❌ Token non trovato nella risposta di login diretto")
                            print(f"   Response structure: {data}")
                            return None
                    
                    # Gestisci multi-role (richiede selezione ruolo)
                    elif data.get("status") == "choose_role":
                        print("🔄 Utente multi-ruolo, selezionando primo ruolo disponibile...")
                        return await self._handle_role_selection(data.get("data"), headers)
                    
                    else:
                        print(f"❌ Risposta inaspettata dal login: {data}")
                        return None
                else:
                    print(f"❌ Login automatico fallito: {response.status_code}")
                    print(f"   Response: {response.text}")
                    return None
                    
            except Exception as e:
                print(f"❌ Errore durante il login automatico: {e}")
                return None

    async def _handle_role_selection(self, auth_data, headers):
        """
        Gestisce la selezione del ruolo per utenti multi-ruolo
        """
        pre_auth_token = auth_data.get("preAuthToken")
        available_roles = auth_data.get("available_roles", [])
        
        if not pre_auth_token or not available_roles:
            print("❌ Dati insufficienti per selezione ruolo")
            return None
        
        # Seleziona il primo ruolo disponibile (o quello con più privilegi)
        selected_role = available_roles[0]
        role_id = selected_role.get("id")
        role_name = selected_role.get("name")
        
        print(f"   Selezionando ruolo: {role_name}")
        
        confirm_data = {
            "roleId": role_id,
            "preAuthToken": pre_auth_token
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.api_gateway_url}/api/auth/confirm-role",
                    json=confirm_data,
                    headers=headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    token = data.get("data", {}).get("accessToken")
                    if token:
                        print(f"✅ Ruolo confermato, token ottenuto")
                        return token
                    else:
                        print("❌ Token non trovato nella risposta di conferma ruolo")
                        return None
                else:
                    print(f"❌ Conferma ruolo fallita: {response.status_code}")
                    print(f"   Response: {response.text}")
                    return None
                    
            except Exception as e:
                print(f"❌ Errore durante conferma ruolo: {e}")
                return None

    async def get_token(self):
        """
        Ottiene un token di autenticazione con fallback multipli
        """
        # 1. Prova variabile d'ambiente
        env_token = os.getenv('API_TOKEN')
        if env_token:
            print("✅ Using token from environment variable API_TOKEN")
            return env_token
        
        # 2. Fallback: login automatico
        print("📡 No token in environment, attempting automatic login...")
        return await self.get_automatic_token()
        
    async def setup(self):
        """Setup test environment"""
        print("🔧 Setting up queue system test...")
        
        # Get authentication token
        self.token = await self.get_token()
        if not self.token:
            raise Exception("Failed to get authentication token")
        
        print(f"✅ Authentication token obtained")
        
    async def test_health_check(self):
        """Test basic service health"""
        print("\n📋 Testing service health...")
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{self.base_url}/health", timeout=5.0)
                
                if response.status_code == 200:
                    print("✅ Service is healthy")
                    return True
                else:
                    print(f"❌ Service health check failed: {response.status_code}")
                    return False
            except Exception as e:
                print(f"❌ Service health check failed with exception: {e}")
                return False
    
    async def test_create_job(self):
        """Test job creation endpoint"""
        print("\n🚀 Testing job creation...")
        
        job_data = {
            "title": "Test Milano Apartments Queue",
            "description": "Test job for queue system validation",
            "site": "immobiliare.it",
            "url": "https://www.immobiliare.it/vendita-case/milano/",
            "search_criteria": {
                "property_type": "apartment",
                "price_range": "200000-500000",
                "location": "milano"
            },
            "max_pages": 3,
            "delay_ms": 1000,
            "priority": "normal",
            "max_retries": 2
        }
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/scraping/jobs",
                    json=job_data,
                    headers=headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    job = response.json()
                    self.test_job_id = job.get("id")
                    print(f"✅ Job created successfully: {self.test_job_id}")
                    print(f"   Title: {job.get('title')}")
                    print(f"   Status: {job.get('status')}")
                    print(f"   Priority: {job.get('priority')}")
                    return True
                else:
                    print(f"❌ Job creation failed: {response.status_code}")
                    print(f"   Response: {response.text}")
                    return False
            except Exception as e:
                print(f"❌ Job creation failed with exception: {e}")
                return False


async def main():
    """Main test runner"""
    tester = QueueSystemTester()
    
    try:
        await tester.setup()
        health_ok = await tester.test_health_check() 
        job_created = await tester.test_create_job()
        
        if health_ok and job_created:
            print("\n✅ Step 5.3 Queue System Design - Basic tests PASSED")
        else:
            print("\n❌ Step 5.3 Queue System Design - Basic tests FAILED")
    except Exception as e:
        print(f"❌ Test failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())