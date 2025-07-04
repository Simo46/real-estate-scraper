"""
Configuration package initialization.

This package provides comprehensive configuration management for the
Python Scraper Service using Pydantic for validation and type safety.
"""

from .settings import (
    get_settings, 
    Settings,
    validate_settings,
    print_settings_summary,
    DatabaseSettings,
    APISettings,
    ScrapingSettings,
    ServerSettings,
    LoggingSettings
)

from .environment import (
    load_env_file,
    check_required_environment_variables,
    validate_environment_setup,
    get_configuration_summary,
    setup_development_environment,
    setup_production_environment,
    init_configuration
)

__all__ = [
    # Settings module
    "get_settings", 
    "Settings",
    "validate_settings",
    "print_settings_summary",
    "DatabaseSettings",
    "APISettings", 
    "ScrapingSettings",
    "ServerSettings",
    "LoggingSettings",
    
    # Environment module  
    "load_env_file",
    "check_required_environment_variables",
    "validate_environment_setup",
    "get_configuration_summary",
    "setup_development_environment",
    "setup_production_environment",
    "init_configuration"
]
