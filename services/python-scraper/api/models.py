"""
Standardized API Response Models

This module provides standardized response models for consistent API responses
across all endpoints in the Python Scraper Service.
"""

from typing import Any, Dict, List, Optional, Generic, TypeVar
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

# Generic type for data payload
T = TypeVar('T')


class ResponseStatus(str, Enum):
    """Standard API response status."""
    
    SUCCESS = "success"
    ERROR = "error"
    WARNING = "warning"


class APIResponse(BaseModel, Generic[T]):
    """
    Standard API response wrapper.
    
    Provides consistent response structure across all endpoints.
    """
    
    status: ResponseStatus = Field(
        default=ResponseStatus.SUCCESS,
        description="Response status"
    )
    message: str = Field(
        default="Operation completed successfully",
        description="Human-readable message"
    )
    data: Optional[T] = Field(
        default=None,
        description="Response payload data"
    )
    meta: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Response timestamp"
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Request correlation ID"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "message": "Operation completed successfully",
                "data": {"key": "value"},
                "meta": {"total": 100, "page": 1},
                "timestamp": "2025-07-01T10:00:00Z",
                "request_id": "req_123456"
            }
        }


class ErrorResponse(BaseModel):
    """Standard error response model."""
    
    status: ResponseStatus = Field(
        default=ResponseStatus.ERROR,
        description="Error status"
    )
    message: str = Field(
        description="Error message"
    )
    error_code: Optional[str] = Field(
        default=None,
        description="Error code for programmatic handling"
    )
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional error details"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Error timestamp"
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Request correlation ID"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "error",
                "message": "Resource not found",
                "error_code": "RESOURCE_NOT_FOUND",
                "details": {"resource_id": "123"},
                "timestamp": "2025-07-01T10:00:00Z",
                "request_id": "req_123456"
            }
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response model."""
    
    status: ResponseStatus = Field(
        default=ResponseStatus.SUCCESS,
        description="Response status"
    )
    message: str = Field(
        default="Data retrieved successfully",
        description="Response message"
    )
    data: List[T] = Field(
        description="Paginated data items"
    )
    pagination: Dict[str, Any] = Field(
        description="Pagination metadata"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Response timestamp"
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Request correlation ID"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "message": "Data retrieved successfully",
                "data": [{"id": 1}, {"id": 2}],
                "pagination": {
                    "total": 100,
                    "page": 1,
                    "per_page": 20,
                    "total_pages": 5,
                    "has_next": True,
                    "has_prev": False
                },
                "timestamp": "2025-07-01T10:00:00Z",
                "request_id": "req_123456"
            }
        }


class HealthCheckResponse(BaseModel):
    """Health check response model."""
    
    status: str = Field(
        description="Health status"
    )
    service: str = Field(
        description="Service name"
    )
    version: str = Field(
        description="Service version"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Check timestamp"
    )
    environment: str = Field(
        description="Environment name"
    )
    uptime_seconds: Optional[float] = Field(
        default=None,
        description="Service uptime in seconds"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "service": "python-scraper",
                "version": "1.0.0",
                "timestamp": "2025-07-01T10:00:00Z",
                "environment": "development",
                "uptime_seconds": 3600.5
            }
        }


class ReadinessCheckResponse(BaseModel):
    """Readiness check response model."""
    
    status: str = Field(
        description="Readiness status"
    )
    service: str = Field(
        description="Service name"
    )
    dependencies: Dict[str, str] = Field(
        description="Dependency check results"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Check timestamp"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "ready",
                "service": "python-scraper",
                "dependencies": {
                    "mongodb": "connected",
                    "redis": "connected",
                    "api_gateway": "accessible"
                },
                "timestamp": "2025-07-01T10:00:00Z"
            }
        }


# Utility functions for creating standardized responses
def success_response(
    data: Any = None,
    message: str = "Operation completed successfully",
    meta: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> APIResponse:
    """
    Create a success response.
    
    Args:
        data: Response data
        message: Success message
        meta: Additional metadata
        request_id: Request correlation ID
        
    Returns:
        APIResponse: Standardized success response
    """
    return APIResponse(
        status=ResponseStatus.SUCCESS,
        message=message,
        data=data,
        meta=meta,
        request_id=request_id
    )


def error_response(
    message: str,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> ErrorResponse:
    """
    Create an error response.
    
    Args:
        message: Error message
        error_code: Error code
        details: Additional error details
        request_id: Request correlation ID
        
    Returns:
        ErrorResponse: Standardized error response
    """
    return ErrorResponse(
        message=message,
        error_code=error_code,
        details=details,
        request_id=request_id
    )


def paginated_response(
    data: List[Any],
    total: int,
    page: int,
    per_page: int,
    message: str = "Data retrieved successfully",
    request_id: Optional[str] = None
) -> PaginatedResponse:
    """
    Create a paginated response.
    
    Args:
        data: List of data items
        total: Total number of items
        page: Current page number
        per_page: Items per page
        message: Response message
        request_id: Request correlation ID
        
    Returns:
        PaginatedResponse: Standardized paginated response
    """
    total_pages = (total + per_page - 1) // per_page  # Ceiling division
    
    return PaginatedResponse(
        message=message,
        data=data,
        pagination={
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        },
        request_id=request_id
    )
