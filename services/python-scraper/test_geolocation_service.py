"""
Test file for GeolocationProcessor
Validates Italian location normalization and processing.
"""

import sys
import os

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.geolocation_service import GeolocationProcessor, LocationInfo


def test_location_normalization():
    """Test location normalization functionality."""
    print("🧪 Testing GeolocationProcessor...")
    
    processor = GeolocationProcessor()
    
    # Test cases for location normalization
    test_cases = [
        "Milano (MI)",
        "Roma, Centro Storico",
        "Torino, San Salvario",
        "Napoli, Vomero",
        "Florence",  # English alias
        "via Garibaldi, Milano",
        "Centro Storico, Roma (RM)",
        "Periferia Nord, Torino"
    ]
    
    print("📍 Location Normalization Tests:")
    for location_text in test_cases:
        result = processor.normalize_italian_location(location_text)
        print(f"  Input: '{location_text}'")
        print(f"  Output: City={result.city}, Province={result.province}, Region={result.region}")
        print(f"         Neighborhood={result.neighborhood}, Zone={result.zone_type}")
        print()
    
    # Test relevance scoring
    print("🎯 Relevance Scoring Tests:")
    search_criteria_tests = [
        {"location": "milano", "zone_preference": "centro"},
        {"location": "roma"},
        {"location": "torino", "zone_preference": "periferia"},
        {"location": "napoli"}
    ]
    
    property_locations = [
        "Milano, Centro Storico",
        "Roma, EUR",
        "Torino, Mirafiori",
        "Napoli, Chiaia"
    ]
    
    for criteria in search_criteria_tests:
        print(f"Search Criteria: {criteria}")
        for prop_location in property_locations:
            score = processor.calculate_relevance_score(prop_location, criteria)
            print(f"  Property: {prop_location} → Score: {score:.2f}")
        print()
    
    # Test neighborhood info extraction
    print("🏘️ Neighborhood Info Extraction Tests:")
    neighborhood_tests = [
        "Milano, Brera",
        "Roma, Trastevere", 
        "Torino, Crocetta",
        "Napoli, Chiaia"
    ]
    
    for location in neighborhood_tests:
        info = processor.extract_neighborhood_info(location)
        print(f"Location: {location}")
        for key, value in info.items():
            print(f"  {key}: {value}")
        print()
    
    # Test distance calculation
    print("📏 Distance Calculation Test:")
    # Milano coordinates: 45.4642, 9.1900
    # Roma coordinates: 41.9028, 12.4964
    milano_coords = (45.4642, 9.1900)
    roma_coords = (41.9028, 12.4964)
    
    distance = processor.calculate_distance_km(*milano_coords, *roma_coords)
    print(f"Distance Milano-Roma: {distance:.1f} km")
    print()


if __name__ == "__main__":
    test_location_normalization()
    print("✅ GeolocationProcessor tests completed!")
