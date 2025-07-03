"""
Scrapers module initialization.
Contains base scraper architecture and common functionality.
"""

from .base_scraper import BaseScraper, ScraperConfig
from .exceptions import (
    ScraperException, 
    RateLimitException, 
    ValidationException,
    NetworkException,
    ParsingException
)
from .models import (
    RealEstateProperty,
    PropertyType,
    ListingType,
    PropertyCondition,
    Location,
    PropertyFeatures,
    PropertyPrice,
    PropertyContact,
    ScrapingMetadata,
    ScrapingResult
)
from .factory import ScraperFactory, scraper_factory, register_scraper

__all__ = [
    # Base classes
    'BaseScraper',
    'ScraperConfig',
    
    # Exceptions
    'ScraperException', 
    'RateLimitException',
    'ValidationException',
    'NetworkException',
    'ParsingException',
    
    # Data models
    'RealEstateProperty',
    'PropertyType',
    'ListingType',
    'PropertyCondition',
    'Location',
    'PropertyFeatures',
    'PropertyPrice',
    'PropertyContact',
    'ScrapingMetadata',
    'ScrapingResult',
    
    # Factory
    'ScraperFactory',
    'scraper_factory',
    'register_scraper'
]
