"""
Scraper factory for managing different scraper implementations.
"""

from typing import Dict, Type, List, Optional
from urllib.parse import urlparse
import logging

from .base_scraper import BaseScraper, ScraperConfig
from .exceptions import ScraperException


class ScraperFactory:
    """Factory class for creating and managing scrapers."""
    
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self._scrapers: Dict[str, Type[BaseScraper]] = {}
        self._url_patterns: Dict[str, str] = {}  # URL pattern -> scraper name
    
    def register_scraper(self, name: str, scraper_class: Type[BaseScraper]) -> None:
        """
        Register a scraper class.
        
        Args:
            name: Unique name for the scraper
            scraper_class: Scraper class that inherits from BaseScraper
        """
        if not issubclass(scraper_class, BaseScraper):
            raise ValueError(f"Scraper class must inherit from BaseScraper")
        
        self._scrapers[name] = scraper_class
        
        # Register URL patterns for automatic detection
        try:
            # Create temporary instance to get supported URLs
            temp_instance = scraper_class()
            supported_urls = temp_instance.get_supported_urls()
            
            for pattern in supported_urls:
                self._url_patterns[pattern] = name
                
            self.logger.info(f"Registered scraper '{name}' with {len(supported_urls)} URL patterns")
            
        except Exception as e:
            self.logger.warning(f"Could not register URL patterns for '{name}': {str(e)}")
    
    def get_scraper(self, name: str, config: ScraperConfig = None) -> BaseScraper:
        """
        Create scraper instance by name.
        
        Args:
            name: Name of the scraper
            config: Optional scraper configuration
            
        Returns:
            Scraper instance
            
        Raises:
            ScraperException: When scraper not found
        """
        if name not in self._scrapers:
            available = list(self._scrapers.keys())
            raise ScraperException(
                f"Scraper '{name}' not found. Available scrapers: {available}"
            )
        
        scraper_class = self._scrapers[name]
        return scraper_class(config)
    
    def get_scraper_for_url(self, url: str, config: ScraperConfig = None) -> Optional[BaseScraper]:
        """
        Get appropriate scraper for a given URL.
        
        Args:
            url: URL to scrape
            config: Optional scraper configuration
            
        Returns:
            Scraper instance or None if no suitable scraper found
        """
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.lower()
        
        # Look for exact domain matches first
        for pattern, scraper_name in self._url_patterns.items():
            if domain in pattern.lower() or pattern.lower() in domain:
                self.logger.info(f"Found scraper '{scraper_name}' for URL: {url}")
                return self.get_scraper(scraper_name, config)
        
        self.logger.warning(f"No scraper found for URL: {url}")
        return None
    
    def list_scrapers(self) -> List[str]:
        """
        Get list of registered scraper names.
        
        Returns:
            List of scraper names
        """
        return list(self._scrapers.keys())
    
    def get_supported_domains(self) -> List[str]:
        """
        Get list of all supported domains/patterns.
        
        Returns:
            List of supported URL patterns
        """
        return list(self._url_patterns.keys())
    
    def is_url_supported(self, url: str) -> bool:
        """
        Check if a URL is supported by any registered scraper.
        
        Args:
            url: URL to check
            
        Returns:
            True if URL is supported, False otherwise
        """
        return self.get_scraper_for_url(url) is not None


# Global scraper factory instance
scraper_factory = ScraperFactory()


def register_scraper(name: str):
    """
    Decorator for registering scrapers.
    
    Usage:
        @register_scraper("immobiliare")
        class ImmobiliareScraper(BaseScraper):
            ...
    """
    def decorator(scraper_class: Type[BaseScraper]):
        scraper_factory.register_scraper(name, scraper_class)
        return scraper_class
    return decorator
