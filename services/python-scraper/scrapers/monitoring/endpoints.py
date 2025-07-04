"""
Monitoring endpoints for scraper metrics and health.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from .metrics import get_metrics_collector, MetricsCollector
from .notifications import get_notification_system, ErrorNotificationSystem
from .logging import get_scraper_logger


# Response models
class HealthResponse(BaseModel):
    """System health response model."""
    status: str
    timestamp: str
    active_operations: int
    total_scrapers: int
    total_errors_24h: int
    avg_response_time: float
    uptime_seconds: Optional[float] = None


class OperationMetricsResponse(BaseModel):
    """Operation metrics response model."""
    scraper_name: str
    operation_id: str
    start_time: str
    end_time: Optional[str]
    duration: Optional[float]
    status: str
    error_message: Optional[str]
    requests: Dict[str, Any]
    data: Dict[str, Any]
    errors: Dict[str, Any]
    performance: Dict[str, Any]


class ScraperStatsResponse(BaseModel):
    """Scraper statistics response model."""
    scraper_name: str
    period_hours: int
    operations_count: int
    total_properties: int
    avg_duration: float
    success_rate: float
    error_rate: float
    avg_properties_per_minute: float
    recent_request_times: List[float]
    error_breakdown: Dict[str, int]


class AlertResponse(BaseModel):
    """Alert response model."""
    scraper_name: str
    error_type: str
    message: str
    timestamp: str
    severity: str
    operation_id: Optional[str]
    url: Optional[str]
    context: Optional[Dict[str, Any]]


# Create router
router = APIRouter(prefix="/monitoring", tags=["monitoring"])

# System startup time for uptime calculation
_startup_time = datetime.utcnow()


@router.get("/health", response_model=HealthResponse)
async def get_system_health(
    metrics: MetricsCollector = Depends(get_metrics_collector)
) -> HealthResponse:
    """Get overall system health status."""
    
    health_data = metrics.get_system_health()
    uptime = (datetime.utcnow() - _startup_time).total_seconds()
    
    return HealthResponse(
        status=health_data["system_status"],
        timestamp=health_data["timestamp"],
        active_operations=health_data["active_operations"],
        total_scrapers=health_data["total_scrapers"],
        total_errors_24h=health_data["total_errors_24h"],
        avg_response_time=health_data["avg_response_time"],
        uptime_seconds=uptime
    )


@router.get("/operations", response_model=List[OperationMetricsResponse])
async def get_active_operations(
    metrics: MetricsCollector = Depends(get_metrics_collector)
) -> List[OperationMetricsResponse]:
    """Get all currently active scraping operations."""
    
    active_ops = metrics.get_active_operations()
    
    return [
        OperationMetricsResponse(
            scraper_name=op["scraper_name"],
            operation_id=op["operation_id"],
            start_time=op["start_time"],
            end_time=op["end_time"],
            duration=op["duration"],
            status=op["status"],
            error_message=op["error_message"],
            requests=op["requests"],
            data=op["data"],
            errors=op["errors"],
            performance=op["performance"]
        )
        for op in active_ops
    ]


@router.get("/operations/{operation_id}", response_model=OperationMetricsResponse)
async def get_operation_metrics(
    operation_id: str,
    metrics: MetricsCollector = Depends(get_metrics_collector)
) -> OperationMetricsResponse:
    """Get metrics for a specific operation."""
    
    operation_data = metrics.get_operation_metrics(operation_id)
    
    if not operation_data:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    return OperationMetricsResponse(
        scraper_name=operation_data["scraper_name"],
        operation_id=operation_data["operation_id"],
        start_time=operation_data["start_time"],
        end_time=operation_data["end_time"],
        duration=operation_data["duration"],
        status=operation_data["status"],
        error_message=operation_data["error_message"],
        requests=operation_data["requests"],
        data=operation_data["data"],
        errors=operation_data["errors"],
        performance=operation_data["performance"]
    )


@router.get("/scrapers/{scraper_name}/stats", response_model=ScraperStatsResponse)
async def get_scraper_statistics(
    scraper_name: str,
    hours: int = Query(24, ge=1, le=168, description="Time period in hours (1-168)"),
    metrics: MetricsCollector = Depends(get_metrics_collector)
) -> ScraperStatsResponse:
    """Get statistics for a specific scraper."""
    
    stats = metrics.get_scraper_stats(scraper_name, hours)
    
    return ScraperStatsResponse(
        scraper_name=stats["scraper_name"],
        period_hours=stats["period_hours"],
        operations_count=stats["operations_count"],
        total_properties=stats["total_properties"],
        avg_duration=stats["avg_duration"],
        success_rate=stats["success_rate"],
        error_rate=stats["error_rate"],
        avg_properties_per_minute=stats["avg_properties_per_minute"],
        recent_request_times=stats["recent_request_times"],
        error_breakdown=stats["error_breakdown"]
    )


@router.get("/alerts", response_model=List[AlertResponse])
async def get_recent_alerts(
    hours: int = Query(24, ge=1, le=168, description="Time period in hours (1-168)"),
    severity: Optional[str] = Query(None, regex="^(low|medium|high|critical)$"),
    scraper_name: Optional[str] = Query(None),
    notifications: ErrorNotificationSystem = Depends(get_notification_system)
) -> List[AlertResponse]:
    """Get recent error alerts with optional filtering."""
    
    alerts = notifications.get_recent_alerts(hours)
    
    # Apply filters
    if severity:
        severity_levels = {'low': 0, 'medium': 1, 'high': 2, 'critical': 3}
        min_level = severity_levels[severity]
        alerts = [
            alert for alert in alerts 
            if severity_levels.get(alert.severity, 0) >= min_level
        ]
    
    if scraper_name:
        alerts = [alert for alert in alerts if alert.scraper_name == scraper_name]
    
    return [
        AlertResponse(
            scraper_name=alert.scraper_name,
            error_type=alert.error_type,
            message=alert.message,
            timestamp=alert.timestamp.isoformat(),
            severity=alert.severity,
            operation_id=alert.operation_id,
            url=alert.url,
            context=alert.context
        )
        for alert in alerts
    ]


@router.get("/dashboard")
async def get_monitoring_dashboard(
    metrics: MetricsCollector = Depends(get_metrics_collector),
    notifications: ErrorNotificationSystem = Depends(get_notification_system)
) -> Dict[str, Any]:
    """Get comprehensive monitoring dashboard data."""
    
    # Get system health
    health = metrics.get_system_health()
    
    # Get active operations
    active_ops = metrics.get_active_operations()
    
    # Get recent alerts
    recent_alerts = notifications.get_recent_alerts(24)
    
    # Calculate some dashboard metrics
    alert_counts = {}
    for alert in recent_alerts:
        alert_counts[alert.severity] = alert_counts.get(alert.severity, 0) + 1
    
    # Get scraper performance summary
    scrapers_summary = []
    unique_scrapers = set(op["scraper_name"] for op in active_ops)
    
    for scraper_name in unique_scrapers:
        stats = metrics.get_scraper_stats(scraper_name, 24)
        scrapers_summary.append({
            "name": scraper_name,
            "operations_24h": stats["operations_count"],
            "success_rate": stats["success_rate"],
            "total_properties": stats["total_properties"],
            "avg_properties_per_minute": stats["avg_properties_per_minute"]
        })
    
    return {
        "system_health": health,
        "active_operations": len(active_ops),
        "operations_details": active_ops,
        "alerts_24h": {
            "total": len(recent_alerts),
            "by_severity": alert_counts,
            "recent": [
                {
                    "scraper": alert.scraper_name,
                    "type": alert.error_type,
                    "severity": alert.severity,
                    "time": alert.timestamp.isoformat(),
                    "message": alert.message[:100] + "..." if len(alert.message) > 100 else alert.message
                }
                for alert in recent_alerts[-10:]  # Last 10 alerts
            ]
        },
        "scrapers_summary": scrapers_summary,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/test-alert")
async def send_test_alert(
    scraper_name: str = Query(..., description="Scraper name for test alert"),
    severity: str = Query("medium", regex="^(low|medium|high|critical)$"),
    notifications: ErrorNotificationSystem = Depends(get_notification_system)
) -> Dict[str, str]:
    """Send a test alert (for testing notification channels)."""
    
    logger = get_scraper_logger('MonitoringAPI')
    
    alert = notifications.create_alert(
        scraper_name=scraper_name,
        error_type="test_alert",
        message=f"This is a test alert from the monitoring system for {scraper_name}",
        severity=severity,
        context={"test": True, "timestamp": datetime.utcnow().isoformat()}
    )
    
    await notifications.send_alert(alert, rate_limit_minutes=0)  # No rate limiting for test
    
    logger.info(f"Test alert sent for {scraper_name} with severity {severity}")
    
    return {
        "message": f"Test alert sent for {scraper_name}",
        "severity": severity,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/metrics/export")
async def export_metrics(
    format: str = Query("json", regex="^(json|csv)$"),
    hours: int = Query(24, ge=1, le=168),
    metrics: MetricsCollector = Depends(get_metrics_collector)
) -> Dict[str, Any]:
    """Export metrics in different formats."""
    
    if format == "json":
        # Export as JSON
        all_data = {
            "health": metrics.get_system_health(),
            "active_operations": metrics.get_active_operations(),
            "export_time": datetime.utcnow().isoformat(),
            "period_hours": hours
        }
        
        return all_data
    
    elif format == "csv":
        # For CSV, we would typically return a streaming response
        # For now, return instructions on how to get CSV data
        return {
            "message": "CSV export not implemented yet",
            "instructions": "Use the JSON format and convert client-side, or implement CSV streaming"
        }


# Health check endpoint for load balancers
@router.get("/ping")
async def ping() -> Dict[str, str]:
    """Simple ping endpoint for health checks."""
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "python-scraper-monitoring"
    }
