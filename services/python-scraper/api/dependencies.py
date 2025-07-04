"""
FastAPI Dependencies

Authentication and authorization dependencies for protected endpoints.
"""

from typing import Dict, Optional
from fastapi import Request, HTTPException, Depends
import structlog

from middleware.auth_middleware import AuthMiddleware

logger = structlog.get_logger(__name__)


# Global auth middleware instance for dependency functions
_auth_middleware = None


def get_auth_middleware() -> AuthMiddleware:
    """Get or create auth middleware instance."""
    global _auth_middleware
    if _auth_middleware is None:
        _auth_middleware = AuthMiddleware(None)  # App not needed for dependency functions
    return _auth_middleware


def get_current_user(request: Request) -> Dict:
    """
    Get current authenticated user from request.
    
    This dependency ensures the request is authenticated and returns
    the user information from the JWT token.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Dict: User information from JWT
        
    Raises:
        HTTPException: If user is not authenticated
    """
    auth_middleware = get_auth_middleware()
    
    if not auth_middleware.is_authenticated(request):
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    
    user = auth_middleware.get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="User information not available"
        )
    
    return user


def get_current_user_optional(request: Request) -> Optional[Dict]:
    """
    Get current authenticated user from request (optional).
    
    This dependency returns user information if authenticated,
    but doesn't require authentication.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Optional[Dict]: User information if authenticated, None otherwise
    """
    auth_middleware = get_auth_middleware()
    
    if auth_middleware.is_authenticated(request):
        return auth_middleware.get_current_user(request)
    
    return None


def require_tenant(tenant_id: str):
    """
    Create a dependency that requires a specific tenant.
    
    Args:
        tenant_id: Required tenant ID
        
    Returns:
        Dependency function that validates tenant access
    """
    def _require_tenant(user: Dict = Depends(get_current_user)) -> Dict:
        user_tenant_id = user.get("tenant_id")
        if user_tenant_id != tenant_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: requires tenant {tenant_id}"
            )
        return user
    
    return _require_tenant


def require_role(role_id: str):
    """
    Create a dependency that requires a specific role.
    
    Args:
        role_id: Required role ID
        
    Returns:
        Dependency function that validates role access
    """
    def _require_role(user: Dict = Depends(get_current_user)) -> Dict:
        user_role_id = user.get("role_id")
        if user_role_id != role_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: requires role {role_id}"
            )
        return user
    
    return _require_role


def require_permission(permission: str):
    """
    Create a dependency that requires a specific permission.
    
    Args:
        permission: Required permission
        
    Returns:
        Dependency function that validates permission
    """
    def _require_permission(user: Dict = Depends(get_current_user)) -> Dict:
        user_permissions = user.get("permissions", [])
        if permission not in user_permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: requires permission '{permission}'"
            )
        return user
    
    return _require_permission


async def get_fresh_user_info(request: Request) -> Dict:
    """
    Get fresh user information from API Gateway.
    
    This dependency fetches the most up-to-date user information
    from the API Gateway instead of relying on JWT payload.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Dict: Fresh user information
        
    Raises:
        HTTPException: If authentication fails or user info unavailable
    """
    auth_middleware = get_auth_middleware()
    
    # First ensure basic authentication
    user = get_current_user(request)
    
    # Get fresh user info from API Gateway
    fresh_info = await auth_middleware.get_fresh_user_info(request)
    if not fresh_info:
        logger.warning(
            "Failed to fetch fresh user info",
            user_id=user.get("id")
        )
        # Fallback to JWT user info
        return user
    
    return fresh_info


def get_tenant_context(user: Dict = Depends(get_current_user)):
    """
    Get tenant context from authenticated user.
    
    Args:
        user: Authenticated user from get_current_user
        
    Returns:
        Dict: Tenant context information
        
    Raises:
        HTTPException: If tenant information is missing
    """
    tenant_id = user.get("tenant_id")
    user_id = user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Tenant ID required for this operation"
        )
    
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="User ID required for this operation"
        )
    
    return {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "user": user
    }


def validate_tenant_resource_access(resource_tenant_id: str):
    """
    Create a dependency that validates tenant access to a specific resource.
    
    Args:
        resource_tenant_id: Tenant ID of the resource
        
    Returns:
        Dependency function that validates access
    """
    def _validate_access(tenant_context: Dict = Depends(get_tenant_context)) -> Dict:
        requesting_tenant_id = tenant_context["tenant_id"]
        
        if requesting_tenant_id != resource_tenant_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: resource belongs to different tenant"
            )
        
        return tenant_context
    
    return _validate_access


def require_tenant_admin(user: Dict = Depends(get_current_user)) -> Dict:
    """
    Require tenant admin privileges.
    
    Args:
        user: Authenticated user
        
    Returns:
        Dict: User information if admin
        
    Raises:
        HTTPException: If user is not tenant admin
    """
    user_roles = user.get("roles", [])
    tenant_id = user.get("tenant_id")
    
    if "tenant_admin" not in user_roles and "admin" not in user_roles:
        raise HTTPException(
            status_code=403,
            detail="Tenant admin privileges required"
        )
    
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Tenant ID required for admin operations"
        )
    
    return user
