"""
Controllers package for NLP Service
"""

try:
    from .entity_controller import *
except ImportError:
    pass

__all__ = [
    "EntityController",
    "entity_router"
]
