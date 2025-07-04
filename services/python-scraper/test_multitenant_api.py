"""
Test for Multi-Tenant API Integration
Verifica funzionalità tenant isolation e API endpoints.
"""

import pytest
import asyncio
from datetime import datetime
from uuid import uuid4

from api.middleware.tenant_middleware import TenantDataIsolation, TenantContextManager
from services.data_pipeline import SearchResultMapper


def test_tenant_data_isolation():
    """Test basic tenant data isolation functionality."""
    print("🧪 Testing Tenant Data Isolation...")
    
    isolation = TenantDataIsolation()
    
    # Mock results from different tenants
    results = [
        {
            "id": "result_1",
            "tenant_id": "tenant_a",
            "external_url": "https://example.com/property_1",
            "basic_title": "Property A1",
            "basic_price": 400000
        },
        {
            "id": "result_2", 
            "tenant_id": "tenant_b",
            "external_url": "https://example.com/property_2",
            "basic_title": "Property B1",
            "basic_price": 500000
        },
        {
            "id": "result_3",
            "tenant_id": "tenant_a", 
            "external_url": "https://example.com/property_3",
            "basic_title": "Property A2",
            "basic_price": 450000
        }
    ]
    
    # Test filtering for tenant_a
    tenant_a_results = isolation.filter_results_by_tenant(results, "tenant_a")
    
    print(f"  ✅ Total results: {len(results)}")
    print(f"  ✅ Tenant A results: {len(tenant_a_results)}")
    
    assert len(tenant_a_results) == 2
    assert all(r["tenant_id"] == "tenant_a" for r in tenant_a_results)
    assert tenant_a_results[0]["id"] == "result_1"
    assert tenant_a_results[1]["id"] == "result_3"
    
    # Test filtering for tenant_b
    tenant_b_results = isolation.filter_results_by_tenant(results, "tenant_b")
    
    print(f"  ✅ Tenant B results: {len(tenant_b_results)}")
    
    assert len(tenant_b_results) == 1
    assert tenant_b_results[0]["tenant_id"] == "tenant_b"
    assert tenant_b_results[0]["id"] == "result_2"
    
    print("  ✅ Tenant data isolation working correctly")


def test_search_execution_creation():
    """Test search execution creation with tenant isolation."""
    print("\n🧪 Testing Search Execution Creation...")
    
    isolation = TenantDataIsolation()
    
    search_data = {
        "saved_search_id": "search_123",
        "search_criteria": {
            "location": "milano",
            "property_type": "apartment",
            "min_price": 300000
        },
        "platform": "immobiliare_it",
        "max_results": 50
    }
    
    tenant_id = "tenant_test"
    user_id = "user_123"
    
    search_execution = isolation.create_search_execution_for_tenant(
        search_data, tenant_id, user_id
    )
    
    print(f"  ✅ Search execution created: {search_execution['id']}")
    print(f"  ✅ Tenant ID: {search_execution['tenant_id']}")
    print(f"  ✅ User ID: {search_execution['user_id']}")
    print(f"  ✅ Status: {search_execution['status']}")
    
    assert search_execution["tenant_id"] == tenant_id
    assert search_execution["user_id"] == user_id
    assert search_execution["status"] == "pending"
    assert search_execution["metadata"]["tenant_isolated"] == True
    assert "id" in search_execution
    assert "created_at" in search_execution
    
    print("  ✅ Search execution creation working correctly")


def test_tenant_context_manager():
    """Test tenant context manager functionality."""
    print("\n🧪 Testing Tenant Context Manager...")
    
    tenant_id = "tenant_context_test"
    user_id = "user_context_123"
    
    with TenantContextManager(tenant_id, user_id) as tenant_ctx:
        
        # Test search execution creation
        search_data = {
            "saved_search_id": "search_ctx_123",
            "search_criteria": {"location": "roma"},
            "max_results": 25
        }
        
        search_execution = tenant_ctx.create_search_execution(search_data)
        
        print(f"  ✅ Context search execution: {search_execution['id']}")
        assert search_execution["tenant_id"] == tenant_id
        
        # Test result filtering
        mock_results = [
            {"id": "r1", "tenant_id": tenant_id, "title": "Property 1"},
            {"id": "r2", "tenant_id": "other_tenant", "title": "Property 2"},
            {"id": "r3", "tenant_id": tenant_id, "title": "Property 3"}
        ]
        
        filtered = tenant_ctx.filter_results(mock_results)
        
        print(f"  ✅ Filtered results: {len(filtered)}")
        assert len(filtered) == 2
        assert all(r["tenant_id"] == tenant_id for r in filtered)
    
    print("  ✅ Tenant context manager working correctly")


def test_tenant_resource_access_validation():
    """Test tenant resource access validation."""
    print("\n🧪 Testing Tenant Resource Access Validation...")
    
    isolation = TenantDataIsolation()
    
    # Test valid access
    resource = {
        "id": "resource_123",
        "tenant_id": "tenant_valid",
        "data": "some data"
    }
    
    valid_access = isolation.validate_tenant_access_to_resource(
        resource, "tenant_valid"
    )
    
    print(f"  ✅ Valid access test: {valid_access}")
    assert valid_access == True
    
    # Test invalid access
    invalid_access = isolation.validate_tenant_access_to_resource(
        resource, "tenant_invalid"
    )
    
    print(f"  ✅ Invalid access test: {invalid_access}")
    assert invalid_access == False
    
    print("  ✅ Tenant resource access validation working correctly")


def test_data_cleaning_for_tenant():
    """Test data cleaning for tenant security."""
    print("\n🧪 Testing Data Cleaning for Tenant...")
    
    isolation = TenantDataIsolation()
    
    dirty_result = {
        "id": "result_123",
        "tenant_id": "wrong_tenant",
        "external_url": "https://example.com/property",
        "basic_title": "Property Title",
        "internal_id": "SENSITIVE_INTERNAL_123",
        "raw_scraped_data": {"sensitive": "data"},
        "admin_metadata": {"admin_only": "info"}
    }
    
    cleaned_result = isolation._clean_result_for_tenant(dirty_result, "correct_tenant")
    
    print(f"  ✅ Original keys: {list(dirty_result.keys())}")
    print(f"  ✅ Cleaned keys: {list(cleaned_result.keys())}")
    
    # Check sensitive fields removed
    assert "internal_id" not in cleaned_result
    assert "raw_scraped_data" not in cleaned_result
    assert "admin_metadata" not in cleaned_result
    
    # Check tenant_id corrected
    assert cleaned_result["tenant_id"] == "correct_tenant"
    
    # Check safe fields preserved
    assert cleaned_result["external_url"] == dirty_result["external_url"]
    assert cleaned_result["basic_title"] == dirty_result["basic_title"]
    
    print("  ✅ Data cleaning working correctly")


if __name__ == "__main__":
    print("🚀 Starting Multi-Tenant API Integration Tests...")
    print("=" * 60)
    
    test_tenant_data_isolation()
    test_search_execution_creation()
    test_tenant_context_manager()
    test_tenant_resource_access_validation()
    test_data_cleaning_for_tenant()
    
    print("\n✅ All Multi-Tenant Tests Passed!")
    print("🎯 Task 3.4: Multi-Tenant API Integration - COMPLETED")
