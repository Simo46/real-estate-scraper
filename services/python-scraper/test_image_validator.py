"""
Test file for ImageValidator
Validates image URL validation and quality assessment.
"""

import sys
import os
import asyncio
import pytest

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.image_validator import ImageValidator


@pytest.mark.asyncio
async def test_image_validator():
    """Test image validation functionality."""
    print("🧪 Testing ImageValidator...")
    
    # Test URLs (mix of valid and invalid)
    test_urls = [
        # Valid image URLs (mock examples)
        "https://images.immobiliare.it/property/123456/1920x1080/photo1.jpg",
        "https://media.casa.it/uploads/2024/property_456789.png",
        "https://cdn.example.com/gallery/house_photo.webp",
        
        # Invalid URLs
        "https://invalid-domain-that-does-not-exist.com/image.jpg",
        "https://www.google.com/",  # Not an image
        "not-a-valid-url",
        "",
        
        # Potentially valid but small images
        "https://via.placeholder.com/100x100.jpg",
        "https://via.placeholder.com/800x600.png"
    ]
    
    async with ImageValidator() as validator:
        print("📸 Image URL Validation Tests:")
        
        # Test individual URL validation patterns
        for url in test_urls[:3]:  # Test first 3 URLs
            print(f"  Testing URL pattern: {url}")
            
            # Test URL format validation
            is_valid_url = validator._is_valid_url(url)
            looks_like_image = validator._looks_like_image_url(url)
            
            print(f"    Valid URL format: {is_valid_url}")
            print(f"    Looks like image: {looks_like_image}")
            print()
        
        # Test image format detection
        print("🎨 Image Format Detection Tests:")
        
        # JPEG header
        jpeg_header = b'\xff\xd8\xff\xe0\x00\x10JFIF'
        jpeg_format = validator._detect_image_format(jpeg_header)
        print(f"  JPEG header detection: {jpeg_format}")
        
        # PNG header
        png_header = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
        png_format = validator._detect_image_format(png_header)
        print(f"  PNG header detection: {png_format}")
        
        # WebP header
        webp_header = b'RIFF\x00\x00\x00\x00WEBP'
        webp_format = validator._detect_image_format(webp_header)
        print(f"  WebP header detection: {webp_format}")
        
        print()
        
        # Test quality scoring
        print("📊 Image Quality Scoring Tests:")
        
        # Mock validation results
        mock_results = [
            {
                'url': 'image1.jpg',
                'valid': True,
                'size': (1920, 1080),
                'format': 'jpeg',
                'file_size': 500000,
                'error': None
            },
            {
                'url': 'image2.png',
                'valid': True,
                'size': (800, 600),
                'format': 'png', 
                'file_size': 300000,
                'error': None
            },
            {
                'url': 'image3.jpg',
                'valid': True,
                'size': (640, 480),
                'format': 'jpeg',
                'file_size': 200000,
                'error': None
            },
            {
                'url': 'image4.jpg',
                'valid': False,
                'size': None,
                'format': None,
                'file_size': None,
                'error': 'HTTP 404'
            }
        ]
        
        quality_score = validator.calculate_image_quality_score(mock_results)
        print(f"  Quality score for {len(mock_results)} images: {quality_score:.2f}")
        
        # Test with different scenarios
        high_quality_results = [
            {'url': f'hq_image_{i}.jpg', 'valid': True, 'size': (1920, 1080), 
             'format': 'jpeg', 'file_size': 800000, 'error': None}
            for i in range(10)
        ]
        hq_score = validator.calculate_image_quality_score(high_quality_results)
        print(f"  High quality scenario (10 HD images): {hq_score:.2f}")
        
        low_quality_results = [
            {'url': 'lq_image.jpg', 'valid': True, 'size': (320, 240), 
             'format': 'jpeg', 'file_size': 50000, 'error': None}
        ]
        lq_score = validator.calculate_image_quality_score(low_quality_results)
        print(f"  Low quality scenario (1 small image): {lq_score:.2f}")
        
        print()
        
        # Test duplicate detection
        print("🔍 Duplicate Detection Tests:")
        
        duplicate_test_results = [
            {
                'url': 'https://example.com/image1.jpg',
                'valid': True,
                'size': (800, 600),
                'format': 'jpeg',
                'file_size': 400000,
                'error': None
            },
            {
                'url': 'https://example.com/image1_thumb.jpg',  # Potential duplicate
                'valid': True,
                'size': (200, 150),
                'format': 'jpeg',
                'file_size': 50000,
                'error': None
            },
            {
                'url': 'https://example.com/image2.png',
                'valid': True,
                'size': (1024, 768),
                'format': 'png',
                'file_size': 600000,
                'error': None
            }
        ]
        
        duplicates = validator.detect_duplicate_images(duplicate_test_results)
        print(f"  Found {len(duplicates)} duplicate groups")
        for i, group in enumerate(duplicates):
            urls = [duplicate_test_results[idx]['url'] for idx in group]
            print(f"    Group {i+1}: {urls}")
        
        print()
        
        # Test dimension extraction
        print("📐 Dimension Extraction Tests:")
        
        # Mock PNG IHDR chunk (simplified)
        png_ihdr = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x03\x20\x00\x00\x02\x58'  # 800x600
        png_dims = validator._get_png_dimensions(png_ihdr)
        print(f"  PNG dimensions: {png_dims}")
        
        print()


if __name__ == "__main__":
    asyncio.run(test_image_validator())
    print("✅ ImageValidator tests completed!")
