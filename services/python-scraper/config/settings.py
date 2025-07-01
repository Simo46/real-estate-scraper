"""
Configuration Management for Python Scraper Service

This module implements comprehensive configuration management using Pydantic
for validation and type safety. It handles environment variables, validation,
and provides different environment configurations.
"""

import os
from typing import Optional, List, Literal
from functools import lru_cache

from pydantic import Field, validator, AnyHttpUrl
from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    """Database connection settings"""
    
    # MongoDB Configuration
    mongo_url: str = Field(
        default="mongodb://admin:dev_secret_2024@mongodb:27017",
        description="MongoDB connection URL"
    )
    mongo_database: str = Field(
        default="real_estate_scraper",
        description="MongoDB database name"
    )
    mongo_max_pool_size: int = Field(
        default=10,
        description="MongoDB max connection pool size"
    )
    mongo_min_pool_size: int = Field(
        default=1,
        description="MongoDB min connection pool size"
    )
    
    # Redis Configuration
    redis_url: str = Field(
        default="redis://redis:6379/0",
        description="Redis connection URL"
    )
    redis_max_connections: int = Field(
        default=20,
        description="Redis max connections in pool"
    )
    redis_retry_on_timeout: bool = Field(
        default=True,
        description="Retry Redis operations on timeout"
    )

    class Config:
        env_prefix = "PYTHON_SCRAPER_"
        case_sensitive = False


class APISettings(BaseSettings):
    """API integration settings"""
    
    # Node.js API Gateway Integration
    api_gateway_url: AnyHttpUrl = Field(
        default="http://api-gateway:3000",
        description="API Gateway base URL"
    )
    jwt_verify_url: AnyHttpUrl = Field(
        default="http://api-gateway:3000/api/auth/verify",
        description="JWT token verification endpoint"
    )
    api_timeout: int = Field(
        default=30,
        description="API request timeout in seconds"
    )
    api_max_retries: int = Field(
        default=3,
        description="Max API request retries"
    )
    
    # JWT Configuration
    jwt_algorithm: str = Field(
        default="HS256",
        description="JWT algorithm"
    )
    jwt_secret_key: Optional[str] = Field(
        default=None,
        description="JWT secret key for local validation"
    )

    class Config:
        env_prefix = "PYTHON_SCRAPER_"
        case_sensitive = False


class ScrapingSettings(BaseSettings):
    """Scraping configuration settings"""
    
    max_concurrent_jobs: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum concurrent scraping jobs"
    )
    default_delay: int = Field(
        default=1000,
        ge=100,
        description="Default delay between requests in milliseconds"
    )
    user_agent_rotation: bool = Field(
        default=True,
        description="Enable user agent rotation"
    )
    retry_attempts: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Number of retry attempts for failed requests"
    )
    request_timeout: int = Field(
        default=30,
        ge=5,
        le=120,
        description="Request timeout in seconds"
    )
    
    # Rate limiting
    rate_limit_requests: int = Field(
        default=100,
        description="Requests per minute rate limit"
    )
    rate_limit_window: int = Field(
        default=60,
        description="Rate limit window in seconds"
    )

    class Config:
        env_prefix = "SCRAPER_"
        case_sensitive = False


class ServerSettings(BaseSettings):
    """Server configuration settings"""
    
    port: int = Field(
        default=8000,
        ge=1000,
        le=65535,
        description="Server port"
    )
    host: str = Field(
        default="0.0.0.0",
        description="Server host"
    )
    workers: int = Field(
        default=1,
        ge=1,
        le=8,
        description="Number of worker processes"
    )
    timeout: int = Field(
        default=300,
        ge=30,
        description="Worker timeout in seconds"
    )
    
    # CORS Configuration
    cors_origins: List[str] = Field(
        default=["*"],
        description="Allowed CORS origins"
    )
    cors_methods: List[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        description="Allowed CORS methods"
    )
    cors_headers: List[str] = Field(
        default=["*"],
        description="Allowed CORS headers"
    )

    class Config:
        env_prefix = "PYTHON_SCRAPER_"
        case_sensitive = False


class LoggingSettings(BaseSettings):
    """Logging configuration settings"""
    
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Logging level"
    )
    format: Literal["json", "text"] = Field(
        default="json",
        description="Log format"
    )
    enable_access_logs: bool = Field(
        default=True,
        description="Enable access logging"
    )
    log_sql_queries: bool = Field(
        default=False,
        description="Log SQL queries (debug mode)"
    )

    @validator('level', pre=True)
    def normalize_log_level(cls, v):
        """Normalize log level to uppercase"""
        if isinstance(v, str):
            return v.upper()
        return v

    @validator('format', pre=True)
    def normalize_log_format(cls, v):
        """Normalize log format to lowercase"""
        if isinstance(v, str):
            return v.lower()
        return v

    class Config:
        env_prefix = "LOG_"
        case_sensitive = False


class Settings(BaseSettings):
    """Main application settings"""
    
    # Environment Configuration
    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        description="Application environment"
    )
    debug: bool = Field(
        default=True,
        description="Debug mode"
    )
    version: str = Field(
        default="1.0.0",
        description="Application version"
    )
    
    # Service Identity
    service_name: str = Field(
        default="python-scraper",
        description="Service name"
    )
    service_description: str = Field(
        default="Real Estate Python Scraper Service",
        description="Service description"
    )
    
    # Nested Settings
    database: DatabaseSettings = DatabaseSettings()
    api: APISettings = APISettings()
    scraping: ScrapingSettings = ScrapingSettings()
    server: ServerSettings = ServerSettings()
    logging: LoggingSettings = LoggingSettings()

    @validator('environment', pre=True)
    def normalize_environment(cls, v):
        """Normalize environment to lowercase"""
        if isinstance(v, str):
            return v.lower()
        return v

    @validator('debug', pre=True, always=True)
    def set_debug_mode(cls, v, values):
        """Set debug mode based on environment"""
        environment = values.get('environment', 'development')
        if environment == 'production':
            return False
        return v

    @validator('logging', pre=True, always=True)
    def set_logging_level(cls, v, values):
        """Adjust logging level based on environment and debug mode"""
        if isinstance(v, dict):
            environment = values.get('environment', 'development')
            debug = values.get('debug', True)
            
            if environment == 'production':
                v.setdefault('level', 'WARNING')
                v.setdefault('log_sql_queries', False)
            elif debug:
                v.setdefault('level', 'DEBUG')
                v.setdefault('log_sql_queries', True)
            
            return LoggingSettings(**v)
        return v

    class Config:
        case_sensitive = False
        env_file = ".env"
        env_file_encoding = "utf-8"
        env_nested_delimiter = "__"
        
        # Field customization
        fields = {
            "environment": {"env": "ENVIRONMENT"},
            "debug": {"env": "DEBUG"},
            "version": {"env": "APP_VERSION"},
        }

    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.environment == "development"
    
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return self.environment == "production"
    
    def is_staging(self) -> bool:
        """Check if running in staging mode"""
        return self.environment == "staging"

    def get_database_url(self) -> str:
        """Get the complete database URL"""
        return self.database.mongo_url
    
    def get_redis_url(self) -> str:
        """Get the complete Redis URL"""
        return self.database.redis_url
    
    def get_api_gateway_url(self) -> str:
        """Get the API Gateway URL"""
        return str(self.api.api_gateway_url)


@lru_cache()
def get_settings() -> Settings:
    """
    Get application settings with caching.
    
    This function creates and caches the settings instance,
    ensuring configuration is loaded only once.
    """
    return Settings()


def validate_settings() -> bool:
    """
    Validate current settings configuration.
    
    Returns:
        bool: True if settings are valid, False otherwise
    """
    try:
        settings = get_settings()
        
        # Basic validation checks
        required_urls = [
            settings.get_database_url(),
            settings.get_redis_url(),
            settings.get_api_gateway_url()
        ]
        
        for url in required_urls:
            if not url or url == "":
                return False
        
        # Environment-specific validation
        if settings.is_production():
            if settings.debug:
                print("WARNING: Debug mode enabled in production")
            
            if settings.logging.level in ["DEBUG", "INFO"]:
                print("WARNING: Verbose logging in production")
        
        return True
        
    except Exception as e:
        print(f"Settings validation failed: {e}")
        return False


def print_settings_summary():
    """Print a summary of current settings (for debugging)"""
    settings = get_settings()
    
    print(f"""
=== Python Scraper Service Configuration ===
Environment: {settings.environment}
Debug Mode: {settings.debug}
Version: {settings.version}

Server:
  Host: {settings.server.host}
  Port: {settings.server.port}
  Workers: {settings.server.workers}

Database:
  MongoDB: {settings.database.mongo_url}
  Redis: {settings.database.redis_url}

API Integration:
  Gateway: {settings.api.api_gateway_url}
  JWT Verify: {settings.api.jwt_verify_url}

Scraping:
  Max Jobs: {settings.scraping.max_concurrent_jobs}
  Default Delay: {settings.scraping.default_delay}ms
  Retry Attempts: {settings.scraping.retry_attempts}

Logging:
  Level: {settings.logging.level}
  Format: {settings.logging.format}
============================================
""")


# Export the main settings function and class
__all__ = ["get_settings", "Settings", "validate_settings", "print_settings_summary"]