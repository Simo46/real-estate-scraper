"""
Decorators for automatic monitoring of scraper operations.
"""

import asyncio
import functools
import time
import traceback
from typing import Callable, Any, Optional
from datetime import datetime

from .logging import get_scraper_logger
from .metrics import get_metrics_collector
from .notifications import get_notification_system


def monitor_scraping_operation(
    operation_name: str = None,
    track_requests: bool = True,
    track_errors: bool = True,
    notify_on_failure: bool = True,
    min_duration_for_alert: float = 300.0  # 5 minutes
):
    """
    Decorator to automatically monitor scraping operations.
    
    Args:
        operation_name: Name for the operation (defaults to function name)
        track_requests: Whether to track HTTP requests
        track_errors: Whether to track and categorize errors
        notify_on_failure: Whether to send notifications on failures
        min_duration_for_alert: Minimum duration before sending slow operation alerts
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            # Get scraper instance (should be first argument)
            scraper = args[0] if args else None
            scraper_name = getattr(scraper, 'get_scraper_name', lambda: func.__name__)()
            
            # Initialize monitoring
            logger = get_scraper_logger(scraper_name)
            metrics = get_metrics_collector()
            notifications = get_notification_system()
            
            # Start operation tracking
            operation_id = f"{scraper_name}_{int(time.time())}"
            operation_metrics = metrics.start_operation(scraper_name, operation_id)
            
            start_time = time.time()
            
            logger.info(
                f"Starting {operation_name or func.__name__}",
                operation_id=operation_id,
                function=func.__name__
            )
            
            try:
                # Execute the function
                result = await func(*args, **kwargs)
                
                # Calculate duration
                duration = time.time() - start_time
                
                # Extract metrics from result if it's a ScrapingResult
                if hasattr(result, 'properties') and hasattr(result, 'total_scraped'):
                    metrics.record_data(
                        operation_id,
                        properties_found=result.total_found,
                        properties_scraped=result.total_scraped,
                        validation_errors=len(result.errors)
                    )
                
                # Mark operation as completed
                metrics.complete_operation(operation_id, "completed")
                
                # Log success
                logger.info(
                    f"Completed {operation_name or func.__name__}",
                    operation_id=operation_id,
                    duration=duration,
                    status="success"
                )
                
                # Check for slow operations
                if duration > min_duration_for_alert and notify_on_failure:
                    await notifications.send_alert(
                        notifications.create_alert(
                            scraper_name=scraper_name,
                            error_type="slow_operation",
                            message=f"Operation {operation_name or func.__name__} took {duration:.2f} seconds",
                            severity="medium",
                            operation_id=operation_id,
                            context={"duration": duration, "threshold": min_duration_for_alert}
                        )
                    )
                
                return result
                
            except Exception as e:
                # Calculate duration
                duration = time.time() - start_time
                error_type = type(e).__name__
                
                # Record error metrics
                if track_errors:
                    # Categorize error type
                    if "network" in error_type.lower() or "connection" in error_type.lower():
                        metrics.record_error(operation_id, "network")
                    elif "parsing" in error_type.lower() or "extraction" in error_type.lower():
                        metrics.record_error(operation_id, "parsing")
                    elif "rate" in error_type.lower() and "limit" in error_type.lower():
                        metrics.record_error(operation_id, "rate_limit")
                    else:
                        metrics.record_error(operation_id, "other")
                
                # Mark operation as failed
                metrics.complete_operation(operation_id, "failed", str(e))
                
                # Log error
                logger.error(
                    f"Failed {operation_name or func.__name__}: {str(e)}",
                    operation_id=operation_id,
                    duration=duration,
                    error_type=error_type,
                    exc_info=True
                )
                
                # Send notification for failures
                if notify_on_failure:
                    await notifications.notify_scraper_failure(
                        scraper_name=scraper_name,
                        message=f"Operation {operation_name or func.__name__} failed: {str(e)}",
                        operation_id=operation_id,
                        context={
                            "error_type": error_type,
                            "duration": duration,
                            "function": func.__name__
                        }
                    )
                
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            # For synchronous functions, we can't use async monitoring
            # So we provide basic logging
            scraper = args[0] if args else None
            scraper_name = getattr(scraper, 'get_scraper_name', lambda: func.__name__)()
            logger = get_scraper_logger(scraper_name)
            
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                logger.info(
                    f"Completed {operation_name or func.__name__}",
                    duration=duration,
                    status="success"
                )
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                
                logger.error(
                    f"Failed {operation_name or func.__name__}: {str(e)}",
                    duration=duration,
                    error_type=type(e).__name__,
                    exc_info=True
                )
                
                raise
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def monitor_requests(scraper_method: Callable) -> Callable:
    """
    Decorator to monitor HTTP requests made by scrapers.
    """
    @functools.wraps(scraper_method)
    async def wrapper(*args, **kwargs) -> Any:
        scraper = args[0]
        url = args[1] if len(args) > 1 else kwargs.get('url', 'unknown')
        
        # Get operation ID from scraper if available
        operation_id = getattr(scraper, '_current_operation_id', None)
        
        if operation_id:
            metrics = get_metrics_collector()
            start_time = time.time()
            
            try:
                result = await scraper_method(*args, **kwargs)
                
                # Record successful request
                response_time = time.time() - start_time
                metrics.record_request(operation_id, response_time, success=True)
                
                return result
                
            except Exception as e:
                # Record failed request
                response_time = time.time() - start_time
                metrics.record_request(operation_id, response_time, success=False)
                
                # Check for rate limiting
                if "429" in str(e) or "rate limit" in str(e).lower():
                    notifications = get_notification_system()
                    await notifications.notify_rate_limit(
                        scraper_name=scraper.get_scraper_name(),
                        url=url
                    )
                
                raise
        else:
            # No operation tracking, just execute
            return await scraper_method(*args, **kwargs)
    
    return wrapper


def track_scraper_performance(scraper_class):
    """
    Class decorator to automatically add monitoring to scraper methods.
    """
    # Add monitoring to main scrape method
    if hasattr(scraper_class, 'scrape'):
        scraper_class.scrape = monitor_scraping_operation(
            operation_name="scrape",
            notify_on_failure=True
        )(scraper_class.scrape)
    
    # Add request monitoring to _make_request method
    if hasattr(scraper_class, '_make_request'):
        scraper_class._make_request = monitor_requests(scraper_class._make_request)
    
    # Add operation tracking to _scrape_search_page method
    if hasattr(scraper_class, '_scrape_search_page'):
        scraper_class._scrape_search_page = monitor_scraping_operation(
            operation_name="scrape_search_page",
            notify_on_failure=False
        )(scraper_class._scrape_search_page)
    
    return scraper_class


class MonitoringContext:
    """Context manager for manual monitoring operations."""
    
    def __init__(self, 
                 scraper_name: str,
                 operation_name: str = "custom_operation",
                 auto_notify: bool = True):
        self.scraper_name = scraper_name
        self.operation_name = operation_name
        self.auto_notify = auto_notify
        
        self.logger = get_scraper_logger(scraper_name)
        self.metrics = get_metrics_collector()
        self.notifications = get_notification_system()
        
        self.operation_id = None
        self.operation_metrics = None
        self.start_time = None
    
    async def __aenter__(self):
        """Enter monitoring context."""
        self.operation_id = f"{self.scraper_name}_{int(time.time())}"
        self.operation_metrics = self.metrics.start_operation(self.scraper_name, self.operation_id)
        self.start_time = time.time()
        
        self.logger.info(
            f"Starting {self.operation_name}",
            operation_id=self.operation_id
        )
        
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit monitoring context."""
        duration = time.time() - self.start_time
        
        if exc_type is None:
            # Success
            self.metrics.complete_operation(self.operation_id, "completed")
            self.logger.info(
                f"Completed {self.operation_name}",
                operation_id=self.operation_id,
                duration=duration
            )
        else:
            # Failure
            self.metrics.complete_operation(self.operation_id, "failed", str(exc_val))
            self.logger.error(
                f"Failed {self.operation_name}: {str(exc_val)}",
                operation_id=self.operation_id,
                duration=duration,
                exc_info=True
            )
            
            if self.auto_notify:
                await self.notifications.notify_scraper_failure(
                    scraper_name=self.scraper_name,
                    message=f"{self.operation_name} failed: {str(exc_val)}",
                    operation_id=self.operation_id
                )
    
    def record_request(self, response_time: float, success: bool = True):
        """Record a request within this monitoring context."""
        self.metrics.record_request(self.operation_id, response_time, success)
    
    def record_error(self, error_type: str):
        """Record an error within this monitoring context."""
        self.metrics.record_error(self.operation_id, error_type)
    
    def record_data(self, properties_found: int = 0, properties_scraped: int = 0):
        """Record data metrics within this monitoring context."""
        self.metrics.record_data(
            self.operation_id,
            properties_found=properties_found,
            properties_scraped=properties_scraped
        )
