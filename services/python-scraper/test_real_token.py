#!/usr/bin/env python3
"""
Real Token Test - Test with actual JWT tokens from API Gateway

Run this after getting a real token from the API Gateway login endpoint.
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

print("🔍 Starting Real Token Test...")

import structlog
from core.integration.jwt_validator import get_jwt_validator
from core.integration.auth_service import get_auth_service

# Configure logging
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


async def test_real_token():
    """Test with a real JWT token from API Gateway."""
    
    # PASTE YOUR REAL TOKEN HERE (from Postman/curl response)
    real_token = input("Enter your real access token from API Gateway: ").strip()
    
    if not real_token:
        logger.error("No token provided")
        return False
    
    logger.info("Testing real token from API Gateway...")
    
    # Test JWT validation
    validator = get_jwt_validator()
    user_info = validator.validate_access_token(real_token)
    
    if user_info:
        logger.info("✅ Real token validation successful!", **user_info)
        
        # Test auth service
        auth_service = get_auth_service()
        authenticated_user = await auth_service.authenticate_token(
            real_token,
            tenant_id=user_info.get("tenant_id"),
            verify_with_backend=False  # Start with local validation
        )
        
        if authenticated_user:
            logger.info("✅ Auth service authentication successful!")
            logger.info("User details:", **authenticated_user.to_dict())
            return True
        else:
            logger.error("❌ Auth service authentication failed")
            return False
    else:
        logger.error("❌ Real token validation failed")
        
        # Show token info for debugging
        token_info = validator.get_token_info(real_token)
        logger.info("Token debug info:", **token_info)
        return False


async def test_full_flow():
    """Test complete authentication flow with real credentials."""
    
    print("Testing complete login flow with real credentials...")
    
    username = input("Enter username (e.g., mario.rossi): ").strip()
    password = input("Enter password: ").strip()
    tenant_id = input("Enter tenant ID (e.g., 6eb6e4c8-a8e7-4711-8001-7a566844fbdf): ").strip()
    
    if not all([username, password, tenant_id]):
        logger.error("Missing required fields")
        return False
    
    auth_service = get_auth_service()
    
    try:
        authenticated_user, additional_data = await auth_service.authenticate_credentials(
            username=username,
            password=password,
            tenant_id=tenant_id
        )
        
        if authenticated_user:
            logger.info("✅ Login successful!")
            logger.info("User authenticated:", **authenticated_user.to_dict())
            
            # Test token validation
            validator = get_jwt_validator()
            token_validation = validator.validate_access_token(authenticated_user.access_token)
            
            if token_validation:
                logger.info("✅ Token validation successful after login!")
                return True
            else:
                logger.error("❌ Token validation failed after successful login")
                return False
                
        elif additional_data and additional_data.get("requires_role_selection"):
            logger.info("⚠️ Multi-role user - role selection required")
            logger.info("Available roles:", available_roles=additional_data.get("available_roles"))
            
            # For testing, select the first available role
            available_roles = additional_data.get("available_roles", [])
            if available_roles:
                selected_role_id = available_roles[0]["id"]
                logger.info(f"Selecting first role: {selected_role_id}")
                
                confirmed_user = await auth_service.confirm_role_selection(
                    pre_auth_token=additional_data["pre_auth_token"],
                    role_id=selected_role_id,
                    tenant_id=tenant_id
                )
                
                if confirmed_user:
                    logger.info("✅ Role confirmation successful!")
                    logger.info("User authenticated:", **confirmed_user.to_dict())
                    return True
                else:
                    logger.error("❌ Role confirmation failed")
                    return False
            else:
                logger.error("❌ No available roles found")
                return False
        else:
            logger.error("❌ Login failed")
            return False
            
    except Exception as e:
        logger.error("❌ Login flow error", error=str(e))
        return False


async def main():
    """Main test function."""
    
    print("🚀 Real Token Integration Test")
    print("Choose test type:")
    print("1. Test with existing token from Postman/curl")
    print("2. Test complete login flow with credentials")
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        success = await test_real_token()
    elif choice == "2":
        success = await test_full_flow()
    else:
        print("Invalid choice")
        return
    
    if success:
        print("\n🎉 Real token test completed successfully!")
        print("Your Python scraper integration with Node.js API Gateway is working!")
    else:
        print("\n❌ Real token test failed")
        print("Check the logs above for details")


if __name__ == "__main__":
    asyncio.run(main())
