"""
Data models for scraped real estate properties.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, validator


class PropertyType(str, Enum):
    """Property type enumeration."""
    APARTMENT = "apartment"
    HOUSE = "house"
    VILLA = "villa"
    PENTHOUSE = "penthouse"
    LOFT = "loft"
    STUDIO = "studio"
    ROOM = "room"
    COMMERCIAL = "commercial"
    OFFICE = "office"
    GARAGE = "garage"
    LAND = "land"
    OTHER = "other"


class ListingType(str, Enum):
    """Listing type enumeration."""
    SALE = "sale"
    RENT = "rent"


class PropertyCondition(str, Enum):
    """Property condition enumeration."""
    NEW = "new"
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    TO_RENOVATE = "to_renovate"
    UNKNOWN = "unknown"


class Location(BaseModel):
    """Location information for a property."""
    
    address: Optional[str] = None
    city: str
    province: Optional[str] = None
    region: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = "Italy"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    neighborhood: Optional[str] = None


class PropertyFeatures(BaseModel):
    """Property features and amenities."""
    
    # Basic features
    rooms: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    floor: Optional[str] = None
    total_floors: Optional[int] = None
    
    # Areas (in square meters)
    size_sqm: Optional[float] = None
    garden_sqm: Optional[float] = None
    terrace_sqm: Optional[float] = None
    balcony_sqm: Optional[float] = None
    
    # Property details
    condition: Optional[PropertyCondition] = None
    year_built: Optional[int] = None
    energy_class: Optional[str] = None
    heating_type: Optional[str] = None
    
    # Amenities (boolean flags)
    has_elevator: Optional[bool] = None
    has_parking: Optional[bool] = None
    has_garage: Optional[bool] = None
    has_garden: Optional[bool] = None
    has_terrace: Optional[bool] = None
    has_balcony: Optional[bool] = None
    has_fireplace: Optional[bool] = None
    has_air_conditioning: Optional[bool] = None
    has_alarm: Optional[bool] = None
    furnished: Optional[bool] = None
    
    # Additional features
    pets_allowed: Optional[bool] = None
    smoking_allowed: Optional[bool] = None


class PropertyPrice(BaseModel):
    """Price information for a property."""
    
    amount: float = Field(gt=0, description="Price amount")
    currency: str = Field(default="EUR", description="Price currency")
    price_per_sqm: Optional[float] = None
    
    # Additional costs
    condominium_fees: Optional[float] = None
    utilities_included: Optional[bool] = None
    deposit_required: Optional[float] = None
    agency_fees: Optional[float] = None
    
    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Price amount must be greater than 0')
        return v


class PropertyContact(BaseModel):
    """Contact information for a property listing."""
    
    agency_name: Optional[str] = None
    agent_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None


class ScrapingMetadata(BaseModel):
    """Metadata about the scraping process."""
    
    source_url: str
    scraper_name: str
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    listing_id: Optional[str] = None  # ID from the source website
    listing_url: Optional[str] = None  # Direct URL to the listing
    images: List[str] = Field(default_factory=list)  # URLs of property images
    raw_data: Optional[Dict[str, Any]] = None  # Raw scraped data for debugging


class RealEstateProperty(BaseModel):
    """Complete real estate property model."""
    
    # Basic information
    title: str
    description: Optional[str] = None
    property_type: PropertyType
    listing_type: ListingType
    
    # Location and features
    location: Location
    features: PropertyFeatures
    price: PropertyPrice
    contact: Optional[PropertyContact] = None
    
    # Metadata
    metadata: ScrapingMetadata
    
    # Validation timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    
    @validator('title')
    def validate_title(cls, v):
        if not v or not v.strip():
            raise ValueError('Title cannot be empty')
        return v.strip()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage."""
        return self.dict(by_alias=True, exclude_none=True)
    
    def get_unique_id(self) -> str:
        """Generate unique ID for deduplication."""
        # Use source URL + listing ID if available, otherwise use title + location
        if self.metadata.listing_id:
            return f"{self.metadata.scraper_name}_{self.metadata.listing_id}"
        else:
            return f"{self.metadata.scraper_name}_{hash(self.title + str(self.location.dict()))}"


class ScrapingResult(BaseModel):
    """Result of a scraping operation."""
    
    properties: List[RealEstateProperty] = Field(default_factory=list)
    total_found: int = 0
    total_scraped: int = 0
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    scraping_duration: Optional[float] = None  # Duration in seconds
    
    @validator('total_scraped')
    def validate_scraped_count(cls, v, values):
        if 'properties' in values and len(values['properties']) != v:
            raise ValueError('total_scraped must match the number of properties')
        return v
