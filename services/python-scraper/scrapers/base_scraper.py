"""
Base scraper class with common functionality for all scrapers.
"""

import asyncio
import logging
import random
import time
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Union
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, ValidationError

from .exceptions import (
    ScraperException, 
    RateLimitException, 
    ValidationException,
    NetworkException,
    ParsingException
)


class ScraperConfig(BaseModel):
    """Configuration model for scrapers."""
    
    # Rate limiting settings
    min_delay: float = 1.0  # Minimum delay between requests (seconds)
    max_delay: float = 3.0  # Maximum delay between requests (seconds)
    max_retries: int = 3    # Maximum number of retries for failed requests
    
    # Timeout settings
    request_timeout: int = 30  # Request timeout in seconds
    
    # User agent rotation
    rotate_user_agents: bool = True
    
    # Headers
    default_headers: Dict[str, str] = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    }


class BaseScraper(ABC):
    """
    Abstract base class for all scrapers.
    
    Provides common functionality including:
    - User-agent rotation
    - Rate limiting
    - Error handling
    - Data validation
    """
    
    def __init__(self, config: ScraperConfig = None):
        self.config = config or ScraperConfig()
        self.logger = logging.getLogger(self.__class__.__name__)
        self.session: Optional[httpx.AsyncClient] = None
        self.last_request_time = 0
        
        # User agents for rotation
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0"
        ]
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self._init_session()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self._close_session()
    
    async def _init_session(self) -> None:
        """Initialize HTTP session."""
        if self.session is None:
            self.session = httpx.AsyncClient(
                timeout=self.config.request_timeout,
                follow_redirects=True
            )
            self.logger.info("HTTP session initialized")
    
    async def _close_session(self) -> None:
        """Close HTTP session."""
        if self.session:
            await self.session.aclose()
            self.session = None
            self.logger.info("HTTP session closed")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers with optional user-agent rotation."""
        headers = self.config.default_headers.copy()
        
        if self.config.rotate_user_agents:
            headers["User-Agent"] = random.choice(self.user_agents)
        
        return headers
    
    async def _rate_limit(self) -> None:
        """Apply rate limiting between requests."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        delay = random.uniform(self.config.min_delay, self.config.max_delay)
        
        if time_since_last < delay:
            sleep_time = delay - time_since_last
            self.logger.debug(f"Rate limiting: sleeping for {sleep_time:.2f} seconds")
            await asyncio.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    async def _make_request(self, url: str, method: str = "GET", **kwargs) -> httpx.Response:
        """
        Make HTTP request with error handling and retries.
        
        Args:
            url: URL to request
            method: HTTP method
            **kwargs: Additional arguments for the request
            
        Returns:
            HTTP response
            
        Raises:
            NetworkException: When network request fails
            RateLimitException: When rate limited by server
        """
        if not self.session:
            await self._init_session()
        
        headers = kwargs.pop('headers', {})
        headers.update(self._get_headers())
        
        for attempt in range(self.config.max_retries + 1):
            try:
                await self._rate_limit()
                
                self.logger.debug(f"Making {method} request to {url} (attempt {attempt + 1})")
                
                response = await self.session.request(method, url, headers=headers, **kwargs)
                
                # Check for rate limiting
                if response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 60))
                    raise RateLimitException(
                        f"Rate limited by server", 
                        retry_after=retry_after,
                        details={"url": url, "status": response.status_code}
                    )
                
                # Check for other HTTP errors
                if response.status_code >= 400:
                    if attempt == self.config.max_retries:
                        raise NetworkException(
                            f"HTTP {response.status_code} error for {url}",
                            status_code=response.status_code,
                            details={"url": url, "method": method}
                        )
                    # Continue to retry
                    continue
                
                self.logger.debug(f"Successfully fetched {url} with status {response.status_code}")
                return response
                    
            except httpx.RequestError as e:
                if attempt == self.config.max_retries:
                    raise NetworkException(
                        f"Network error: {str(e)}",
                        details={"url": url, "method": method, "error": str(e)}
                    )
                
                self.logger.warning(f"Request failed (attempt {attempt + 1}): {str(e)}")
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
        
        raise NetworkException(f"Max retries exceeded for {url}")
    
    async def _fetch_page(self, url: str) -> BeautifulSoup:
        """
        Fetch and parse HTML page.
        
        Args:
            url: URL to fetch
            
        Returns:
            BeautifulSoup parsed HTML
            
        Raises:
            NetworkException: When request fails
            ParsingException: When HTML parsing fails
        """
        try:
            response = await self._make_request(url)
            html_content = response.text
            
            soup = BeautifulSoup(html_content, 'html.parser')
            self.logger.debug(f"Successfully parsed HTML from {url}")
            return soup
            
        except Exception as e:
            if isinstance(e, (NetworkException, RateLimitException)):
                raise
            
            raise ParsingException(
                f"Failed to parse HTML from {url}: {str(e)}",
                details={"url": url, "error": str(e)}
            )
    
    def _validate_data(self, data: Dict[str, Any], model_class: BaseModel) -> BaseModel:
        """
        Validate scraped data against Pydantic model.
        
        Args:
            data: Raw data to validate
            model_class: Pydantic model class for validation
            
        Returns:
            Validated model instance
            
        Raises:
            ValidationException: When validation fails
        """
        try:
            return model_class(**data)
        except ValidationError as e:
            raise ValidationException(
                f"Data validation failed: {str(e)}",
                details={"data": data, "errors": e.errors()}
            )
    
    def _extract_text(self, element, selector: str = None) -> Optional[str]:
        """
        Extract text from BeautifulSoup element with error handling.
        
        Args:
            element: BeautifulSoup element or result set
            selector: CSS selector (optional)
            
        Returns:
            Extracted text or None if not found
        """
        try:
            if selector:
                found = element.select_one(selector)
                if found:
                    return found.get_text(strip=True)
            elif element:
                return element.get_text(strip=True)
            return None
        except Exception as e:
            self.logger.warning(f"Failed to extract text with selector '{selector}': {str(e)}")
            return None
    
    def _extract_attribute(self, element, attr: str, selector: str = None) -> Optional[str]:
        """
        Extract attribute from BeautifulSoup element with error handling.
        
        Args:
            element: BeautifulSoup element
            attr: Attribute name
            selector: CSS selector (optional)
            
        Returns:
            Attribute value or None if not found
        """
        try:
            if selector:
                found = element.select_one(selector)
                if found:
                    return found.get(attr)
            elif element:
                return element.get(attr)
            return None
        except Exception as e:
            self.logger.warning(f"Failed to extract attribute '{attr}' with selector '{selector}': {str(e)}")
            return None
    
    def _clean_price(self, price_text: str) -> Optional[float]:
        """
        Clean and convert price text to float.
        
        Args:
            price_text: Raw price text
            
        Returns:
            Cleaned price as float or None if conversion fails
        """
        if not price_text:
            return None
        
        try:
            # Remove common price formatting
            cleaned = price_text.replace('€', '').replace(',', '').replace('.', '')
            cleaned = ''.join(filter(str.isdigit, cleaned))
            
            if cleaned:
                return float(cleaned)
        except (ValueError, TypeError):
            self.logger.warning(f"Failed to parse price: {price_text}")
        
        return None
    
    @abstractmethod
    async def scrape(self, *args, **kwargs) -> List[Dict[str, Any]]:
        """
        Main scraping method to be implemented by subclasses.
        
        Returns:
            List of scraped data dictionaries
        """
        pass
    
    @abstractmethod
    def get_scraper_name(self) -> str:
        """
        Get human-readable name of the scraper.
        
        Returns:
            Scraper name
        """
        pass
    
    @abstractmethod
    def get_supported_urls(self) -> List[str]:
        """
        Get list of URL patterns supported by this scraper.
        
        Returns:
            List of supported URL patterns
        """
        pass
