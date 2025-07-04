#!/usr/bin/env python3
"""
Debug version of test_final_integration.py to identify the blocking issue
"""

import asyncio
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

print("🔍 Starting debug test...")

try:
    import structlog
    print("✅ structlog imported")
    
    from config.settings import get_settings
    print("✅ settings imported")
    
    # Configure logging with simple setup
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.JSONRenderer()
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    print("✅ structlog configured")
    
    logger = structlog.get_logger(__name__)
    print("✅ logger created")
    
    def test_configuration():
        """Test configuration loading"""
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
            
            # Check API URLs
            api_config = {
                "gateway_url": str(settings.api.api_gateway_url),
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
        """Test module imports"""
        print("🧪 Running imports test...")
        logger.info("Testing module imports...")
        
        try:
            print("  - Testing JWT Validator...")
            from core.integration.jwt_validator import JWTValidator
            validator = JWTValidator()
            logger.info("✅ JWTValidator imported and initialized")
            
            print("  - Testing API Client...")
            from core.integration.api_client import APIGatewayClient
            logger.info("✅ APIGatewayClient imported")
            
            print("  - Testing Auth Service...")
            from core.integration.auth_service import AuthService
            logger.info("✅ AuthService imported")
            
            print("  - Testing Middleware...")
            from middleware.auth_middleware import AuthMiddleware
            logger.info("✅ AuthMiddleware imported")
            
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
    
    async def debug_main():
        """Debug main function"""
        print("🚀 Starting debug main...")
        logger.info("🚀 Starting debug integration validation...")
        
        # Run tests
        tests = [
            ("Configuration", test_configuration),
            ("Imports", test_imports)
        ]
        
        results = {}
        for test_name, test_func in tests:
            print(f"Running {test_name} test...")
            logger.info(f"Running {test_name} test...")
            try:
                results[test_name] = test_func()
                print(f"✅ {test_name} test completed")
            except Exception as e:
                print(f"❌ {test_name} test failed: {e}")
                results[test_name] = False
        
        # Show results
        passed = sum(results.values())
        total = len(results)
        
        print(f"Test Results: {passed}/{total} passed")
        logger.info(f"Test Results: {passed}/{total} passed")
        
        if passed == total:
            print("🎉 All tests passed!")
            logger.info("🎉 All tests passed!")
        else:
            print("❌ Some tests failed")
            logger.error("❌ Some tests failed")
            for test_name, passed in results.items():
                status = "✅" if passed else "❌"
                print(f"  {status} {test_name}")
        
        return passed == total
    
    print("Running synchronous tests first...")
    
    # Test sync functions first
    config_result = test_configuration()
    import_result = test_imports()
    
    if config_result and import_result:
        print("✅ Synchronous tests passed, now testing async...")
        
        # Now test async
        result = asyncio.run(debug_main())
        print(f"Final result: {result}")
    else:
        print("❌ Synchronous tests failed")

except Exception as e:
    print(f"❌ Debug test failed: {e}")
    import traceback
    traceback.print_exc()
