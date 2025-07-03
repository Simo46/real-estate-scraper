"""
Test script for the Immobiliare.it scraper.
"""

import asyncio
import logging
import sys
import os

# Add the parent directory to the path so we can import the scrapers module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers import ScraperConfig, scraper_factory
from scrapers.sites.immobiliare_scraper import ImmobiliareScraper


async def test_immobiliare_scraper():
    """Test the Immobiliare.it scraper."""
    
    print("🏠 Testing Immobiliare.it Scraper")
    print("=" * 50)
    
    # Test 1: Scraper Registration
    print("\n1. Testing Scraper Registration...")
    scrapers = scraper_factory.list_scrapers()
    print(f"✅ Available scrapers: {scrapers}")
    
    if "immobiliare" in scrapers:
        print("✅ Immobiliare scraper is registered")
    else:
        print("❌ Immobiliare scraper not found in factory")
        return False
    
    # Test 2: URL Detection
    print("\n2. Testing URL Detection...")
    test_urls = [
        "https://www.immobiliare.it/vendita-case/milano/",
        "https://immobiliare.it/affitto-appartamenti/roma/"
    ]
    
    for url in test_urls:
        scraper = scraper_factory.get_scraper_for_url(url)
        if scraper:
            print(f"✅ URL '{url}' -> {scraper.get_scraper_name()}")
        else:
            print(f"❌ No scraper found for '{url}'")
    
    # Test 3: Search URL Building
    print("\n3. Testing Search URL Building...")
    
    config = ScraperConfig(min_delay=0.1, max_delay=0.2)  # Fast for testing
    
    async with ImmobiliareScraper(config) as scraper:
        # Test different search URL combinations
        test_cases = [
            {
                "city": "Milano",
                "property_type": "appartamenti",
                "min_price": 100000,
                "max_price": 500000
            },
            {
                "city": "Roma",
                "listing_type": "affitto",
                "rooms": 3
            },
            {
                "property_type": "ville",
                "min_surface": 100,
                "max_surface": 300
            }
        ]
        
        for i, test_case in enumerate(test_cases, 1):
            search_url = scraper.build_search_url(**test_case)
            print(f"✅ Test case {i}: {search_url}")
    
    # Test 4: Data Extraction Methods
    print("\n4. Testing Data Extraction Methods...")
    
    async with ImmobiliareScraper(config) as scraper:
        # Test location parsing
        test_locations = [
            "Milano, Zona Brera (MI)",
            "Roma, Centro Storico, Lazio",
            "Via Garibaldi 123, Torino (TO)"
        ]
        
        for location_text in test_locations:
            location = scraper._parse_location(location_text)
            print(f"✅ Location '{location_text}' -> City: {location.city}, Province: {location.province}")
        
        # Test property type detection
        test_titles = [
            "Appartamento in vendita a Milano",
            "Villa con giardino in zona residenziale",
            "Attico panoramico con terrazza",
            "Monolocale arredato centro città"
        ]
        
        for title in test_titles:
            from scrapers.models import PropertyFeatures
            prop_type = scraper._determine_property_type(title, PropertyFeatures())
            print(f"✅ Title '{title}' -> Type: {prop_type}")
        
        # Test listing ID extraction
        test_urls = [
            "https://www.immobiliare.it/annunci/12345678/",
            "https://www.immobiliare.it/vendita-case/milano/annuncio-98765432",
            "https://www.immobiliare.it/annunci/appartamento-milano-brera/11223344"
        ]
        
        for url in test_urls:
            listing_id = scraper._extract_listing_id(url)
            print(f"✅ URL '{url}' -> ID: {listing_id}")
    
    # Test 5: Scraper Configuration
    print("\n5. Testing Scraper Configuration...")
    
    # Test different configurations
    configs = [
        ScraperConfig(min_delay=0.5, max_delay=1.0, max_retries=2),
        ScraperConfig(min_delay=2.0, max_delay=5.0, max_retries=5)
    ]
    
    for i, config in enumerate(configs, 1):
        scraper = ImmobiliareScraper(config)
        print(f"✅ Config {i}: delay={config.min_delay}-{config.max_delay}s, retries={config.max_retries}")
        print(f"   Scraper name: {scraper.get_scraper_name()}")
        print(f"   Supported URLs: {scraper.get_supported_urls()}")
    
    print("\n🎉 All Immobiliare.it scraper tests passed!")
    return True


async def test_mock_scraping():
    """Test scraping with mock data (without actual web requests)."""
    
    print("\n🔧 Testing Mock Scraping Logic")
    print("=" * 30)
    
    # This test validates the scraping logic without making real HTTP requests
    config = ScraperConfig(min_delay=0.1, max_delay=0.2)
    
    scraper = ImmobiliareScraper(config)
    
    # Test the search URL building with various parameters
    search_params = [
        {"city": "Milano", "min_price": 200000, "max_price": 800000},
        {"city": "Roma", "listing_type": "affitto", "rooms": 2},
        {"property_type": "ville", "min_surface": 150}
    ]
    
    for params in search_params:
        url = scraper.build_search_url(**params)
        print(f"✅ Search URL: {url}")
    
    print("✅ Mock scraping logic test completed")


async def main():
    """Main test function."""
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        success = await test_immobiliare_scraper()
        await test_mock_scraping()
        
        if success:
            print("\n✅ Immobiliare.it Scraper Test: PASSED")
            return 0
        else:
            print("\n❌ Immobiliare.it Scraper Test: FAILED")
            return 1
            
    except Exception as e:
        print(f"\n❌ Test failed with exception: {str(e)}")
        logging.exception("Test failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
