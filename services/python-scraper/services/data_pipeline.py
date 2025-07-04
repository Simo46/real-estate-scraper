"""
Data pipeline for mapping scraped properties to Node.js SearchResult format.

This module handles the transformation of scraped real estate data into the format
expected by the Node.js backend, ensuring compliance with the "Personal Real Estate Assistant"
architecture (metadata-only, no copyright violation).
"""

import re
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from decimal import Decimal, ROUND_HALF_UP

from scrapers.models import RealEstateProperty, PropertyType, ListingType, PropertyCondition
from scrapers.utils import clean_text, extract_price


class SearchResultMapper:
    """Maps scraped property data to SearchResult format for Node.js backend."""
    
    # Platform mapping for source_platform enum
    PLATFORM_MAPPING = {
        'immobiliare': 'immobiliare.it',
        'immobiliare_it': 'immobiliare.it',
        'casa': 'casa.it',
        'casa_it': 'casa.it',
        'idealista': 'idealista.it',
        'idealista_it': 'idealista.it',
        'subito': 'subito.it',
        'subito_it': 'subito.it'
    }
    
    def __init__(self):
        self.location_normalizer = LocationNormalizer()
        self.price_normalizer = PriceNormalizer()
        self.quality_assessor = QualityAssessor()
        
    def map_to_search_result(
        self, 
        scraped_property: RealEstateProperty, 
        search_execution_id: str,
        tenant_id: str,
        saved_search_id: str,
        search_criteria: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Transform RealEstateProperty to SearchResult format.
        
        Args:
            scraped_property: The scraped property data
            search_execution_id: ID of the search execution
            tenant_id: Tenant ID for multi-tenancy
            saved_search_id: ID of the saved search
            search_criteria: Original search criteria for relevance scoring
            
        Returns:
            dict: SearchResult format compatible with Node.js model
        """
        
        # Extract and normalize basic data
        normalized_location = self.location_normalizer.normalize_location(
            scraped_property.location.city,
            scraped_property.location.province,
            scraped_property.location.address
        )
        
        normalized_price = self.price_normalizer.normalize_price(
            scraped_property.price.amount,
            scraped_property.price.currency
        )
        
        # Calculate relevance score
        relevance_score = self._calculate_relevance_score(
            scraped_property, 
            search_criteria or {}
        )
        
        # Generate AI insights
        ai_insights = self.quality_assessor.generate_insights(scraped_property)
        
        # Extract external ID from metadata
        external_id = self._extract_external_id(scraped_property)
        
        # Map source platform
        source_platform = self._map_source_platform(
            scraped_property.metadata.scraper_name
        )
        
        return {
            'id': str(uuid.uuid4()),
            'tenant_id': tenant_id,
            'saved_search_id': saved_search_id,
            'search_execution_id': search_execution_id,
            
            # External reference (no copyright violation)
            'external_url': scraped_property.metadata.source_url,
            'source_platform': source_platform,
            'external_id': external_id,
            
            # Basic metadata for filtering/sorting (minimal info)
            'basic_title': self._create_basic_title(scraped_property),
            'basic_price': normalized_price,
            'basic_location': normalized_location,
            
            # AI analysis (our value-add)
            'relevance_score': relevance_score,
            'ai_insights': ai_insights,
            'ai_summary': self._generate_ai_summary(scraped_property),
            'ai_recommendation': self._generate_ai_recommendation(
                scraped_property, 
                relevance_score,
                search_criteria
            ),
            'ai_processed_at': datetime.utcnow().isoformat(),
            
            # Tracking
            'is_new_result': True,  # Will be updated by deduplication system
            'found_at': datetime.utcnow().isoformat(),
            'last_seen_at': datetime.utcnow().isoformat(),
            'status': 'active'
        }
    
    def _calculate_relevance_score(
        self, 
        property_data: RealEstateProperty, 
        search_criteria: Dict[str, Any]
    ) -> float:
        """Calculate relevance score based on how well property matches search criteria."""
        
        if not search_criteria:
            return 0.5  # Default middle score when no criteria
            
        score = 0.0
        max_score = 0.0
        
        # Location matching (weight: 30%)
        max_score += 30
        if 'location' in search_criteria:
            location_score = self._calculate_location_score(
                property_data.location, 
                search_criteria['location']
            )
            score += location_score * 30
        else:
            score += 15  # Partial score if no location specified
            
        # Price matching (weight: 40%)
        max_score += 40
        if 'price_min' in search_criteria or 'price_max' in search_criteria:
            price_score = self._calculate_price_score(
                property_data.price.amount,
                search_criteria.get('price_min'),
                search_criteria.get('price_max')
            )
            score += price_score * 40
        else:
            score += 20  # Partial score if no price range
            
        # Property type matching (weight: 20%)
        max_score += 20
        if 'property_type' in search_criteria:
            type_score = self._calculate_type_score(
                property_data.property_type,
                search_criteria['property_type']
            )
            score += type_score * 20
        else:
            score += 10  # Partial score
            
        # Surface area matching (weight: 10%)
        max_score += 10
        if 'surface_min' in search_criteria or 'surface_max' in search_criteria:
            surface_score = self._calculate_surface_score(
                property_data.features.size_sqm,
                search_criteria.get('surface_min'),
                search_criteria.get('surface_max')
            )
            score += surface_score * 10
        else:
            score += 5  # Partial score
            
        # Normalize to 0-1 range
        return round(min(score / max_score if max_score > 0 else 0.5, 1.0), 2)
    
    def _calculate_location_score(self, property_location, search_location: str) -> float:
        """Calculate location match score (0-1)."""
        if not search_location or not property_location.city:
            return 0.5
            
        search_lower = search_location.lower().strip()
        city_lower = property_location.city.lower().strip()
        
        # Exact city match
        if search_lower == city_lower:
            return 1.0
            
        # City contains search term or vice versa
        if search_lower in city_lower or city_lower in search_lower:
            return 0.8
            
        # Check province match
        if property_location.province:
            province_lower = property_location.province.lower().strip()
            if search_lower == province_lower:
                return 0.6
                
        # Check address match (if available)
        if property_location.address:
            address_lower = property_location.address.lower()
            if search_lower in address_lower:
                return 0.7
                
        return 0.1  # Minimal score for no match
    
    def _calculate_price_score(self, property_price: float, min_price: Optional[float], max_price: Optional[float]) -> float:
        """Calculate price match score (0-1)."""
        if not property_price:
            return 0.3  # Some score if price unknown
            
        # Within range - perfect score
        in_range = True
        if min_price and property_price < min_price:
            in_range = False
        if max_price and property_price > max_price:
            in_range = False
            
        if in_range:
            return 1.0
            
        # Calculate distance from range
        if min_price and property_price < min_price:
            distance = min_price - property_price
            tolerance = min_price * 0.2  # 20% tolerance
        elif max_price and property_price > max_price:
            distance = property_price - max_price
            tolerance = max_price * 0.2  # 20% tolerance
        else:
            return 1.0
            
        # Score based on distance (closer = higher score)
        if distance <= tolerance:
            return max(0.3, 1.0 - (distance / tolerance) * 0.7)
        else:
            return 0.1  # Minimal score for far outside range
    
    def _calculate_type_score(self, property_type: PropertyType, search_type: str) -> float:
        """Calculate property type match score (0-1)."""
        if not search_type:
            return 0.5
            
        search_lower = search_type.lower().strip()
        
        # Handle both PropertyType enum and string inputs
        if hasattr(property_type, 'value'):
            property_type_str = property_type.value.lower()
        else:
            property_type_str = str(property_type).lower() if property_type else ""
        
        # Exact match
        if search_lower == property_type_str:
            return 1.0
            
        # Flexible matching for common terms
        type_mappings = {
            'appartamento': ['apartment', 'app'],
            'casa': ['house'],
            'villa': ['villa'],
            'attico': ['penthouse'],
            'loft': ['loft'],
            'monolocale': ['studio', 'studio apartment']
        }
        
        for italian_term, english_terms in type_mappings.items():
            if search_lower == italian_term and property_type_str in english_terms:
                return 1.0
            if search_lower in english_terms and property_type_str == italian_term:
                return 1.0
                
        return 0.2  # Minimal score for no match
    
    def _calculate_surface_score(self, property_surface: Optional[float], min_surface: Optional[float], max_surface: Optional[float]) -> float:
        """Calculate surface area match score (0-1)."""
        if not property_surface:
            return 0.4  # Some score if surface unknown
            
        # Within range - perfect score
        in_range = True
        if min_surface and property_surface < min_surface:
            in_range = False
        if max_surface and property_surface > max_surface:
            in_range = False
            
        if in_range:
            return 1.0
            
        # Calculate distance from range with tolerance
        if min_surface and property_surface < min_surface:
            distance = min_surface - property_surface
            tolerance = min_surface * 0.15  # 15% tolerance
        elif max_surface and property_surface > max_surface:
            distance = property_surface - max_surface
            tolerance = max_surface * 0.15  # 15% tolerance
        else:
            return 1.0
            
        if distance <= tolerance:
            return max(0.3, 1.0 - (distance / tolerance) * 0.7)
        else:
            return 0.1
    
    def _extract_external_id(self, property_data: RealEstateProperty) -> Optional[str]:
        """Extract external ID from property metadata."""
        if property_data.metadata.listing_id:
            return str(property_data.metadata.listing_id)
            
        # Try to extract from URL
        url = property_data.metadata.source_url
        if not url:
            return None
            
        # Pattern for immobiliare.it URLs
        immobiliare_pattern = r'/annunci/(\d+)/'
        match = re.search(immobiliare_pattern, url)
        if match:
            return match.group(1)
            
        # Pattern for other platforms can be added here
        
        return None
    
    def _map_source_platform(self, scraper_name: str) -> str:
        """Map scraper name to source_platform enum value."""
        scraper_lower = scraper_name.lower()
        
        for key, platform in self.PLATFORM_MAPPING.items():
            if key in scraper_lower:
                return platform
                
        # Default fallback
        return 'immobiliare.it'
    
    def _create_basic_title(self, property_data: RealEstateProperty) -> str:
        """Create basic title for reference (not full redistribution)."""
        # Use minimal info: property type + location + price range
        prop_type = property_data.property_type.title() if property_data.property_type else "Immobile"
        city = property_data.location.city or "Location"
        
        # Price range instead of exact price
        price_range = self._get_price_range(property_data.price.amount)
        
        return f"{prop_type} {city} {price_range}"
    
    def _get_price_range(self, price: float) -> str:
        """Convert exact price to price range for privacy."""
        if not price:
            return "Prezzo da definire"
            
        if price < 100000:
            return "< 100k"
        elif price < 200000:
            return "100k-200k"
        elif price < 300000:
            return "200k-300k"
        elif price < 500000:
            return "300k-500k"
        elif price < 750000:
            return "500k-750k"
        elif price < 1000000:
            return "750k-1M"
        else:
            return "> 1M"
    
    def _generate_ai_summary(self, property_data: RealEstateProperty) -> str:
        """Generate AI summary (our analysis, not redistribution)."""
        # This is our value-add analysis, not copying original content
        summary_parts = []
        
        # Property characteristics
        if property_data.features.size_sqm:
            summary_parts.append(f"Superficie: {property_data.features.size_sqm}mq")
            
        if property_data.features.rooms:
            summary_parts.append(f"{property_data.features.rooms} locali")
            
        if property_data.features.bathrooms:
            summary_parts.append(f"{property_data.features.bathrooms} bagni")
            
        # Condition assessment
        if property_data.features.condition:
            condition_map = {
                'new': 'Nuovo/Ristrutturato',
                'excellent': 'Ottime condizioni',
                'good': 'Buone condizioni',
                'fair': 'Da aggiornare',
                'poor': 'Da ristrutturare',
                'to_renovate': 'Da ristrutturare'
            }
            condition_text = condition_map.get(property_data.features.condition.value, 'Condizioni da verificare')
            summary_parts.append(condition_text)
        
        return " • ".join(summary_parts) if summary_parts else "Immobile interessante da valutare"
    
    def _generate_ai_recommendation(
        self, 
        property_data: RealEstateProperty, 
        relevance_score: float,
        search_criteria: Optional[Dict[str, Any]]
    ) -> str:
        """Generate personalized AI recommendation."""
        
        if relevance_score >= 0.8:
            base_rec = "Ottima corrispondenza ai tuoi criteri"
        elif relevance_score >= 0.6:
            base_rec = "Buona opzione da considerare"
        elif relevance_score >= 0.4:
            base_rec = "Interessante ma verifica i dettagli"
        else:
            base_rec = "Potrebbe essere un'opportunità se sei flessibile sui criteri"
        
        # Add specific insights
        insights = []
        
        # Price insight
        if search_criteria and 'price_max' in search_criteria:
            price_ratio = property_data.price.amount / search_criteria['price_max']
            if price_ratio < 0.8:
                insights.append("prezzo vantaggioso")
            elif price_ratio > 1.1:
                insights.append("sopra budget ma potrebbe valerne la pena")
        
        # Surface insight
        if property_data.features.size_sqm and property_data.features.size_sqm > 100:
            insights.append("spazi generosi")
        
        # Condition insight
        if property_data.features.condition in ['new', 'excellent']:
            insights.append("condizioni ottime")
        
        if insights:
            return f"{base_rec}. Punti di forza: {', '.join(insights)}."
        else:
            return f"{base_rec}."


class LocationNormalizer:
    """Handles location normalization for Italian addresses."""
    
    def normalize_location(self, city: str, province: Optional[str] = None, address: Optional[str] = None) -> str:
        """Normalize location to standard format."""
        if not city:
            return "Location non specificata"
            
        # Clean city name
        clean_city = clean_text(city)
        
        # Add province if available and different from city
        if province and province.lower() != city.lower():
            clean_province = clean_text(province)
            return f"{clean_city}, {clean_province}"
        
        return clean_city


class PriceNormalizer:
    """Handles price normalization and conversion."""
    
    def normalize_price(self, amount: float, currency: str = "EUR") -> Optional[float]:
        """Normalize price to standard format."""
        if not amount or amount <= 0:
            return None
            
        # Convert to EUR if needed (placeholder for future currency conversion)
        if currency.upper() != "EUR":
            # TODO: Add currency conversion logic
            pass
            
        # Round to 2 decimal places
        return float(Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


class QualityAssessor:
    """Assesses quality and generates insights for properties."""
    
    def generate_insights(self, property_data: RealEstateProperty) -> Dict[str, Any]:
        """Generate quality insights for a property."""
        
        insights = {
            'quality_score': self._calculate_quality_score(property_data),
            'completeness_score': self._calculate_completeness_score(property_data),
            'features_detected': self._extract_key_features(property_data),
            'generated_at': datetime.utcnow().isoformat()
        }
        
        return insights
    
    def _calculate_quality_score(self, property_data: RealEstateProperty) -> float:
        """Calculate overall quality score (0-1)."""
        score = 0.0
        max_score = 0.0
        
        # Information completeness (40%)
        max_score += 40
        completeness = self._calculate_completeness_score(property_data)
        score += completeness * 40
        
        # Description quality (30%)
        max_score += 30
        if property_data.description:
            desc_quality = min(len(property_data.description) / 200, 1.0)  # Good descriptions are 200+ chars
            score += desc_quality * 30
        
        # Images presence (20%)
        max_score += 20
        if property_data.metadata.images:
            image_quality = min(len(property_data.metadata.images) / 5, 1.0)  # Good listings have 5+ images
            score += image_quality * 20
        
        # Metadata quality (10%)
        max_score += 10
        if property_data.metadata.listing_id and property_data.metadata.source_url:
            score += 10
        elif property_data.metadata.source_url:
            score += 5
        
        return round(score / max_score if max_score > 0 else 0, 2)
    
    def _calculate_completeness_score(self, property_data: RealEstateProperty) -> float:
        """Calculate information completeness score (0-1)."""
        total_fields = 0
        populated_fields = 0
        
        # Core fields
        core_fields = [
            property_data.title,
            property_data.location.city,
            property_data.price.amount,
            property_data.features.size_sqm,
            property_data.features.rooms
        ]
        
        for field in core_fields:
            total_fields += 1
            if field:
                populated_fields += 1
        
        # Optional but valuable fields
        optional_fields = [
            property_data.description,
            property_data.features.bathrooms,
            property_data.features.floor,
            property_data.features.condition,
            property_data.metadata.images
        ]
        
        for field in optional_fields:
            total_fields += 1
            if field:
                populated_fields += 1
        
        return round(populated_fields / total_fields if total_fields > 0 else 0, 2)
    
    def _extract_key_features(self, property_data: RealEstateProperty) -> List[str]:
        """Extract key features for highlighting."""
        features = []
        
        # Size features
        if property_data.features.size_sqm:
            if property_data.features.size_sqm > 120:
                features.append("ampi spazi")
            elif property_data.features.size_sqm < 50:
                features.append("soluzione compatta")
        
        # Amenities
        amenity_mapping = {
            'has_elevator': 'ascensore',
            'has_parking': 'posto auto',
            'has_garden': 'giardino',
            'has_terrace': 'terrazzo',
            'has_balcony': 'balcone'
        }
        
        for field, label in amenity_mapping.items():
            if getattr(property_data.features, field, False):
                features.append(label)
        
        # Condition
        if property_data.features.condition in ['new', 'excellent']:
            features.append('ottime condizioni')
        
        return features
