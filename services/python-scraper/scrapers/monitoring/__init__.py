"""
Monitoring module for scrapers.
Provides logging, metrics collection, error notifications, and monitoring endpoints.
"""

from .logging import ScraperLogger, get_scraper_logger
from .metrics import MetricsCollector, ScrapingMetrics, get_metrics_collector
from .notifications import (
    ErrorNotificationSystem,
    ErrorAlert,
    NotificationChannel,
    EmailNotificationChannel,
    SlackNotificationChannel,
    WebhookNotificationChannel,
    get_notification_system,
    severity_filter,
    scraper_filter
)
from .endpoints import router as monitoring_router
from .decorators import MonitoringContext, monitor_scraping_operation

__all__ = [
    # Logging
    'ScraperLogger',
    'get_scraper_logger',
    
    # Metrics
    'MetricsCollector',
    'ScrapingMetrics',
    'get_metrics_collector',
    
    # Notifications
    'ErrorNotificationSystem',
    'ErrorAlert',
    'NotificationChannel',
    'EmailNotificationChannel',
    'SlackNotificationChannel',
    'WebhookNotificationChannel',
    'get_notification_system',
    'severity_filter',
    'scraper_filter',
    
    # Endpoints
    'monitoring_router',
    
    # Decorators
    'MonitoringContext',
    'monitor_scraping_operation'
]
