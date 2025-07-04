"""
JWT Token Validator for Node.js API Gateway integration.

This module provides local JWT token validation using the same secret
as the Node.js API Gateway, enabling secure inter-service communication.
"""

import jwt
import logging
from typing import Optional, Dict, Any, Union
from datetime import datetime, timezone

from config.settings import get_settings

logger = logging.getLogger(__name__)


class JWTValidator:
    """
    JWT token validator for API Gateway integration.
    
    Features:
    - Local JWT validation using shared secret
    - Access token and refresh token support
    - Multi-tenant validation
    - Token expiration checking
    - User information extraction
    """
    
    def __init__(self):
        self.settings = get_settings()
        self._access_secret = self.settings.api.jwt_secret_key
        self._refresh_secret = self.settings.api.jwt_refresh_secret_key
        self._pre_auth_secret = self.settings.api.jwt_pre_auth_secret_key
        self._algorithm = self.settings.api.jwt_algorithm
        
    def validate_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate access token and extract payload.
        
        Args:
            token: JWT access token string
            
        Returns:
            Dict with user information or None if invalid
        """
        try:
            # Decode and validate JWT token
            payload = jwt.decode(
                token,
                self._access_secret,  # Use access secret for access tokens
                algorithms=[self._algorithm],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_iat": True,
                    "require_exp": True,
                    "require_iat": True,
                    "require_sub": True
                }
            )
            
            # Validate required fields
            if not payload.get("sub"):
                logger.warning("JWT token missing required 'sub' field")
                return None
            
            # Extract user information (based on real token structure)
            user_info = {
                "user_id": payload["sub"],
                "name": payload.get("name"),
                "email": payload.get("email"), 
                "username": payload.get("username"),
                "tenant_id": payload.get("tenant_id"),
                "active_role_id": payload.get("active_role_id"),
                "active_role_name": payload.get("active_role_name"),
                "exp": payload.get("exp"),
                "iat": payload.get("iat"),
                "token_type": "access"
            }
            
            logger.debug(f"Access token validated for user: {user_info['user_id']}")
            return user_info
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error validating JWT token: {e}")
            return None
    
    def validate_refresh_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate refresh token and extract payload.
        
        Args:
            token: JWT refresh token string
            
        Returns:
            Dict with user information or None if invalid
        """
        try:
            # Use refresh secret for refresh tokens
            payload = jwt.decode(
                token,
                self._refresh_secret,
                algorithms=[self._algorithm],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_iat": True,
                    "require_exp": True,
                    "require_iat": True,
                    "require_sub": True
                }
            )
            
            user_info = {
                "user_id": payload["sub"],
                "tenant_id": payload.get("tenant_id"),
                "exp": payload.get("exp"),
                "iat": payload.get("iat"),
                "token_type": "refresh"
            }
            
            logger.debug(f"Refresh token validated for user: {user_info['user_id']}")
            return user_info
            
        except jwt.ExpiredSignatureError:
            logger.warning("Refresh token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid refresh token: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error validating refresh token: {e}")
            return None
    
    def validate_pre_auth_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate pre-auth token for role selection.
        
        Args:
            token: JWT pre-auth token string
            
        Returns:
            Dict with pre-auth information or None if invalid
        """
        try:
            # Use pre-auth secret for pre-auth tokens
            payload = jwt.decode(
                token,
                self._pre_auth_secret,
                algorithms=[self._algorithm],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_iat": True,
                    "require_exp": True,
                    "require_iat": True
                }
            )
            
            # Validate pre-auth token type
            if payload.get("type") != "pre_auth":
                logger.warning("Token is not a pre-auth token")
                return None
            
            pre_auth_info = {
                "user_id": payload.get("sub"),
                "tenant_id": payload.get("tenant_id"),
                "available_role_ids": payload.get("available_role_ids", []),  # Updated field name
                "jti": payload.get("jti"),  # JWT ID for tracking
                "exp": payload.get("exp"),
                "iat": payload.get("iat"),
                "token_type": "pre_auth"
            }
            
            logger.debug(f"Pre-auth token validated for user: {pre_auth_info['user_id']}")
            return pre_auth_info
            
        except jwt.ExpiredSignatureError:
            logger.warning("Pre-auth token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid pre-auth token: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error validating pre-auth token: {e}")
            return None
    
    def extract_token_from_header(self, authorization_header: str) -> Optional[str]:
        """
        Extract JWT token from Authorization header.
        
        Args:
            authorization_header: Authorization header value
            
        Returns:
            JWT token string or None if invalid format
        """
        if not authorization_header:
            return None
            
        # Check for Bearer token format
        if not authorization_header.startswith("Bearer "):
            logger.warning("Authorization header does not use Bearer format")
            return None
            
        # Extract token
        token = authorization_header[7:]  # Remove "Bearer " prefix
        
        if not token.strip():
            logger.warning("Empty token in Authorization header")
            return None
            
        return token.strip()
    
    def validate_token_for_tenant(self, user_info: Dict[str, Any], required_tenant_id: str) -> bool:
        """
        Validate that token is valid for the specified tenant.
        
        Args:
            user_info: User information from validated token
            required_tenant_id: Required tenant ID
            
        Returns:
            True if token is valid for tenant, False otherwise
        """
        token_tenant_id = user_info.get("tenant_id")
        
        if not token_tenant_id:
            logger.warning("Token does not contain tenant_id")
            return False
            
        if token_tenant_id != required_tenant_id:
            logger.warning(f"Token tenant_id {token_tenant_id} does not match required {required_tenant_id}")
            return False
            
        return True
    
    def is_token_expired(self, user_info: Dict[str, Any], buffer_seconds: int = 60) -> bool:
        """
        Check if token is expired or will expire soon.
        
        Args:
            user_info: User information from validated token
            buffer_seconds: Buffer time before expiration to consider token expired
            
        Returns:
            True if token is expired or will expire soon
        """
        exp_timestamp = user_info.get("exp")
        if not exp_timestamp:
            return True
            
        current_timestamp = datetime.now(timezone.utc).timestamp()
        return (exp_timestamp - buffer_seconds) <= current_timestamp
    
    def get_token_info(self, token: str) -> Dict[str, Any]:
        """
        Get comprehensive token information without full validation.
        
        Args:
            token: JWT token string
            
        Returns:
            Dict with token information
        """
        try:
            # Decode without verification to get info
            payload = jwt.decode(
                token,
                options={"verify_signature": False, "verify_exp": False}
            )
            
            return {
                "valid_format": True,
                "user_id": payload.get("sub"),
                "tenant_id": payload.get("tenant_id"),
                "active_role_id": payload.get("active_role_id"),
                "token_type": payload.get("type", "access"),
                "issued_at": payload.get("iat"),
                "expires_at": payload.get("exp"),
                "expired": self.is_token_expired(payload) if payload.get("exp") else None
            }
            
        except Exception as e:
            return {
                "valid_format": False,
                "error": str(e)
            }


# Global JWT validator instance
_jwt_validator: Optional[JWTValidator] = None


def get_jwt_validator() -> JWTValidator:
    """
    Get global JWT validator instance.
    
    Returns:
        JWTValidator instance
    """
    global _jwt_validator
    if _jwt_validator is None:
        _jwt_validator = JWTValidator()
    return _jwt_validator
