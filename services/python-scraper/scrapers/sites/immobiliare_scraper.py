"""
Immobiliare.it specific scraper implementation.
Extends BaseScraper to handle the specific structure and patterns of immobiliare.it
"""

import re
import asyncio
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse, parse_qs
import logging

from ..base_scraper import BaseScraper, ScraperConfig
from ..models import (
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
from ..factory import register_scraper
from ..exceptions import ScraperException, ValidationException, ParsingException
from ..utils import clean_text, extract_price, parse_room_info, parse_area_info, normalize_url


@register_scraper("immobiliare")
class ImmobiliareScraper(BaseScraper):
    """
    Scraper specifically designed for immobiliare.it
    
    Handles:
    - Search result pages
    - Individual property pages
    - Data extraction and normalization
    - Rate limiting compliance
    """
    
    def __init__(self, config: ScraperConfig = None):
        super().__init__(config)
        self.base_url = "https://www.immobiliare.it"
        self.search_base = f"{self.base_url}/vendita-case"
        
        # Immobiliare.it specific selectors
        self.selectors = {
            # Search results page
            'property_cards': '.nd-list__item',
            'property_link': 'a.in-card__title',
            'property_title': '.in-card__title',
            'property_price': '.in-card__price',
            'property_location': '.in-card__location',
            'property_features': '.in-card__features',
            'property_surface': '.in-card__surface',
            'property_rooms': '.in-card__rooms',
            'property_image': '.in-card__image img',
            'pagination_next': '.in-pagination__next',
            
            # Individual property page
            'detail_title': 'h1.im-titleBlock__title',
            'detail_price': '.im-mainFeatures__price',
            'detail_location': '.im-titleBlock__location',
            'detail_description': '.im-description__text',
            'detail_features': '.im-features__list',
            'detail_surface': '.im-mainFeatures__item--surface',
            'detail_rooms': '.im-mainFeatures__item--rooms',
            'detail_bathrooms': '.im-mainFeatures__item--bathrooms',
            'detail_floor': '.im-mainFeatures__item--floor',
            'detail_condition': '.im-mainFeatures__item--condition',
            'detail_energy_class': '.im-mainFeatures__item--energy',
            'detail_images': '.im-gallery__thumb img',
            'detail_contact': '.im-contact__info',
            'detail_agency': '.im-contact__agency',
        }
        
        # Property type mapping from Italian to enum
        self.property_type_mapping = {
            'appartamento': PropertyType.APARTMENT,
            'casa': PropertyType.HOUSE,
            'villa': PropertyType.VILLA,
            'attico': PropertyType.PENTHOUSE,
            'loft': PropertyType.LOFT,
            'monolocale': PropertyType.STUDIO,
            'camera': PropertyType.ROOM,
            'ufficio': PropertyType.OFFICE,
            'negozio': PropertyType.COMMERCIAL,
            'box': PropertyType.GARAGE,
            'terreno': PropertyType.LAND,
        }
        
        # Property condition mapping
        self.condition_mapping = {
            'nuovo': PropertyCondition.NEW,
            'ottimo': PropertyCondition.EXCELLENT,
            'buono': PropertyCondition.GOOD,
            'da ristrutturare': PropertyCondition.TO_RENOVATE,
            'discreto': PropertyCondition.FAIR,
        }
    
    def get_scraper_name(self) -> str:
        """Return human-readable name of the scraper."""
        return "Immobiliare.it Scraper"
    
    def get_supported_urls(self) -> List[str]:
        """Return list of URL patterns supported by this scraper."""
        return [
            "immobiliare.it",
            "www.immobiliare.it"
        ]
    
    def build_search_url(self, 
                        city: str = None,
                        property_type: str = "case",
                        listing_type: str = "vendita",
                        min_price: int = None,
                        max_price: int = None,
                        min_surface: int = None,
                        max_surface: int = None,
                        rooms: int = None) -> str:
        """
        Build search URL for immobiliare.it based on search criteria.
        
        Args:
            city: City name to search in
            property_type: Type of property (case, appartamenti, ville, etc.)
            listing_type: vendita or affitto
            min_price: Minimum price filter
            max_price: Maximum price filter
            min_surface: Minimum surface area in sqm
            max_surface: Maximum surface area in sqm
            rooms: Number of rooms filter
            
        Returns:
            Formatted search URL
        """
        base_url = f"{self.base_url}/{listing_type}-{property_type}"
        
        if city:
            base_url += f"/{city.lower().replace(' ', '-')}"
        
        # Add query parameters for filters
        params = []
        if min_price:
            params.append(f"prezzoMinimo={min_price}")
        if max_price:
            params.append(f"prezzoMassimo={max_price}")
        if min_surface:
            params.append(f"superficieMinima={min_surface}")
        if max_surface:
            params.append(f"superficieMassima={max_surface}")
        if rooms:
            params.append(f"locali={rooms}")
        
        if params:
            base_url += "?" + "&".join(params)
        
        return base_url
    
    async def scrape(self, 
                    search_url: str = None,
                    city: str = None,
                    max_pages: int = 5,
                    detailed_scraping: bool = True,
                    **kwargs) -> ScrapingResult:
        """
        Main scraping method for immobiliare.it
        
        Args:
            search_url: Direct search URL to scrape
            city: City to search for properties
            max_pages: Maximum number of pages to scrape
            detailed_scraping: Whether to scrape individual property pages for more details
            **kwargs: Additional search criteria
            
        Returns:
            ScrapingResult with scraped properties
        """
        self.logger.info(f"Starting scraping with {self.get_scraper_name()}")
        
        result = ScrapingResult()
        start_time = asyncio.get_event_loop().time()
        
        try:
            # Build search URL if not provided
            if not search_url:
                if not city:
                    search_url = self.build_search_url(**kwargs)
                else:
                    search_url = self.build_search_url(city=city, **kwargs)
            
            self.logger.info(f"Scraping search URL: {search_url}")
            
            # Scrape search result pages
            page_num = 1
            current_url = search_url
            
            while page_num <= max_pages and current_url:
                self.logger.info(f"Scraping page {page_num}/{max_pages}")
                
                try:
                    page_properties = await self._scrape_search_page(current_url, detailed_scraping)
                    result.properties.extend(page_properties)
                    result.total_scraped += len(page_properties)
                    
                    # Get next page URL
                    current_url = await self._get_next_page_url(current_url)
                    page_num += 1
                    
                except Exception as e:
                    error_msg = f"Failed to scrape page {page_num}: {str(e)}"
                    self.logger.error(error_msg)
                    result.errors.append(error_msg)
                    break
            
            result.total_found = result.total_scraped  # For now, assume we scraped all found
            
        except Exception as e:
            error_msg = f"Scraping failed: {str(e)}"
            self.logger.error(error_msg)
            result.errors.append(error_msg)
        
        # Calculate duration
        end_time = asyncio.get_event_loop().time()
        result.scraping_duration = end_time - start_time
        
        self.logger.info(f"Completed scraping: {result.total_scraped} properties in {result.scraping_duration:.2f}s")
        return result
    
    async def _scrape_search_page(self, url: str, detailed_scraping: bool = True) -> List[RealEstateProperty]:
        """
        Scrape a single search results page.
        
        Args:
            url: URL of the search page
            detailed_scraping: Whether to fetch detailed info from individual property pages
            
        Returns:
            List of RealEstateProperty objects
        """
        soup = await self._fetch_page(url)
        properties = []
        
        # Find all property cards
        property_cards = soup.select(self.selectors['property_cards'])
        self.logger.debug(f"Found {len(property_cards)} property cards on page")
        
        for card in property_cards:
            try:
                if detailed_scraping:
                    # Get property URL and scrape detailed page
                    property_url = self._extract_property_url(card, url)
                    if property_url:
                        property_data = await self._scrape_property_detail(property_url)
                        if property_data:
                            properties.append(property_data)
                else:
                    # Extract basic info from search card
                    property_data = await self._extract_search_card_data(card, url)
                    if property_data:
                        properties.append(property_data)
                        
            except Exception as e:
                self.logger.warning(f"Failed to extract property from card: {str(e)}")
                continue
        
        return properties
    
    def _extract_property_url(self, card_element, base_url: str) -> Optional[str]:
        """Extract property detail URL from search card."""
        link_element = card_element.select_one(self.selectors['property_link'])
        if link_element:
            href = link_element.get('href')
            if href:
                return normalize_url(href, base_url)
        return None
    
    async def _scrape_property_detail(self, property_url: str) -> Optional[RealEstateProperty]:
        """
        Scrape detailed information from individual property page.
        
        Args:
            property_url: URL of the property detail page
            
        Returns:
            RealEstateProperty object or None if extraction fails
        """
        try:
            soup = await self._fetch_page(property_url)
            
            # Extract basic information
            title = self._extract_text(soup, self.selectors['detail_title'])
            if not title:
                raise ValidationException("Property title not found")
            
            # Extract price
            price_text = self._extract_text(soup, self.selectors['detail_price'])
            price_amount = extract_price(price_text)
            if not price_amount:
                raise ValidationException(f"Invalid price: {price_text}")
            
            # Extract location
            location_text = self._extract_text(soup, self.selectors['detail_location'])
            location = self._parse_location(location_text)
            
            # Extract description
            description = self._extract_text(soup, self.selectors['detail_description'])
            
            # Extract features
            features = self._extract_property_features(soup)
            
            # Extract images
            image_elements = soup.select(self.selectors['detail_images'])
            images = [normalize_url(img.get('src'), property_url) 
                     for img in image_elements if img.get('src')]
            
            # Extract contact info
            contact = self._extract_contact_info(soup)
            
            # Determine property and listing type
            property_type = self._determine_property_type(title, features)
            listing_type = self._determine_listing_type(property_url)
            
            # Build property object
            property_data = RealEstateProperty(
                title=title,
                description=description,
                property_type=property_type,
                listing_type=listing_type,
                
                location=location,
                features=features,
                
                price=PropertyPrice(
                    amount=price_amount,
                    currency="EUR"
                ),
                
                contact=contact,
                
                metadata=ScrapingMetadata(
                    source_url=property_url,
                    scraper_name=self.get_scraper_name(),
                    listing_url=property_url,
                    images=images,
                    listing_id=self._extract_listing_id(property_url)
                )
            )
            
            return property_data
            
        except Exception as e:
            self.logger.error(f"Failed to scrape property detail {property_url}: {str(e)}")
            return None
    
    async def _extract_search_card_data(self, card_element, base_url: str) -> Optional[RealEstateProperty]:
        """
        Extract basic property data from search result card.
        
        Args:
            card_element: BeautifulSoup element of the property card
            base_url: Base URL for resolving relative links
            
        Returns:
            RealEstateProperty object or None if extraction fails
        """
        try:
            # Extract basic info from card
            title = self._extract_text(card_element, self.selectors['property_title'])
            if not title:
                raise ValidationException("Property title not found")
            
            price_text = self._extract_text(card_element, self.selectors['property_price'])
            price_amount = extract_price(price_text)
            if not price_amount:
                raise ValidationException(f"Invalid price: {price_text}")
            
            location_text = self._extract_text(card_element, self.selectors['property_location'])
            location = self._parse_location(location_text)
            
            # Extract features from card
            surface_text = self._extract_text(card_element, self.selectors['property_surface'])
            rooms_text = self._extract_text(card_element, self.selectors['property_rooms'])
            
            features = PropertyFeatures()
            if surface_text:
                features.size_sqm = parse_area_info(surface_text)
            if rooms_text:
                room_info = parse_room_info(rooms_text)
                features.rooms = room_info.get('rooms')
            
            # Extract image
            image_element = card_element.select_one(self.selectors['property_image'])
            images = []
            if image_element:
                img_src = image_element.get('src')
                if img_src:
                    images.append(normalize_url(img_src, base_url))
            
            # Get property URL
            property_url = self._extract_property_url(card_element, base_url)
            
            # Determine types
            property_type = self._determine_property_type(title, features)
            listing_type = self._determine_listing_type(property_url or base_url)
            
            # Build property object
            property_data = RealEstateProperty(
                title=title,
                property_type=property_type,
                listing_type=listing_type,
                
                location=location,
                features=features,
                
                price=PropertyPrice(
                    amount=price_amount,
                    currency="EUR"
                ),
                
                metadata=ScrapingMetadata(
                    source_url=base_url,
                    scraper_name=self.get_scraper_name(),
                    listing_url=property_url,
                    images=images,
                    listing_id=self._extract_listing_id(property_url) if property_url else None
                )
            )
            
            return property_data
            
        except Exception as e:
            self.logger.warning(f"Failed to extract search card data: {str(e)}")
            return None
    
    def _parse_location(self, location_text: str) -> Location:
        """Parse location string into Location object."""
        if not location_text:
            return Location(city="Unknown", country="Italy")
        
        # Clean location text
        location_text = clean_text(location_text)
        
        # Split by common separators
        parts = re.split(r'[,\-\(\)]', location_text)
        parts = [part.strip() for part in parts if part.strip()]
        
        # Extract city (usually the first major part)
        city = parts[0] if parts else "Unknown"
        
        # Try to extract province/region
        province = None
        region = None
        
        for part in parts[1:]:
            # Look for province codes (2 letters in parentheses)
            if len(part) == 2 and part.isupper():
                province = part
            elif len(part) > 2:
                region = part
                break
        
        return Location(
            address=location_text,
            city=city,
            province=province,
            region=region,
            country="Italy"
        )
    
    def _extract_property_features(self, soup) -> PropertyFeatures:
        """Extract property features from detail page."""
        features = PropertyFeatures()
        
        # Extract surface area
        surface_text = self._extract_text(soup, self.selectors['detail_surface'])
        if surface_text:
            features.size_sqm = parse_area_info(surface_text)
        
        # Extract rooms
        rooms_text = self._extract_text(soup, self.selectors['detail_rooms'])
        if rooms_text:
            room_info = parse_room_info(rooms_text)
            features.rooms = room_info.get('rooms')
            features.bedrooms = room_info.get('bedrooms')
        
        # Extract bathrooms
        bathrooms_text = self._extract_text(soup, self.selectors['detail_bathrooms'])
        if bathrooms_text:
            bathrooms_info = parse_room_info(bathrooms_text)
            features.bathrooms = bathrooms_info.get('bathrooms')
        
        # Extract floor
        floor_text = self._extract_text(soup, self.selectors['detail_floor'])
        if floor_text:
            features.floor = clean_text(floor_text)
        
        # Extract condition
        condition_text = self._extract_text(soup, self.selectors['detail_condition'])
        if condition_text:
            condition_clean = clean_text(condition_text).lower()
            features.condition = self.condition_mapping.get(condition_clean, PropertyCondition.UNKNOWN)
        
        # Extract energy class
        energy_text = self._extract_text(soup, self.selectors['detail_energy_class'])
        if energy_text:
            features.energy_class = clean_text(energy_text)
        
        return features
    
    def _extract_contact_info(self, soup) -> Optional[PropertyContact]:
        """Extract contact information from property page."""
        contact_element = soup.select_one(self.selectors['detail_contact'])
        agency_element = soup.select_one(self.selectors['detail_agency'])
        
        if not contact_element and not agency_element:
            return None
        
        contact = PropertyContact()
        
        if agency_element:
            contact.agency_name = self._extract_text(agency_element)
        
        if contact_element:
            # Try to extract phone and other contact details
            contact_text = self._extract_text(contact_element)
            if contact_text:
                # Look for phone patterns
                phone_pattern = r'(\+?39[-.\s]?\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4})'
                phone_match = re.search(phone_pattern, contact_text)
                if phone_match:
                    contact.phone = phone_match.group(1)
        
        return contact
    
    def _determine_property_type(self, title: str, features: PropertyFeatures) -> PropertyType:
        """Determine property type from title and features."""
        title_lower = title.lower()
        
        for italian_type, enum_type in self.property_type_mapping.items():
            if italian_type in title_lower:
                return enum_type
        
        # Default to apartment if unclear
        return PropertyType.APARTMENT
    
    def _determine_listing_type(self, url: str) -> ListingType:
        """Determine listing type from URL."""
        if 'affitto' in url.lower():
            return ListingType.RENT
        else:
            return ListingType.SALE
    
    def _extract_listing_id(self, url: str) -> Optional[str]:
        """Extract listing ID from property URL."""
        if not url:
            return None
        
        # Look for ID patterns in URL
        id_patterns = [
            r'/annuncio-(\d+)',
            r'/(\d+)/?$',
            r'id=(\d+)'
        ]
        
        for pattern in id_patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None
    
    async def _get_next_page_url(self, current_url: str) -> Optional[str]:
        """Get URL of next page from current search page."""
        try:
            soup = await self._fetch_page(current_url)
            next_button = soup.select_one(self.selectors['pagination_next'])
            
            if next_button and not next_button.get('disabled'):
                next_href = next_button.get('href')
                if next_href:
                    return normalize_url(next_href, current_url)
            
        except Exception as e:
            self.logger.warning(f"Failed to get next page URL: {str(e)}")
        
        return None
