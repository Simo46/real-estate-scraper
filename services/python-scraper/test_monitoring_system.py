"""
Test script for the monitoring system.
"""

import asyncio
import logging
import sys
import os
import time
from datetime import datetime

# Add the parent directory to the path so we can import the scrapers module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.monitoring import (
    get_scraper_logger,
    get_metrics_collector,
    get_notification_system,
    MonitoringContext,
    monitor_scraping_operation,
    ErrorAlert
)


async def test_logging_system():
    """Test the logging system."""
    print("🔍 Testing Logging System")
    print("=" * 30)
    
    # Test basic logging
    logger = get_scraper_logger("TestScraper")
    
    logger.info("Test info message", url="https://example.com", duration=1.5)
    logger.warning("Test warning message", status_code=429)
    logger.error("Test error message", error_type="NetworkError")
    logger.debug("Test debug message", properties_count=5)
    
    # Test operation context
    with logger.operation("test_operation", url="https://example.com"):
        await asyncio.sleep(0.1)  # Simulate work
        logger.info("Work completed inside operation")
    
    print("✅ Logging system test completed")


async def test_metrics_system():
    """Test the metrics collection system."""
    print("\n📊 Testing Metrics System")
    print("=" * 30)
    
    metrics = get_metrics_collector()
    
    # Start operation
    operation_metrics = metrics.start_operation("TestScraper", "test_op_123")
    
    # Record some metrics
    metrics.record_request("test_op_123", 0.5, success=True)
    metrics.record_request("test_op_123", 1.2, success=True)
    metrics.record_request("test_op_123", 0.8, success=False)
    
    metrics.record_data("test_op_123", properties_found=10, properties_scraped=8)
    metrics.record_error("test_op_123", "network")
    metrics.record_page_scraped("test_op_123", 2.1)
    
    # Complete operation
    metrics.complete_operation("test_op_123", "completed")
    
    # Get metrics
    operation_data = metrics.get_operation_metrics("test_op_123")
    print(f"✅ Operation metrics: {operation_data['requests']['total']} requests")
    print(f"✅ Success rate: {operation_data['requests']['successful']}/{operation_data['requests']['total']}")
    print(f"✅ Properties scraped: {operation_data['data']['properties_scraped']}")
    
    # Test active operations
    active_ops = metrics.get_active_operations()
    print(f"✅ Active operations: {len(active_ops)}")
    
    # Test scraper stats
    stats = metrics.get_scraper_stats("TestScraper", 1)
    print(f"✅ Scraper stats - operations: {stats['operations_count']}, success rate: {stats['success_rate']:.1f}%")
    
    # Test system health
    health = metrics.get_system_health()
    print(f"✅ System health: {health['system_status']}")
    
    print("✅ Metrics system test completed")


async def test_notification_system():
    """Test the notification system."""
    print("\n🔔 Testing Notification System")
    print("=" * 30)
    
    notifications = get_notification_system()
    
    # Create test alerts
    test_alerts = [
        notifications.create_alert(
            scraper_name="TestScraper",
            error_type="network_error",
            message="Test network error message",
            severity="medium",
            operation_id="test_op_123",
            url="https://example.com"
        ),
        notifications.create_alert(
            scraper_name="TestScraper",
            error_type="critical_failure",
            message="Test critical failure message",
            severity="critical",
            operation_id="test_op_456"
        )
    ]
    
    # Test alert creation
    for alert in test_alerts:
        print(f"✅ Created alert: {alert.error_type} - {alert.severity}")
    
    # Test notification methods (without actually sending)
    await notifications.notify_critical_error(
        "TestScraper",
        "This is a test critical error",
        operation_id="test_critical_123"
    )
    
    await notifications.notify_scraper_failure(
        "TestScraper",
        "This is a test scraper failure",
        operation_id="test_failure_456"
    )
    
    await notifications.notify_rate_limit(
        "TestScraper",
        "https://example.com",
        retry_after=60
    )
    
    # Get recent alerts
    recent_alerts = notifications.get_recent_alerts(1)
    print(f"✅ Recent alerts: {len(recent_alerts)}")
    
    for alert in recent_alerts:
        print(f"   - {alert.error_type}: {alert.severity}")
    
    print("✅ Notification system test completed")


async def test_monitoring_context():
    """Test the monitoring context manager."""
    print("\n🎯 Testing Monitoring Context")
    print("=" * 30)
    
    # Test successful operation
    async with MonitoringContext("TestScraper", "test_context_operation") as monitor:
        # Simulate some work
        await asyncio.sleep(0.1)
        
        # Record some metrics
        monitor.record_request(0.5, success=True)
        monitor.record_request(0.3, success=True)
        monitor.record_data(properties_found=5, properties_scraped=4)
        
        print("✅ Context operation completed successfully")
    
    # Test failed operation
    try:
        async with MonitoringContext("TestScraper", "test_context_failure") as monitor:
            monitor.record_request(0.2, success=False)
            monitor.record_error("parsing")
            raise ValueError("Test error for monitoring")
    except ValueError:
        print("✅ Context handled failure correctly")
    
    print("✅ Monitoring context test completed")


@monitor_scraping_operation(operation_name="decorated_test_operation")
async def test_decorated_function():
    """Test function with monitoring decorator."""
    await asyncio.sleep(0.1)
    return {"status": "success", "items": 3}


async def test_monitoring_decorators():
    """Test monitoring decorators."""
    print("\n🎨 Testing Monitoring Decorators")
    print("=" * 30)
    
    # Create a mock scraper object
    class MockScraper:
        def get_scraper_name(self):
            return "MockScraper"
    
    scraper = MockScraper()
    
    # Test decorated function
    result = await test_decorated_function()
    print(f"✅ Decorated function result: {result}")
    
    print("✅ Monitoring decorators test completed")


async def test_system_integration():
    """Test the complete monitoring system integration."""
    print("\n🔧 Testing System Integration")
    print("=" * 30)
    
    metrics = get_metrics_collector()
    notifications = get_notification_system()
    
    # Simulate a complete scraping workflow
    scraper_name = "IntegrationTestScraper"
    
    # Start multiple operations
    operations = []
    for i in range(3):
        op_id = f"integration_test_{i}"
        op_metrics = metrics.start_operation(scraper_name, op_id)
        operations.append(op_id)
        
        # Simulate different outcomes
        if i == 0:
            # Successful operation
            metrics.record_request(op_id, 0.5, success=True)
            metrics.record_data(op_id, properties_found=5, properties_scraped=5)
            metrics.complete_operation(op_id, "completed")
        
        elif i == 1:
            # Failed operation
            metrics.record_request(op_id, 1.0, success=False)
            metrics.record_error(op_id, "network")
            metrics.complete_operation(op_id, "failed", "Network timeout")
        
        else:
            # Leave one active
            metrics.record_request(op_id, 0.3, success=True)
            metrics.record_data(op_id, properties_found=2, properties_scraped=1)
    
    # Check integration results
    active_ops = metrics.get_active_operations()
    print(f"✅ Active operations after simulation: {len(active_ops)}")
    
    stats = metrics.get_scraper_stats(scraper_name, 1)
    print(f"✅ Integration test stats:")
    print(f"   - Operations: {stats['operations_count']}")
    print(f"   - Success rate: {stats['success_rate']:.1f}%")
    print(f"   - Total properties: {stats['total_properties']}")
    
    health = metrics.get_system_health()
    print(f"✅ System health: {health['system_status']}")
    print(f"   - Total errors: {health['total_errors_24h']}")
    print(f"   - Avg response time: {health['avg_response_time']:.3f}s")
    
    print("✅ System integration test completed")


async def main():
    """Main test function."""
    print("🧪 Testing Monitoring System")
    print("=" * 50)
    
    # Configure basic logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        await test_logging_system()
        await test_metrics_system()
        await test_notification_system()
        await test_monitoring_context()
        await test_monitoring_decorators()
        await test_system_integration()
        
        print("\n🎉 All monitoring system tests passed!")
        return 0
        
    except Exception as e:
        print(f"\n❌ Test failed with exception: {str(e)}")
        logging.exception("Test failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
