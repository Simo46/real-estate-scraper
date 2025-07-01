"""
Logging Middleware

Provides structured logging for all HTTP requests and responses.
Uses structlog for consistent, JSON-formatted logging.
"""

import time
import uuid
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for logging HTTP requests and responses.
    
    Logs request details, response status, and timing information
    using structured logging for better observability.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process HTTP request and log details.
        
        Args:
            request: HTTP request
            call_next: Next middleware/handler in chain
            
        Returns:
            Response: HTTP response
        """
        
        # Generate request ID for tracing
        request_id = str(uuid.uuid4())
        
        # Add request ID to request state for access in handlers
        request.state.request_id = request_id
        
        # Extract request information
        start_time = time.time()
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # Log incoming request
        logger.info(
            "HTTP request started",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            query_params=str(request.query_params),
            client_ip=client_ip,
            user_agent=user_agent,
            content_length=request.headers.get("content-length", 0)
        )
        
        try:
            # Process request
            response = await call_next(request)
            
            # Calculate processing time
            process_time = time.time() - start_time
            
            # Log response
            logger.info(
                "HTTP request completed",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                process_time_ms=round(process_time * 1000, 2),
                response_size=response.headers.get("content-length", 0)
            )
            
            # Add custom headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
            
            return response
            
        except Exception as exc:
            # Calculate processing time for error case
            process_time = time.time() - start_time
            
            # Log error
            logger.error(
                "HTTP request failed",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                error=str(exc),
                process_time_ms=round(process_time * 1000, 2),
                exc_info=True
            )
            
            # Re-raise the exception
            raise
    
    def _get_client_ip(self, request: Request) -> str:
        """
        Extract client IP address from request.
        
        Handles various proxy headers for accurate IP detection.
        
        Args:
            request: HTTP request
            
        Returns:
            str: Client IP address
        """
        
        # Check for forwarded IP headers (common in reverse proxy setups)
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # X-Forwarded-For can contain multiple IPs, take the first one
            return forwarded_for.split(",")[0].strip()
        
        # Check for real IP header
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        
        # Fallback to direct client IP
        if request.client:
            return request.client.host
        
        return "unknown"
