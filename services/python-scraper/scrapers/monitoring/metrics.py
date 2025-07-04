"""
Metrics collection system for scrapers.
"""

import time
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from collections import defaultdict, deque
import threading


@dataclass
class ScrapingMetrics:
    """Metrics for a single scraping operation."""
    
    scraper_name: str
    operation_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: Optional[float] = None
    
    # Request metrics
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    avg_response_time: float = 0.0
    
    # Data metrics
    properties_found: int = 0
    properties_scraped: int = 0
    properties_validated: int = 0
    validation_errors: int = 0
    
    # Error metrics
    network_errors: int = 0
    parsing_errors: int = 0
    rate_limit_errors: int = 0
    other_errors: int = 0
    
    # Performance metrics
    pages_scraped: int = 0
    avg_page_time: float = 0.0
    properties_per_minute: float = 0.0
    
    # Status
    status: str = "running"
    error_message: Optional[str] = None
    
    def __post_init__(self):
        if self.operation_id is None:
            self.operation_id = f"{self.scraper_name}_{int(time.time())}"
    
    def complete(self, status: str = "completed", error_message: str = None):
        """Mark operation as completed."""
        self.end_time = datetime.utcnow()
        self.duration = (self.end_time - self.start_time).total_seconds()
        self.status = status
        self.error_message = error_message
        
        # Calculate derived metrics
        if self.duration > 0:
            self.properties_per_minute = (self.properties_scraped / self.duration) * 60
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary."""
        return {
            'scraper_name': self.scraper_name,
            'operation_id': self.operation_id,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'duration': self.duration,
            'status': self.status,
            'error_message': self.error_message,
            
            'requests': {
                'total': self.total_requests,
                'successful': self.successful_requests,
                'failed': self.failed_requests,
                'avg_response_time': self.avg_response_time
            },
            
            'data': {
                'properties_found': self.properties_found,
                'properties_scraped': self.properties_scraped,
                'properties_validated': self.properties_validated,
                'validation_errors': self.validation_errors
            },
            
            'errors': {
                'network': self.network_errors,
                'parsing': self.parsing_errors,
                'rate_limit': self.rate_limit_errors,
                'other': self.other_errors
            },
            
            'performance': {
                'pages_scraped': self.pages_scraped,
                'avg_page_time': self.avg_page_time,
                'properties_per_minute': self.properties_per_minute
            }
        }


class MetricsCollector:
    """Collects and manages scraping metrics."""
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.active_operations: Dict[str, ScrapingMetrics] = {}
        self.completed_operations: deque = deque(maxlen=max_history)
        self.aggregate_stats: Dict[str, Any] = defaultdict(lambda: defaultdict(int))
        self._lock = threading.Lock()
        
        # Real-time metrics tracking
        self.request_times: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
        self.error_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    
    def start_operation(self, scraper_name: str, operation_id: str = None) -> ScrapingMetrics:
        """Start tracking a new scraping operation."""
        with self._lock:
            metrics = ScrapingMetrics(
                scraper_name=scraper_name,
                operation_id=operation_id or f"{scraper_name}_{int(time.time())}",
                start_time=datetime.utcnow()
            )
            
            self.active_operations[metrics.operation_id] = metrics
            return metrics
    
    def complete_operation(self, operation_id: str, status: str = "completed", error_message: str = None):
        """Complete a scraping operation."""
        with self._lock:
            if operation_id in self.active_operations:
                metrics = self.active_operations.pop(operation_id)
                metrics.complete(status, error_message)
                self.completed_operations.append(metrics)
                
                # Update aggregate stats
                self._update_aggregate_stats(metrics)
    
    def record_request(self, operation_id: str, response_time: float, success: bool = True):
        """Record a request metrics."""
        with self._lock:
            if operation_id in self.active_operations:
                metrics = self.active_operations[operation_id]
                metrics.total_requests += 1
                
                if success:
                    metrics.successful_requests += 1
                else:
                    metrics.failed_requests += 1
                
                # Update average response time
                total_time = metrics.avg_response_time * (metrics.total_requests - 1) + response_time
                metrics.avg_response_time = total_time / metrics.total_requests
                
                # Track recent request times
                self.request_times[metrics.scraper_name].append(response_time)
    
    def record_error(self, operation_id: str, error_type: str):
        """Record an error."""
        with self._lock:
            if operation_id in self.active_operations:
                metrics = self.active_operations[operation_id]
                
                if error_type == "network":
                    metrics.network_errors += 1
                elif error_type == "parsing":
                    metrics.parsing_errors += 1
                elif error_type == "rate_limit":
                    metrics.rate_limit_errors += 1
                else:
                    metrics.other_errors += 1
                
                # Update error counts
                self.error_counts[metrics.scraper_name][error_type] += 1
    
    def record_data(self, operation_id: str, 
                   properties_found: int = 0,
                   properties_scraped: int = 0,
                   properties_validated: int = 0,
                   validation_errors: int = 0):
        """Record data metrics."""
        with self._lock:
            if operation_id in self.active_operations:
                metrics = self.active_operations[operation_id]
                metrics.properties_found += properties_found
                metrics.properties_scraped += properties_scraped
                metrics.properties_validated += properties_validated
                metrics.validation_errors += validation_errors
    
    def record_page_scraped(self, operation_id: str, page_time: float):
        """Record page scraping metrics."""
        with self._lock:
            if operation_id in self.active_operations:
                metrics = self.active_operations[operation_id]
                metrics.pages_scraped += 1
                
                # Update average page time
                total_time = metrics.avg_page_time * (metrics.pages_scraped - 1) + page_time
                metrics.avg_page_time = total_time / metrics.pages_scraped
    
    def get_operation_metrics(self, operation_id: str) -> Optional[Dict[str, Any]]:
        """Get metrics for a specific operation."""
        with self._lock:
            if operation_id in self.active_operations:
                return self.active_operations[operation_id].to_dict()
            
            # Search in completed operations
            for metrics in self.completed_operations:
                if metrics.operation_id == operation_id:
                    return metrics.to_dict()
            
            return None
    
    def get_active_operations(self) -> List[Dict[str, Any]]:
        """Get all active operations."""
        with self._lock:
            return [metrics.to_dict() for metrics in self.active_operations.values()]
    
    def get_scraper_stats(self, scraper_name: str, hours: int = 24) -> Dict[str, Any]:
        """Get statistics for a specific scraper."""
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        with self._lock:
            # Filter recent operations
            recent_ops = [
                metrics for metrics in self.completed_operations
                if metrics.scraper_name == scraper_name and metrics.start_time >= cutoff_time
            ]
            
            if not recent_ops:
                return {
                    'scraper_name': scraper_name,
                    'period_hours': hours,
                    'operations_count': 0,
                    'total_properties': 0,
                    'avg_duration': 0,
                    'success_rate': 0,
                    'error_rate': 0,
                    'avg_properties_per_minute': 0
                }
            
            # Calculate statistics
            total_properties = sum(op.properties_scraped for op in recent_ops)
            total_duration = sum(op.duration or 0 for op in recent_ops)
            successful_ops = sum(1 for op in recent_ops if op.status == "completed")
            
            stats = {
                'scraper_name': scraper_name,
                'period_hours': hours,
                'operations_count': len(recent_ops),
                'total_properties': total_properties,
                'avg_duration': total_duration / len(recent_ops) if recent_ops else 0,
                'success_rate': (successful_ops / len(recent_ops)) * 100 if recent_ops else 0,
                'error_rate': ((len(recent_ops) - successful_ops) / len(recent_ops)) * 100 if recent_ops else 0,
                'avg_properties_per_minute': sum(op.properties_per_minute for op in recent_ops) / len(recent_ops) if recent_ops else 0,
                
                'recent_request_times': list(self.request_times[scraper_name])[-50:],  # Last 50 requests
                'error_breakdown': dict(self.error_counts[scraper_name])
            }
            
            return stats
    
    def get_system_health(self) -> Dict[str, Any]:
        """Get overall system health metrics."""
        with self._lock:
            active_count = len(self.active_operations)
            total_errors = sum(
                sum(errors.values()) for errors in self.error_counts.values()
            )
            
            # Calculate average response times across all scrapers
            all_request_times = []
            for times in self.request_times.values():
                all_request_times.extend(times)
            
            avg_response_time = sum(all_request_times) / len(all_request_times) if all_request_times else 0
            
            return {
                'active_operations': active_count,
                'total_scrapers': len(self.request_times),
                'total_errors_24h': total_errors,
                'avg_response_time': avg_response_time,
                'system_status': 'healthy' if active_count < 10 and total_errors < 100 else 'warning',
                'timestamp': datetime.utcnow().isoformat()
            }
    
    def _update_aggregate_stats(self, metrics: ScrapingMetrics):
        """Update aggregate statistics."""
        scraper_stats = self.aggregate_stats[metrics.scraper_name]
        scraper_stats['total_operations'] += 1
        scraper_stats['total_properties'] += metrics.properties_scraped
        scraper_stats['total_requests'] += metrics.total_requests
        scraper_stats['total_errors'] += (
            metrics.network_errors + metrics.parsing_errors + 
            metrics.rate_limit_errors + metrics.other_errors
        )
        
        if metrics.status == "completed":
            scraper_stats['successful_operations'] += 1


# Global metrics collector instance
metrics_collector = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    """Get the global metrics collector."""
    return metrics_collector
