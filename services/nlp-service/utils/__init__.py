"""
Utils package for NLP Service
"""

try:
    from .spacy_utils import *
    from .real_estate_utils import *
except ImportError:
    pass

__all__ = [
    # spaCy utilities
    "SpacyManager",
    "ModelStatus",
    "download_spacy_model",
    "get_spacy_model",
    
    # Real estate utilities  
    "RealEstateNormalizer",
    "LocationNormalizer",
    "PriceNormalizer",
    "PropertyTypeNormalizer",
    "DimensionNormalizer",
    "ConditionNormalizer"
]
