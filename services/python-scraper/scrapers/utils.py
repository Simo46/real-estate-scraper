"""
Utility functions for scraping operations.
"""

import asyncio
import re
import time
from typing import Optional, Union, List, Dict, Any
from urllib.parse import urljoin, urlparse
from datetime import datetime


def clean_text(text: str) -> str:
    """
    Clean and normalize text extracted from web pages.
    
    Args:
        text: Raw text to clean
        
    Returns:
        Cleaned text
    """
    if not text:
        return ""
    
    # Remove extra whitespace and normalize
    cleaned = ' '.join(text.split())
    
    # Remove common unwanted characters
    cleaned = cleaned.replace('\u00a0', ' ')  # Non-breaking space
    cleaned = cleaned.replace('\u200b', '')   # Zero-width space
    
    return cleaned.strip()


def extract_number(text: str) -> Optional[float]:
    """
    Extract first number from text string.
    
    Args:
        text: Text containing numbers
        
    Returns:
        First number found or None
    """
    if not text:
        return None
    
    # Look for numbers (including decimals with comma or dot)
    number_pattern = r'[\d]+[.,]?[\d]*'
    match = re.search(number_pattern, text)
    
    if match:
        number_str = match.group().replace(',', '.')
        try:
            return float(number_str)
        except ValueError:
            pass
    
    return None


def extract_price(price_text: str, currency_symbols: List[str] = None) -> Optional[float]:
    """
    Extract price from text with various formatting.
    
    Args:
        price_text: Text containing price
        currency_symbols: List of currency symbols to remove
        
    Returns:
        Price as float or None
    """
    if not price_text:
        return None
    
    # Default currency symbols
    if currency_symbols is None:
        currency_symbols = ['€', '$', '£', '¥', 'EUR', 'USD', 'GBP']
    
    # Remove currency symbols and common formatting
    cleaned = price_text
    for symbol in currency_symbols:
        cleaned = cleaned.replace(symbol, '')
    
    # Remove common price formatting
    cleaned = cleaned.replace('.', '').replace(',', '').replace(' ', '')
    
    # Extract numbers only
    numbers_only = ''.join(filter(str.isdigit, cleaned))
    
    if numbers_only:
        try:
            return float(numbers_only)
        except ValueError:
            pass
    
    return None


def normalize_url(url: str, base_url: str = None) -> str:
    """
    Normalize URL by converting relative to absolute and cleaning.
    
    Args:
        url: URL to normalize
        base_url: Base URL for resolving relative URLs
        
    Returns:
        Normalized absolute URL
    """
    if not url:
        return ""
    
    # Strip whitespace
    url = url.strip()
    
    # Convert relative to absolute URL
    if base_url and not url.startswith(('http://', 'https://')):
        url = urljoin(base_url, url)
    
    return url


def extract_coordinates(text: str) -> tuple[Optional[float], Optional[float]]:
    """
    Extract latitude and longitude coordinates from text.
    
    Args:
        text: Text potentially containing coordinates
        
    Returns:
        Tuple of (latitude, longitude) or (None, None)
    """
    if not text:
        return None, None
    
    # Look for coordinate patterns (lat,lng or lat lng)
    coord_pattern = r'(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)'
    match = re.search(coord_pattern, text)
    
    if match:
        try:
            lat = float(match.group(1))
            lng = float(match.group(2))
            
            # Basic validation (rough world bounds)
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return lat, lng
        except ValueError:
            pass
    
    return None, None


def parse_room_info(text: str) -> Dict[str, Optional[int]]:
    """
    Parse room information from text.
    
    Args:
        text: Text containing room information
        
    Returns:
        Dictionary with room counts
    """
    if not text:
        return {}
    
    result = {}
    text_lower = text.lower()
    
    # Common patterns for room counts
    patterns = {
        'rooms': r'(\d+)\s*(?:stanze?|camere?|rooms?)',
        'bedrooms': r'(\d+)\s*(?:camere?\s*da\s*letto|bedrooms?)',
        'bathrooms': r'(\d+)\s*(?:bagni?|bathrooms?)',
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, text_lower)
        if match:
            try:
                result[key] = int(match.group(1))
            except ValueError:
                pass
    
    return result


def parse_area_info(text: str) -> Optional[float]:
    """
    Parse area information from text (square meters).
    
    Args:
        text: Text containing area information
        
    Returns:
        Area in square meters or None
    """
    if not text:
        return None
    
    # Look for area patterns
    area_patterns = [
        r'(\d+(?:[.,]\d+)?)\s*(?:m²|mq|sqm|square\s*meters?)',
        r'(\d+(?:[.,]\d+)?)\s*metri\s*quadri?'
    ]
    
    for pattern in area_patterns:
        match = re.search(pattern, text.lower())
        if match:
            try:
                area_str = match.group(1).replace(',', '.')
                return float(area_str)
            except ValueError:
                pass
    
    return None


def validate_email(email: str) -> bool:
    """
    Basic email validation.
    
    Args:
        email: Email address to validate
        
    Returns:
        True if email appears valid
    """
    if not email:
        return False
    
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(email_pattern, email))


def validate_phone(phone: str) -> bool:
    """
    Basic phone number validation for Italian numbers.
    
    Args:
        phone: Phone number to validate
        
    Returns:
        True if phone appears valid
    """
    if not phone:
        return False
    
    # Remove common formatting
    cleaned = re.sub(r'[^\d+]', '', phone)
    
    # Basic patterns for Italian phones
    italian_patterns = [
        r'^\+39\d{9,10}$',  # International format
        r'^39\d{9,10}$',    # Without +
        r'^3\d{9}$',        # Mobile
        r'^0\d{9,10}$'      # Landline
    ]
    
    return any(re.match(pattern, cleaned) for pattern in italian_patterns)


class Timer:
    """Simple timer for measuring scraping performance."""
    
    def __init__(self):
        self.start_time = None
        self.end_time = None
    
    def start(self):
        """Start timing."""
        self.start_time = time.time()
        return self
    
    def stop(self):
        """Stop timing."""
        self.end_time = time.time()
        return self
    
    def elapsed(self) -> float:
        """Get elapsed time in seconds."""
        if self.start_time is None:
            return 0.0
        
        end = self.end_time or time.time()
        return end - self.start_time
    
    def __enter__(self):
        """Context manager entry."""
        return self.start()
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.stop()


def retry_on_failure(max_retries: int = 3, delay: float = 1.0):
    """
    Decorator for retrying function calls on failure.
    
    Args:
        max_retries: Maximum number of retry attempts
        delay: Delay between retries in seconds
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries:
                        await asyncio.sleep(delay * (2 ** attempt))  # Exponential backoff
                    
            raise last_exception
        
        return wrapper
    return decorator
