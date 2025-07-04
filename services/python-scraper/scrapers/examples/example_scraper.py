"""
Example implementation of a concrete scraper using the base architecture.
This serves as a template for implementing specific scrapers.
"""

from typing import List, Dict, Any
import logging

from ..base_scraper import BaseScraper, ScraperConfig
from ..models import (
    RealEstateProperty, 
    PropertyType, 
    ListingType, 
    Location, 
    PropertyFeatures, 
    PropertyPrice, 
    ScrapingMetadata,
    ScrapingResult
)
from ..factory import register_scraper
from ..exceptions import ScraperException, ValidationException


@register_scraper("example")
class ExampleScraper(BaseScraper):
    """
    Example scraper implementation demonstrating the base architecture.
    
    This is a template that shows how to:
    - Extend BaseScraper
    - Use the common functionality
    - Handle errors properly
    - Return standardized data models
    """
    
    def __init__(self, config: ScraperConfig = None):
        super().__init__(config)
        self.base_url = "https://example-real-estate.com"
    
    def get_scraper_name(self) -> str:
        """Return human-readable name of the scraper."""
        return "Example Real Estate Scraper"
    
    def get_supported_urls(self) -> List[str]:
        """Return list of URL patterns supported by this scraper."""
        return [
            "example-real-estate.com",
            "www.example-real-estate.com"
        ]
    
    async def scrape(self, search_url: str = None, **kwargs) -> ScrapingResult:
        """
        Main scraping method.
        
        Args:
            search_url: URL to scrape (optional, defaults to base URL)
            **kwargs: Additional parameters
            
        Returns:
            ScrapingResult with scraped properties
        """
        self.logger.info(f"Starting scraping with {self.get_scraper_name()}")
        
        # Initialize result
        result = ScrapingResult()
        
        try:
            # Use provided URL or default
            url = search_url or f"{self.base_url}/search"
            
            # Fetch the main page
            soup = await self._fetch_page(url)
            
            # Extract property listings from the page
            property_elements = soup.select('.property-listing')  # Example selector
            result.total_found = len(property_elements)
            
            self.logger.info(f"Found {result.total_found} property listings")
            
            # Process each property
            for element in property_elements:
                try:
                    property_data = await self._extract_property_data(element, url)
                    if property_data:
                        result.properties.append(property_data)
                        result.total_scraped += 1
                
                except Exception as e:
                    error_msg = f"Failed to extract property: {str(e)}"
                    self.logger.warning(error_msg)
                    result.errors.append(error_msg)
            
            self.logger.info(f"Successfully scraped {result.total_scraped} properties")
            
        except Exception as e:
            error_msg = f"Scraping failed: {str(e)}"
            self.logger.error(error_msg)
            result.errors.append(error_msg)
        
        return result
    
    async def _extract_property_data(self, element, base_url: str) -> RealEstateProperty:
        """
        Extract property data from a single listing element.
        
        Args:
            element: BeautifulSoup element containing property data
            base_url: Base URL for resolving relative links
            
        Returns:
            RealEstateProperty instance
            
        Raises:
            ValidationException: When data validation fails
        """
        try:
            # Extract basic information using the helper methods from BaseScraper
            title = self._extract_text(element, '.property-title')
            if not title:
                raise ValidationException("Property title not found")
            
            description = self._extract_text(element, '.property-description')
            
            # Extract price
            price_text = self._extract_text(element, '.property-price')
            price_amount = self._clean_price(price_text)
            if not price_amount:
                raise ValidationException(f"Invalid price: {price_text}")
            
            # Extract location
            city = self._extract_text(element, '.property-city') or "Unknown"
            address = self._extract_text(element, '.property-address')
            
            # Extract features
            rooms_text = self._extract_text(element, '.property-rooms')
            rooms = int(rooms_text.split()[0]) if rooms_text and rooms_text.split()[0].isdigit() else None
            
            size_text = self._extract_text(element, '.property-size')
            size_sqm = float(size_text.replace('m²', '').strip()) if size_text else None
            
            # Extract images
            image_elements = element.select('.property-image img')
            images = [img.get('src') for img in image_elements if img.get('src')]
            
            # Extract listing URL
            listing_link = element.select_one('.property-link')
            listing_url = listing_link.get('href') if listing_link else None
            if listing_url and not listing_url.startswith('http'):
                from urllib.parse import urljoin
                listing_url = urljoin(base_url, listing_url)
            
            # Build the property model
            property_data = RealEstateProperty(
                title=title,
                description=description,
                property_type=PropertyType.APARTMENT,  # Default, could be extracted
                listing_type=ListingType.SALE,  # Default, could be extracted
                
                location=Location(
                    address=address,
                    city=city,
                    country="Italy"
                ),
                
                features=PropertyFeatures(
                    rooms=rooms,
                    size_sqm=size_sqm
                ),
                
                price=PropertyPrice(
                    amount=price_amount,
                    currency="EUR"
                ),
                
                metadata=ScrapingMetadata(
                    source_url=base_url,
                    scraper_name=self.get_scraper_name(),
                    listing_url=listing_url,
                    images=images
                )
            )
            
            # Validate the model (this will raise ValidationException if invalid)
            return property_data
            
        except ValidationException:
            raise  # Re-raise validation exceptions
        except Exception as e:
            raise ValidationException(f"Data extraction failed: {str(e)}")


# Example of how to use the scraper
async def example_usage():
    """Example of how to use the scraper."""
    
    # Create scraper with custom configuration
    config = ScraperConfig(
        min_delay=2.0,
        max_delay=5.0,
        max_retries=3
    )
    
    # Use the scraper within async context manager
    async with ExampleScraper(config) as scraper:
        # Scrape properties
        result = await scraper.scrape("https://example-real-estate.com/search")
        
        # Process results
        print(f"Found {result.total_found} properties, scraped {result.total_scraped}")
        
        for property_data in result.properties:
            print(f"- {property_data.title}: €{property_data.price.amount}")
        
        if result.errors:
            print(f"Errors encountered: {result.errors}")


if __name__ == "__main__":
    import asyncio
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    
    # Run example
    asyncio.run(example_usage())
