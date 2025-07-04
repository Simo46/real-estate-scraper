"""
Authentication Service for Python Scraper integration.

This service provides high-level authentication functionality,
coordinating JWT validation, API Gateway communication, and user management.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timezone

from .jwt_validator import get_jwt_validator
from .api_client import get_api_client

logger = logging.getLogger(__name__)


class AuthenticatedUser:
    """
    Represents an authenticated user with token management.
    """
    
    def __init__(self, user_data: Dict[str, Any], access_token: str, refresh_token: Optional[str] = None):
        self.user_id = user_data.get("id") or user_data.get("user_id")
        self.username = user_data.get("username")
        self.tenant_id = user_data.get("tenant_id")
        self.active_role_id = user_data.get("active_role_id")
        self.active_role_name = user_data.get("active_role_name")
        self.abilities = user_data.get("abilities", [])
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.token_expires_at = user_data.get("exp")
        self.authenticated_at = datetime.now(timezone.utc)
        
    def is_token_expired(self, buffer_seconds: int = 60) -> bool:
        """Check if access token is expired or will expire soon"""
        if not self.token_expires_at:
            return True
        
        current_timestamp = datetime.now(timezone.utc).timestamp()
        return (self.token_expires_at - buffer_seconds) <= current_timestamp
    
    def has_ability(self, ability_name: str) -> bool:
        """Check if user has specific ability"""
        return ability_name in self.abilities
    
    def has_any_ability(self, ability_names: list) -> bool:
        """Check if user has any of the specified abilities"""
        return any(ability in self.abilities for ability in ability_names)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "user_id": self.user_id,
            "username": self.username,
            "tenant_id": self.tenant_id,
            "active_role_id": self.active_role_id,
            "active_role_name": self.active_role_name,
            "abilities": self.abilities,
            "token_expires_at": self.token_expires_at,
            "authenticated_at": self.authenticated_at.isoformat()
        }


class AuthService:
    """
    High-level authentication service for Python Scraper.
    
    Features:
    - Token validation (local and remote)
    - User authentication and authorization
    - Token refresh management
    - Multi-tenant support
    - Integration with Node.js API Gateway
    """
    
    def __init__(self):
        self.jwt_validator = get_jwt_validator()
        self.api_client = get_api_client()
        
    async def authenticate_token(
        self,
        token: str,
        tenant_id: Optional[str] = None,
        verify_with_backend: bool = False
    ) -> Optional[AuthenticatedUser]:
        """
        Authenticate user by JWT token.
        
        Args:
            token: JWT access token
            tenant_id: Required tenant ID for multi-tenant validation
            verify_with_backend: Whether to verify token with API Gateway
            
        Returns:
            AuthenticatedUser object or None if authentication failed
        """
        try:
            # Step 1: Local JWT validation
            user_info = self.jwt_validator.validate_access_token(token)
            
            if not user_info:
                logger.warning("Local JWT validation failed")
                return None
            
            # Step 2: Tenant validation if required
            if tenant_id and not self.jwt_validator.validate_token_for_tenant(user_info, tenant_id):
                logger.warning("Token tenant validation failed")
                return None
            
            # Step 3: Backend verification if requested
            if verify_with_backend:
                backend_user_data = await self.api_client.verify_token(token, tenant_id)
                
                if not backend_user_data:
                    logger.warning("Backend token verification failed")
                    return None
                
                # Merge backend data with local token data
                user_info.update(backend_user_data)
                
                # Get user abilities from backend
                abilities = await self.api_client.get_user_abilities(token, tenant_id)
                if abilities:
                    user_info["abilities"] = abilities
            
            # Create authenticated user object
            authenticated_user = AuthenticatedUser(user_info, token)
            
            logger.info(f"User authenticated successfully: {authenticated_user.user_id}")
            return authenticated_user
            
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return None
    
    async def authenticate_credentials(
        self,
        username: str,
        password: str,
        tenant_id: Optional[str] = None,
        role_id: Optional[str] = None
    ) -> Tuple[Optional[AuthenticatedUser], Optional[Dict[str, Any]]]:
        """
        Authenticate user by username/password.
        
        Args:
            username: User username
            password: User password
            tenant_id: Tenant ID for multi-tenant login
            role_id: Specific role ID (for direct role login)
            
        Returns:
            Tuple of (AuthenticatedUser, additional_data)
            additional_data contains role selection info for multi-role users
        """
        try:
            # Choose login method based on role_id
            if role_id:
                # Direct role login
                login_response = await self.api_client.login_with_role(
                    username, password, role_id, tenant_id
                )
            else:
                # Standard login (may require role selection)
                login_response = await self.api_client.login(
                    username, password, tenant_id
                )
            
            if not login_response:
                logger.warning("Login request failed")
                return None, None
            
            login_status = login_response.get("status")
            login_data = login_response.get("data", {})
            
            if login_status == "success":
                # Successful login with tokens
                access_token = login_data.get("accessToken")
                refresh_token = login_data.get("refreshToken")
                user_data = login_data.get("user", {})
                
                if not access_token:
                    logger.error("Login response missing access token")
                    return None, None
                
                # Create authenticated user
                authenticated_user = AuthenticatedUser(user_data, access_token, refresh_token)
                
                logger.info(f"User login successful: {username}")
                return authenticated_user, None
                
            elif login_status == "choose_role":
                # Multi-role user needs to select role
                logger.info(f"Multi-role login requires role selection: {username}")
                return None, {
                    "requires_role_selection": True,
                    "pre_auth_token": login_data.get("preAuthToken"),
                    "available_roles": login_data.get("availableRoles", [])
                }
                
            else:
                logger.warning(f"Login failed: {login_response.get('message', 'Unknown error')}")
                return None, None
                
        except Exception as e:
            logger.error(f"Credential authentication error: {e}")
            return None, None
    
    async def confirm_role_selection(
        self,
        pre_auth_token: str,
        role_id: str,
        tenant_id: Optional[str] = None
    ) -> Optional[AuthenticatedUser]:
        """
        Confirm role selection for multi-role users.
        
        Args:
            pre_auth_token: Pre-authentication token from initial login
            role_id: Selected role ID
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            AuthenticatedUser object or None if confirmation failed
        """
        try:
            # Validate pre-auth token locally first
            pre_auth_info = self.jwt_validator.validate_pre_auth_token(pre_auth_token)
            
            if not pre_auth_info:
                logger.warning("Invalid pre-auth token")
                return None
            
            # Confirm role with backend
            confirm_response = await self.api_client.confirm_role(
                pre_auth_token, role_id, tenant_id
            )
            
            if not confirm_response:
                logger.warning("Role confirmation request failed")
                return None
            
            if confirm_response.get("status") != "success":
                logger.warning(f"Role confirmation failed: {confirm_response.get('message')}")
                return None
            
            # Extract tokens and user data
            confirm_data = confirm_response.get("data", {})
            access_token = confirm_data.get("accessToken")
            refresh_token = confirm_data.get("refreshToken")
            user_data = confirm_data.get("user", {})
            
            if not access_token:
                logger.error("Role confirmation response missing access token")
                return None
            
            # Create authenticated user
            authenticated_user = AuthenticatedUser(user_data, access_token, refresh_token)
            
            logger.info(f"Role confirmation successful: {user_data.get('username')} -> {role_id}")
            return authenticated_user
            
        except Exception as e:
            logger.error(f"Role confirmation error: {e}")
            return None
    
    async def refresh_user_token(
        self,
        authenticated_user: AuthenticatedUser
    ) -> Optional[AuthenticatedUser]:
        """
        Refresh user's access token using refresh token.
        
        Args:
            authenticated_user: Current authenticated user
            
        Returns:
            Updated AuthenticatedUser with new tokens or None if refresh failed
        """
        try:
            if not authenticated_user.refresh_token:
                logger.warning("No refresh token available for user")
                return None
            
            # Validate refresh token locally first
            refresh_info = self.jwt_validator.validate_refresh_token(authenticated_user.refresh_token)
            
            if not refresh_info:
                logger.warning("Invalid refresh token")
                return None
            
            # Refresh with backend
            refresh_response = await self.api_client.refresh_token(
                authenticated_user.refresh_token,
                authenticated_user.tenant_id
            )
            
            if not refresh_response:
                logger.warning("Token refresh request failed")
                return None
            
            if refresh_response.get("status") != "success":
                logger.warning(f"Token refresh failed: {refresh_response.get('message')}")
                return None
            
            # Extract new tokens
            refresh_data = refresh_response.get("data", {})
            new_access_token = refresh_data.get("accessToken")
            new_refresh_token = refresh_data.get("refreshToken")
            
            if not new_access_token:
                logger.error("Token refresh response missing access token")
                return None
            
            # Update user with new tokens
            authenticated_user.access_token = new_access_token
            authenticated_user.refresh_token = new_refresh_token or authenticated_user.refresh_token
            
            # Update token expiration from new token
            new_token_info = self.jwt_validator.validate_access_token(new_access_token)
            if new_token_info:
                authenticated_user.token_expires_at = new_token_info.get("exp")
            
            logger.info(f"Token refresh successful for user: {authenticated_user.user_id}")
            return authenticated_user
            
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return None
    
    async def ensure_valid_token(
        self,
        authenticated_user: AuthenticatedUser,
        buffer_seconds: int = 120
    ) -> Optional[AuthenticatedUser]:
        """
        Ensure user has a valid access token, refreshing if necessary.
        
        Args:
            authenticated_user: Current authenticated user
            buffer_seconds: Refresh token if it expires within this time
            
        Returns:
            AuthenticatedUser with valid token or None if refresh failed
        """
        # Check if token needs refresh
        if not authenticated_user.is_token_expired(buffer_seconds):
            return authenticated_user
        
        logger.info("Access token expired or expiring soon, attempting refresh")
        
        # Attempt to refresh token
        refreshed_user = await self.refresh_user_token(authenticated_user)
        
        if refreshed_user:
            return refreshed_user
        else:
            logger.warning("Token refresh failed, user needs to re-authenticate")
            return None
    
    def extract_tenant_from_request(self, headers: Dict[str, str]) -> Optional[str]:
        """
        Extract tenant ID from request headers.
        
        Args:
            headers: HTTP request headers
            
        Returns:
            Tenant ID or None if not found
        """
        # Look for X-Tenant-ID header (development)
        tenant_id = headers.get("X-Tenant-ID") or headers.get("x-tenant-id")
        
        if tenant_id:
            return tenant_id
        
        # Could implement subdomain parsing here for production
        # e.g., agency1.app.com -> "agency1"
        
        return None
    
    async def close(self):
        """Close authentication service and cleanup resources"""
        await self.api_client.close()


# Global auth service instance
_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    """
    Get global auth service instance.
    
    Returns:
        AuthService instance
    """
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service


async def close_auth_service():
    """Close global auth service"""
    global _auth_service
    if _auth_service:
        await _auth_service.close()
        _auth_service = None
