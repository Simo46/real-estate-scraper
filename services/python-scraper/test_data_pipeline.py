"""
Test for SearchResultMapper data pipeline functionality.
"""

import pytest
from datetime import datetime
from decimal import Decimal

from services.data_pipeline import SearchResultMapper, LocationNormalizer, PriceNormalizer, QualityAssessor
from scrapers.models import (
    RealEstateProperty, PropertyType, ListingType, PropertyCondition,
    Location, PropertyFeatures, PropertyPrice, PropertyContact, ScrapingMetadata
)


class TestSearchResultMapper:
    """Test cases for SearchResultMapper."""
    
    def setup_method(self):
        """Setup test fixtures."""
        self.mapper = SearchResultMapper()
        self.sample_property = self._create_sample_property()
        
    def _create_sample_property(self) -> RealEstateProperty:
        """Create a sample property for testing."""
        return RealEstateProperty(
            title="Appartamento moderno in zona Cenisia",
            description="Bellissimo appartamento di 85 mq, completamente ristrutturato, al terzo piano con ascensore. Composto da soggiorno, cucina abitabile, due camere da letto e bagno. Riscaldamento autonomo, aria condizionata.",
            property_type=PropertyType.APARTMENT,
            listing_type=ListingType.SALE,
            location=Location(
                address="Via Giuseppe Cenisia 15",
                city="Torino",
                province="TO",
                region="Piemonte",
                postal_code="10144",
                latitude=45.0703,
                longitude=7.6869
            ),
            features=PropertyFeatures(
                surface_sqm=85,
                rooms=3,
                bedrooms=2,
                bathrooms=1,
                floor=3,
                condition=PropertyCondition.EXCELLENT,
                year_built=2020,
                has_elevator=True,
                has_air_conditioning=True,
                has_balcony=True
            ),
            price=PropertyPrice(
                amount=285000.0,
                currency="EUR",
                price_per_sqm=3352.94
            ),
            images=[
                "https://example.com/image1.jpg",
                "https://example.com/image2.jpg",
                "https://example.com/image3.jpg"
            ],
            contact=PropertyContact(
                agency_name="Immobiliare Test",
                phone="+39 011 123456"
            ),
            metadata=ScrapingMetadata(
                scraper_name="immobiliare_it",
                source_url="https://www.immobiliare.it/annunci/12345678/",
                listing_id="12345678",
                scraped_at=datetime.utcnow()
            )
        )
    
    def test_basic_mapping(self):
        """Test basic property mapping to SearchResult format."""
        search_execution_id = "exec-123"
        tenant_id = "tenant-456"
        saved_search_id = "search-789"
        
        result = self.mapper.map_to_search_result(
            self.sample_property,
            search_execution_id,
            tenant_id,
            saved_search_id
        )
        
        # Test required fields
        assert result['search_execution_id'] == search_execution_id
        assert result['tenant_id'] == tenant_id
        assert result['saved_search_id'] == saved_search_id
        
        # Test external reference
        assert result['external_url'] == "https://www.immobiliare.it/annunci/12345678/"
        assert result['source_platform'] == "immobiliare.it"
        assert result['external_id'] == "12345678"
        
        # Test basic metadata
        assert "Appartamento" in result['basic_title']
        assert "Torino" in result['basic_title']
        assert result['basic_price'] == 285000.0
        assert result['basic_location'] == "Torino, TO"
        
        # Test AI fields
        assert 'relevance_score' in result
        assert 'ai_insights' in result
        assert 'ai_summary' in result
        assert 'ai_recommendation' in result
        
        # Test tracking fields
        assert result['is_new_result'] is True
        assert result['status'] == 'active'
        assert 'found_at' in result
    
    def test_relevance_scoring_perfect_match(self):
        """Test relevance scoring with perfect match criteria."""
        search_criteria = {
            'location': 'Torino',
            'property_type': 'apartment',
            'price_min': 250000,
            'price_max': 300000,
            'surface_min': 80,
            'surface_max': 90
        }
        
        result = self.mapper.map_to_search_result(
            self.sample_property,
            "exec-123",
            "tenant-456", 
            "search-789",
            search_criteria
        )
        
        # Should get high relevance score for perfect match
        assert result['relevance_score'] >= 0.9
        assert "Ottima corrispondenza" in result['ai_recommendation']
    
    def test_relevance_scoring_partial_match(self):
        """Test relevance scoring with partial match criteria."""
        search_criteria = {
            'location': 'Milano',  # Different city
            'property_type': 'apartment',  # Matches
            'price_min': 200000,  # In range
            'price_max': 400000   # In range
        }
        
        result = self.mapper.map_to_search_result(
            self.sample_property,
            "exec-123",
            "tenant-456",
            "search-789", 
            search_criteria
        )
        
        # Should get medium relevance score
        assert 0.3 <= result['relevance_score'] <= 0.7
    
    def test_relevance_scoring_no_criteria(self):
        """Test relevance scoring with no search criteria."""
        result = self.mapper.map_to_search_result(
            self.sample_property,
            "exec-123",
            "tenant-456",
            "search-789"
        )
        
        # Should get default middle score
        assert result['relevance_score'] == 0.5
    
    def test_ai_insights_generation(self):
        """Test AI insights generation."""
        result = self.mapper.map_to_search_result(
            self.sample_property,
            "exec-123",
            "tenant-456",
            "search-789"
        )
        
        insights = result['ai_insights']
        
        # Test insight structure
        assert 'quality_score' in insights
        assert 'completeness_score' in insights
        assert 'features_detected' in insights
        assert 'generated_at' in insights
        
        # Test quality scoring
        assert 0 <= insights['quality_score'] <= 1
        assert 0 <= insights['completeness_score'] <= 1
        
        # Test feature detection
        features = insights['features_detected']
        assert isinstance(features, list)
        # Should detect elevator and AC
        assert any('ascensore' in f for f in features)
    
    def test_ai_summary_generation(self):
        """Test AI summary generation."""
        result = self.mapper.map_to_search_result(
            self.sample_property,
            "exec-123",
            "tenant-456",
            "search-789"
        )
        
        summary = result['ai_summary']
        
        # Should contain key property info
        assert "85mq" in summary
        assert "3 locali" in summary
        assert "1 bagni" in summary
        assert "Ottime condizioni" in summary
    
    def test_price_range_generation(self):
        """Test price range generation for basic_title."""
        # Test different price ranges
        test_cases = [
            (50000, "< 100k"),
            (150000, "100k-200k"),
            (250000, "200k-300k"),
            (400000, "300k-500k"),
            (600000, "500k-750k"),
            (900000, "750k-1M"),
            (1200000, "> 1M")
        ]
        
        for price, expected_range in test_cases:
            actual_range = self.mapper._get_price_range(price)
            assert actual_range == expected_range
    
    def test_external_id_extraction(self):
        """Test external ID extraction from various URL patterns."""
        test_cases = [
            ("https://www.immobiliare.it/annunci/12345678/", "12345678"),
            ("https://immobiliare.it/annunci/87654321/dettaglio", "87654321"),
            ("https://casa.it/property/999888", None),  # No pattern match
        ]
        
        for url, expected_id in test_cases:
            # Create property with test URL
            property_copy = self.sample_property.copy(deep=True)
            property_copy.metadata.source_url = url
            
            extracted_id = self.mapper._extract_external_id(property_copy)
            assert extracted_id == expected_id
    
    def test_platform_mapping(self):
        """Test source platform mapping."""
        test_cases = [
            ("immobiliare", "immobiliare.it"),
            ("immobiliare_it", "immobiliare.it"),
            ("casa", "casa.it"),
            ("idealista", "idealista.it"),
            ("unknown_scraper", "immobiliare.it")  # Default fallback
        ]
        
        for scraper_name, expected_platform in test_cases:
            mapped_platform = self.mapper._map_source_platform(scraper_name)
            assert mapped_platform == expected_platform


class TestLocationNormalizer:
    """Test cases for LocationNormalizer."""
    
    def setup_method(self):
        self.normalizer = LocationNormalizer()
    
    def test_city_only(self):
        """Test normalization with city only."""
        result = self.normalizer.normalize_location("Torino")
        assert result == "Torino"
    
    def test_city_and_province(self):
        """Test normalization with city and province."""
        result = self.normalizer.normalize_location("Torino", "TO")
        assert result == "Torino, TO"
    
    def test_city_same_as_province(self):
        """Test normalization when city and province are the same."""
        result = self.normalizer.normalize_location("Milano", "Milano")
        assert result == "Milano"  # Should not duplicate
    
    def test_empty_city(self):
        """Test normalization with empty city."""
        result = self.normalizer.normalize_location("")
        assert result == "Location non specificata"


class TestPriceNormalizer:
    """Test cases for PriceNormalizer."""
    
    def setup_method(self):
        self.normalizer = PriceNormalizer()
    
    def test_valid_price(self):
        """Test normalization of valid price."""
        result = self.normalizer.normalize_price(285000.0)
        assert result == 285000.0
    
    def test_price_with_decimals(self):
        """Test normalization of price with decimals."""
        result = self.normalizer.normalize_price(285000.999)
        assert result == 285001.0  # Should round properly
    
    def test_zero_price(self):
        """Test normalization of zero price."""
        result = self.normalizer.normalize_price(0)
        assert result is None
    
    def test_negative_price(self):
        """Test normalization of negative price."""
        result = self.normalizer.normalize_price(-100)
        assert result is None


class TestQualityAssessor:
    """Test cases for QualityAssessor."""
    
    def setup_method(self):
        self.assessor = QualityAssessor()
    
    def test_quality_scoring_complete_property(self):
        """Test quality scoring for complete property."""
        # Create a complete property
        property_data = RealEstateProperty(
            title="Complete Property",
            description="A very detailed description that is long enough to be considered good quality for the assessment algorithm",
            property_type=PropertyType.APARTMENT,
            listing_type=ListingType.SALE,
            location=Location(city="Torino"),
            features=PropertyFeatures(
                surface_sqm=85,
                rooms=3,
                bathrooms=2,
                condition=PropertyCondition.EXCELLENT
            ),
            price=PropertyPrice(amount=285000.0),
            images=["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg", "img5.jpg"],
            metadata=ScrapingMetadata(
                scraper_name="test",
                source_url="https://example.com",
                listing_id="123"
            )
        )
        
        insights = self.assessor.generate_insights(property_data)
        
        # Should get high quality scores
        assert insights['quality_score'] >= 0.7
        assert insights['completeness_score'] >= 0.7
    
    def test_feature_detection(self):
        """Test key feature detection."""
        property_data = RealEstateProperty(
            title="Property with features",
            property_type=PropertyType.APARTMENT,
            listing_type=ListingType.SALE,
            location=Location(city="Torino"),
            features=PropertyFeatures(
                surface_sqm=150,  # Large space
                has_elevator=True,
                has_garden=True,
                condition=PropertyCondition.NEW
            ),
            price=PropertyPrice(amount=285000.0),
            metadata=ScrapingMetadata(scraper_name="test")
        )
        
        insights = self.assessor.generate_insights(property_data)
        features = insights['features_detected']
        
        # Should detect large space, elevator, garden, and excellent condition
        assert any('ampi spazi' in f for f in features)
        assert 'ascensore' in features
        assert 'giardino' in features
        assert 'ottime condizioni' in features


if __name__ == "__main__":
    # Run basic tests
    mapper = SearchResultMapper()
    
    # Create test property
    test_property = RealEstateProperty(
        title="Test Property",
        property_type=PropertyType.APARTMENT,
        listing_type=ListingType.SALE,
        location=Location(city="Torino", province="TO"),
        features=PropertyFeatures(surface_sqm=85, rooms=3),
        price=PropertyPrice(amount=285000.0),
        metadata=ScrapingMetadata(
            scraper_name="immobiliare_it",
            source_url="https://www.immobiliare.it/annunci/12345678/"
        )
    )
    
    # Test mapping
    result = mapper.map_to_search_result(
        test_property,
        "exec-123",
        "tenant-456",
        "search-789"
    )
    
    print("✅ Mapping Test Results:")
    print(f"📍 Location: {result['basic_location']}")
    print(f"💰 Price: €{result['basic_price']:,.0f}")
    print(f"🎯 Relevance Score: {result['relevance_score']}")
    print(f"📊 Quality Score: {result['ai_insights']['quality_score']}")
    print(f"📝 Summary: {result['ai_summary']}")
    print(f"💡 Recommendation: {result['ai_recommendation']}")
    print(f"🔗 External URL: {result['external_url']}")
    print(f"🆔 External ID: {result['external_id']}")
    
    print("\n🎉 Step 3.3.1 Implementation completed successfully!")
