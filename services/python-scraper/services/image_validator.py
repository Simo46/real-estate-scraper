"""
Image URL Validation Service
Validates and assesses quality of scraped image URLs.
"""

import asyncio
import httpx
import hashlib
import re
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse
from PIL import Image
import io


class ImageValidator:
    """Validator for scraped image URLs with quality assessment."""
    
    def __init__(self):
        self.session = None
        self.supported_formats = {'jpeg', 'jpg', 'png', 'webp', 'gif'}
        self.min_width = 200
        self.min_height = 200
        self.max_file_size = 10 * 1024 * 1024  # 10MB
        
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = httpx.AsyncClient()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.aclose()
    
    async def validate_image_urls(self, urls: List[str]) -> List[Dict]:
        """
        Validate a list of image URLs.
        
        Args:
            urls: List of image URLs to validate
            
        Returns:
            List[dict]: Validation results for each URL
                       [{"url": str, "valid": bool, "size": tuple, "format": str, 
                         "file_size": int, "error": str}]
        """
        if not urls:
            return []
        
        # Use context manager if session not already created
        if not self.session:
            async with httpx.AsyncClient() as session:
                self.session = session
                return await self._validate_urls_batch(urls)
        else:
            return await self._validate_urls_batch(urls)
    
    async def _validate_urls_batch(self, urls: List[str]) -> List[Dict]:
        """Validate URLs in batch with concurrency control."""
        semaphore = asyncio.Semaphore(5)  # Limit concurrent requests
        
        tasks = [self._validate_single_url(url, semaphore) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle exceptions
        validated_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                validated_results.append({
                    'url': urls[i],
                    'valid': False,
                    'size': None,
                    'format': None,
                    'file_size': None,
                    'error': str(result)
                })
            else:
                validated_results.append(result)
        
        return validated_results
    
    async def _validate_single_url(self, url: str, semaphore: asyncio.Semaphore) -> Dict:
        """Validate a single image URL."""
        async with semaphore:
            try:
                # Basic URL validation
                if not self._is_valid_url(url):
                    return {
                        'url': url,
                        'valid': False,
                        'size': None,
                        'format': None,
                        'file_size': None,
                        'error': 'Invalid URL format'
                    }
                
                # Check if URL looks like an image
                if not self._looks_like_image_url(url):
                    return {
                        'url': url,
                        'valid': False,
                        'size': None,
                        'format': None,
                        'file_size': None,
                        'error': 'URL does not appear to be an image'
                    }
                
                # Fetch image metadata
                response = await self.session.head(url, timeout=10.0)
                if response.status_code != 200:
                    return {
                        'url': url,
                        'valid': False,
                        'size': None,
                        'format': None,
                        'file_size': None,
                        'error': f'HTTP {response.status_code}'
                    }
                
                content_type = response.headers.get('content-type', '').lower()
                if not content_type.startswith('image/'):
                    return {
                        'url': url,
                        'valid': False,
                        'size': None,
                        'format': None,
                        'file_size': None,
                        'error': f'Invalid content type: {content_type}'
                    }
                
                file_size = int(response.headers.get('content-length', 0))
                if file_size > self.max_file_size:
                    return {
                        'url': url,
                        'valid': False,
                        'size': None,
                        'format': None,
                        'file_size': file_size,
                        'error': 'File too large'
                    }
                
                # Get image dimensions (fetch partial content)
                size, format_detected = await self._get_image_dimensions(url)
                
                # Validate dimensions
                if size and (size[0] < self.min_width or size[1] < self.min_height):
                    return {
                        'url': url,
                        'valid': False,
                        'size': size,
                        'format': format_detected,
                        'file_size': file_size,
                        'error': f'Image too small: {size[0]}x{size[1]}'
                    }
                
                return {
                    'url': url,
                    'valid': True,
                    'size': size,
                    'format': format_detected,
                    'file_size': file_size,
                    'error': None
                }
                
            except httpx.TimeoutException:
                return {
                    'url': url,
                    'valid': False,
                    'size': None,
                    'format': None,
                    'file_size': None,
                    'error': 'Request timeout'
                }
            except Exception as e:
                return {
                    'url': url,
                    'valid': False,
                    'size': None,
                    'format': None,
                    'file_size': None,
                    'error': str(e)
                }
    
    async def _get_image_dimensions(self, url: str) -> Tuple[Optional[Tuple[int, int]], Optional[str]]:
        """Get image dimensions by fetching partial content."""
        try:
            # Fetch first 2KB to get image headers
            headers = {'Range': 'bytes=0-2047'}
            response = await self.session.get(url, headers=headers, timeout=10.0)
            if response.status_code not in [200, 206]:
                return None, None
            
            content = response.content
            
            # Try to determine format and size from headers
            format_detected = self._detect_image_format(content)
            size = self._extract_dimensions_from_headers(content, format_detected)
            
            return size, format_detected
            
        except Exception:
            return None, None
    
    def _is_valid_url(self, url: str) -> bool:
        """Check if URL is valid."""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False
    
    def _looks_like_image_url(self, url: str) -> bool:
        """Check if URL looks like an image based on extension or path."""
        # Check file extension
        url_lower = url.lower()
        image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
        
        for ext in image_extensions:
            if ext in url_lower:
                return True
        
        # Check for common image hosting patterns
        image_patterns = [
            r'/images?/',
            r'/foto/',
            r'/pics?/',
            r'/gallery/',
            r'\.cloudinary\.com',
            r'\.amazonaws\.com',
            r'immobiliare\.it.*\.(jpg|jpeg|png|webp)',
            r'casa\.it.*\.(jpg|jpeg|png|webp)'
        ]
        
        for pattern in image_patterns:
            if re.search(pattern, url_lower):
                return True
        
        return False
    
    def _detect_image_format(self, content: bytes) -> Optional[str]:
        """Detect image format from file headers."""
        if not content:
            return None
        
        # JPEG
        if content.startswith(b'\xff\xd8\xff'):
            return 'jpeg'
        
        # PNG
        if content.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'png'
        
        # WebP
        if b'WEBP' in content[:12]:
            return 'webp'
        
        # GIF
        if content.startswith(b'GIF87a') or content.startswith(b'GIF89a'):
            return 'gif'
        
        return None
    
    def _extract_dimensions_from_headers(self, content: bytes, format_type: str) -> Optional[Tuple[int, int]]:
        """Extract image dimensions from file headers."""
        try:
            if format_type == 'jpeg':
                return self._get_jpeg_dimensions(content)
            elif format_type == 'png':
                return self._get_png_dimensions(content)
            elif format_type == 'webp':
                return self._get_webp_dimensions(content)
            elif format_type == 'gif':
                return self._get_gif_dimensions(content)
        except Exception:
            pass
        
        return None
    
    def _get_jpeg_dimensions(self, content: bytes) -> Optional[Tuple[int, int]]:
        """Extract JPEG dimensions from headers."""
        if len(content) < 10:
            return None
        
        # Look for SOF (Start of Frame) markers
        i = 2  # Skip JPEG header
        while i < len(content) - 8:
            if content[i:i+2] == b'\xff\xc0':  # SOF0 marker
                height = int.from_bytes(content[i+5:i+7], 'big')
                width = int.from_bytes(content[i+7:i+9], 'big')
                return (width, height)
            i += 1
        
        return None
    
    def _get_png_dimensions(self, content: bytes) -> Optional[Tuple[int, int]]:
        """Extract PNG dimensions from IHDR chunk."""
        if len(content) < 24:
            return None
        
        # PNG IHDR chunk starts at byte 16
        if content[12:16] == b'IHDR':
            width = int.from_bytes(content[16:20], 'big')
            height = int.from_bytes(content[20:24], 'big')
            return (width, height)
        
        return None
    
    def _get_webp_dimensions(self, content: bytes) -> Optional[Tuple[int, int]]:
        """Extract WebP dimensions."""
        if len(content) < 30:
            return None
        
        # Simple WebP format
        if b'VP8 ' in content[:20]:
            # Look for VP8 bitstream
            vp8_start = content.find(b'VP8 ') + 8
            if vp8_start + 10 < len(content):
                width = int.from_bytes(content[vp8_start+6:vp8_start+8], 'little') & 0x3fff
                height = int.from_bytes(content[vp8_start+8:vp8_start+10], 'little') & 0x3fff
                return (width, height)
        
        return None
    
    def _get_gif_dimensions(self, content: bytes) -> Optional[Tuple[int, int]]:
        """Extract GIF dimensions."""
        if len(content) < 10:
            return None
        
        # GIF dimensions are at bytes 6-9
        width = int.from_bytes(content[6:8], 'little')
        height = int.from_bytes(content[8:10], 'little')
        return (width, height)
    
    def calculate_image_quality_score(self, image_data: List[Dict]) -> float:
        """
        Calculate image quality score based on validation results.
        
        Args:
            image_data: List of image validation results
            
        Returns:
            float: Quality score 0-1
        """
        if not image_data:
            return 0.0
        
        valid_images = [img for img in image_data if img['valid']]
        
        if not valid_images:
            return 0.0
        
        # Base score for having images
        score = 0.3
        
        # Number of images bonus
        num_images = len(valid_images)
        if num_images >= 10:
            score += 0.3
        elif num_images >= 5:
            score += 0.2
        elif num_images >= 3:
            score += 0.1
        
        # Image size quality
        size_scores = []
        for img in valid_images:
            if img['size']:
                width, height = img['size']
                pixels = width * height
                
                if pixels >= 1920 * 1080:  # HD+
                    size_scores.append(1.0)
                elif pixels >= 1024 * 768:  # Large
                    size_scores.append(0.8)
                elif pixels >= 640 * 480:   # Medium
                    size_scores.append(0.6)
                else:  # Small
                    size_scores.append(0.3)
        
        if size_scores:
            avg_size_score = sum(size_scores) / len(size_scores)
            score += avg_size_score * 0.3
        
        # Format diversity bonus
        formats = set(img['format'] for img in valid_images if img['format'])
        if 'jpeg' in formats or 'jpg' in formats:
            score += 0.05
        if 'png' in formats:
            score += 0.05
        if 'webp' in formats:
            score += 0.05
        
        return min(score, 1.0)
    
    def detect_duplicate_images(self, image_data: List[Dict]) -> List[List[int]]:
        """
        Detect duplicate images based on URL patterns.
        
        Args:
            image_data: List of image validation results
            
        Returns:
            List[List[int]]: Groups of duplicate image indices
        """
        duplicates = []
        processed = set()
        
        for i, img1 in enumerate(image_data):
            if i in processed or not img1['valid']:
                continue
            
            group = [i]
            
            for j, img2 in enumerate(image_data[i+1:], i+1):
                if j in processed or not img2['valid']:
                    continue
                
                if self._are_likely_duplicates(img1, img2):
                    group.append(j)
                    processed.add(j)
            
            if len(group) > 1:
                duplicates.append(group)
            
            processed.add(i)
        
        return duplicates
    
    def _are_likely_duplicates(self, img1: Dict, img2: Dict) -> bool:
        """Check if two images are likely duplicates."""
        url1, url2 = img1['url'], img2['url']
        
        # Same URL
        if url1 == url2:
            return True
        
        # Same size and format
        if (img1['size'] and img2['size'] and 
            img1['size'] == img2['size'] and
            img1['format'] == img2['format'] and
            img1['file_size'] == img2['file_size']):
            return True
        
        # Similar URL patterns (thumbnails vs full size)
        if self._similar_url_pattern(url1, url2):
            return True
        
        return False
    
    def _similar_url_pattern(self, url1: str, url2: str) -> bool:
        """Check if URLs have similar patterns suggesting same image."""
        # Remove thumbnail indicators
        clean_url1 = re.sub(r'_(thumb|small|medium|large|xl)\.', '.', url1.lower())
        clean_url2 = re.sub(r'_(thumb|small|medium|large|xl)\.', '.', url2.lower())
        
        # Remove size parameters
        clean_url1 = re.sub(r'[?&](w|h|width|height|size)=\d+', '', clean_url1)
        clean_url2 = re.sub(r'[?&](w|h|width|height|size)=\d+', '', clean_url2)
        
        return clean_url1 == clean_url2
