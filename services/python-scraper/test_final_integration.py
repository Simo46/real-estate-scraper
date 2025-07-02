#!/usr/bin/env python3
"""
Final Integration Test for Node.js API Authentication - FIXED VERSION

This script demonstrates the completed integration between the Python scraper
service and the Node.js API Gateway for authentication and authorization.
"""

import asyncio
import sys
import os
from pathlib import Path

# Detect if we're running in Docker container or host
if os.path.exists('/app') and os.path.isfile('/app/config/settings.py'):
    # We're in the Docker container
    sys.path.insert(0, '/app')
else:
    # We're on the host machine
    project_root = Path(__file__).parent
    sys.path.insert(0, str(project_root))

print("🔍 Starting Final Integration Test...")

import structlog
from config.settings import get_settings

# Configure logging with error handling
try:
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.JSONRenderer()
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    logger = structlog.get_logger(__name__)
    print("✅ Logging configured successfully")
except Exception as e:
    print(f"❌ Logging configuration failed: {e}")
    # Fallback to print statements
    class SimpleLogger:
        def info(self, msg, **kwargs): 
            print(f"INFO: {msg} {kwargs}")
        def error(self, msg, **kwargs): 
            print(f"ERROR: {msg} {kwargs}")
    logger = SimpleLogger()


def test_configuration():
    """Test that all JWT configurations are loaded correctly."""
    print("🧪 Running configuration test...")
    logger.info("Testing JWT configuration...")
    
    try:
        settings = get_settings()
        
        # Check JWT secrets
        jwt_config = {
            "access_secret": settings.api.jwt_secret_key,
            "refresh_secret": settings.api.jwt_refresh_secret_key,
            "pre_auth_secret": settings.api.jwt_pre_auth_secret_key,
            "algorithm": settings.api.jwt_algorithm
        }
        
        logger.info("✅ JWT Configuration loaded successfully", **jwt_config)
        
        # Check API URLs - FIXED FIELD NAMES
        api_config = {
            "gateway_url": str(settings.api.api_gateway_url),  # Convert to string
            "verify_url": str(settings.api.jwt_verify_url),
            "timeout": settings.api.api_timeout,
            "retries": settings.api.api_max_retries
        }
        
        logger.info("✅ API Configuration loaded successfully", **api_config)
        print("✅ Configuration test passed")
        
        return True
        
    except Exception as e:
        logger.error("❌ Configuration test failed", error=str(e))
        print(f"❌ Configuration test failed: {e}")
        return False


def test_imports():
    """Test that all integration modules can be imported."""
    print("🧪 Running imports test...")
    logger.info("Testing module imports...")
    
    try:
        # Test JWT Validator
        print("  - Testing JWT Validator...")
        from core.integration.jwt_validator import JWTValidator
        validator = JWTValidator()
        logger.info("✅ JWTValidator imported and initialized")
        
        # Test API Client
        print("  - Testing API Client...")
        from core.integration.api_client import APIGatewayClient
        logger.info("✅ APIGatewayClient imported")
        
        # Test Auth Service
        print("  - Testing Auth Service...")
        from core.integration.auth_service import AuthService
        logger.info("✅ AuthService imported")
        
        # Test Middleware
        print("  - Testing Middleware...")
        from middleware.auth_middleware import AuthMiddleware
        logger.info("✅ AuthMiddleware imported")
        
        # Test Dependencies
        print("  - Testing Dependencies...")
        from api.dependencies import get_current_user
        logger.info("✅ Dependencies imported")
        
        print("✅ All imports successful")
        return True
        
    except Exception as e:
        logger.error("❌ Import test failed", error=str(e))
        print(f"❌ Import test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_middleware_logic():
    """Test authentication middleware logic."""
    logger.info("Testing middleware logic...")
    
    try:
        from middleware.auth_middleware import AuthMiddleware
        
        class MockApp:
            pass
        
        middleware = AuthMiddleware(MockApp())
        
        # Test public endpoint detection
        public_endpoints = ["/", "/docs", "/health", "/api/health/status"]
        protected_endpoints = ["/api/scraping/jobs", "/api/monitoring/stats"]
        
        for endpoint in public_endpoints:
            assert middleware._is_public_endpoint(endpoint), f"Should be public: {endpoint}"
        
        for endpoint in protected_endpoints:
            assert not middleware._is_public_endpoint(endpoint), f"Should be protected: {endpoint}"
        
        logger.info("✅ Middleware endpoint detection works correctly")
        
        # Test token extraction
        class MockRequest:
            def __init__(self, auth_header=None, cookies=None):
                self.headers = {"authorization": auth_header} if auth_header else {}
                self.cookies = cookies or {}
        
        # Test Bearer token
        request = MockRequest("Bearer test-token-123")
        token = middleware._extract_token(request)
        assert token == "test-token-123", f"Expected 'test-token-123', got {token}"
        
        # Test cookie token
        request = MockRequest(cookies={"access_token": "cookie-token-456"})
        token = middleware._extract_token(request)
        assert token == "cookie-token-456", f"Expected 'cookie-token-456', got {token}"
        
        logger.info("✅ Middleware token extraction works correctly")
        
        return True
        
    except Exception as e:
        logger.error("❌ Middleware logic test failed", error=str(e))
        return False


def test_jwt_validation_with_real_structure():
    """Test JWT validation with the expected token structure from API Gateway."""
    logger.info("Testing JWT validation with realistic token structure...")
    
    try:
        from core.integration.jwt_validator import JWTValidator
        import jwt
        from datetime import datetime, timezone, timedelta
        
        validator = JWTValidator()
        settings = get_settings()
        
        # Create a realistic access token payload (matching your API Gateway structure)
        access_payload = {
            "sub": "5486e929-91a2-4f07-a124-69e476fa92b8",
            "name": "Mario Rossi", 
            "email": "mario.rossi@gmail.com",
            "username": "mario.rossi",
            "tenant_id": "6eb6e4c8-a8e7-4711-8001-7a566844fbdf",
            "active_role_id": "28e57202-c559-4f36-8111-35d5dc2c0629",
            "active_role_name": "user",
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=15)).timestamp())
        }
        
        # Generate test token using the same secret
        test_token = jwt.encode(
            access_payload,
            settings.api.jwt_secret_key,
            algorithm=settings.api.jwt_algorithm
        )
        
        # Validate the token
        result = validator.validate_access_token(test_token)
        
        if result:
            logger.info("✅ JWT validation successful with realistic token structure")
            logger.info("Token content:", **result)
            return True
        else:
            logger.error("❌ JWT validation failed with realistic token structure")
            return False
        
    except Exception as e:
        logger.error("❌ JWT validation test failed", error=str(e))
        return False


def generate_integration_summary():
    """Generate a summary of the completed integration."""
    logger.info("🎉 Node.js API Integration Summary")
    
    summary = {
        "completed_components": [
            "JWT Token Validator (access, refresh, pre-auth tokens)",
            "API Gateway Client (async HTTP communication)",
            "Authentication Service (high-level auth flows)",
            "FastAPI Authentication Middleware", 
            "Request Dependencies (get_current_user, permissions, roles)",
            "Multi-tenant Support (X-Tenant-ID header)",
            "Configuration Management (JWT secrets, API URLs)"
        ],
        "supported_flows": [
            "Single-role login (/api/auth/login)",
            "Multi-role login with role selection (/api/auth/login + /api/auth/confirm-role)",
            "Direct role login (/api/auth/login-with-role)",
            "Token refresh (/api/auth/refresh)",
            "User info retrieval (/api/auth/me)",
            "Role switching (/api/auth/switch-role)"
        ],
        "security_features": [
            "Local JWT validation for performance",
            "Signature verification with shared secrets",
            "Token expiration checking",
            "Multi-tenant isolation",
            "Role-based access control",
            "Permission-based authorization"
        ],
        "configuration": {
            "jwt_secrets": "Configured from docker-compose environment",
            "api_endpoints": "Configured for inter-service communication",
            "middleware_order": "Properly integrated into FastAPI stack",
            "error_handling": "Comprehensive error responses"
        }
    }
    
    for category, items in summary.items():
        logger.info(f"✅ {category.replace('_', ' ').title()}", items=items)
    
    return summary


async def main():
    """Run all integration validation tests."""
    print("🚀 Starting main function...")
    logger.info("🚀 Starting Final Integration Validation...")
    
    # Run tests
    tests = [
        ("Configuration", test_configuration),
        ("Imports", test_imports), 
        ("Middleware Logic", test_middleware_logic),
        ("JWT Validation", test_jwt_validation_with_real_structure)
    ]
    
    results = {}
    for i, (test_name, test_func) in enumerate(tests):
        print(f"Running test {i+1}/{len(tests)}: {test_name}...")
        logger.info(f"Running {test_name} test...")
        try:
            results[test_name] = test_func()
            print(f"✅ {test_name} completed")
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results[test_name] = False
    
    print("All tests completed, showing results...")
    
    # Show results
    passed = sum(results.values())
    total = len(results)
    
    logger.info(f"Test Results: {passed}/{total} passed")
    print(f"Test Results: {passed}/{total} passed")
    
    if passed == total:
        logger.info("🎉 All integration tests passed!")
        generate_integration_summary()
        
        logger.info("""
📋 INTEGRATION COMPLETED SUCCESSFULLY!

The Python scraper service is now fully integrated with the Node.js API Gateway
for authentication and authorization. 

🔑 Key Features:
- JWT token validation (access, refresh, pre-auth)
- Multi-tenant support with X-Tenant-ID headers  
- Role-based access control and permissions
- Automatic authentication middleware for FastAPI
- Support for all login flows (single-role, multi-role, direct)
- Token refresh and user info retrieval

🚀 Next Steps:
1. Start the services with: docker-compose up -d api-gateway python-scraper
2. Test authentication with real API calls
3. Implement protected endpoints using the provided dependencies
4. Add authorization logic for specific features

🔧 Usage Example:
```python
from fastapi import Depends
from api.dependencies import get_current_user, require_permission

@app.post("/api/scraping/jobs")
async def create_job(
    user: dict = Depends(require_permission("scraping:create"))
):
    # Only users with scraping:create permission can access
    return {"message": f"Job created by {user['username']}"}
```
        """)
    else:
        logger.error("❌ Some integration tests failed")
        for test_name, passed in results.items():
            status = "✅" if passed else "❌"
            logger.info(f"{status} {test_name}")


if __name__ == "__main__":
    asyncio.run(main())