"""
API Gateway Client for Node.js backend integration.

This module provides HTTP client functionality for communicating with
the Node.js API Gateway, including authentication, user management,
and search execution coordination.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
import json

import httpx
from httpx import AsyncClient, Response, RequestError, HTTPStatusError

from config.settings import get_settings

logger = logging.getLogger(__name__)


class APIGatewayClient:
    """
    HTTP client for Node.js API Gateway integration.
    
    Features:
    - Async HTTP client with connection pooling
    - JWT token management and refresh
    - Multi-tenant support
    - Retry logic with exponential backoff
    - Error handling and logging
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = str(self.settings.api.api_gateway_url).rstrip('/')
        self.timeout = self.settings.api.api_timeout
        self.max_retries = self.settings.api.api_max_retries
        
        # HTTP client with connection pooling
        self.client: Optional[AsyncClient] = None
        self._client_lock = asyncio.Lock()
        
    async def _get_client(self) -> AsyncClient:
        """Get or create HTTP client with connection pooling"""
        async with self._client_lock:
            if self.client is None:
                self.client = AsyncClient(
                    timeout=httpx.Timeout(self.timeout),
                    limits=httpx.Limits(
                        max_keepalive_connections=10,
                        max_connections=20,
                        keepalive_expiry=30.0
                    ),
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Python-Scraper-Service/1.0"
                    }
                )
            return self.client
    
    async def close(self):
        """Close HTTP client and cleanup connections"""
        async with self._client_lock:
            if self.client:
                await self.client.aclose()
                self.client = None
    
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        retry_count: int = 0
    ) -> Optional[Response]:
        """
        Make HTTP request with retry logic.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            headers: Additional headers
            data: JSON payload for POST/PUT requests
            params: Query parameters
            retry_count: Current retry attempt
            
        Returns:
            Response object or None if all retries failed
        """
        url = f"{self.base_url}{endpoint}"
        client = await self._get_client()
        
        # Prepare request headers
        request_headers = {}
        if headers:
            request_headers.update(headers)
        
        try:
            # Make HTTP request
            if method.upper() == "GET":
                response = await client.get(url, headers=request_headers, params=params)
            elif method.upper() == "POST":
                response = await client.post(url, headers=request_headers, json=data, params=params)
            elif method.upper() == "PUT":
                response = await client.put(url, headers=request_headers, json=data, params=params)
            elif method.upper() == "DELETE":
                response = await client.delete(url, headers=request_headers, params=params)
            elif method.upper() == "PATCH":
                response = await client.patch(url, headers=request_headers, json=data, params=params)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            # Log request details
            logger.debug(f"API request: {method} {url} -> {response.status_code}")
            
            return response
            
        except (RequestError, HTTPStatusError) as e:
            logger.warning(f"API request failed (attempt {retry_count + 1}): {e}")
            
            # Retry logic with exponential backoff
            if retry_count < self.max_retries:
                wait_time = (retry_count + 1) * 2  # 2s, 4s, 6s
                logger.info(f"Retrying API request in {wait_time}s...")
                await asyncio.sleep(wait_time)
                return await self._make_request(method, endpoint, headers, data, params, retry_count + 1)
            
            logger.error(f"API request failed after {self.max_retries + 1} attempts")
            return None
        
        except Exception as e:
            logger.error(f"Unexpected error in API request: {e}")
            return None
    
    async def verify_token(self, token: str, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Verify JWT token with API Gateway.
        
        Args:
            token: JWT access token
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            User information if token is valid, None otherwise
        """
        headers = {"Authorization": f"Bearer {token}"}
        
        # Add tenant header if provided
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        response = await self._make_request("GET", "/api/auth/me", headers=headers)
        
        if response and response.status_code == 200:
            try:
                user_data = response.json()
                if user_data.get("status") == "success":
                    return user_data.get("data", {})
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from auth verification")
        
        return None
    
    async def login(
        self,
        username: str,
        password: str,
        tenant_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Login to API Gateway.
        
        Args:
            username: User username
            password: User password
            tenant_id: Tenant ID for multi-tenant login
            
        Returns:
            Login response with tokens or role selection info
        """
        headers = {}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        data = {
            "username": username,
            "password": password
        }
        
        response = await self._make_request("POST", "/api/auth/login", headers=headers, data=data)
        
        if response and response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from login")
        
        return None
    
    async def login_with_role(
        self,
        username: str,
        password: str,
        role_id: str,
        tenant_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Login directly with specific role.
        
        Args:
            username: User username
            password: User password
            role_id: Specific role ID to use
            tenant_id: Tenant ID for multi-tenant login
            
        Returns:
            Login response with tokens
        """
        headers = {}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        data = {
            "username": username,
            "password": password,
            "roleId": role_id
        }
        
        response = await self._make_request("POST", "/api/auth/login-with-role", headers=headers, data=data)
        
        if response and response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from login-with-role")
        
        return None
    
    async def confirm_role(
        self,
        pre_auth_token: str,
        role_id: str,
        tenant_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Confirm role selection after multi-role login.
        
        Args:
            pre_auth_token: Pre-authentication token
            role_id: Selected role ID
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            Final login response with tokens
        """
        headers = {}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        data = {
            "preAuthToken": pre_auth_token,
            "roleId": role_id
        }
        
        response = await self._make_request("POST", "/api/auth/confirm-role", headers=headers, data=data)
        
        if response and response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from confirm-role")
        
        return None
    
    async def refresh_token(
        self,
        refresh_token: str,
        tenant_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Refresh access token using refresh token.
        
        Args:
            refresh_token: JWT refresh token
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            New tokens or None if refresh failed
        """
        headers = {}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        data = {
            "refreshToken": refresh_token
        }
        
        response = await self._make_request("POST", "/api/auth/refresh", headers=headers, data=data)
        
        if response and response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from token refresh")
        
        return None
    
    async def get_user_abilities(
        self,
        token: str,
        tenant_id: Optional[str] = None
    ) -> Optional[List[str]]:
        """
        Get user abilities for authorization checks.
        
        Args:
            token: JWT access token
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            List of ability names or None if request failed
        """
        headers = {"Authorization": f"Bearer {token}"}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        response = await self._make_request("GET", "/api/auth/ui-abilities", headers=headers)
        
        if response and response.status_code == 200:
            try:
                result = response.json()
                if result.get("status") == "success":
                    return result.get("data", {}).get("abilities", [])
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from user abilities")
        
        return None
    
    async def create_search_execution(
        self,
        token: str,
        saved_search_id: str,
        execution_type: str = "manual",
        tenant_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Create a search execution in the API Gateway.
        
        Args:
            token: JWT access token
            saved_search_id: ID of the saved search to execute
            execution_type: Type of execution (manual, scheduled, etc.)
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            Search execution response or None if failed
        """
        headers = {"Authorization": f"Bearer {token}"}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        data = {
            "saved_search_id": saved_search_id,
            "execution_type": execution_type
        }
        
        response = await self._make_request("POST", "/api/search-executions", headers=headers, data=data)
        
        if response and response.status_code == 201:
            try:
                return response.json()
            except json.JSONDecodeError:
                logger.error("Invalid JSON response from create search execution")
        
        return None
    
    async def update_search_execution_status(
        self,
        token: str,
        execution_id: str,
        status: str,
        results_count: Optional[int] = None,
        errors: Optional[List[str]] = None,
        tenant_id: Optional[str] = None
    ) -> bool:
        """
        Update search execution status.
        
        Args:
            token: JWT access token
            execution_id: ID of the search execution
            status: New status (running, completed, failed)
            results_count: Number of results found
            errors: List of error messages
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            True if update successful, False otherwise
        """
        headers = {"Authorization": f"Bearer {token}"}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        data = {
            "status": status
        }
        
        if results_count is not None:
            data["total_results_found"] = results_count
        
        if errors:
            data["execution_errors"] = errors
        
        if status == "completed":
            data["completed_at"] = datetime.utcnow().isoformat()
        
        response = await self._make_request(
            "PUT", 
            f"/api/search-executions/{execution_id}/status", 
            headers=headers, 
            data=data
        )
        
        return response is not None and response.status_code == 200
    
    async def create_search_results(
        self,
        token: str,
        execution_id: str,
        results: List[Dict[str, Any]],
        tenant_id: Optional[str] = None
    ) -> bool:
        """
        Create search results in batch.
        
        Args:
            token: JWT access token
            execution_id: ID of the search execution
            results: List of search result data
            tenant_id: Tenant ID for multi-tenant validation
            
        Returns:
            True if creation successful, False otherwise
        """
        headers = {"Authorization": f"Bearer {token}"}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        
        # Create results one by one (could be optimized with batch endpoint)
        success_count = 0
        
        for result_data in results:
            result_data["execution_id"] = execution_id
            
            response = await self._make_request("POST", "/api/search-results", headers=headers, data=result_data)
            
            if response and response.status_code == 201:
                success_count += 1
            else:
                logger.warning(f"Failed to create search result: {result_data.get('external_url', 'unknown')}")
        
        logger.info(f"Created {success_count}/{len(results)} search results")
        return success_count > 0
    
    async def get_connection_stats(self) -> Dict[str, Any]:
        """
        Get API client connection statistics.
        
        Returns:
            Dict with connection stats
        """
        if self.client:
            return {
                "connected": True,
                "base_url": self.base_url,
                "timeout": self.timeout,
                "max_retries": self.max_retries,
                "pool_connections": "Active"
            }
        else:
            return {
                "connected": False,
                "base_url": self.base_url,
                "timeout": self.timeout,
                "max_retries": self.max_retries
            }


# Global API client instance
_api_client: Optional[APIGatewayClient] = None


def get_api_client() -> APIGatewayClient:
    """
    Get global API client instance.
    
    Returns:
        APIGatewayClient instance
    """
    global _api_client
    if _api_client is None:
        _api_client = APIGatewayClient()
    return _api_client


async def close_api_client():
    """Close global API client"""
    global _api_client
    if _api_client:
        await _api_client.close()
        _api_client = None
