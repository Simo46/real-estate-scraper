"""
Services package for NLP Service
"""

try:
    from .entity_service import *
except ImportError:
    pass

__all__ = [
    "EntityService",
    "EntityExtractionConfig",
    "EntityExtractionResult"
]
