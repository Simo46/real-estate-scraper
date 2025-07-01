"""
Environment-specific configuration validation and utilities.

This module provides utilities for validating configuration in different
environments and ensures proper setup for development, staging, and production.
"""

import os
import sys
from typing import Dict, Any, List
from pathlib import Path

from .settings import get_settings, validate_settings, Settings


def load_env_file(env_file_path: str = None) -> bool:
    """
    Load environment variables from .env file.
    
    Args:
        env_file_path: Path to .env file. If None, looks for standard locations.
        
    Returns:
        bool: True if .env file was loaded successfully
    """
    try:
        from dotenv import load_dotenv
        
        if env_file_path:
            return load_dotenv(env_file_path)
        
        # Try standard locations
        possible_env_files = [
            ".env",
            ".env.local", 
            ".env.python-scraper",
            "config/.env.example"
        ]
        
        for env_file in possible_env_files:
            if os.path.exists(env_file):
                print(f"Loading environment from: {env_file}")
                return load_dotenv(env_file)
        
        print("No .env file found, using system environment variables")
        return True
        
    except ImportError:
        print("python-dotenv not installed, using system environment variables")
        return True


def check_required_environment_variables() -> List[str]:
    """
    Check for required environment variables.
    
    Returns:
        List[str]: List of missing required variables
    """
    required_vars = [
        "PYTHON_SCRAPER_MONGO_URL",
        "PYTHON_SCRAPER_REDIS_URL", 
        "PYTHON_SCRAPER_API_GATEWAY_URL"
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    return missing_vars


def validate_environment_setup() -> bool:
    """
    Comprehensive environment validation.
    
    Returns:
        bool: True if environment is properly configured
    """
    print("🔍 Validating environment setup...")
    
    # Load environment variables
    if not load_env_file():
        print("❌ Failed to load environment variables")
        return False
    
    # Check required variables
    missing_vars = check_required_environment_variables()
    if missing_vars:
        print(f"❌ Missing required environment variables: {missing_vars}")
        return False
    
    # Validate settings
    if not validate_settings():
        print("❌ Settings validation failed")
        return False
    
    # Environment-specific checks
    settings = get_settings()
    
    if settings.is_production():
        print("🏭 Production environment detected")
        if settings.debug:
            print("⚠️  WARNING: Debug mode enabled in production!")
        if settings.logging.level in ["DEBUG", "INFO"]:
            print("⚠️  WARNING: Verbose logging in production!")
    
    elif settings.is_development():
        print("🛠️  Development environment detected")
        if not settings.debug:
            print("💡 Consider enabling debug mode for development")
    
    elif settings.is_staging():
        print("🧪 Staging environment detected")
    
    print("✅ Environment validation completed successfully")
    return True


def get_configuration_summary() -> Dict[str, Any]:
    """
    Get a summary of current configuration.
    
    Returns:
        Dict containing configuration summary
    """
    settings = get_settings()
    
    return {
        "environment": settings.environment,
        "debug": settings.debug,
        "version": settings.version,
        "service_name": settings.service_name,
        "server": {
            "host": settings.server.host,
            "port": settings.server.port,
            "workers": settings.server.workers
        },
        "database": {
            "mongo_configured": bool(settings.database.mongo_url),
            "redis_configured": bool(settings.database.redis_url)
        },
        "api": {
            "gateway_configured": bool(settings.api.api_gateway_url),
            "jwt_verify_configured": bool(settings.api.jwt_verify_url)
        },
        "scraping": {
            "max_concurrent_jobs": settings.scraping.max_concurrent_jobs,
            "default_delay": settings.scraping.default_delay,
            "retry_attempts": settings.scraping.retry_attempts
        },
        "logging": {
            "level": settings.logging.level,
            "format": settings.logging.format
        }
    }


def setup_development_environment():
    """Setup development environment with optimal settings."""
    print("🛠️  Setting up development environment...")
    
    # Set development environment variables if not already set
    dev_vars = {
        "ENVIRONMENT": "development",
        "DEBUG": "true",
        "LOG_LEVEL": "DEBUG",
        "LOG_FORMAT": "text",  # More readable in development
        "PYTHON_SCRAPER_WORKERS": "1",  # Single worker for debugging
        "SCRAPER_MAX_CONCURRENT_JOBS": "3",  # Lower load for development
    }
    
    for var, value in dev_vars.items():
        if not os.getenv(var):
            os.environ[var] = value
            print(f"  Set {var}={value}")
    
    print("✅ Development environment setup completed")


def setup_production_environment():
    """Setup production environment with optimal settings."""
    print("🏭 Setting up production environment...")
    
    # Set production environment variables if not already set
    prod_vars = {
        "ENVIRONMENT": "production",
        "DEBUG": "false",
        "LOG_LEVEL": "WARNING",
        "LOG_FORMAT": "json",
        "LOG_LOG_SQL_QUERIES": "false",
        "PYTHON_SCRAPER_WORKERS": "4",
        "SCRAPER_MAX_CONCURRENT_JOBS": "10",
    }
    
    for var, value in prod_vars.items():
        if not os.getenv(var):
            os.environ[var] = value
            print(f"  Set {var}={value}")
    
    print("✅ Production environment setup completed")


def init_configuration(environment: str = None) -> Settings:
    """
    Initialize configuration for the specified environment.
    
    Args:
        environment: Target environment (development, staging, production)
        
    Returns:
        Settings: Configured settings instance
    """
    if environment:
        os.environ["ENVIRONMENT"] = environment
    
    # Setup environment-specific configurations
    current_env = os.getenv("ENVIRONMENT", "development")
    
    if current_env == "development":
        setup_development_environment()
    elif current_env == "production":
        setup_production_environment()
    
    # Validate environment
    if not validate_environment_setup():
        print("❌ Configuration initialization failed")
        sys.exit(1)
    
    settings = get_settings()
    print(f"✅ Configuration initialized for {settings.environment} environment")
    
    return settings


if __name__ == "__main__":
    """CLI for configuration management"""
    import json
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "validate":
            success = validate_environment_setup()
            sys.exit(0 if success else 1)
            
        elif command == "summary":
            summary = get_configuration_summary()
            print(json.dumps(summary, indent=2))
            
        elif command == "init":
            env = sys.argv[2] if len(sys.argv) > 2 else None
            init_configuration(env)
            
        else:
            print("Available commands: validate, summary, init [environment]")
            sys.exit(1)
    else:
        # Default: validate and show summary
        if validate_environment_setup():
            from .settings import print_settings_summary
            print_settings_summary()
