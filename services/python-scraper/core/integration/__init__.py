"""
Node.js API Gateway integration module.

This module provides authentication and communication with the Node.js API Gateway,
including JWT token validation, user information retrieval, and API calls.
"""

from .jwt_validator import JWTValidator, get_jwt_validator
from .api_client import APIGatewayClient, get_api_client, close_api_client
from .auth_service import AuthService, AuthenticatedUser, get_auth_service, close_auth_service

__all__ = [
    # JWT Validation
    "JWTValidator",
    "get_jwt_validator",
    
    # API Client
    "APIGatewayClient", 
    "get_api_client",
    "close_api_client",
    
    # Auth Service
    "AuthService",
    "AuthenticatedUser",
    "get_auth_service",
    "close_auth_service"
]
