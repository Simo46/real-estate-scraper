"""
Test script for the base scraper architecture.
"""

import asyncio
import logging
import sys
import os

# Add the parent directory to the path so we can import the scrapers module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers import (
    ScraperConfig, 
    scraper_factory, 
    PropertyType,
    ListingType,
    RealEstateProperty,
    Location,
    PropertyFeatures,
    PropertyPrice,
    ScrapingMetadata
)


async def test_base_architecture():
    """Test the base scraper architecture."""
    
    print("🧪 Testing Base Scraper Architecture")
    print("=" * 50)
    
    # Test 1: Configuration
    print("\n1. Testing ScraperConfig...")
    config = ScraperConfig(
        min_delay=0.5,
        max_delay=1.0,
        max_retries=2
    )
    print(f"✅ Created config: min_delay={config.min_delay}, max_delay={config.max_delay}")
    
    # Test 2: Data Models
    print("\n2. Testing Data Models...")
    try:
        property_data = RealEstateProperty(
            title="Test Property",
            description="A beautiful test property",
            property_type=PropertyType.APARTMENT,
            listing_type=ListingType.SALE,
            
            location=Location(
                address="Via Test 123",
                city="Milano",
                country="Italy"
            ),
            
            features=PropertyFeatures(
                rooms=3,
                bathrooms=2,
                size_sqm=85.5
            ),
            
            price=PropertyPrice(
                amount=250000.0,
                currency="EUR"
            ),
            
            metadata=ScrapingMetadata(
                source_url="https://test.com",
                scraper_name="Test Scraper"
            )
        )
        
        print(f"✅ Created property: {property_data.title}")
        print(f"   - Type: {property_data.property_type}")
        print(f"   - Location: {property_data.location.city}")
        print(f"   - Price: €{property_data.price.amount}")
        print(f"   - Unique ID: {property_data.get_unique_id()}")
        
    except Exception as e:
        print(f"❌ Property model creation failed: {e}")
        return False
    
    # Test 3: Factory
    print("\n3. Testing Scraper Factory...")
    
    # List available scrapers
    scrapers = scraper_factory.list_scrapers()
    print(f"✅ Available scrapers: {scrapers}")
    
    # Check if example scraper is registered
    if "example" in scrapers:
        print("✅ Example scraper is registered")
        
        # Test URL detection
        supported_domains = scraper_factory.get_supported_domains()
        print(f"✅ Supported domains: {supported_domains}")
        
        # Test scraper creation
        try:
            scraper = scraper_factory.get_scraper("example", config)
            print(f"✅ Created scraper: {scraper.get_scraper_name()}")
        except Exception as e:
            print(f"❌ Scraper creation failed: {e}")
            return False
            
    else:
        print("⚠️  Example scraper not found (this is expected if not imported)")
    
    # Test 4: Utilities
    print("\n4. Testing Utilities...")
    
    # Import and test utilities
    try:
        from scrapers.utils import clean_text, extract_price, parse_room_info
        
        # Test text cleaning
        dirty_text = "  Test   text  with\u00a0extra\u200bspaces  "
        clean = clean_text(dirty_text)
        print(f"✅ Text cleaning: '{dirty_text}' -> '{clean}'")
        
        # Test price extraction
        price_text = "€ 250.000"
        price = extract_price(price_text)
        print(f"✅ Price extraction: '{price_text}' -> {price}")
        
        # Test room parsing
        room_text = "3 stanze, 2 bagni"
        rooms = parse_room_info(room_text)
        print(f"✅ Room parsing: '{room_text}' -> {rooms}")
        
    except Exception as e:
        print(f"❌ Utilities test failed: {e}")
        return False
    
    print("\n🎉 All tests passed! Base scraper architecture is working correctly.")
    return True


async def main():
    """Main test function."""
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    success = await test_base_architecture()
    
    if success:
        print("\n✅ Base Scraper Architecture Test: PASSED")
        return 0
    else:
        print("\n❌ Base Scraper Architecture Test: FAILED")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
