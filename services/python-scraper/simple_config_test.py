#!/usr/bin/env python3
"""
Simple test to check if configuration import works
"""

try:
    print("Testing basic import...")
    from config.settings import get_settings
    print("✅ Import successful!")
    
    print("Creating settings instance...")
    settings = get_settings()
    print("✅ Settings instance created!")
    
    print(f"Environment: {settings.environment}")
    print(f"Debug: {settings.debug}")
    print(f"Service: {settings.service_name}")
    print(f"Port: {settings.server.port}")
    
    print("🎉 Configuration working properly!")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
