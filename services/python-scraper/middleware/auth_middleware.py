"""
Authentication Middleware

Handles JWT token validation and authentication for protected endpoints.
Integrates with the Node.js API Gateway for token verification.
"""

import httpx
import structlog
from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable, Optional, Set

from config.settings import get_settings

logger = structlog.get_logger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware for JWT authentication and authorization.
    
    Validates JWT tokens for protected endpoints and integrates
    with the Node.js API Gateway for token verification.
    """
    
    # Endpoints that don't require authentication
    PUBLIC_ENDPOINTS: Set[str] = {
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/health",  # Docker health check endpoint
        "/api/health/",
        "/api/health/status", 
        "/api/health/ready",
        "/api/health/live",
        "/api/health/metrics"
    }
    
    def __init__(self, app):
        """
        Initialize authentication middleware.
        
        Args:
            app: FastAPI application instance
        """
        super().__init__(app)
        self.settings = get_settings()
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process HTTP request and validate authentication.
        
        Args:
            request: HTTP request
            call_next: Next middleware/handler in chain
            
        Returns:
            Response: HTTP response
        """
        
        # Check if endpoint requires authentication
        if self._is_public_endpoint(request.url.path):
            return await call_next(request)
        
        # Extract and validate JWT token
        try:
            token = self._extract_token(request)
            if not token:
                raise HTTPException(
                    status_code=401,
                    detail="Missing authentication token"
                )
            
            # Validate token with API Gateway
            user_info = await self._validate_token(token)
            if not user_info:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired token"
                )
            
            # Add user information to request state
            request.state.user = user_info
            request.state.authenticated = True
            
            logger.debug(
                "Authentication successful",
                user_id=user_info.get("id"),
                path=request.url.path,
                method=request.method
            )
            
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as exc:
            logger.error(
                "Authentication error",
                error=str(exc),
                path=request.url.path,
                method=request.method,
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail="Authentication service error"
            )
        
        # Continue to next middleware/handler
        return await call_next(request)
    
    def _is_public_endpoint(self, path: str) -> bool:
        """
        Check if endpoint is public (doesn't require authentication).
        
        Args:
            path: Request path
            
        Returns:
            bool: True if endpoint is public
        """
        
        # Exact match for public endpoints
        if path in self.PUBLIC_ENDPOINTS:
            return True
        
        # Check for path prefixes that are public
        public_prefixes = ["/api/health", "/docs", "/redoc"]
        for prefix in public_prefixes:
            if path.startswith(prefix):
                return True
        
        # Special handling for trailing slashes
        path_normalized = path.rstrip('/')
        if path_normalized in self.PUBLIC_ENDPOINTS:
            return True
        
        return False
    
    def _extract_token(self, request: Request) -> Optional[str]:
        """
        Extract JWT token from request headers.
        
        Args:
            request: HTTP request
            
        Returns:
            Optional[str]: JWT token if found
        """
        
        # Check Authorization header (Bearer token)
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            return auth_header[7:]  # Remove "Bearer " prefix
        
        # Check for token in cookies (optional fallback)
        token_cookie = request.cookies.get("access_token")
        if token_cookie:
            return token_cookie
        
        return None
    
    async def _validate_token(self, token: str) -> Optional[dict]:
        """
        Validate JWT token with API Gateway.
        
        Args:
            token: JWT token to validate
            
        Returns:
            Optional[dict]: User information if token is valid
        """
        
        try:
            # Make request to API Gateway for token validation
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    self.settings.jwt_verify_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json={"token": token}
                )
                
                if response.status_code == 200:
                    user_data = response.json()
                    logger.debug(
                        "Token validation successful",
                        user_id=user_data.get("id")
                    )
                    return user_data
                else:
                    logger.warning(
                        "Token validation failed",
                        status_code=response.status_code,
                        response=response.text
                    )
                    return None
                    
        except httpx.TimeoutException:
            logger.error("Token validation timeout")
            return None
        except Exception as exc:
            logger.error(
                "Token validation error",
                error=str(exc),
                exc_info=True
            )
            return None
    
    def get_current_user(self, request: Request) -> Optional[dict]:
        """
        Get current authenticated user from request state.
        
        Args:
            request: HTTP request
            
        Returns:
            Optional[dict]: User information if authenticated
        """
        
        if hasattr(request.state, "user"):
            return request.state.user
        return None
    
    def is_authenticated(self, request: Request) -> bool:
        """
        Check if request is authenticated.
        
        Args:
            request: HTTP request
            
        Returns:
            bool: True if authenticated
        """
        
        return getattr(request.state, "authenticated", False)
