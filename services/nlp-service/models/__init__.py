"""
Models package for NLP Service
"""

# Importiamo solo quello che serve, evitando import circolari
try:
    from .entities import *
    from .common import *
except ImportError:
    pass

__all__ = [
    # Entity models
    "EntityType",
    "EntityConfidence", 
    "RealEstateEntity",
    "LocationEntity",
    "PriceEntity",
    "PropertyTypeEntity",
    "DimensionEntity",
    "ConditionEntity",
    "EntityExtractionRequest",
    "EntityExtractionResponse",
    
    # Common models
    "BaseResponse",
    "ErrorResponse",
    "ValidationError"
]
