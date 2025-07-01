"""
Request ID Middleware

Provides request correlation IDs for tracking requests across services.
"""

import uuid
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add request correlation IDs.
    
    Adds a unique request ID to each HTTP request for tracing and correlation
    across services. The request ID is available in request state and response headers.
    """
    
    def __init__(self, app, header_name: str = "X-Request-ID"):
        """
        Initialize the request ID middleware.
        
        Args:
            app: ASGI application
            header_name: Header name for request ID
        """
        super().__init__(app)
        self.header_name = header_name
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and add request ID.
        
        Args:
            request: HTTP request
            call_next: Next middleware/endpoint
            
        Returns:
            Response: HTTP response with request ID header
        """
        # Generate or extract request ID
        request_id = request.headers.get(self.header_name) or str(uuid.uuid4())
        
        # Store request ID in request state for use in endpoints
        request.state.request_id = request_id
        
        # Add request ID to logging context
        with structlog.contextvars.bound_contextvars(request_id=request_id):
            logger.debug(
                "Processing request",
                method=request.method,
                path=request.url.path,
                request_id=request_id
            )
            
            # Process the request
            response = await call_next(request)
            
            # Add request ID to response headers
            response.headers[self.header_name] = request_id
            
            logger.debug(
                "Request completed",
                status_code=response.status_code,
                request_id=request_id
            )
            
            return response


def get_request_id(request: Request) -> str:
    """
    Get the request ID from the request state.
    
    Args:
        request: HTTP request
        
    Returns:
        str: Request correlation ID
    """
    return getattr(request.state, 'request_id', None)
