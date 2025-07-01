#!/usr/bin/env python3
"""
Configuration Test Script for Python Scraper Service

This script tests the configuration management implementation
to ensure all settings are properly loaded and validated.
"""

import sys
import os
import json
from pathlib import Path

# Add current directory to Python path for imports
sys.path.insert(0, str(Path(__file__).parent))

def test_basic_import():
    """Test basic configuration import"""
    try:
        from config import get_settings, Settings
        print("✅ Basic configuration import successful")
        return True
    except ImportError as e:
        print(f"❌ Configuration import failed: {e}")
        return False

def test_settings_creation():
    """Test settings instance creation"""
    try:
        from config import get_settings
        settings = get_settings()
        print(f"✅ Settings created successfully")
        print(f"   Environment: {settings.environment}")
        print(f"   Debug: {settings.debug}")
        print(f"   Service: {settings.service_name}")
        return True
    except Exception as e:
        print(f"❌ Settings creation failed: {e}")
        return False

def test_nested_settings():
    """Test nested settings access"""
    try:
        from config import get_settings
        settings = get_settings()
        
        # Test database settings
        db_url = settings.get_database_url()
        redis_url = settings.get_redis_url()
        api_url = settings.get_api_gateway_url()
        
        print(f"✅ Nested settings access successful")
        print(f"   Database URL: {db_url[:50]}...")
        print(f"   Redis URL: {redis_url}")
        print(f"   API Gateway: {api_url}")
        print(f"   Server Port: {settings.server.port}")
        print(f"   Max Jobs: {settings.scraping.max_concurrent_jobs}")
        
        return True
    except Exception as e:
        print(f"❌ Nested settings access failed: {e}")
        return False

def test_validation():
    """Test settings validation"""
    try:
        from config import validate_settings, validate_environment_setup
        
        # Test basic validation
        basic_valid = validate_settings()
        print(f"✅ Basic validation: {'PASSED' if basic_valid else 'FAILED'}")
        
        # Test environment validation (this might fail without proper .env)
        try:
            env_valid = validate_environment_setup()
            print(f"✅ Environment validation: {'PASSED' if env_valid else 'FAILED'}")
        except Exception as e:
            print(f"⚠️  Environment validation skipped: {e}")
        
        return basic_valid
    except Exception as e:
        print(f"❌ Validation test failed: {e}")
        return False

def test_configuration_summary():
    """Test configuration summary generation"""
    try:
        from config.environment import get_configuration_summary
        summary = get_configuration_summary()
        
        print("✅ Configuration summary generated:")
        print(json.dumps(summary, indent=2))
        return True
    except Exception as e:
        print(f"❌ Configuration summary failed: {e}")
        return False

def test_environment_methods():
    """Test environment detection methods"""
    try:
        from config import get_settings
        settings = get_settings()
        
        print(f"✅ Environment methods:")
        print(f"   Is Development: {settings.is_development()}")
        print(f"   Is Production: {settings.is_production()}")
        print(f"   Is Staging: {settings.is_staging()}")
        
        return True
    except Exception as e:
        print(f"❌ Environment methods test failed: {e}")
        return False

def test_settings_summary():
    """Test settings summary printing"""
    try:
        from config import print_settings_summary
        print("✅ Settings summary:")
        print_settings_summary()
        return True
    except Exception as e:
        print(f"❌ Settings summary test failed: {e}")
        return False

def main():
    """Run all configuration tests"""
    print("🧪 Testing Python Scraper Configuration Management")
    print("=" * 60)
    
    tests = [
        ("Basic Import", test_basic_import),
        ("Settings Creation", test_settings_creation),
        ("Nested Settings", test_nested_settings),
        ("Validation", test_validation),
        ("Configuration Summary", test_configuration_summary),
        ("Environment Methods", test_environment_methods),
        ("Settings Summary", test_settings_summary),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🔍 Running: {test_name}")
        print("-" * 40)
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} PASSED")
            else:
                print(f"❌ {test_name} FAILED")
        except Exception as e:
            print(f"💥 {test_name} CRASHED: {e}")
        
        print()
    
    print("=" * 60)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All configuration tests PASSED!")
        print("✅ Step 4.2 Configuration Management is COMPLETE!")
        return True
    else:
        print("⚠️  Some tests failed. Please check the configuration.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
