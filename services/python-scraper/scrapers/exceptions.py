"""
Custom exceptions for scraper operations.
"""


class ScraperException(Exception):
    """Base exception for all scraper-related errors."""
    
    def __init__(self, message: str, details: dict = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class RateLimitException(ScraperException):
    """Exception raised when rate limiting is triggered."""
    
    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = None, details: dict = None):
        self.retry_after = retry_after
        super().__init__(message, details)


class ValidationException(ScraperException):
    """Exception raised when data validation fails."""
    
    def __init__(self, message: str = "Data validation failed", field: str = None, details: dict = None):
        self.field = field
        super().__init__(message, details)


class NetworkException(ScraperException):
    """Exception raised for network-related issues."""
    
    def __init__(self, message: str = "Network error occurred", status_code: int = None, details: dict = None):
        self.status_code = status_code
        super().__init__(message, details)


class ParsingException(ScraperException):
    """Exception raised when parsing fails."""
    
    def __init__(self, message: str = "Parsing error occurred", selector: str = None, details: dict = None):
        self.selector = selector
        super().__init__(message, details)
