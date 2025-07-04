"""
API Routes Index

Imports and exports all API routes for easy inclusion in the main application.
"""

from .health import router as health_router
from .scraping import router as scraping_router

__all__ = ["health_router", "scraping_router"]
