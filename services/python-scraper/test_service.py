#!/usr/bin/env python3
"""
Python Scraper Service - Test Script

Comprehensive testing script to verify all endpoints and functionality
of the Python scraper service.
"""

import asyncio
import httpx
import json
import sys
from typing import Dict, Any, Optional
from datetime import datetime


class PythonScraperTester:
    """Test suite for Python Scraper Service."""
    
    def __init__(self, base_url: str = "http://localhost:8001"):
        """
        Initialize tester.
        
        Args:
            base_url: Base URL of the Python scraper service
        """
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=10.0)
        self.test_results = []
    
    async def run_all_tests(self) -> bool:
        """
        Run all test scenarios.
        
        Returns:
            bool: True if all tests pass
        """
        
        print("🧪 Starting Python Scraper Service Tests")
        print("=" * 50)
        
        tests = [
            ("Basic Service Health", self.test_basic_health),
            ("Root Endpoint", self.test_root_endpoint),
            ("Health Check Endpoints", self.test_health_endpoints),
            ("API Documentation", self.test_api_docs),
            ("Scraping Endpoints (Public)", self.test_scraping_endpoints_public),
            ("Authentication Required Endpoints", self.test_auth_required_endpoints),
            ("Error Handling", self.test_error_handling),
            ("CORS Headers", self.test_cors_headers),
        ]
        
        all_passed = True
        
        for test_name, test_func in tests:
            print(f"\n🔍 Running: {test_name}")
            try:
                result = await test_func()
                if result:
                    print(f"   ✅ PASSED")
                    self.test_results.append({"test": test_name, "status": "PASSED"})
                else:
                    print(f"   ❌ FAILED")
                    self.test_results.append({"test": test_name, "status": "FAILED"})
                    all_passed = False
            except Exception as exc:
                print(f"   💥 ERROR: {str(exc)}")
                self.test_results.append({"test": test_name, "status": "ERROR", "error": str(exc)})
                all_passed = False
        
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {'✅ ALL PASSED' if all_passed else '❌ SOME FAILED'}")
        
        return all_passed
    
    async def test_basic_health(self) -> bool:
        """Test basic health check endpoint."""
        
        response = await self.client.get(f"{self.base_url}/health")
        
        if response.status_code != 200:
            print(f"   Status code: {response.status_code}")
            return False
        
        data = response.json()
        expected_fields = ["status", "service", "timestamp"]
        
        for field in expected_fields:
            if field not in data:
                print(f"   Missing field: {field}")
                return False
        
        if data["service"] != "python-scraper":
            print(f"   Wrong service name: {data['service']}")
            return False
        
        print(f"   Service status: {data['status']}")
        return True
    
    async def test_root_endpoint(self) -> bool:
        """Test root endpoint."""
        
        response = await self.client.get(f"{self.base_url}/")
        
        if response.status_code != 200:
            return False
        
        data = response.json()
        expected_fields = ["service", "version", "status", "environment", "message"]
        
        for field in expected_fields:
            if field not in data:
                return False
        
        print(f"   Version: {data['version']}, Environment: {data['environment']}")
        return True
    
    async def test_health_endpoints(self) -> bool:
        """Test all health check endpoints."""
        
        endpoints = [
            "/api/health/",
            "/api/health/status",
            "/api/health/ready",
            "/api/health/live",
            "/api/health/metrics"
        ]
        
        for endpoint in endpoints:
            response = await self.client.get(f"{self.base_url}{endpoint}")
            if response.status_code not in [200, 503]:  # 503 is OK for readiness if deps not ready
                print(f"   {endpoint}: {response.status_code}")
                return False
        
        print(f"   Tested {len(endpoints)} health endpoints")
        return True
    
    async def test_api_docs(self) -> bool:
        """Test API documentation endpoints."""
        
        docs_endpoints = [
            "/docs",
            "/redoc",
            "/openapi.json"
        ]
        
        for endpoint in docs_endpoints:
            response = await self.client.get(f"{self.base_url}{endpoint}")
            if response.status_code != 200:
                print(f"   {endpoint}: {response.status_code}")
                return False
        
        print(f"   API documentation accessible")
        return True
    
    async def test_scraping_endpoints_public(self) -> bool:
        """Test scraping endpoints without authentication."""
        
        # Test GET endpoints that should return 401 (need auth)
        endpoints = [
            "/api/scraping/jobs",
            "/api/scraping/stats",
        ]
        
        for endpoint in endpoints:
            response = await self.client.get(f"{self.base_url}{endpoint}")
            if response.status_code != 401:
                print(f"   {endpoint}: Expected 401, got {response.status_code}")
                return False
        
        print(f"   Authentication properly required for protected endpoints")
        return True
    
    async def test_auth_required_endpoints(self) -> bool:
        """Test that protected endpoints require authentication."""
        
        # Test POST endpoint that should require auth
        response = await self.client.post(
            f"{self.base_url}/api/scraping/jobs",
            json={
                "url": "https://www.immobiliare.it/vendita-case/milano/",
                "job_type": "immobiliare"
            }
        )
        
        if response.status_code != 401:
            print(f"   POST /api/scraping/jobs: Expected 401, got {response.status_code}")
            return False
        
        error_data = response.json()
        if "Missing authentication token" not in error_data.get("detail", ""):
            print(f"   Wrong error message: {error_data}")
            return False
        
        print(f"   Authentication correctly enforced")
        return True
    
    async def test_error_handling(self) -> bool:
        """Test error handling."""
        
        # Test invalid endpoint
        response = await self.client.get(f"{self.base_url}/api/invalid/endpoint")
        
        if response.status_code != 404:
            print(f"   Invalid endpoint: Expected 404, got {response.status_code}")
            return False
        
        print(f"   Error handling working correctly")
        return True
    
    async def test_cors_headers(self) -> bool:
        """Test CORS headers."""
        
        response = await self.client.options(
            f"{self.base_url}/api/health/status",
            headers={"Origin": "http://localhost:3000"}
        )
        
        # CORS should be configured
        cors_header = response.headers.get("access-control-allow-origin")
        if not cors_header:
            print(f"   Missing CORS headers")
            return False
        
        print(f"   CORS configured: {cors_header}")
        return True
    
    async def cleanup(self):
        """Cleanup resources."""
        await self.client.aclose()


async def main():
    """Main test function."""
    
    tester = PythonScraperTester()
    
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    finally:
        await tester.cleanup()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
